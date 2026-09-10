package operations

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"net"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"syscall"
	"time"
)

const (
	installationJournalName = "installation-state.json"
	minimumMemoryBytes      = 2 * 1024 * 1024 * 1024
	minimumDiskBytes        = 20 * 1024 * 1024 * 1024
)

type installationRequest struct {
	Domain    string                `json:"domain"`
	Database  installationDatabase  `json:"database"`
	Storage   installationStorage   `json:"storage"`
	Mail      installationMail      `json:"mail"`
	Bootstrap installationBootstrap `json:"bootstrap"`
	Setup     installationSetup     `json:"setup,omitempty"`
}

type installationDatabase struct {
	Mode string `json:"mode"`
	URI  string `json:"uri"`
}

type installationStorage struct {
	Mode            string `json:"mode"`
	Endpoint        string `json:"endpoint"`
	BrowserEndpoint string `json:"browserEndpoint"`
	Region          string `json:"region"`
	AccessKeyID     string `json:"accessKeyId"`
	SecretAccessKey string `json:"secretAccessKey"`
	BucketName      string `json:"bucketName"`
	ForcePathStyle  bool   `json:"forcePathStyle"`
}

type installationMail struct {
	Host     string `json:"host"`
	Port     int    `json:"port"`
	TLSMode  string `json:"tlsMode"`
	Username string `json:"username"`
	Password string `json:"password"`
	From     string `json:"from"`
	FromName string `json:"fromName"`
	ReplyTo  string `json:"replyTo"`
}

type installationBootstrap struct {
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

type installationRetentionCategory struct {
	Enabled bool `json:"enabled"`
	AgeDays int  `json:"ageDays"`
}

type installationRetention struct {
	Schedule struct {
		Enabled  bool   `json:"enabled"`
		Timezone string `json:"timezone"`
		Time     string `json:"time"`
	} `json:"schedule"`
	PlayedVoiceNotes   installationRetentionCategory `json:"playedVoiceNotes"`
	UnplayedVoiceNotes installationRetentionCategory `json:"unplayedVoiceNotes"`
	AudioBroadcasts    installationRetentionCategory `json:"audioBroadcasts"`
	UnusedPDFUploads   installationRetentionCategory `json:"unusedPdfUploads"`
}

type installationBackup struct {
	Enabled bool   `json:"enabled"`
	DailyAt string `json:"dailyAt"`
	Keep    int    `json:"keep"`
}

type installationSetup struct {
	Configured bool                  `json:"configured"`
	LogoBase64 string                `json:"logoBase64,omitempty"`
	Retention  installationRetention `json:"retention"`
	Backup     installationBackup    `json:"backup"`
}

type installationJournal struct {
	FormatVersion      int             `json:"formatVersion"`
	RequestFingerprint string          `json:"requestFingerprint"`
	CompletedSteps     map[string]bool `json:"completedSteps"`
	CurrentStep        string          `json:"currentStep,omitempty"`
	LastFailure        string          `json:"lastFailure,omitempty"`
	UpdatedAt          time.Time       `json:"updatedAt"`
}

func (paths Paths) installationJournalPath() string {
	return filepath.Join(paths.StateDir, installationJournalName)
}

func readInstallationJournal(paths Paths, owner uint32) (*installationJournal, error) {
	contents, err := os.ReadFile(paths.installationJournalPath())
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read installation state: %w", err)
	}
	if err := validateProtectedFile(paths.installationJournalPath(), owner); err != nil {
		return nil, err
	}
	var journal installationJournal
	if err := json.Unmarshal(contents, &journal); err != nil {
		return nil, fmt.Errorf("decode installation state: %w", err)
	}
	if journal.FormatVersion != 1 || journal.RequestFingerprint == "" || journal.CompletedSteps == nil {
		return nil, errors.New("installation state is invalid")
	}
	return &journal, nil
}

func writeInstallationJournal(paths Paths, owner uint32, journal *installationJournal) error {
	if err := ensureSecureDirectory(paths.StateDir, owner); err != nil {
		return err
	}
	journal.UpdatedAt = time.Now().UTC()
	contents, err := json.MarshalIndent(journal, "", "  ")
	if err != nil {
		return fmt.Errorf("encode installation state: %w", err)
	}
	return writeAtomically(paths.installationJournalPath(), append(contents, '\n'), owner)
}

func runInstallationStep(paths Paths, owner uint32, journal *installationJournal, name string, action func() error) error {
	if journal.CompletedSteps[name] {
		return nil
	}
	journal.CurrentStep = name
	journal.LastFailure = ""
	if err := writeInstallationJournal(paths, owner, journal); err != nil {
		return err
	}
	if err := action(); err != nil {
		journal.LastFailure = fmt.Sprintf("%s did not complete", name)
		if saveError := writeInstallationJournal(paths, owner, journal); saveError != nil {
			return errors.Join(err, saveError)
		}
		return err
	}
	journal.CompletedSteps[name] = true
	journal.CurrentStep = ""
	journal.LastFailure = ""
	return writeInstallationJournal(paths, owner, journal)
}

func normaliseInstallRequest(request *installationRequest) error {
	request.Domain = strings.ToLower(strings.TrimSpace(request.Domain))
	if request.Domain == "" || len(request.Domain) > 253 || net.ParseIP(request.Domain) != nil || !isValidDomainName(request.Domain) {
		return errors.New("installation domain is invalid")
	}
	request.Database.Mode = strings.ToLower(strings.TrimSpace(request.Database.Mode))
	if request.Database.Mode != "local" && request.Database.Mode != "external" {
		return errors.New("database mode must be local or external")
	}
	request.Database.URI = strings.TrimSpace(request.Database.URI)
	if request.Database.Mode == "external" {
		parsed, err := url.Parse(request.Database.URI)
		if err != nil || (parsed.Scheme != "mongodb" && parsed.Scheme != "mongodb+srv") || parsed.Host == "" {
			return errors.New("external MongoDB URI is invalid")
		}
	} else if request.Database.URI != "" {
		return errors.New("local database does not accept a MongoDB URI")
	}

	request.Storage.Mode = strings.ToLower(strings.TrimSpace(request.Storage.Mode))
	if request.Storage.Mode != "local" && request.Storage.Mode != "external" {
		return errors.New("storage mode must be local or external")
	}
	if request.Storage.Mode == "external" {
		for _, value := range []string{request.Storage.Endpoint, request.Storage.BrowserEndpoint} {
			parsed, err := url.Parse(strings.TrimSpace(value))
			if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
				return errors.New("external storage endpoints are invalid")
			}
		}
		if strings.TrimSpace(request.Storage.Region) == "" || !validIdentifier(request.Storage.AccessKeyID, 1, 256) || strings.TrimSpace(request.Storage.SecretAccessKey) == "" || !validIdentifier(request.Storage.BucketName, 3, 63) {
			return errors.New("external storage configuration is invalid")
		}
	} else if request.Storage.Endpoint != "" || request.Storage.BrowserEndpoint != "" || request.Storage.Region != "" || request.Storage.AccessKeyID != "" || request.Storage.SecretAccessKey != "" || request.Storage.BucketName != "" || request.Storage.ForcePathStyle {
		return errors.New("local storage does not accept external storage settings")
	}

	if err := normaliseInstallationMail(&request.Mail); err != nil {
		return err
	}

	request.Bootstrap.UniversityName = strings.TrimSpace(request.Bootstrap.UniversityName)
	request.Bootstrap.PrimaryColor = strings.ToLower(strings.TrimSpace(request.Bootstrap.PrimaryColor))
	request.Bootstrap.AccentColor = strings.ToLower(strings.TrimSpace(request.Bootstrap.AccentColor))
	request.Bootstrap.Administrator.Name = strings.TrimSpace(request.Bootstrap.Administrator.Name)
	request.Bootstrap.Administrator.Email = strings.ToLower(strings.TrimSpace(request.Bootstrap.Administrator.Email))
	request.Bootstrap.Administrator.RollNo = strings.ToUpper(strings.TrimSpace(request.Bootstrap.Administrator.RollNo))
	if request.Bootstrap.UniversityName == "" || len(request.Bootstrap.UniversityName) > 120 || request.Bootstrap.Administrator.Name == "" || len(request.Bootstrap.Administrator.Name) > 100 || !emailPattern.MatchString(request.Bootstrap.Administrator.Email) || !rollNumberPattern.MatchString(request.Bootstrap.Administrator.RollNo) || len(request.Bootstrap.Administrator.Password) < 10 || len(request.Bootstrap.Administrator.Password) > 128 || !colorPattern.MatchString(request.Bootstrap.PrimaryColor) || !colorPattern.MatchString(request.Bootstrap.AccentColor) {
		return errors.New("bootstrap configuration is invalid")
	}
	if err := normaliseInstallationSetup(&request.Setup); err != nil {
		return err
	}
	return nil
}

func normaliseInstallationMail(mail *installationMail) error {
	mail.Host = strings.TrimSpace(mail.Host)
	mail.Username = strings.TrimSpace(mail.Username)
	mail.From = strings.TrimSpace(mail.From)
	mail.FromName = strings.TrimSpace(mail.FromName)
	mail.ReplyTo = strings.TrimSpace(mail.ReplyTo)
	mail.TLSMode = strings.ToLower(strings.TrimSpace(mail.TLSMode))
	if mail.Host == "" && mail.Port == 0 && mail.TLSMode == "" && mail.Username == "" && mail.Password == "" && mail.From == "" && mail.FromName == "" && mail.ReplyTo == "" {
		return nil
	}
	if mail.Host == "" || mail.Port < 1 || mail.Port > 65535 || (mail.TLSMode != "none" && mail.TLSMode != "starttls" && mail.TLSMode != "tls") || !emailPattern.MatchString(mail.From) || mail.FromName == "" || (mail.Username == "") != (mail.Password == "") || (mail.ReplyTo != "" && !emailPattern.MatchString(mail.ReplyTo)) {
		return errors.New("mail configuration is invalid")
	}
	return nil
}

func normaliseInstallationSetup(setup *installationSetup) error {
	if !setup.Configured {
		if setup.LogoBase64 != "" || setup.Backup.Enabled || setup.Backup.DailyAt != "" || setup.Backup.Keep != 0 || setup.Retention.Schedule.Enabled || setup.Retention.Schedule.Timezone != "" || setup.Retention.Schedule.Time != "" {
			return errors.New("installation setup is invalid")
		}
		return nil
	}
	if setup.LogoBase64 == "" {
		return errors.New("installation logo is required")
	}
	if _, err := reencodeWizardLogo(setup.LogoBase64); err != nil {
		return err
	}
	return normaliseInstallationPreferences(&setup.Retention, &setup.Backup)
}

func normaliseInstallationPreferences(retention *installationRetention, backup *installationBackup) error {
	retention.Schedule.Timezone = strings.TrimSpace(retention.Schedule.Timezone)
	retention.Schedule.Time = strings.TrimSpace(retention.Schedule.Time)
	if retention.Schedule.Timezone == "" {
		return errors.New("retention timezone is required")
	}
	if _, err := time.LoadLocation(retention.Schedule.Timezone); err != nil {
		return errors.New("retention timezone is invalid")
	}
	if !isDailyTime(retention.Schedule.Time) {
		return errors.New("retention time is invalid")
	}
	for _, category := range []installationRetentionCategory{
		retention.PlayedVoiceNotes,
		retention.UnplayedVoiceNotes,
		retention.AudioBroadcasts,
		retention.UnusedPDFUploads,
	} {
		if category.AgeDays < 1 || category.AgeDays > 3650 {
			return errors.New("retention age is invalid")
		}
	}
	backup.DailyAt = strings.TrimSpace(backup.DailyAt)
	if backup.Enabled {
		if !isDailyTime(backup.DailyAt) || backup.Keep < 1 || backup.Keep > 365 {
			return errors.New("backup preferences are invalid")
		}
	} else if backup.DailyAt != "" || backup.Keep != 0 {
		return errors.New("backup preferences are invalid")
	}
	return nil
}

func isValidDomainName(value string) bool {
	labels := strings.Split(value, ".")
	if len(labels) < 2 {
		return false
	}
	for _, label := range labels {
		if len(label) == 0 || len(label) > 63 || label[0] == '-' || label[len(label)-1] == '-' {
			return false
		}
		for _, character := range label {
			if (character < 'a' || character > 'z') && (character < '0' || character > '9') && character != '-' {
				return false
			}
		}
	}
	return true
}

func validIdentifier(value string, minimum, maximum int) bool {
	value = strings.TrimSpace(value)
	if len(value) < minimum || len(value) > maximum {
		return false
	}
	for _, character := range value {
		if (character < 'a' || character > 'z') && (character < 'A' || character > 'Z') && (character < '0' || character > '9') && character != '.' && character != '-' && character != '_' {
			return false
		}
	}
	return true
}

func installationFingerprint(request installationRequest) string {
	mongoDestination := request.Database.URI
	if parsed, err := url.Parse(request.Database.URI); err == nil {
		mongoDestination = parsed.Scheme + "://" + parsed.Host + parsed.Path
	}
	setup, _ := json.Marshal(request.Setup)
	value := strings.Join([]string{
		request.Domain,
		request.Database.Mode,
		mongoDestination,
		request.Storage.Mode,
		request.Storage.Endpoint,
		request.Storage.BrowserEndpoint,
		request.Storage.Region,
		request.Storage.BucketName,
		request.Mail.Host,
		strconv.Itoa(request.Mail.Port),
		request.Mail.TLSMode,
		request.Mail.From,
		request.Mail.FromName,
		request.Mail.ReplyTo,
		request.Bootstrap.UniversityName,
		request.Bootstrap.PrimaryColor,
		request.Bootstrap.AccentColor,
		request.Bootstrap.Administrator.Name,
		request.Bootstrap.Administrator.Email,
		request.Bootstrap.Administrator.RollNo,
		string(setup),
	}, "\x00")
	checksum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(checksum[:])
}

func readInstallationRequest(path string, owner uint32) (installationRequest, error) {
	if err := validateProtectedFile(path, owner); err != nil {
		return installationRequest{}, fmt.Errorf("installation request: %w", err)
	}
	contents, err := os.ReadFile(path)
	if err != nil {
		return installationRequest{}, fmt.Errorf("read installation request: %w", err)
	}
	var request installationRequest
	decoder := json.NewDecoder(bytes.NewReader(contents))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		return installationRequest{}, errors.New("installation request is invalid")
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return installationRequest{}, errors.New("installation request is invalid")
	}
	if err := normaliseInstallRequest(&request); err != nil {
		return installationRequest{}, err
	}
	return request, nil
}

func randomBase64(bytesCount int) (string, error) {
	contents := make([]byte, bytesCount)
	if _, err := rand.Read(contents); err != nil {
		return "", fmt.Errorf("generate secret: %w", err)
	}
	return base64.StdEncoding.EncodeToString(contents), nil
}

func randomHex(bytesCount int) (string, error) {
	contents := make([]byte, bytesCount)
	if _, err := rand.Read(contents); err != nil {
		return "", fmt.Errorf("generate secret: %w", err)
	}
	return hex.EncodeToString(contents), nil
}

func envContents(settings map[string]string) ([]byte, error) {
	keys := make([]string, 0, len(settings))
	for key := range settings {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	var contents strings.Builder
	for _, key := range keys {
		if !validIdentifier(key, 1, 128) || strings.Contains(settings[key], "\x00") || strings.Contains(settings[key], "\n") || strings.Contains(settings[key], "\r") {
			return nil, errors.New("installation configuration contains an invalid value")
		}
		contents.WriteString(key)
		contents.WriteByte('=')
		contents.WriteString(strconv.Quote(settings[key]))
		contents.WriteByte('\n')
	}
	return []byte(contents.String()), nil
}

func buildRuntimeSettings(request installationRequest, paths Paths) (map[string]string, error) {
	nextAuthSecret, err := randomBase64(32)
	if err != nil {
		return nil, err
	}
	cronSecret, err := randomBase64(32)
	if err != nil {
		return nil, err
	}
	backupKeyBytes := make([]byte, 32)
	if _, err := rand.Read(backupKeyBytes); err != nil {
		return nil, fmt.Errorf("generate recovery key: %w", err)
	}
	settings := map[string]string{
		"PORTAL_PUBLIC_URL":       "https://" + request.Domain,
		"FYP_CADDY_SITE":          request.Domain,
		"FYP_CADDY_DATA_DIR":      "/var/lib/fyp-portal/caddy",
		"FYP_STATE_DIR":           paths.StateDir,
		"FYP_BACKUP_DIR":          "/var/lib/fyp-portal/backups",
		"FYP_BACKUP_STAGING_DIR":  "/var/lib/fyp-portal/backups/.staging",
		"FYP_BACKUP_RECOVERY_KEY": base64.StdEncoding.EncodeToString(backupKeyBytes),
		"NEXTAUTH_SECRET":         nextAuthSecret,
		"CRON_SECRET":             cronSecret,
	}
	if request.Database.Mode == "local" {
		rootPassword, err := randomBase64(32)
		if err != nil {
			return nil, err
		}
		applicationPassword, err := randomBase64(32)
		if err != nil {
			return nil, err
		}
		replicaSetKey, err := randomBase64(48)
		if err != nil {
			return nil, err
		}
		settings["MONGODB_ROOT_USERNAME"] = "fyp-root"
		settings["MONGODB_ROOT_PASSWORD"] = rootPassword
		settings["MONGODB_APP_USERNAME"] = "fyp-portal"
		settings["MONGODB_APP_PASSWORD"] = applicationPassword
		settings["MONGODB_REPLICA_SET_KEY"] = replicaSetKey
		settings["MONGODB_DATABASE"] = "fyp-portal"
		settings["MONGODB_URI"] = "mongodb://fyp-portal:" + url.QueryEscape(applicationPassword) + "@mongo:27017/fyp-portal?authSource=fyp-portal&replicaSet=rs0"
		settings["FYP_MONGODB_DATA_DIR"] = "/var/lib/fyp-portal/mongodb"
	} else {
		settings["MONGODB_URI"] = request.Database.URI
	}
	if request.Storage.Mode == "local" {
		accessKey, err := randomHex(16)
		if err != nil {
			return nil, err
		}
		secretKey, err := randomBase64(32)
		if err != nil {
			return nil, err
		}
		settings["S3_ENDPOINT"] = "http://seaweedfs:8333"
		settings["S3_BROWSER_ENDPOINT"] = settings["PORTAL_PUBLIC_URL"]
		settings["S3_REGION"] = "us-east-1"
		settings["S3_ACCESS_KEY_ID"] = accessKey
		settings["S3_SECRET_ACCESS_KEY"] = secretKey
		settings["S3_BUCKET_NAME"] = "fyp-uploads"
		settings["S3_FORCE_PATH_STYLE"] = "true"
		settings["FYP_SEAWEEDFS_DATA_DIR"] = "/var/lib/fyp-portal/seaweedfs"
	} else {
		settings["S3_ENDPOINT"] = request.Storage.Endpoint
		settings["S3_BROWSER_ENDPOINT"] = request.Storage.BrowserEndpoint
		settings["S3_REGION"] = request.Storage.Region
		settings["S3_ACCESS_KEY_ID"] = request.Storage.AccessKeyID
		settings["S3_SECRET_ACCESS_KEY"] = request.Storage.SecretAccessKey
		settings["S3_BUCKET_NAME"] = request.Storage.BucketName
		settings["S3_FORCE_PATH_STYLE"] = strconv.FormatBool(request.Storage.ForcePathStyle)
	}
	if request.Mail.Host != "" {
		settings["SMTP_HOST"] = request.Mail.Host
		settings["SMTP_PORT"] = strconv.Itoa(request.Mail.Port)
		settings["SMTP_TLS_MODE"] = request.Mail.TLSMode
		settings["SMTP_FROM_ADDRESS"] = request.Mail.From
		settings["SMTP_FROM_NAME"] = request.Mail.FromName
		if request.Mail.Username != "" {
			settings["SMTP_USER"] = request.Mail.Username
			settings["SMTP_PASSWORD"] = request.Mail.Password
		}
		if request.Mail.ReplyTo != "" {
			settings["SMTP_REPLY_TO"] = request.Mail.ReplyTo
		}
	}
	return settings, nil
}

func composeFilesForRequest(request installationRequest) []string {
	files := []string{"deploy/compose.yaml", "deploy/compose.gateway.yaml"}
	if request.Database.Mode == "local" {
		files = append(files, "deploy/compose.local-mongodb.yaml")
	}
	if request.Storage.Mode == "local" {
		files = append(files, "deploy/compose.local-storage.yaml")
	}
	return files
}

func preflightInstallation(request installationRequest, paths Paths) error {
	contents, err := os.ReadFile("/etc/os-release")
	if err != nil {
		return fmt.Errorf("read operating system release: %w", err)
	}
	osRelease := string(contents)
	if !strings.Contains(osRelease, "ID=ubuntu") || !strings.Contains(osRelease, "VERSION_ID=\"24.04\"") {
		return errors.New("FYP Portal requires Ubuntu 24.04 LTS")
	}
	if runtime.GOARCH != "amd64" {
		return fmt.Errorf("FYP Portal requires amd64, found %s", runtime.GOARCH)
	}
	memory, err := availableMemory()
	if err != nil || memory < minimumMemoryBytes {
		return errors.New("FYP Portal requires at least 2 GiB of memory")
	}
	diskPath := paths.ReleaseDir
	for {
		if _, err := os.Stat(diskPath); err == nil {
			break
		} else if !errors.Is(err, os.ErrNotExist) {
			return fmt.Errorf("inspect installation filesystem: %w", err)
		}
		parent := filepath.Dir(diskPath)
		if parent == diskPath {
			return errors.New("installation filesystem is unavailable")
		}
		diskPath = parent
	}
	var filesystem syscall.Statfs_t
	if err := syscall.Statfs(diskPath, &filesystem); err != nil {
		return fmt.Errorf("inspect installation filesystem: %w", err)
	}
	if uint64(filesystem.Bavail)*uint64(filesystem.Bsize) < minimumDiskBytes {
		return errors.New("FYP Portal requires at least 20 GiB of free disk space")
	}
	for _, port := range []string{":80", ":443"} {
		listener, err := net.Listen("tcp", port)
		if err != nil {
			return fmt.Errorf("required port %s is unavailable", strings.TrimPrefix(port, ":"))
		}
		listener.Close()
	}
	if addresses, err := net.LookupHost(request.Domain); err != nil || len(addresses) == 0 {
		return errors.New("installation domain does not resolve in DNS")
	}
	connection, err := net.DialTimeout("tcp", "download.docker.com:443", 10*time.Second)
	if err != nil {
		return errors.New("cannot reach Docker's Ubuntu package repository")
	}
	connection.Close()
	return nil
}

func availableMemory() (uint64, error) {
	contents, err := os.ReadFile("/proc/meminfo")
	if err != nil {
		return 0, err
	}
	for _, line := range strings.Split(string(contents), "\n") {
		fields := strings.Fields(line)
		if len(fields) == 3 && fields[0] == "MemAvailable:" && fields[2] == "kB" {
			value, err := strconv.ParseUint(fields[1], 10, 64)
			if err == nil {
				return value * 1024, nil
			}
		}
	}
	return 0, errors.New("MemAvailable is unavailable")
}

func dockerAvailable() bool {
	return exec.Command("docker", "compose", "version").Run() == nil
}

func installedConflicts() ([]string, error) {
	output, err := exec.Command("dpkg-query", "-W", "-f=${db:Status-Abbrev} ${binary:Package}\\n", "docker.io", "docker-compose", "docker-compose-v2", "docker-doc", "podman-docker", "containerd", "runc").CombinedOutput()
	if err != nil && len(output) == 0 {
		return nil, fmt.Errorf("inspect conflicting Docker packages: %w", err)
	}
	var conflicts []string
	for _, line := range strings.Split(string(output), "\n") {
		fields := strings.Fields(line)
		if len(fields) == 2 && strings.HasPrefix(fields[0], "ii") {
			conflicts = append(conflicts, fields[1])
		}
	}
	return conflicts, nil
}

func installDocker(ctx context.Context) error {
	if dockerAvailable() {
		return nil
	}
	conflicts, err := installedConflicts()
	if err != nil {
		return err
	}
	if len(conflicts) > 0 {
		return fmt.Errorf("conflicting Docker packages are installed (%s); remove them explicitly before retrying", strings.Join(conflicts, ", "))
	}
	commands := [][]string{
		{"apt-get", "update"},
		{"apt-get", "install", "--yes", "ca-certificates", "curl"},
		{"install", "-m", "0755", "-d", "/etc/apt/keyrings"},
		{"curl", "--fail", "--silent", "--show-error", "--location", "https://download.docker.com/linux/ubuntu/gpg", "--output", "/etc/apt/keyrings/docker.asc"},
		{"chmod", "a+r", "/etc/apt/keyrings/docker.asc"},
	}
	for _, command := range commands {
		if _, err := commandOutput(ctx, redactor{}, command[0], command[1:], nil); err != nil {
			return err
		}
	}
	osRelease, err := os.ReadFile("/etc/os-release")
	if err != nil {
		return fmt.Errorf("read operating system release: %w", err)
	}
	codename := ""
	for _, line := range strings.Split(string(osRelease), "\n") {
		if strings.HasPrefix(line, "VERSION_CODENAME=") {
			codename = strings.Trim(strings.TrimPrefix(line, "VERSION_CODENAME="), "\"")
			break
		}
	}
	if codename != "noble" {
		return errors.New("Ubuntu 24.04 codename could not be confirmed")
	}
	source := strings.Join([]string{
		"Types: deb",
		"URIs: https://download.docker.com/linux/ubuntu",
		"Suites: noble",
		"Components: stable",
		"Architectures: amd64",
		"Signed-By: /etc/apt/keyrings/docker.asc",
		"",
	}, "\n")
	if err := writeAtomically("/etc/apt/sources.list.d/docker.sources", []byte(source), 0); err != nil {
		return err
	}
	for _, command := range [][]string{
		{"apt-get", "update"},
		{"apt-get", "install", "--yes", "docker-ce", "docker-ce-cli", "containerd.io", "docker-buildx-plugin", "docker-compose-plugin"},
		{"systemctl", "enable", "--now", "docker"},
	} {
		if _, err := commandOutput(ctx, redactor{}, command[0], command[1:], nil); err != nil {
			return err
		}
	}
	if !dockerAvailable() {
		return errors.New("Docker Compose plugin is unavailable after installation")
	}
	return nil
}

func copyRelease(source, destination string) error {
	if source == "" || destination == "" {
		return errors.New("release source and destination are required")
	}
	if _, err := os.Stat(filepath.Join(source, "deploy", "compose.yaml")); err != nil {
		return errors.New("release source is missing deployment files")
	}
	if _, err := os.Stat(filepath.Join(source, "fypctl")); err != nil {
		return errors.New("release source is missing the fypctl binary")
	}
	if _, err := os.Lstat(destination); !errors.Is(err, os.ErrNotExist) {
		if err == nil {
			return fmt.Errorf("release destination %s already exists", destination)
		}
		return fmt.Errorf("inspect release destination: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(destination), 0o755); err != nil {
		return fmt.Errorf("create release parent: %w", err)
	}
	temporary, err := os.MkdirTemp(filepath.Dir(destination), ".fyp-portal-release-")
	if err != nil {
		return fmt.Errorf("create temporary release: %w", err)
	}
	defer os.RemoveAll(temporary)
	copyError := filepath.WalkDir(source, func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		relative, err := filepath.Rel(source, path)
		if err != nil {
			return err
		}
		if relative == "." {
			return nil
		}
		name := entry.Name()
		if entry.IsDir() && (name == ".git" || name == ".next" || name == "node_modules" || name == ".codex" || name == ".agents") {
			return filepath.SkipDir
		}
		if strings.HasPrefix(name, ".env") || entry.Type()&os.ModeSymlink != 0 {
			if entry.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		target := filepath.Join(temporary, relative)
		if entry.IsDir() {
			return os.Mkdir(target, 0o755)
		}
		if !entry.Type().IsRegular() {
			return fmt.Errorf("release source contains unsupported file %s", relative)
		}
		contents, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		mode := info.Mode().Perm()
		if mode&0o111 != 0 {
			mode = 0o755
		} else {
			mode = 0o644
		}
		return os.WriteFile(target, contents, mode)
	})
	if copyError != nil {
		return copyError
	}
	if err := os.Rename(temporary, destination); err != nil {
		return fmt.Errorf("activate release: %w", err)
	}
	return nil
}

func installFypctl(paths Paths) error {
	source := filepath.Join(paths.ReleaseDir, "fypctl")
	contents, err := os.ReadFile(source)
	if err != nil {
		return fmt.Errorf("read fypctl binary: %w", err)
	}
	if len(contents) == 0 {
		return errors.New("fypctl binary is empty")
	}
	if err := writeAtomically("/usr/local/bin/fypctl", contents, 0); err != nil {
		return err
	}
	return os.Chmod("/usr/local/bin/fypctl", 0o755)
}

func installationSource() (string, error) {
	directory, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf("read installation source: %w", err)
	}
	return filepath.Abs(directory)
}

func hasUntrackedInstallation(paths Paths, owner uint32) (bool, error) {
	journal, err := readInstallationJournal(paths, owner)
	if err != nil || journal != nil {
		return journal == nil && err == nil, err
	}
	for _, path := range []string{paths.ConfigPath, paths.statePath(), paths.ReleaseDir} {
		if _, err := os.Lstat(path); err == nil {
			return true, nil
		} else if !errors.Is(err, os.ErrNotExist) {
			return false, fmt.Errorf("inspect existing installation: %w", err)
		}
	}
	return false, nil
}

func composeUp(paths Paths, redactor redactor) error {
	command, err := dockerComposeArgs(paths, 0, "up", "--build", "--detach", "--wait")
	if err != nil {
		return err
	}
	_, err = commandOutput(context.Background(), redactor, "docker", command, nil)
	return err
}

func runInstall(paths Paths, args []string, stdin io.Reader, stdout, stderr io.Writer) int {
	flags := flag.NewFlagSet("install", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	requestPath := flags.String("request", "", "root-owned 0600 JSON installation request")
	if err := flags.Parse(args); err != nil || len(flags.Args()) != 0 || *requestPath == "" {
		fmt.Fprintln(stderr, "install requires --request FILE")
		return 2
	}
	request, err := readInstallationRequest(*requestPath, 0)
	if err != nil {
		fmt.Fprintf(stderr, "install: %v\n", err)
		return 2
	}
	releaseLock, err := AcquireOperationLock(paths, 0)
	if err != nil {
		fmt.Fprintf(stderr, "install: %v\n", err)
		return 1
	}
	defer releaseLock()
	if existing, err := hasUntrackedInstallation(paths, 0); err != nil {
		fmt.Fprintf(stderr, "install: %v\n", err)
		return 1
	} else if existing {
		fmt.Fprintln(stderr, "install: an untracked installation already exists; refusing to overwrite it")
		return 1
	}
	fingerprint := installationFingerprint(request)
	journal, err := readInstallationJournal(paths, 0)
	if err != nil {
		fmt.Fprintf(stderr, "install: %v\n", err)
		return 1
	}
	if journal == nil {
		journal = &installationJournal{FormatVersion: 1, RequestFingerprint: fingerprint, CompletedSteps: make(map[string]bool)}
	} else if journal.RequestFingerprint != fingerprint {
		fmt.Fprintln(stderr, "install: request does not match the interrupted installation")
		return 1
	}

	if err := runInstallationStep(paths, 0, journal, "preflight", func() error { return preflightInstallation(request, paths) }); err != nil {
		fmt.Fprintf(stderr, "install: preflight failed: %v\n", err)
		return 1
	}
	if err := runInstallationStep(paths, 0, journal, "docker", func() error { return installDocker(context.Background()) }); err != nil {
		fmt.Fprintf(stderr, "install: Docker setup failed: %v\n", err)
		return 1
	}
	source, err := installationSource()
	if err != nil {
		fmt.Fprintf(stderr, "install: %v\n", err)
		return 1
	}
	if err := runInstallationStep(paths, 0, journal, "release", func() error {
		if _, err := os.Lstat(paths.ReleaseDir); errors.Is(err, os.ErrNotExist) {
			if err := copyRelease(source, paths.ReleaseDir); err != nil {
				return err
			}
		} else if err != nil {
			return fmt.Errorf("inspect release destination: %w", err)
		} else if _, err := os.Stat(filepath.Join(paths.ReleaseDir, "deploy", "compose.yaml")); err != nil {
			return errors.New("incomplete release destination exists; refusing to replace it")
		}
		return installFypctl(paths)
	}); err != nil {
		fmt.Fprintf(stderr, "install: release setup failed: %v\n", err)
		return 1
	}
	if err := runInstallationStep(paths, 0, journal, "configuration", func() error {
		if _, err := os.Lstat(paths.ConfigPath); err == nil {
			if err := validateProtectedFile(paths.ConfigPath, 0); err != nil {
				return err
			}
			return WriteDeploymentState(paths, DeploymentState{ReleaseVersion: cliVersion, ComposeFiles: composeFilesForRequest(request)}, 0)
		} else if !errors.Is(err, os.ErrNotExist) {
			return err
		}
		settings, err := buildRuntimeSettings(request, paths)
		if err != nil {
			return err
		}
		contents, err := envContents(settings)
		if err != nil {
			return err
		}
		if err := WriteProtectedConfig(paths.ConfigPath, contents, 0); err != nil {
			return err
		}
		return WriteDeploymentState(paths, DeploymentState{ReleaseVersion: cliVersion, ComposeFiles: composeFilesForRequest(request)}, 0)
	}); err != nil {
		fmt.Fprintf(stderr, "install: configuration failed: %v\n", err)
		return 1
	}
	redactor, err := loadRedactor(paths)
	if err != nil {
		fmt.Fprintf(stderr, "install: configuration: %v\n", err)
		return 1
	}
	if err := runInstallationStep(paths, 0, journal, "deployment", func() error { return composeUp(paths, redactor) }); err != nil {
		fmt.Fprintf(stderr, "install: deployment failed: %v\n", err)
		return 1
	}
	if err := runInstallationStep(paths, 0, journal, "bootstrap", func() error {
		arguments := []string{
			"--password-stdin",
			"--university-name", request.Bootstrap.UniversityName,
			"--primary-color", request.Bootstrap.PrimaryColor,
			"--accent-color", request.Bootstrap.AccentColor,
			"--admin-name", request.Bootstrap.Administrator.Name,
			"--admin-email", request.Bootstrap.Administrator.Email,
			"--admin-roll-no", request.Bootstrap.Administrator.RollNo,
		}
		returnCode := runBootstrap(paths, arguments, strings.NewReader(request.Bootstrap.Administrator.Password+"\n"), io.Discard, stderr)
		if returnCode != 0 {
			return errors.New("initial administrator bootstrap failed")
		}
		return nil
	}); err != nil {
		fmt.Fprintf(stderr, "install: bootstrap failed: %v\n", err)
		return 1
	}
	if request.Setup.Configured {
		if err := runInstallationStep(paths, 0, journal, "preferences", func() error {
			branding := wizardBranding{
				UniversityName: request.Bootstrap.UniversityName,
				PrimaryColor:   request.Bootstrap.PrimaryColor,
				AccentColor:    request.Bootstrap.AccentColor,
			}
			if err := applyPortalConfiguration(paths, redactor, branding, request.Setup.Retention, request.Setup.LogoBase64); err != nil {
				return err
			}
			return applyBackupSchedule(paths, redactor, request.Setup.Backup.Enabled, request.Setup.Backup.DailyAt, request.Setup.Backup.Keep)
		}); err != nil {
			fmt.Fprintf(stderr, "install: preferences failed: %v\n", err)
			return 1
		}
	}
	if err := runInstallationStep(paths, 0, journal, "timers", func() error {
		returnCode := runTimers(paths, []string{"install"}, io.Discard, stderr)
		if returnCode != 0 {
			return errors.New("background timer setup failed")
		}
		return nil
	}); err != nil {
		fmt.Fprintf(stderr, "install: timer setup failed: %v\n", err)
		return 1
	}
	fmt.Fprintln(stdout, "install: complete")
	return 0
}
