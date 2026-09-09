package operations

import (
	"bytes"
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
