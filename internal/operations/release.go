package operations

import (
	"bufio"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

const (
	releaseManifestName = "release-manifest.json"
	releaseChecksumsName = "SHA256SUMS"
)

var (
	releaseVersionPattern = regexp.MustCompile(`^v[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$`)
	imageDigestPattern   = regexp.MustCompile(`^ghcr\.io/[a-z0-9][a-z0-9._/-]*@sha256:[a-f0-9]{64}$`)
	commitPattern        = regexp.MustCompile(`^[a-f0-9]{40}$`)
	checksumPattern      = regexp.MustCompile(`^[a-f0-9]{64}$`)
)

// ReleaseManifest is generated with the installer archive and records the
// immutable application image that the archive deploys.
type ReleaseManifest struct {
	FormatVersion        int      `json:"formatVersion"`
	ReleaseVersion       string   `json:"releaseVersion"`
	Image                string   `json:"image"`
	Platform             string   `json:"platform"`
	ConfigurationVersion int      `json:"configurationVersion"`
	CompatibleFrom       []string `json:"compatibleFrom"`
	Migration            string   `json:"migration"`
	RollbackCompatible   bool     `json:"rollbackCompatible"`
	SourceCommit         string   `json:"sourceCommit"`
}

func readReleaseManifest(releaseDir string) (ReleaseManifest, error) {
	path := filepath.Join(releaseDir, releaseManifestName)
	info, err := os.Lstat(path)
	if err != nil {
		return ReleaseManifest{}, fmt.Errorf("read release manifest: %w", err)
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() || info.Size() > 128*1024 {
		return ReleaseManifest{}, errors.New("release manifest is invalid")
	}
	contents, err := os.ReadFile(path)
	if err != nil {
		return ReleaseManifest{}, fmt.Errorf("read release manifest: %w", err)
	}
	var manifest ReleaseManifest
	decoder := json.NewDecoder(strings.NewReader(string(contents)))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&manifest); err != nil {
		return ReleaseManifest{}, errors.New("release manifest is invalid")
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return ReleaseManifest{}, errors.New("release manifest is invalid")
	}
	if err := validateReleaseManifest(manifest); err != nil {
		return ReleaseManifest{}, err
	}
	return manifest, nil
}

func validateReleaseManifest(manifest ReleaseManifest) error {
	if manifest.FormatVersion != 1 || !releaseVersionPattern.MatchString(manifest.ReleaseVersion) || !imageDigestPattern.MatchString(manifest.Image) || manifest.Platform != "linux/amd64" || manifest.ConfigurationVersion != 1 || !commitPattern.MatchString(manifest.SourceCommit) {
		return errors.New("release manifest is invalid")
	}
	if manifest.Migration != "none" && !releaseVersionPattern.MatchString(manifest.Migration) {
		return errors.New("release manifest is invalid")
	}
	for _, version := range manifest.CompatibleFrom {
		if !releaseVersionPattern.MatchString(version) {
			return errors.New("release manifest is invalid")
		}
	}
	return nil
}

func readReleaseChecksums(releaseDir string) (map[string]string, error) {
	path := filepath.Join(releaseDir, releaseChecksumsName)
	info, err := os.Lstat(path)
	if err != nil {
		return nil, fmt.Errorf("read release checksums: %w", err)
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() || info.Size() > 4*1024*1024 {
		return nil, errors.New("release checksums are invalid")
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("read release checksums: %w", err)
	}
	defer file.Close()

	checksums := make(map[string]string)
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		digest, name, found := strings.Cut(scanner.Text(), "  ")
		if !found || len(digest) != sha256.Size*2 || !checksumPattern.MatchString(digest) || name == "" || name == releaseChecksumsName || filepath.IsAbs(name) || filepath.Clean(name) != name || strings.HasPrefix(name, "../") {
			return nil, errors.New("release checksums are invalid")
		}
		if _, exists := checksums[name]; exists {
			return nil, errors.New("release checksums are invalid")
		}
		checksums[name] = digest
	}
	if err := scanner.Err(); err != nil || len(checksums) == 0 {
		return nil, errors.New("release checksums are invalid")
	}
	return checksums, nil
}

func fileChecksum(path string) (string, error) {
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

func verifyReleasePayload(releaseDir string) (ReleaseManifest, error) {
	manifest, err := readReleaseManifest(releaseDir)
	if err != nil {
		return ReleaseManifest{}, err
	}
	checksums, err := readReleaseChecksums(releaseDir)
	if err != nil {
		return ReleaseManifest{}, err
	}

	for _, required := range []string{"install", "fypctl", "deploy/compose.yaml", "INSTALL.md", "THIRD_PARTY_NOTICES.md", releaseManifestName} {
		if _, exists := checksums[required]; !exists {
			return ReleaseManifest{}, errors.New("release checksums are incomplete")
		}
	}
	remaining := make(map[string]string, len(checksums))
	for name, digest := range checksums {
		remaining[name] = digest
	}
	err = filepath.WalkDir(releaseDir, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if path == releaseDir || entry.IsDir() {
			return nil
		}
		relative, err := filepath.Rel(releaseDir, path)
		if err != nil {
			return err
		}
		if entry.Type()&os.ModeSymlink != 0 || !entry.Type().IsRegular() {
			return fmt.Errorf("release contains unsupported file %s", relative)
		}
		if relative == releaseChecksumsName {
			return nil
		}
		expected, exists := remaining[relative]
		if !exists {
			return fmt.Errorf("release contains unexpected file %s", relative)
		}
		actual, err := fileChecksum(path)
		if err != nil {
			return fmt.Errorf("checksum release file %s: %w", relative, err)
		}
		if actual != expected {
			return fmt.Errorf("checksum mismatch for release file %s", relative)
		}
		delete(remaining, relative)
		return nil
	})
	if err != nil {
		return ReleaseManifest{}, err
	}
	if len(remaining) != 0 {
		files := make([]string, 0, len(remaining))
		for path := range remaining {
			files = append(files, path)
		}
		sort.Strings(files)
		return ReleaseManifest{}, fmt.Errorf("release is missing file %s", files[0])
	}
	if cliVersion != "dev" && manifest.ReleaseVersion != cliVersion {
		return ReleaseManifest{}, errors.New("release manifest does not match the installer version")
	}
	if releaseCommit != "dev" && manifest.SourceCommit != releaseCommit {
		return ReleaseManifest{}, errors.New("release manifest does not match the installer source commit")
	}
	return manifest, nil
}
