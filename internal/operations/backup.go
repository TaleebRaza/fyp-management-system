package operations

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	pathpkg "path"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

const (
	backupFormatVersion   = 1
	backupEncryptionMagic = "FYPB01"
	backupChunkSize       = 1024 * 1024
	backupPortalUserID    = 1001
)

type backupPolicy struct {
	RetentionCount int    `json:"retentionCount"`
	DailyAt        string `json:"dailyAt"`
}

type maintenanceState struct {
	StartedAt    time.Time `json:"startedAt"`
	ActiveTimers []string  `json:"activeTimers"`
}

type backupManifest struct {
	FormatVersion             int       `json:"formatVersion"`
	BackupID                  string    `json:"backupId"`
	CreatedAt                 time.Time `json:"createdAt"`
	ReleaseVersion            string    `json:"releaseVersion"`
	ArchiveSHA256             string    `json:"archiveSha256"`
	ApplicationManifestSHA256 string    `json:"applicationManifestSha256"`
}

type backupDirectories struct {
	Root    string
	Staging string
	Restore string
}

type encryptedChunkWriter struct {
	output      io.Writer
	aead        cipher.AEAD
	noncePrefix [8]byte
	counter     uint32
	buffer      []byte
	closed      bool
}

func backupPolicyPath(paths Paths) string {
	return filepath.Join(paths.StateDir, "backup-policy.json")
}

func maintenanceStatePath(paths Paths) string {
	return filepath.Join(paths.StateDir, "maintenance.json")
}

func backupDirectoriesFor(paths Paths, settings map[string]string) (backupDirectories, error) {
	root := strings.TrimSpace(settings["FYP_BACKUP_DIR"])
	if root == "" {
		root = "/var/lib/fyp-portal/backups"
	}
	root = filepath.Clean(root)
	if !filepath.IsAbs(root) || root == "/" {
		return backupDirectories{}, errors.New("FYP_BACKUP_DIR must be a safe absolute path")
	}

	staging := strings.TrimSpace(settings["FYP_BACKUP_STAGING_DIR"])
	if staging == "" {
		staging = filepath.Join(root, ".staging")
	}
	staging = filepath.Clean(staging)
	if staging != filepath.Join(root, ".staging") {
		return backupDirectories{}, errors.New("FYP_BACKUP_STAGING_DIR must equal FYP_BACKUP_DIR/.staging")
	}

	return backupDirectories{
		Root:    root,
		Staging: staging,
		Restore: filepath.Join(root, ".restore"),
	}, nil
}

func ensureBackupDirectories(directories backupDirectories) error {
	if err := ensureSecureDirectory(directories.Root, 0); err != nil {
		return err
	}
	if err := ensureSecureDirectory(directories.Staging, backupPortalUserID); err != nil {
		return err
	}
	return ensureSecureDirectory(directories.Restore, 0)
}

func loadSettings(paths Paths) (map[string]string, error) {
	if err := validateProtectedFile(paths.ConfigPath, 0); err != nil {
		return nil, err
	}
	return parseEnvFile(paths.ConfigPath)
}

func backupRecoveryKey(settings map[string]string) ([]byte, error) {
	encoded := strings.TrimSpace(settings["FYP_BACKUP_RECOVERY_KEY"])
	if encoded == "" {
		return nil, errors.New("FYP_BACKUP_RECOVERY_KEY is required for backup and restore")
	}
	key, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil || len(key) != 32 {
		return nil, errors.New("FYP_BACKUP_RECOVERY_KEY must be a base64-encoded 32-byte key")
	}
	return key, nil
}

func backupID(value string) (string, error) {
	if !regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`).MatchString(value) {
		return "", errors.New("backup identifier is invalid")
	}
	return value, nil
}

func newBackupID() (string, error) {
	randomBytes := make([]byte, 8)
	if _, err := rand.Read(randomBytes); err != nil {
		return "", fmt.Errorf("generate backup identifier: %w", err)
	}
	return fmt.Sprintf("%s-%s", time.Now().UTC().Format("20060102T150405Z"), hex.EncodeToString(randomBytes)), nil
}

func archivePath(directories backupDirectories, identifier string) string {
	return filepath.Join(directories.Root, identifier+".fypbak")
}

func backupManifestPath(directories backupDirectories, identifier string) string {
	return filepath.Join(directories.Root, identifier+".manifest.json")
}

func applicationBackupPath(directories backupDirectories, identifier string) string {
	return filepath.Join(directories.Staging, identifier)
}

func hashFile(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", err
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

func writeAll(output io.Writer, contents []byte) error {
	for len(contents) > 0 {
		written, err := output.Write(contents)
		if err != nil {
			return err
		}
		if written == 0 {
			return io.ErrShortWrite
		}
		contents = contents[written:]
	}
	return nil
}

func newEncryptedChunkWriter(output io.Writer, key []byte) (*encryptedChunkWriter, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("create backup cipher: %w", err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("create backup cipher: %w", err)
	}
	writer := &encryptedChunkWriter{output: output, aead: aead, buffer: make([]byte, 0, backupChunkSize)}
	if _, err := rand.Read(writer.noncePrefix[:]); err != nil {
		return nil, fmt.Errorf("generate backup nonce: %w", err)
	}
	if err := writeAll(output, append([]byte(backupEncryptionMagic), writer.noncePrefix[:]...)); err != nil {
		return nil, err
	}
	return writer, nil
}

func (writer *encryptedChunkWriter) flush() error {
	if len(writer.buffer) == 0 {
		return nil
	}
	if writer.counter == ^uint32(0) {
		return errors.New("backup archive is too large")
	}
	nonce := make([]byte, writer.aead.NonceSize())
	copy(nonce, writer.noncePrefix[:])
	binary.BigEndian.PutUint32(nonce[len(nonce)-4:], writer.counter)
	ciphertext := writer.aead.Seal(nil, nonce, writer.buffer, nil)
	length := make([]byte, 4)
	binary.BigEndian.PutUint32(length, uint32(len(writer.buffer)))
	if err := writeAll(writer.output, length); err != nil {
		return err
	}
	if err := writeAll(writer.output, ciphertext); err != nil {
		return err
	}
	writer.counter++
	writer.buffer = writer.buffer[:0]
	return nil
}

func (writer *encryptedChunkWriter) Write(contents []byte) (int, error) {
	if writer.closed {
		return 0, errors.New("backup archive is closed")
	}
	written := len(contents)
	for len(contents) > 0 {
		available := backupChunkSize - len(writer.buffer)
		if available > len(contents) {
			available = len(contents)
		}
		writer.buffer = append(writer.buffer, contents[:available]...)
		contents = contents[available:]
		if len(writer.buffer) == backupChunkSize {
			if err := writer.flush(); err != nil {
				return written - len(contents), err
			}
		}
	}
	return written, nil
}

func (writer *encryptedChunkWriter) Close() error {
	if writer.closed {
		return nil
	}
	writer.closed = true
	return writer.flush()
}

func decryptArchive(input io.Reader, output io.Writer, key []byte) error {
	block, err := aes.NewCipher(key)
	if err != nil {
		return fmt.Errorf("create backup cipher: %w", err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return fmt.Errorf("create backup cipher: %w", err)
	}
	header := make([]byte, len(backupEncryptionMagic))
	if _, err := io.ReadFull(input, header); err != nil || string(header) != backupEncryptionMagic {
		return errors.New("backup archive is not recognized")
	}
	noncePrefix := make([]byte, 8)
	if _, err := io.ReadFull(input, noncePrefix); err != nil {
		return errors.New("backup archive is incomplete")
	}

	var counter uint32
	for {
		length := make([]byte, 4)
		if _, err := io.ReadFull(input, length); err != nil {
			if errors.Is(err, io.EOF) {
				return nil
			}
			return errors.New("backup archive is incomplete")
		}
		plaintextLength := binary.BigEndian.Uint32(length)
		if plaintextLength == 0 || plaintextLength > backupChunkSize || counter == ^uint32(0) {
			return errors.New("backup archive is invalid")
		}
		ciphertext := make([]byte, int(plaintextLength)+aead.Overhead())
		if _, err := io.ReadFull(input, ciphertext); err != nil {
			return errors.New("backup archive is incomplete")
		}
		nonce := make([]byte, aead.NonceSize())
		copy(nonce, noncePrefix)
		binary.BigEndian.PutUint32(nonce[len(nonce)-4:], counter)
		plaintext, err := aead.Open(nil, nonce, ciphertext, nil)
		if err != nil || len(plaintext) != int(plaintextLength) {
			return errors.New("backup archive integrity check failed")
		}
		if err := writeAll(output, plaintext); err != nil {
			return err
		}
		counter++
	}
}

func addArchiveFile(writer *tar.Writer, source, name string) error {
	info, err := os.Lstat(source)
	if err != nil {
		return err
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() {
		return fmt.Errorf("backup source %s must be a regular file", source)
	}
	header, err := tar.FileInfoHeader(info, "")
	if err != nil {
		return err
	}
	header.Name = name
	header.Mode = 0o600
	if err := writer.WriteHeader(header); err != nil {
		return err
	}
	file, err := os.Open(source)
	if err != nil {
		return err
	}
	_, copyError := io.Copy(writer, file)
	closeError := file.Close()
	return errors.Join(copyError, closeError)
}

func addArchiveDirectory(writer *tar.Writer, source, prefix string) error {
	if err := writer.WriteHeader(&tar.Header{Name: strings.TrimSuffix(prefix, "/") + "/", Mode: 0o700, Typeflag: tar.TypeDir}); err != nil {
		return err
	}
	return filepath.WalkDir(source, func(path string, entry os.DirEntry, walkError error) error {
		if walkError != nil {
			return walkError
		}
		if path == source {
			return nil
		}
		info, err := os.Lstat(path)
		if err != nil {
			return err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("backup source %s must not contain symbolic links", path)
		}
		relativePath, err := filepath.Rel(source, path)
		if err != nil {
			return err
		}
		name := strings.TrimSuffix(prefix, "/") + "/" + filepath.ToSlash(relativePath)
		if entry.IsDir() {
			return writer.WriteHeader(&tar.Header{Name: name + "/", Mode: 0o700, Typeflag: tar.TypeDir})
		}
		if !info.Mode().IsRegular() {
			return fmt.Errorf("backup source %s must contain only regular files", path)
		}
		return addArchiveFile(writer, path, name)
	})
}

func createBackupArchive(paths Paths, directories backupDirectories, identifier string, key []byte, state *DeploymentState) (string, error) {
	temporary, err := os.CreateTemp(directories.Root, ".backup-")
	if err != nil {
		return "", fmt.Errorf("create backup archive: %w", err)
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if err := temporary.Chmod(0o600); err != nil {
		temporary.Close()
		return "", err
	}

	encrypted, err := newEncryptedChunkWriter(temporary, key)
	if err != nil {
		temporary.Close()
		return "", err
	}
	compressed := gzip.NewWriter(encrypted)
	archive := tar.NewWriter(compressed)
	application := applicationBackupPath(directories, identifier)
	archiveError := addArchiveDirectory(archive, application, "application")
	if archiveError == nil {
		archiveError = addArchiveFile(archive, paths.ConfigPath, "recovery/portal.env")
	}
	if archiveError == nil && state != nil {
		if err := validateProtectedFile(paths.statePath(), 0); err != nil {
			archiveError = err
		} else {
			archiveError = addArchiveFile(archive, paths.statePath(), "recovery/deployment-state.json")
		}
	}
	if archiveError == nil {
		if _, err := os.Lstat(backupPolicyPath(paths)); err == nil {
			if err := validateProtectedFile(backupPolicyPath(paths), 0); err != nil {
				archiveError = err
			} else {
				archiveError = addArchiveFile(archive, backupPolicyPath(paths), "recovery/backup-policy.json")
			}
		} else if !errors.Is(err, os.ErrNotExist) {
			archiveError = err
		}
	}
	archiveError = errors.Join(archiveError, archive.Close(), compressed.Close(), encrypted.Close(), temporary.Sync(), temporary.Close())
	if archiveError != nil {
		return "", archiveError
	}

	path := archivePath(directories, identifier)
	if _, err := os.Lstat(path); err == nil {
		return "", errors.New("backup archive already exists")
	} else if !errors.Is(err, os.ErrNotExist) {
		return "", err
	}
	if err := os.Rename(temporaryPath, path); err != nil {
		return "", err
	}
	return path, nil
}

func verifyBackupArchive(archivePath string, key []byte) error {
	file, err := os.Open(archivePath)
	if err != nil {
		return err
	}
	defer file.Close()
	decrypted, err := os.CreateTemp(filepath.Dir(archivePath), ".verify-")
	if err != nil {
		return err
	}
	decryptedPath := decrypted.Name()
	defer os.Remove(decryptedPath)
	if err := decryptArchive(file, decrypted, key); err != nil {
		decrypted.Close()
		return err
	}
	if err := decrypted.Close(); err != nil {
		return err
	}
	input, err := os.Open(decryptedPath)
	if err != nil {
		return err
	}
	defer input.Close()
	compressed, err := gzip.NewReader(input)
	if err != nil {
		return errors.New("backup archive compression is invalid")
	}
	defer compressed.Close()
	archive := tar.NewReader(compressed)
	for {
		header, err := archive.Next()
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return errors.New("backup archive contents are invalid")
		}
		if _, err := io.Copy(io.Discard, archive); err != nil {
			return fmt.Errorf("read backup archive entry %s: %w", header.Name, err)
		}
	}
}

func readBackupPolicy(paths Paths) (backupPolicy, error) {
	policy := backupPolicy{RetentionCount: 7}
	contents, err := os.ReadFile(backupPolicyPath(paths))
	if errors.Is(err, os.ErrNotExist) {
		return policy, nil
	}
	if err != nil {
		return backupPolicy{}, err
	}
	if err := validateProtectedFile(backupPolicyPath(paths), 0); err != nil {
		return backupPolicy{}, err
	}
	if err := json.Unmarshal(contents, &policy); err != nil {
		return backupPolicy{}, errors.New("backup policy is invalid")
	}
	if policy.RetentionCount < 1 || policy.RetentionCount > 365 || (policy.DailyAt != "" && !isDailyTime(policy.DailyAt)) {
		return backupPolicy{}, errors.New("backup policy is invalid")
	}
	return policy, nil
}

func writeBackupPolicy(paths Paths, policy backupPolicy) error {
	if policy.RetentionCount < 1 || policy.RetentionCount > 365 || (policy.DailyAt != "" && !isDailyTime(policy.DailyAt)) {
		return errors.New("backup policy is invalid")
	}
	if err := ensureSecureDirectory(paths.StateDir, 0); err != nil {
		return err
	}
	contents, err := json.MarshalIndent(policy, "", "  ")
	if err != nil {
		return err
	}
	return writeAtomically(backupPolicyPath(paths), append(contents, '\n'), 0)
}

func isDailyTime(value string) bool {
	if len(value) != 5 || value[2] != ':' {
		return false
	}
	for _, position := range []int{0, 1, 3, 4} {
		if value[position] < '0' || value[position] > '9' {
			return false
		}
	}
	hour := (value[0]-'0')*10 + value[1] - '0'
	minute := (value[3]-'0')*10 + value[4] - '0'
	return hour < 24 && minute < 60
}

func readMaintenanceState(paths Paths) (*maintenanceState, error) {
	contents, err := os.ReadFile(maintenanceStatePath(paths))
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if err := validateProtectedFile(maintenanceStatePath(paths), 0); err != nil {
		return nil, err
	}
	var state maintenanceState
	if err := json.Unmarshal(contents, &state); err != nil {
		return nil, errors.New("maintenance state is invalid")
	}
	return &state, nil
}

func writeMaintenanceState(paths Paths, state maintenanceState) error {
	if err := ensureSecureDirectory(paths.StateDir, 0); err != nil {
		return err
	}
	contents, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}
	return writeAtomically(maintenanceStatePath(paths), append(contents, '\n'), 0)
}

func removeMaintenanceState(paths Paths) error {
	path := maintenanceStatePath(paths)
	info, err := os.Lstat(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() {
		return errors.New("maintenance state must be a regular file")
	}
	if err := os.Remove(path); err != nil {
		return err
	}
	directory, err := os.Open(filepath.Dir(path))
	if err != nil {
		return err
	}
	defer directory.Close()
	return directory.Sync()
}

func isSystemdUnitActive(name string) (bool, error) {
	err := exec.Command("systemctl", "is-active", "--quiet", name).Run()
	if err == nil {
		return true, nil
	}
	var exitError *exec.ExitError
	if errors.As(err, &exitError) {
		return false, nil
	}
	return false, err
}

func pauseBackgroundWorkers(redactor redactor) ([]string, error) {
	timers := []string{"fyp-portal-essential.timer", "fyp-portal-retention.timer"}
	activeTimers := make([]string, 0, len(timers))
	for _, timer := range timers {
		active, err := isSystemdUnitActive(timer)
		if err != nil {
			return nil, fmt.Errorf("inspect %s: %w", timer, err)
		}
		if !active {
			continue
		}
		if _, err := commandOutput(context.Background(), redactor, "systemctl", []string{"stop", timer}, nil); err != nil {
			return nil, err
		}
		activeTimers = append(activeTimers, timer)
	}
	for _, service := range []string{"fyp-portal-essential.service", "fyp-portal-retention.service"} {
		active, err := isSystemdUnitActive(service)
		if err != nil {
			return nil, fmt.Errorf("inspect %s: %w", service, err)
		}
		if active {
			if _, err := commandOutput(context.Background(), redactor, "systemctl", []string{"stop", service}, nil); err != nil {
				return nil, err
			}
		}
	}
	return activeTimers, nil
}

func resumeBackgroundWorkers(redactor redactor, timers []string) error {
	for _, timer := range timers {
		if _, err := commandOutput(context.Background(), redactor, "systemctl", []string{"start", timer}, nil); err != nil {
			return err
		}
	}
	return nil
}

func runMaintenanceScript(paths Paths, redactor redactor, operation string) error {
	command, err := dockerComposeArgs(paths, 0, "exec", "-T", "app", "node", "scripts/set-maintenance.mjs", operation)
	if err != nil {
		return err
	}
	_, err = commandOutput(context.Background(), redactor, "docker", command, nil)
	return err
}

func startMaintenance(paths Paths, redactor redactor) (*maintenanceState, error) {
	existing, err := readMaintenanceState(paths)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		if err := runMaintenanceScript(paths, redactor, "start"); err != nil {
			return nil, err
		}
		return existing, nil
	}

	activeTimers, err := pauseBackgroundWorkers(redactor)
	if err != nil {
		return nil, err
	}
	if err := runMaintenanceScript(paths, redactor, "start"); err != nil {
		return nil, errors.Join(err, resumeBackgroundWorkers(redactor, activeTimers))
	}
	state := maintenanceState{StartedAt: time.Now().UTC(), ActiveTimers: activeTimers}
	if err := writeMaintenanceState(paths, state); err != nil {
		return nil, errors.Join(err, runMaintenanceScript(paths, redactor, "stop"), resumeBackgroundWorkers(redactor, activeTimers))
	}
	return &state, nil
}

func stopMaintenance(paths Paths, redactor redactor) error {
	state, err := readMaintenanceState(paths)
	if err != nil {
		return err
	}
	if err := runMaintenanceScript(paths, redactor, "stop"); err != nil {
		return err
	}
	if err := removeMaintenanceState(paths); err != nil {
		return err
	}
	if state == nil {
		return nil
	}
	return resumeBackgroundWorkers(redactor, state.ActiveTimers)
}

func runMaintenance(paths Paths, args []string, stdout, stderr io.Writer) int {
	if len(args) != 1 || (args[0] != "start" && args[0] != "stop" && args[0] != "status") {
		fmt.Fprintln(stderr, "maintenance requires start, stop, or status")
		return 2
	}
	redactor, err := loadRedactor(paths)
	if err != nil {
		fmt.Fprintf(stderr, "configuration: %v\n", err)
		return 1
	}
	if args[0] == "status" {
		state, err := readMaintenanceState(paths)
		if err != nil {
			fmt.Fprintf(stderr, "maintenance: %v\n", err)
			return 1
		}
		if state == nil {
			fmt.Fprintln(stdout, "maintenance: inactive")
		} else {
			fmt.Fprintf(stdout, "maintenance: active since %s\n", state.StartedAt.Format(time.RFC3339))
		}
		return 0
	}
	release, err := AcquireOperationLock(paths, 0)
	if err != nil {
		fmt.Fprintf(stderr, "maintenance: %v\n", err)
		return 1
	}
	defer release()
	if args[0] == "start" {
		if _, err := startMaintenance(paths, redactor); err != nil {
			fmt.Fprintf(stderr, "maintenance: %v\n", err)
			return 1
		}
		fmt.Fprintln(stdout, "maintenance: active")
		return 0
	}
	if err := stopMaintenance(paths, redactor); err != nil {
		fmt.Fprintf(stderr, "maintenance: %v\n", err)
		return 1
	}
	fmt.Fprintln(stdout, "maintenance: inactive")
	return 0
}

func parseBackupCreateArgs(args []string, paths Paths) (int, error) {
	flags := flag.NewFlagSet("backup create", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	keep := flags.Int("keep", 7, "number of completed backups to retain")
	scheduled := flags.Bool("scheduled", false, "use the persisted backup policy")
	if err := flags.Parse(args); err != nil || len(flags.Args()) != 0 || *keep < 1 || *keep > 365 {
		return 0, errors.New("backup create accepts --keep 1..365")
	}
	if !*scheduled {
		return *keep, nil
	}
	if *keep != 7 {
		return 0, errors.New("scheduled backup retention is configured with backup schedule")
	}
	policy, err := readBackupPolicy(paths)
	if err != nil {
		return 0, err
	}
	if policy.DailyAt == "" {
		return 0, errors.New("no backup schedule is configured")
	}
	return policy.RetentionCount, nil
}

func runApplicationBackup(paths Paths, redactor redactor, operation, identifier string) error {
	command, err := dockerComposeArgs(paths, 0, "exec", "-T", "app", "node", "scripts/backup-application-data.mjs", operation, identifier)
	if err != nil {
		return err
	}
	_, err = commandOutput(context.Background(), redactor, "docker", command, nil)
	return err
}

func writeBackupManifest(path string, manifest backupManifest) error {
	contents, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return err
	}
	return writeAtomically(path, append(contents, '\n'), 0)
}

func readBackupManifest(path string) (backupManifest, error) {
	contents, err := os.ReadFile(path)
	if err != nil {
		return backupManifest{}, err
	}
	if err := validateProtectedFile(path, 0); err != nil {
		return backupManifest{}, err
	}
	var manifest backupManifest
	if err := json.Unmarshal(contents, &manifest); err != nil {
		return backupManifest{}, errors.New("backup manifest is invalid")
	}
	if manifest.FormatVersion != backupFormatVersion || manifest.BackupID == "" || manifest.ArchiveSHA256 == "" || manifest.ApplicationManifestSHA256 == "" {
		return backupManifest{}, errors.New("backup manifest is invalid")
	}
	if _, err := backupID(manifest.BackupID); err != nil {
		return backupManifest{}, errors.New("backup manifest is invalid")
	}
	return manifest, nil
}

func pruneBackups(directories backupDirectories, keep int) error {
	entries, err := os.ReadDir(directories.Root)
	if err != nil {
		return err
	}
	completed := make([]backupManifest, 0)
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".manifest.json") {
			continue
		}
		manifest, err := readBackupManifest(filepath.Join(directories.Root, entry.Name()))
		if err != nil {
			continue
		}
		archive := archivePath(directories, manifest.BackupID)
		if info, err := os.Lstat(archive); err != nil || info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() {
			continue
		}
		completed = append(completed, manifest)
	}
	sort.Slice(completed, func(left, right int) bool {
		return completed[left].CreatedAt.After(completed[right].CreatedAt)
	})
	for _, manifest := range completed[keep:] {
		archive := archivePath(directories, manifest.BackupID)
		if err := os.Remove(archive); err != nil {
			return err
		}
		if err := os.Remove(backupManifestPath(directories, manifest.BackupID)); err != nil {
			return err
		}
	}
	return nil
}

func createBackup(paths Paths, redactor redactor, settings map[string]string, keep int) (backupManifest, error) {
	directories, err := backupDirectoriesFor(paths, settings)
	if err != nil {
		return backupManifest{}, err
	}
	if err := ensureBackupDirectories(directories); err != nil {
		return backupManifest{}, err
	}
	key, err := backupRecoveryKey(settings)
	if err != nil {
		return backupManifest{}, err
	}
	identifier, err := newBackupID()
	if err != nil {
		return backupManifest{}, err
	}
	defer os.RemoveAll(applicationBackupPath(directories, identifier))
	if err := runApplicationBackup(paths, redactor, "create", identifier); err != nil {
		return backupManifest{}, err
	}
	applicationManifest := filepath.Join(applicationBackupPath(directories, identifier), "manifest.json")
	applicationHash, err := hashFile(applicationManifest)
	if err != nil {
		return backupManifest{}, errors.New("application backup did not produce a manifest")
	}
	state, err := ReadDeploymentState(paths, 0)
	if err != nil {
		return backupManifest{}, err
	}
	archive, err := createBackupArchive(paths, directories, identifier, key, state)
	if err != nil {
		return backupManifest{}, err
	}
	archiveCreated := true
	defer func() {
		if archiveCreated {
			_ = os.Remove(archive)
		}
	}()
	if err := verifyBackupArchive(archive, key); err != nil {
		return backupManifest{}, err
	}
	archiveHash, err := hashFile(archive)
	if err != nil {
		return backupManifest{}, err
	}
	manifest := backupManifest{
		FormatVersion:             backupFormatVersion,
		BackupID:                  identifier,
		CreatedAt:                 time.Now().UTC(),
		ReleaseVersion:            "",
		ArchiveSHA256:             archiveHash,
		ApplicationManifestSHA256: applicationHash,
	}
	if state != nil {
		manifest.ReleaseVersion = state.ReleaseVersion
	}
	if err := writeBackupManifest(backupManifestPath(directories, identifier), manifest); err != nil {
		return backupManifest{}, err
	}
	archiveCreated = false
	if err := pruneBackups(directories, keep); err != nil {
		return backupManifest{}, err
	}
	return manifest, nil
}

func runBackupCreate(paths Paths, args []string, stdout, stderr io.Writer) int {
	keep, err := parseBackupCreateArgs(args, paths)
	if err != nil {
		fmt.Fprintf(stderr, "backup: %v\n", err)
		return 2
	}
	redactor, err := loadRedactor(paths)
	if err != nil {
		fmt.Fprintf(stderr, "configuration: %v\n", err)
		return 1
	}
	settings, err := loadSettings(paths)
	if err != nil {
		fmt.Fprintf(stderr, "configuration: %v\n", err)
		return 1
	}
	release, err := AcquireOperationLock(paths, 0)
	if err != nil {
		fmt.Fprintf(stderr, "backup: %v\n", err)
		return 1
	}
	defer release()
	alreadyInMaintenance, err := readMaintenanceState(paths)
	if err != nil {
		fmt.Fprintf(stderr, "backup: %v\n", err)
		return 1
	}
	if _, err := startMaintenance(paths, redactor); err != nil {
		fmt.Fprintf(stderr, "backup: %v\n", err)
		return 1
	}
	manifest, backupError := createBackup(paths, redactor, settings, keep)
	var maintenanceError error
	if alreadyInMaintenance == nil {
		maintenanceError = stopMaintenance(paths, redactor)
	}
	if backupError != nil {
		fmt.Fprintf(stderr, "backup: %v\n", backupError)
		if maintenanceError != nil {
			fmt.Fprintf(stderr, "backup: could not leave maintenance mode: %v\n", maintenanceError)
		}
		return 1
	}
	if maintenanceError != nil {
		fmt.Fprintf(stderr, "backup: could not leave maintenance mode: %v\n", maintenanceError)
		return 1
	}
	fmt.Fprintf(stdout, "backup: created %s\n", manifest.BackupID)
	return 0
}

func cleanArchiveName(name string) (string, error) {
	clean := pathpkg.Clean(name)
	if name == "" || strings.HasPrefix(name, "/") || clean == "." || clean == ".." || strings.HasPrefix(clean, "../") {
		return "", errors.New("backup archive contains an unsafe path")
	}
	return clean, nil
}

func extractBackupArchive(archivePath, destination string, key []byte) error {
	if err := os.Mkdir(destination, 0o700); err != nil {
		return err
	}
	archive, err := os.Open(archivePath)
	if err != nil {
		return err
	}
	defer archive.Close()
	temporary, err := os.CreateTemp(filepath.Dir(destination), ".restore-")
	if err != nil {
		return err
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if err := decryptArchive(archive, temporary, key); err != nil {
		temporary.Close()
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	input, err := os.Open(temporaryPath)
	if err != nil {
		return err
	}
	defer input.Close()
	compressed, err := gzip.NewReader(input)
	if err != nil {
		return errors.New("backup archive compression is invalid")
	}
	defer compressed.Close()
	reader := tar.NewReader(compressed)
	for {
		header, err := reader.Next()
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return errors.New("backup archive contents are invalid")
		}
		name, err := cleanArchiveName(header.Name)
		if err != nil {
			return err
		}
		target := filepath.Join(destination, filepath.FromSlash(name))
		if relativePath, err := filepath.Rel(destination, target); err != nil || relativePath == ".." || strings.HasPrefix(relativePath, ".."+string(filepath.Separator)) {
			return errors.New("backup archive contains an unsafe path")
		}
		switch header.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(target, 0o700); err != nil {
				return err
			}
		case tar.TypeReg, tar.TypeRegA:
			if err := os.MkdirAll(filepath.Dir(target), 0o700); err != nil {
				return err
			}
			file, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
			if err != nil {
				return err
			}
			_, copyError := io.Copy(file, reader)
			closeError := file.Close()
			if err := errors.Join(copyError, closeError); err != nil {
				return err
			}
		default:
			return errors.New("backup archive contains an unsupported entry")
		}
	}
}

func copyApplicationBackup(source, destination string) error {
	if err := os.Mkdir(destination, 0o700); err != nil {
		return err
	}
	if err := os.Chown(destination, backupPortalUserID, -1); err != nil {
		return err
	}
	return filepath.WalkDir(source, func(path string, entry os.DirEntry, walkError error) error {
		if walkError != nil {
			return walkError
		}
		if path == source {
			return nil
		}
		info, err := os.Lstat(path)
		if err != nil {
			return err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return errors.New("backup application data contains symbolic links")
		}
		relativePath, err := filepath.Rel(source, path)
		if err != nil {
			return err
		}
		target := filepath.Join(destination, relativePath)
		if entry.IsDir() {
			if err := os.Mkdir(target, 0o700); err != nil {
				return err
			}
			return os.Chown(target, backupPortalUserID, -1)
		}
		if !info.Mode().IsRegular() {
			return errors.New("backup application data must contain only regular files")
		}
		input, err := os.Open(path)
		if err != nil {
			return err
		}
		output, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
		if err != nil {
			input.Close()
			return err
		}
		_, copyError := io.Copy(output, input)
		closeError := errors.Join(input.Close(), output.Close())
		if err := errors.Join(copyError, closeError); err != nil {
			return err
		}
		return os.Chown(target, backupPortalUserID, -1)
	})
}

func parseRestoreArgs(args []string, input io.Reader) (string, []byte, bool, error) {
	flags := flag.NewFlagSet("backup restore", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	identifier := flags.String("backup", "", "backup identifier")
	keyStdin := flags.Bool("recovery-key-stdin", false, "read the recovery key from standard input")
	confirmation := flags.String("confirm-restore", "", "confirm restoring into an empty destination")
	restoreConfig := flags.Bool("restore-config", false, "restore protected portal configuration after data restoration")
	if err := flags.Parse(args); err != nil || len(flags.Args()) != 0 || !*keyStdin || *confirmation != "RESTORE_INTO_EMPTY_DESTINATION" {
		return "", nil, false, errors.New("backup restore requires --backup, --recovery-key-stdin, and --confirm-restore=RESTORE_INTO_EMPTY_DESTINATION")
	}
	validatedIdentifier, err := backupID(*identifier)
	if err != nil {
		return "", nil, false, err
	}
	contents, err := io.ReadAll(io.LimitReader(input, 256))
	if err != nil {
		return "", nil, false, err
	}
	if len(contents) == 256 {
		return "", nil, false, errors.New("recovery key is invalid")
	}
	key, err := backupRecoveryKey(map[string]string{"FYP_BACKUP_RECOVERY_KEY": strings.TrimSpace(string(contents))})
	if err != nil {
		return "", nil, false, err
	}
	return validatedIdentifier, key, *restoreConfig, nil
}

func copyRecoveredFile(source, destination string) error {
	contents, err := os.ReadFile(source)
	if err != nil {
		return err
	}
	if err := ensureSecureDirectory(filepath.Dir(destination), 0); err != nil {
		return err
	}
	return writeAtomically(destination, contents, 0)
}

func runBackupRestore(paths Paths, args []string, stdin io.Reader, stdout, stderr io.Writer) int {
	identifier, key, restoreConfig, err := parseRestoreArgs(args, stdin)
	if err != nil {
		fmt.Fprintf(stderr, "backup: %v\n", err)
		return 2
	}
	redactor, err := loadRedactor(paths)
	if err != nil {
		fmt.Fprintf(stderr, "configuration: %v\n", err)
		return 1
	}
	settings, err := loadSettings(paths)
	if err != nil {
		fmt.Fprintf(stderr, "configuration: %v\n", err)
		return 1
	}
	directories, err := backupDirectoriesFor(paths, settings)
	if err != nil {
		fmt.Fprintf(stderr, "backup: %v\n", err)
		return 1
	}
	if err := ensureBackupDirectories(directories); err != nil {
		fmt.Fprintf(stderr, "backup: %v\n", err)
		return 1
	}
	manifest, err := readBackupManifest(backupManifestPath(directories, identifier))
	if err != nil {
		fmt.Fprintf(stderr, "backup: %v\n", err)
		return 1
	}
	archive := archivePath(directories, identifier)
	if info, err := os.Lstat(archive); err != nil || info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() {
		fmt.Fprintln(stderr, "backup: archive is unavailable")
		return 1
	}
	if hash, err := hashFile(archive); err != nil || hash != manifest.ArchiveSHA256 {
		fmt.Fprintln(stderr, "backup: archive integrity check failed")
		return 1
	}
	state, err := ReadDeploymentState(paths, 0)
	if err != nil {
		fmt.Fprintf(stderr, "backup: %v\n", err)
		return 1
	}
	if manifest.ReleaseVersion != "" && (state == nil || state.ReleaseVersion != manifest.ReleaseVersion) {
		fmt.Fprintln(stderr, "backup: the installed release is not compatible with this backup")
		return 1
	}
	recovery := filepath.Join(directories.Restore, identifier)
	if err := extractBackupArchive(archive, recovery, key); err != nil {
		fmt.Fprintf(stderr, "backup: %v\n", err)
		return 1
	}
	application := filepath.Join(recovery, "application")
	applicationManifest, err := hashFile(filepath.Join(application, "manifest.json"))
	if err != nil || applicationManifest != manifest.ApplicationManifestSHA256 {
		fmt.Fprintln(stderr, "backup: application data integrity check failed")
		return 1
	}
	release, err := AcquireOperationLock(paths, 0)
	if err != nil {
		fmt.Fprintf(stderr, "backup: %v\n", err)
		return 1
	}
	defer release()
	alreadyInMaintenance, err := readMaintenanceState(paths)
	if err != nil {
		fmt.Fprintf(stderr, "backup: %v\n", err)
		return 1
	}
	if _, err := startMaintenance(paths, redactor); err != nil {
		fmt.Fprintf(stderr, "backup: %v\n", err)
		return 1
	}
	staging := applicationBackupPath(directories, identifier)
	if err := copyApplicationBackup(application, staging); err != nil {
		fmt.Fprintf(stderr, "backup: %v\n", err)
		return 1
	}
	defer os.RemoveAll(staging)
	if err := runApplicationBackup(paths, redactor, "verify", identifier); err != nil {
		fmt.Fprintf(stderr, "backup: %v\n", err)
		return 1
	}
	if err := runApplicationBackup(paths, redactor, "restore", identifier); err != nil {
		fmt.Fprintf(stderr, "backup: restore did not complete; maintenance mode remains active: %v\n", err)
		return 1
	}
	if alreadyInMaintenance == nil {
		if err := stopMaintenance(paths, redactor); err != nil {
			fmt.Fprintf(stderr, "backup: restored data but could not leave maintenance mode: %v\n", err)
			return 1
		}
	}
	if restoreConfig {
		if err := copyRecoveredFile(filepath.Join(recovery, "recovery", "portal.env"), paths.ConfigPath); err != nil {
			fmt.Fprintf(stderr, "backup: restored data but could not restore configuration: %v\n", err)
			return 1
		}
		if _, err := os.Lstat(filepath.Join(recovery, "recovery", "deployment-state.json")); err == nil {
			if err := copyRecoveredFile(filepath.Join(recovery, "recovery", "deployment-state.json"), paths.statePath()); err != nil {
				fmt.Fprintf(stderr, "backup: restored data but could not restore deployment state: %v\n", err)
				return 1
			}
		}
	}
	if err := os.RemoveAll(recovery); err != nil {
		fmt.Fprintf(stderr, "backup: restored data but could not remove recovery workspace: %v\n", err)
		return 1
	}
	fmt.Fprintf(stdout, "backup: restored %s\n", identifier)
	return 0
}

func runBackupSchedule(paths Paths, args []string, stdout, stderr io.Writer) int {
	if len(args) == 1 && args[0] == "off" {
		redactor, err := loadRedactor(paths)
		if err != nil {
			fmt.Fprintf(stderr, "configuration: %v\n", err)
			return 1
		}
		release, err := AcquireOperationLock(paths, 0)
		if err != nil {
			fmt.Fprintf(stderr, "backup: %v\n", err)
			return 1
		}
		defer release()
		policy, err := readBackupPolicy(paths)
		if err != nil {
			fmt.Fprintf(stderr, "backup: %v\n", err)
			return 1
		}
		policy.DailyAt = ""
		if err := writeBackupPolicy(paths, policy); err != nil {
			fmt.Fprintf(stderr, "backup: %v\n", err)
			return 1
		}
		timer := "/etc/systemd/system/fyp-portal-backup.timer"
		if _, err := os.Lstat(timer); err == nil {
			if _, err := commandOutput(context.Background(), redactor, "systemctl", []string{"disable", "--now", "fyp-portal-backup.timer"}, nil); err != nil {
				fmt.Fprintf(stderr, "backup: %v\n", err)
				return 1
			}
			if err := os.Remove(timer); err != nil {
				fmt.Fprintf(stderr, "backup: %v\n", err)
				return 1
			}
			if _, err := commandOutput(context.Background(), redactor, "systemctl", []string{"daemon-reload"}, nil); err != nil {
				fmt.Fprintf(stderr, "backup: %v\n", err)
				return 1
			}
		}
		fmt.Fprintln(stdout, "backup: schedule disabled")
		return 0
	}

	flags := flag.NewFlagSet("backup schedule", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	at := flags.String("at", "", "daily backup time in HH:MM")
	keep := flags.Int("keep", 7, "number of completed backups to retain")
	if len(args) == 0 || args[0] != "daily" || flags.Parse(args[1:]) != nil || len(flags.Args()) != 0 || !isDailyTime(*at) || *keep < 1 || *keep > 365 {
		fmt.Fprintln(stderr, "backup schedule requires daily --at HH:MM [--keep 1..365], or off")
		return 2
	}
	redactor, err := loadRedactor(paths)
	if err != nil {
		fmt.Fprintf(stderr, "configuration: %v\n", err)
		return 1
	}
	release, err := AcquireOperationLock(paths, 0)
	if err != nil {
		fmt.Fprintf(stderr, "backup: %v\n", err)
		return 1
	}
	defer release()
	if err := writeBackupPolicy(paths, backupPolicy{RetentionCount: *keep, DailyAt: *at}); err != nil {
		fmt.Fprintf(stderr, "backup: %v\n", err)
		return 1
	}
	if err := installSystemdUnit(paths, "fyp-portal-backup.service"); err != nil {
		fmt.Fprintf(stderr, "backup: %v\n", err)
		return 1
	}
	timer := fmt.Sprintf("[Unit]\nDescription=Run FYP Portal backup daily\n\n[Timer]\nOnCalendar=*-*-* %s:00\nPersistent=true\n\n[Install]\nWantedBy=timers.target\n", *at)
	if err := writeAtomically("/etc/systemd/system/fyp-portal-backup.timer", []byte(timer), 0); err != nil {
		fmt.Fprintf(stderr, "backup: %v\n", err)
		return 1
	}
	if _, err := commandOutput(context.Background(), redactor, "systemctl", []string{"daemon-reload"}, nil); err != nil {
		fmt.Fprintf(stderr, "backup: %v\n", err)
		return 1
	}
	if _, err := commandOutput(context.Background(), redactor, "systemctl", []string{"enable", "--now", "fyp-portal-backup.timer"}, nil); err != nil {
		fmt.Fprintf(stderr, "backup: %v\n", err)
		return 1
	}
	fmt.Fprintf(stdout, "backup: scheduled daily at %s\n", *at)
	return 0
}

func runBackup(paths Paths, args []string, stdin io.Reader, stdout, stderr io.Writer) int {
	if len(args) == 0 {
		fmt.Fprintln(stderr, "backup requires create, restore, or schedule")
		return 2
	}
	switch args[0] {
	case "create":
		return runBackupCreate(paths, args[1:], stdout, stderr)
	case "restore":
		return runBackupRestore(paths, args[1:], stdin, stdout, stderr)
	case "schedule":
		return runBackupSchedule(paths, args[1:], stdout, stderr)
	default:
		fmt.Fprintln(stderr, "backup requires create, restore, or schedule")
		return 2
	}
}
