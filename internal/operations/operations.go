package operations

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"syscall"
	"time"
)

var cliVersion = "dev"
var releaseCommit = "dev"

var (
	rollNumberPattern = regexp.MustCompile(`^[FS][0-9]{2}-[0-9]{4}$`)
	emailPattern      = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)
	colorPattern      = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)
)

type Paths struct {
	ConfigPath string
	StateDir   string
	ReleaseDir string
}

type DeploymentState struct {
	ReleaseVersion       string    `json:"releaseVersion"`
	Image                string    `json:"image,omitempty"`
	ConfigurationVersion int       `json:"configurationVersion,omitempty"`
	SourceCommit         string    `json:"sourceCommit,omitempty"`
	ComposeFiles         []string  `json:"composeFiles"`
	UpdatedAt            time.Time `json:"updatedAt"`
}

func DefaultPaths() Paths {
	return Paths{
		ConfigPath: "/etc/fyp-portal/portal.env",
		StateDir:   "/var/lib/fyp-portal/state",
		ReleaseDir: "/opt/fyp-portal/current",
	}
}

func (paths Paths) statePath() string {
	return filepath.Join(paths.StateDir, "deployment-state.json")
}

func (paths Paths) lockPath() string {
	return filepath.Join(paths.StateDir, "operation.lock")
}

func ensureSecureDirectory(path string, owner uint32) error {
	info, err := os.Lstat(path)
	if err == nil {
		if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
			return fmt.Errorf("%s must be a directory", path)
		}
	} else if errors.Is(err, os.ErrNotExist) {
		if err := os.MkdirAll(path, 0o700); err != nil {
			return fmt.Errorf("create %s: %w", path, err)
		}
	} else {
		return fmt.Errorf("inspect %s: %w", path, err)
	}

	if err := os.Chmod(path, 0o700); err != nil {
		return fmt.Errorf("protect %s: %w", path, err)
	}
	if err := os.Chown(path, int(owner), -1); err != nil {
		return fmt.Errorf("set owner for %s: %w", path, err)
	}
	return nil
}

func validateProtectedFile(path string, owner uint32) error {
	info, err := os.Lstat(path)
	if err != nil {
		return fmt.Errorf("inspect %s: %w", path, err)
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() {
		return fmt.Errorf("%s must be a regular file", path)
	}
	if info.Mode().Perm() != 0o600 {
		return fmt.Errorf("%s must have mode 0600", path)
	}
	stat, ok := info.Sys().(*syscall.Stat_t)
	if !ok || stat.Uid != owner {
		return fmt.Errorf("%s must be owned by UID %d", path, owner)
	}
	return nil
}

func writeAtomically(path string, contents []byte, owner uint32) error {
	temporary, err := os.CreateTemp(filepath.Dir(path), ".tmp-")
	if err != nil {
		return fmt.Errorf("create temporary file: %w", err)
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)

	if err := temporary.Chmod(0o600); err != nil {
		temporary.Close()
		return fmt.Errorf("protect temporary file: %w", err)
	}
	if err := temporary.Chown(int(owner), -1); err != nil {
		temporary.Close()
		return fmt.Errorf("set temporary file owner: %w", err)
	}
	if _, err := temporary.Write(contents); err != nil {
		temporary.Close()
		return fmt.Errorf("write temporary file: %w", err)
	}
	if err := temporary.Sync(); err != nil {
		temporary.Close()
		return fmt.Errorf("sync temporary file: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return fmt.Errorf("close temporary file: %w", err)
	}
	if err := os.Rename(temporaryPath, path); err != nil {
		return fmt.Errorf("replace %s: %w", path, err)
	}
	directory, err := os.Open(filepath.Dir(path))
	if err != nil {
		return fmt.Errorf("open state directory: %w", err)
	}
	defer directory.Close()
	if err := directory.Sync(); err != nil {
		return fmt.Errorf("sync state directory: %w", err)
	}
	return nil
}

func WriteProtectedConfig(path string, contents []byte, owner uint32) error {
	if err := ensureSecureDirectory(filepath.Dir(path), owner); err != nil {
		return err
	}
	return writeAtomically(path, contents, owner)
}

func WriteDeploymentState(paths Paths, state DeploymentState, owner uint32) error {
	if err := ensureSecureDirectory(paths.StateDir, owner); err != nil {
		return err
	}
	if err := validateComposeFiles(state.ComposeFiles); err != nil {
		return err
	}
	state.UpdatedAt = time.Now().UTC()
	contents, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return fmt.Errorf("encode deployment state: %w", err)
	}
	return writeAtomically(paths.statePath(), append(contents, '\n'), owner)
}

func ReadDeploymentState(paths Paths, owner uint32) (*DeploymentState, error) {
	contents, err := os.ReadFile(paths.statePath())
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read deployment state: %w", err)
	}
	if err := validateProtectedFile(paths.statePath(), owner); err != nil {
		return nil, err
	}
	var state DeploymentState
	if err := json.Unmarshal(contents, &state); err != nil {
		return nil, fmt.Errorf("decode deployment state: %w", err)
	}
	if err := validateComposeFiles(state.ComposeFiles); err != nil {
		return nil, err
	}
	return &state, nil
}

func AcquireOperationLock(paths Paths, owner uint32) (func() error, error) {
	if err := ensureSecureDirectory(paths.StateDir, owner); err != nil {
		return nil, err
	}
	lock, err := os.OpenFile(paths.lockPath(), os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return nil, fmt.Errorf("open operation lock: %w", err)
	}
	if err := lock.Chmod(0o600); err != nil {
		lock.Close()
		return nil, fmt.Errorf("protect operation lock: %w", err)
	}
	if err := lock.Chown(int(owner), -1); err != nil {
		lock.Close()
		return nil, fmt.Errorf("set operation lock owner: %w", err)
	}
	if err := syscall.Flock(int(lock.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		lock.Close()
		if errors.Is(err, syscall.EWOULDBLOCK) || errors.Is(err, syscall.EAGAIN) {
			return nil, errors.New("another fyp-portal operation is already running")
		}
		return nil, fmt.Errorf("acquire operation lock: %w", err)
	}
	return func() error {
		unlockError := syscall.Flock(int(lock.Fd()), syscall.LOCK_UN)
		closeError := lock.Close()
		return errors.Join(unlockError, closeError)
	}, nil
}

func validateComposeFiles(files []string) error {
	for _, file := range files {
		clean := filepath.Clean(file)
		if filepath.IsAbs(clean) || clean == "." || clean == ".." || strings.HasPrefix(clean, ".."+string(filepath.Separator)) || !strings.HasPrefix(clean, "deploy"+string(filepath.Separator)) {
			return fmt.Errorf("invalid compose file %q", file)
		}
	}
	return nil
}

func composeFiles(paths Paths, owner uint32) ([]string, error) {
	state, err := ReadDeploymentState(paths, owner)
	if err != nil {
		return nil, err
	}
	if state == nil || len(state.ComposeFiles) == 0 {
		return []string{"deploy/compose.yaml"}, nil
	}
	return state.ComposeFiles, nil
}

func parseEnvFile(path string) (map[string]string, error) {
	contents, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read configuration: %w", err)
	}
	settings := make(map[string]string)
	for lineNumber, line := range strings.Split(string(contents), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		line = strings.TrimPrefix(line, "export ")
		key, value, found := strings.Cut(line, "=")
		key = strings.TrimSpace(key)
		if !found || key == "" {
			return nil, fmt.Errorf("invalid configuration line %d", lineNumber+1)
		}
		value = strings.TrimSpace(value)
		if len(value) >= 2 && value[0] == '"' && value[len(value)-1] == '"' {
			unquoted, err := strconv.Unquote(value)
			if err != nil {
				return nil, fmt.Errorf("invalid quoted configuration value on line %d", lineNumber+1)
			}
			value = unquoted
		} else if len(value) >= 2 && value[0] == '\'' && value[len(value)-1] == '\'' {
			value = value[1 : len(value)-1]
		}
		settings[key] = value
	}
	return settings, nil
}

type redactor struct {
	values []string
}

func newRedactor(settings map[string]string) redactor {
	values := make([]string, 0)
	for key, value := range settings {
		upper := strings.ToUpper(key)
		if value != "" && (strings.Contains(upper, "PASSWORD") || strings.Contains(upper, "SECRET") || strings.Contains(upper, "TOKEN") || strings.Contains(upper, "KEY") || strings.HasSuffix(upper, "_URI")) {
			values = append(values, value)
			if parsed, err := url.Parse(value); err == nil && parsed.User != nil {
				if password, present := parsed.User.Password(); present {
					values = append(values, password)
				}
			}
		}
	}
	sort.Slice(values, func(left, right int) bool { return len(values[left]) > len(values[right]) })
	return redactor{values: values}
}

func (redactor redactor) Redact(value string) string {
	for _, secret := range redactor.values {
		value = strings.ReplaceAll(value, secret, "[REDACTED]")
	}
	return value
}

func commandOutput(ctx context.Context, redactor redactor, name string, args []string, input io.Reader) (string, error) {
	command := exec.CommandContext(ctx, name, args...)
	command.Stdin = input
	output, err := command.CombinedOutput()
	redacted := strings.TrimSpace(redactor.Redact(string(output)))
	if err != nil {
		if redacted == "" {
			return "", fmt.Errorf("%s failed: %w", name, err)
		}
		return "", fmt.Errorf("%s failed: %s", name, redacted)
	}
	return redacted, nil
}

func dockerComposeArgs(paths Paths, owner uint32, command ...string) ([]string, error) {
	files, err := composeFiles(paths, owner)
	if err != nil {
		return nil, err
	}
	args := []string{"compose", "--project-directory", paths.ReleaseDir, "--env-file", paths.ConfigPath}
	for _, file := range files {
		args = append(args, "-f", filepath.Join(paths.ReleaseDir, file))
	}
	return append(args, command...), nil
}

type composeService struct {
	Service string `json:"Service"`
	Name    string `json:"Name"`
	State   string `json:"State"`
	Health  string `json:"Health"`
	Status  string `json:"Status"`
}

func listServices(ctx context.Context, paths Paths, owner uint32, redactor redactor) ([]composeService, error) {
	args, err := dockerComposeArgs(paths, owner, "ps", "--format", "json")
	if err != nil {
		return nil, err
	}
	output, err := commandOutput(ctx, redactor, "docker", args, nil)
	if err != nil {
		return nil, err
	}
	if output == "" {
		return nil, nil
	}
	var services []composeService
	if err := json.Unmarshal([]byte(output), &services); err == nil {
		return services, nil
	}
	for _, line := range strings.Split(output, "\n") {
		var service composeService
		if err := json.Unmarshal([]byte(line), &service); err != nil {
			return nil, fmt.Errorf("decode Docker Compose status")
		}
		services = append(services, service)
	}
	return services, nil
}

func loadRedactor(paths Paths) (redactor, error) {
	if err := validateProtectedFile(paths.ConfigPath, 0); err != nil {
		return redactor{}, err
	}
	settings, err := parseEnvFile(paths.ConfigPath)
	if err != nil {
		return redactor{}, err
	}
	return newRedactor(settings), nil
}

func requireRoot(stderr io.Writer) bool {
	if os.Geteuid() == 0 {
		return true
	}
	fmt.Fprintln(stderr, "fypctl must run as root.")
	return false
}

func printUsage(program string, output io.Writer) {
	fmt.Fprintf(output, "Usage: %s [--config FILE] [--state-dir DIR] [--release-dir DIR] <command>\n\n", program)
	fmt.Fprintln(output, "Commands:")
	fmt.Fprintln(output, "  status                 Show Compose service status.")
	fmt.Fprintln(output, "  doctor                 Check protected configuration and service health.")
	fmt.Fprintln(output, "  logs [--tail N] [SERVICE...]  Show redacted container logs.")
	fmt.Fprintln(output, "  version                Show CLI and installed release versions.")
	fmt.Fprintln(output, "  bootstrap              Create branding and the first administrator once.")
	fmt.Fprintln(output, "  jobs <essential|retention>  Run an authenticated background operation.")
	fmt.Fprintln(output, "  timers install         Install and start the background systemd timers.")
	fmt.Fprintln(output, "  maintenance <start|stop|status>  Control protected maintenance mode.")
	fmt.Fprintln(output, "  backup <create|restore|schedule>  Create, restore, or schedule encrypted backups.")
	fmt.Fprintln(output, "  configure              Reopen protected portal configuration.")
}

func parsePaths(program string, args []string, stderr io.Writer) (Paths, []string, bool) {
	paths := DefaultPaths()
	flags := flag.NewFlagSet(program, flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	flags.StringVar(&paths.ConfigPath, "config", paths.ConfigPath, "protected portal.env path")
	flags.StringVar(&paths.StateDir, "state-dir", paths.StateDir, "protected state directory")
	flags.StringVar(&paths.ReleaseDir, "release-dir", paths.ReleaseDir, "active release directory")
	if err := flags.Parse(args); err != nil {
		fmt.Fprintln(stderr, err)
		return Paths{}, nil, false
	}
	return paths, flags.Args(), true
}

func Run(program string, args []string, stdin io.Reader, stdout, stderr io.Writer) int {
	if len(args) == 1 && args[0] == "--version" {
		return runVersion(DefaultPaths(), stdout, stderr)
	}
	if len(args) == 1 && (args[0] == "--help" || args[0] == "-h") {
		printUsage(program, stdout)
		return 0
	}
	if program == "install" && (len(args) == 0 || args[0] == "--request") {
		if !requireRoot(stderr) {
			return 1
		}
		if len(args) == 0 {
			return startWizard(DefaultPaths(), installWizard, stdout, stderr)
		}
		return runInstall(DefaultPaths(), args, stdin, stdout, stderr)
	}
	paths, args, ok := parsePaths(program, args, stderr)
	if !ok {
		return 2
	}
	if len(args) == 0 || args[0] == "help" || args[0] == "--help" || args[0] == "-h" {
		printUsage(program, stdout)
		return 0
	}
	if args[0] == "version" || args[0] == "--version" {
		return runVersion(paths, stdout, stderr)
	}
	if !requireRoot(stderr) {
		return 1
	}

	switch args[0] {
	case "status":
		return runStatus(paths, stdout, stderr)
	case "doctor":
		return runDoctor(paths, stdout, stderr)
	case "logs":
		return runLogs(paths, args[1:], stdout, stderr)
	case "bootstrap":
		return runBootstrap(paths, args[1:], stdin, stdout, stderr)
	case "jobs":
		return runBackgroundJob(paths, args[1:], stdout, stderr)
	case "timers":
		return runTimers(paths, args[1:], stdout, stderr)
	case "maintenance":
		return runMaintenance(paths, args[1:], stdout, stderr)
	case "backup":
		return runBackup(paths, args[1:], stdin, stdout, stderr)
	case "configure":
		if program != "fypctl" || len(args) != 1 {
			fmt.Fprintln(stderr, "configure is available only as fypctl configure")
			return 2
		}
		return startWizard(paths, configureWizard, stdout, stderr)
	case "install":
		if program != "install" {
			fmt.Fprintln(stderr, "install is available only from the installer binary")
			return 2
		}
		return runInstall(paths, args[1:], stdin, stdout, stderr)
	default:
		fmt.Fprintf(stderr, "unknown command %q\n", args[0])
		printUsage(program, stderr)
		return 2
	}
}

func runVersion(paths Paths, stdout, stderr io.Writer) int {
	fmt.Fprintf(stdout, "fypctl %s\n", cliVersion)
	state, err := ReadDeploymentState(paths, 0)
	if err != nil {
		if !errors.Is(err, os.ErrNotExist) {
			fmt.Fprintf(stderr, "release state unavailable: %v\n", err)
			return 1
		}
		return 0
	}
	if state != nil && state.ReleaseVersion != "" {
		fmt.Fprintf(stdout, "release %s\n", state.ReleaseVersion)
		if state.Image != "" {
			fmt.Fprintf(stdout, "image %s\n", state.Image)
		}
	}
	return 0
}

func runStatus(paths Paths, stdout, stderr io.Writer) int {
	redactor, err := loadRedactor(paths)
	if err != nil {
		fmt.Fprintf(stderr, "configuration: %v\n", err)
		return 1
	}
	services, err := listServices(context.Background(), paths, 0, redactor)
	if err != nil {
		fmt.Fprintf(stderr, "status: %v\n", err)
		return 1
	}
	if len(services) == 0 {
		fmt.Fprintln(stdout, "No portal services are running.")
		return 1
	}
	for _, service := range services {
		name := service.Service
		if name == "" {
			name = service.Name
		}
		detail := service.Health
		if detail == "" {
			detail = service.Status
		}
		if detail == "" {
			detail = service.State
		}
		fmt.Fprintf(stdout, "%s: %s\n", name, detail)
	}
	return 0
}

func runDoctor(paths Paths, stdout, stderr io.Writer) int {
	issues := 0
	redactor, err := loadRedactor(paths)
	if err != nil {
		issues++
		fmt.Fprintf(stdout, "configuration: failed (%v)\n", err)
	} else {
		fmt.Fprintln(stdout, "configuration: ok")
	}

	if _, err := commandOutput(context.Background(), redactor, "docker", []string{"compose", "version", "--short"}, nil); err != nil {
		issues++
		fmt.Fprintf(stdout, "docker compose: failed (%v)\n", err)
	} else {
		fmt.Fprintln(stdout, "docker compose: ok")
	}

	if err == nil {
		services, statusError := listServices(context.Background(), paths, 0, redactor)
		if statusError != nil {
			issues++
			fmt.Fprintf(stdout, "services: failed (%v)\n", statusError)
		} else if len(services) == 0 {
			issues++
			fmt.Fprintln(stdout, "services: failed (no portal services are running)")
		} else {
			fmt.Fprintln(stdout, "services: ok")
		}
	}
	if issues != 0 {
		return 1
	}
	return 0
}

func runLogs(paths Paths, args []string, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("logs", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	tail := flags.Int("tail", 100, "number of lines")
	if err := flags.Parse(args); err != nil || *tail < 1 {
		fmt.Fprintln(stderr, "logs requires a positive --tail value")
		return 2
	}
	redactor, err := loadRedactor(paths)
	if err != nil {
		fmt.Fprintf(stderr, "configuration: %v\n", err)
		return 1
	}
	composeCommand := []string{"logs", "--no-color", "--tail", fmt.Sprint(*tail)}
	composeCommand = append(composeCommand, flags.Args()...)
	command, err := dockerComposeArgs(paths, 0, composeCommand...)
	if err != nil {
		fmt.Fprintf(stderr, "logs: %v\n", err)
		return 1
	}
	output, err := commandOutput(context.Background(), redactor, "docker", command, nil)
	if err != nil {
		fmt.Fprintf(stderr, "logs: %v\n", err)
		return 1
	}
	if output != "" {
		fmt.Fprintln(stdout, output)
	}
	return 0
}

type bootstrapRequest struct {
	UniversityName string `json:"universityName"`
	PrimaryColor   string `json:"primaryColor"`
	AccentColor    string `json:"accentColor"`
	Administrator  struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		RollNo   string `json:"rollNo"`
		Password string `json:"password"`
	} `json:"administrator"`
}

func readPassword(input io.Reader) (string, error) {
	contents, err := io.ReadAll(io.LimitReader(input, 130))
	if err != nil {
		return "", fmt.Errorf("read administrator password: %w", err)
	}
	if len(contents) == 130 {
		return "", errors.New("administrator password must be 10 to 128 characters")
	}
	password := strings.TrimSuffix(strings.TrimSuffix(string(contents), "\n"), "\r")
	if strings.ContainsRune(password, 0) || len(password) < 10 || len(password) > 128 {
		return "", errors.New("administrator password must be 10 to 128 characters")
	}
	return password, nil
}

func parseBootstrapRequest(args []string, stdin io.Reader) (bootstrapRequest, error) {
	var request bootstrapRequest
	flags := flag.NewFlagSet("bootstrap", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	passwordStdin := flags.Bool("password-stdin", false, "read the administrator password from standard input")
	flags.StringVar(&request.UniversityName, "university-name", "", "institution name")
	flags.StringVar(&request.PrimaryColor, "primary-color", "#14213d", "primary color")
	flags.StringVar(&request.AccentColor, "accent-color", "#fca311", "accent color")
	flags.StringVar(&request.Administrator.Name, "admin-name", "", "administrator name")
	flags.StringVar(&request.Administrator.Email, "admin-email", "", "administrator email")
	flags.StringVar(&request.Administrator.RollNo, "admin-roll-no", "", "administrator roll number")
	if err := flags.Parse(args); err != nil || len(flags.Args()) != 0 || !*passwordStdin {
		return bootstrapRequest{}, errors.New("bootstrap requires --password-stdin and complete administrator details")
	}
	request.UniversityName = strings.TrimSpace(request.UniversityName)
	request.Administrator.Name = strings.TrimSpace(request.Administrator.Name)
	request.Administrator.Email = strings.ToLower(strings.TrimSpace(request.Administrator.Email))
	request.Administrator.RollNo = strings.ToUpper(strings.TrimSpace(request.Administrator.RollNo))
	request.PrimaryColor = strings.ToLower(strings.TrimSpace(request.PrimaryColor))
	request.AccentColor = strings.ToLower(strings.TrimSpace(request.AccentColor))
	if request.UniversityName == "" || len(request.UniversityName) > 120 || request.Administrator.Name == "" || len(request.Administrator.Name) > 100 || !emailPattern.MatchString(request.Administrator.Email) || !rollNumberPattern.MatchString(request.Administrator.RollNo) || !colorPattern.MatchString(request.PrimaryColor) || !colorPattern.MatchString(request.AccentColor) {
		return bootstrapRequest{}, errors.New("bootstrap details are invalid")
	}
	password, err := readPassword(stdin)
	if err != nil {
		return bootstrapRequest{}, err
	}
	request.Administrator.Password = password
	return request, nil
}

func runBootstrap(paths Paths, args []string, stdin io.Reader, stdout, stderr io.Writer) int {
	request, err := parseBootstrapRequest(args, stdin)
	if err != nil {
		fmt.Fprintf(stderr, "bootstrap: %v\n", err)
		return 2
	}
	redactor, err := loadRedactor(paths)
	if err != nil {
		fmt.Fprintf(stderr, "configuration: %v\n", err)
		return 1
	}
	release, err := AcquireOperationLock(paths, 0)
	if err != nil {
		fmt.Fprintf(stderr, "bootstrap: %v\n", err)
		return 1
	}
	defer release()

	payload, err := json.Marshal(request)
	if err != nil {
		fmt.Fprintln(stderr, "bootstrap: could not encode input")
		return 1
	}
	command, err := dockerComposeArgs(paths, 0, "exec", "-T", "app", "node", "scripts/bootstrap-first-admin.mjs")
	if err != nil {
		fmt.Fprintf(stderr, "bootstrap: %v\n", err)
		return 1
	}
	output, err := commandOutput(context.Background(), redactor, "docker", command, bytes.NewReader(payload))
	if err != nil {
		fmt.Fprintf(stderr, "bootstrap: %v\n", err)
		return 1
	}
	fmt.Fprintln(stdout, output)
	return 0
}

func runBackgroundJob(paths Paths, args []string, stdout, stderr io.Writer) int {
	if len(args) != 1 || (args[0] != "essential" && args[0] != "retention") {
		fmt.Fprintln(stderr, "jobs requires essential or retention")
		return 2
	}
	redactor, err := loadRedactor(paths)
	if err != nil {
		fmt.Fprintf(stderr, "configuration: %v\n", err)
		return 1
	}
	release, err := AcquireOperationLock(paths, 0)
	if err != nil {
		fmt.Fprintf(stderr, "jobs: %v\n", err)
		return 1
	}
	defer release()

	command, err := dockerComposeArgs(paths, 0, "exec", "-T", "app", "node", "scripts/run-background-operation.mjs", args[0])
	if err != nil {
		fmt.Fprintf(stderr, "jobs: %v\n", err)
		return 1
	}
	output, err := commandOutput(context.Background(), redactor, "docker", command, nil)
	if err != nil {
		fmt.Fprintf(stderr, "jobs: %v\n", err)
		return 1
	}
	if output != "" {
		fmt.Fprintln(stdout, output)
	}
	return 0
}

func installSystemdUnit(paths Paths, name string) error {
	contents, err := os.ReadFile(filepath.Join(paths.ReleaseDir, "deploy", "systemd", name))
	if err != nil {
		return fmt.Errorf("read %s: %w", name, err)
	}
	return writeAtomically(filepath.Join("/etc/systemd/system", name), contents, 0)
}

func runTimers(paths Paths, args []string, stdout, stderr io.Writer) int {
	if len(args) != 1 || args[0] != "install" {
		fmt.Fprintln(stderr, "timers requires install")
		return 2
	}
	if _, err := loadRedactor(paths); err != nil {
		fmt.Fprintf(stderr, "configuration: %v\n", err)
		return 1
	}
	release, err := AcquireOperationLock(paths, 0)
	if err != nil {
		fmt.Fprintf(stderr, "timers: %v\n", err)
		return 1
	}
	defer release()

	for _, name := range []string{
		"fyp-portal-essential.service",
		"fyp-portal-essential.timer",
		"fyp-portal-retention.service",
		"fyp-portal-retention.timer",
	} {
		if err := installSystemdUnit(paths, name); err != nil {
			fmt.Fprintf(stderr, "timers: %v\n", err)
			return 1
		}
	}
	if _, err := commandOutput(context.Background(), redactor{}, "systemctl", []string{"daemon-reload"}, nil); err != nil {
		fmt.Fprintf(stderr, "timers: %v\n", err)
		return 1
	}
	if _, err := commandOutput(context.Background(), redactor{}, "systemctl", []string{
		"enable", "--now", "fyp-portal-essential.timer", "fyp-portal-retention.timer",
	}, nil); err != nil {
		fmt.Fprintf(stderr, "timers: %v\n", err)
		return 1
	}
	fmt.Fprintln(stdout, "Background timers installed and started.")
	return 0
}
