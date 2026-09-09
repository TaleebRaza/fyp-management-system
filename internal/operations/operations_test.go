package operations

import (
	"bytes"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func testOwner() uint32 {
	return uint32(os.Geteuid())
}

func TestProtectedConfigAndDeploymentStateArePrivate(t *testing.T) {
	directory := t.TempDir()
	paths := Paths{
		ConfigPath: filepath.Join(directory, "etc", "portal.env"),
		StateDir:   filepath.Join(directory, "state"),
		ReleaseDir: filepath.Join(directory, "release"),
	}
	owner := testOwner()
	if err := WriteProtectedConfig(paths.ConfigPath, []byte("MONGODB_URI=mongodb://user:password@mongo/fyp\n"), owner); err != nil {
		t.Fatal(err)
	}
	if err := validateProtectedFile(paths.ConfigPath, owner); err != nil {
		t.Fatal(err)
	}
	if err := WriteDeploymentState(paths, DeploymentState{
		ReleaseVersion: "v0.1.0",
		ComposeFiles:   []string{"deploy/compose.yaml", "deploy/compose.gateway.yaml"},
	}, owner); err != nil {
		t.Fatal(err)
	}
	state, err := ReadDeploymentState(paths, owner)
	if err != nil {
		t.Fatal(err)
	}
	if state == nil || state.ReleaseVersion != "v0.1.0" || len(state.ComposeFiles) != 2 || state.UpdatedAt.IsZero() {
		t.Fatalf("unexpected deployment state: %#v", state)
	}
}

func TestOperationLockRejectsConcurrentOperations(t *testing.T) {
	paths := Paths{StateDir: filepath.Join(t.TempDir(), "state")}
	release, err := AcquireOperationLock(paths, testOwner())
	if err != nil {
		t.Fatal(err)
	}
	defer release()
	if _, err := AcquireOperationLock(paths, testOwner()); err == nil || !strings.Contains(err.Error(), "already running") {
		t.Fatalf("expected concurrent operation rejection, got %v", err)
	}
}

func TestBootstrapInputUsesStandardInputForPasswords(t *testing.T) {
	request, err := parseBootstrapRequest([]string{
		"--password-stdin",
		"--university-name", "Example University",
		"--admin-name", "Portal Admin",
		"--admin-email", "ADMIN@example.edu",
		"--admin-roll-no", "f23-0001",
	}, strings.NewReader("correct-horse-battery-staple\n"))
	if err != nil {
		t.Fatal(err)
	}
	if request.Administrator.Password != "correct-horse-battery-staple" || request.Administrator.Email != "admin@example.edu" || request.Administrator.RollNo != "F23-0001" {
		t.Fatalf("unexpected bootstrap request: %#v", request)
	}
}

func TestRedactorRemovesConfigurationSecrets(t *testing.T) {
	redactor := newRedactor(map[string]string{
		"MONGODB_URI":     "mongodb://user:password@mongo/fyp",
		"NEXTAUTH_SECRET": "not-for-logs",
	})
	redacted := redactor.Redact("connection mongodb://user:password@mongo/fyp failed with password and not-for-logs")
	if strings.Contains(redacted, "password") || strings.Contains(redacted, "not-for-logs") {
		t.Fatalf("secret leaked in %q", redacted)
	}
}

func TestEncryptedBackupChunksRoundTrip(t *testing.T) {
	key := bytes.Repeat([]byte{7}, 32)
	var encrypted bytes.Buffer
	writer, err := newEncryptedChunkWriter(&encrypted, key)
	if err != nil {
		t.Fatal(err)
	}
	payload := bytes.Repeat([]byte("false backup data"), 200_000)
	if _, err := writer.Write(payload); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	var restored bytes.Buffer
	if err := decryptArchive(&encrypted, &restored, key); err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(restored.Bytes(), payload) {
		t.Fatal("backup payload did not round-trip")
	}
}

func TestBackupInputValidationRejectsUnsafeIdentifiersAndSchedules(t *testing.T) {
	if _, err := backupID("../outside"); err == nil {
		t.Fatal("expected unsafe backup identifier rejection")
	}
	if !isDailyTime("02:00") || isDailyTime("24:00") || isDailyTime("2:00") {
		t.Fatal("unexpected backup schedule validation")
	}
}

func validInstallationRequest() installationRequest {
	var request installationRequest
	request.Domain = "portal.example.edu"
	request.Database.Mode = "local"
	request.Storage.Mode = "local"
	request.Bootstrap.UniversityName = "Example University"
	request.Bootstrap.PrimaryColor = "#14213d"
	request.Bootstrap.AccentColor = "#fca311"
	request.Bootstrap.Administrator.Name = "Portal Admin"
	request.Bootstrap.Administrator.Email = "admin@example.edu"
	request.Bootstrap.Administrator.RollNo = "F23-0001"
	request.Bootstrap.Administrator.Password = "correct-horse-battery-staple"
	return request
}

func TestInstallationRequestAndGeneratedConfiguration(t *testing.T) {
	request := validInstallationRequest()
	if err := normaliseInstallRequest(&request); err != nil {
		t.Fatal(err)
	}
	settings, err := buildRuntimeSettings(request, Paths{StateDir: "/var/lib/fyp-portal/state"})
	if err != nil {
		t.Fatal(err)
	}
	if settings["MONGODB_URI"] == "" || settings["S3_ENDPOINT"] != "http://seaweedfs:8333" || settings["FYP_BACKUP_RECOVERY_KEY"] == "" {
		t.Fatalf("local installation settings were incomplete: %#v", settings)
	}
	mongoURI, err := url.Parse(settings["MONGODB_URI"])
	if err != nil {
		t.Fatal(err)
	}
	mongoPassword, present := mongoURI.User.Password()
	if !present || mongoPassword != settings["MONGODB_APP_PASSWORD"] {
		t.Fatal("MongoDB URI did not preserve the generated application password")
	}
	password := "quoted value\"with quote"
	contents, err := envContents(map[string]string{"SMTP_PASSWORD": password})
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "portal.env")
	if err := os.WriteFile(path, contents, 0o600); err != nil {
		t.Fatal(err)
	}
	parsed, err := parseEnvFile(path)
	if err != nil || parsed["SMTP_PASSWORD"] != password {
		t.Fatalf("quoted configuration round trip failed: %#v, %v", parsed, err)
	}
}

func TestInstallationJournalResumesWithoutRepeatingCompletedSteps(t *testing.T) {
	paths := Paths{StateDir: filepath.Join(t.TempDir(), "state")}
	journal := &installationJournal{
		FormatVersion:      1,
		RequestFingerprint: "false-data-fingerprint",
		CompletedSteps:     make(map[string]bool),
	}
	completed := 0
	if err := runInstallationStep(paths, testOwner(), journal, "configuration", func() error {
		completed++
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	if err := runInstallationStep(paths, testOwner(), journal, "deployment", func() error {
		return os.ErrDeadlineExceeded
	}); err == nil {
		t.Fatal("expected interrupted deployment")
	}
	resumed, err := readInstallationJournal(paths, testOwner())
	if err != nil || resumed == nil || !resumed.CompletedSteps["configuration"] || resumed.LastFailure != "deployment did not complete" {
		t.Fatalf("unexpected interrupted journal: %#v, %v", resumed, err)
	}
	if err := runInstallationStep(paths, testOwner(), resumed, "configuration", func() error {
		completed++
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	if err := runInstallationStep(paths, testOwner(), resumed, "deployment", func() error { return nil }); err != nil {
		t.Fatal(err)
	}
	if completed != 1 || !resumed.CompletedSteps["deployment"] {
		t.Fatalf("installation resume repeated or missed a step: %#v", resumed)
	}
}

func TestCopyReleaseExcludesLocalSecretsAndActivatesAtomically(t *testing.T) {
	source := t.TempDir()
	if err := os.Mkdir(filepath.Join(source, "deploy"), 0o755); err != nil {
		t.Fatal(err)
	}
	for path, contents := range map[string]string{
		"deploy/compose.yaml": "services: {}\n",
		"fypctl":              "false binary\n",
		".env.local":          "SECRET=not-released\n",
	} {
		if err := os.WriteFile(filepath.Join(source, path), []byte(contents), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	destination := filepath.Join(t.TempDir(), "current")
	if err := copyRelease(source, destination); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(destination, "deploy", "compose.yaml")); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(destination, ".env.local")); !os.IsNotExist(err) {
		t.Fatalf("local secret was copied: %v", err)
	}
}
