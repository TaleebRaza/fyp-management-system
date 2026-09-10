package operations

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/subtle"
	"embed"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"image/png"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	wizardSessionLifetime = 15 * time.Minute
	wizardLogoLimit       = 2 * 1024 * 1024
)

//go:embed wizard.html wizard.js wizard.css
var wizardAssets embed.FS

type wizardMode string

const (
	installWizard   wizardMode = "install"
	configureWizard wizardMode = "configure"
)

type wizardBranding struct {
	UniversityName string `json:"universityName"`
	PrimaryColor   string `json:"primaryColor"`
	AccentColor    string `json:"accentColor"`
}

type wizardAdministrator struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	RollNo   string `json:"rollNo"`
	Password string `json:"password"`
}

type wizardConfiguration struct {
	Domain        string                `json:"domain"`
	Database      installationDatabase  `json:"database"`
	Storage       installationStorage   `json:"storage"`
	Mail          installationMail      `json:"mail"`
	Branding      wizardBranding        `json:"branding"`
	Administrator wizardAdministrator   `json:"administrator"`
	Retention     installationRetention `json:"retention"`
	Backup        installationBackup    `json:"backup"`
}

type wizardStatus struct {
	State   string `json:"state"`
	Message string `json:"message"`
}

type wizardServer struct {
	paths      Paths
	mode       wizardMode
	address    string
	setupToken string
	expiresAt  time.Time

	mutex         sync.Mutex
	session       string
	sessionExpiry time.Time
	configuration *wizardConfiguration
	logoBase64    string
	status        wizardStatus
	httpServer    *http.Server
}

func randomWizardToken() (string, error) {
	contents := make([]byte, 32)
	if _, err := rand.Read(contents); err != nil {
		return "", fmt.Errorf("generate setup token: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(contents), nil
}

func startWizard(paths Paths, mode wizardMode, stdout, stderr io.Writer) int {
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		fmt.Fprintf(stderr, "setup: bind loopback server: %v\n", err)
		return 1
	}
	defer listener.Close()

	token, err := randomWizardToken()
	if err != nil {
		fmt.Fprintf(stderr, "setup: %v\n", err)
		return 1
	}
	setup := &wizardServer{
		paths:      paths,
		mode:       mode,
		address:    listener.Addr().String(),
		setupToken: token,
		expiresAt:  time.Now().Add(wizardSessionLifetime),
		status:     wizardStatus{State: "ready", Message: "Complete the form, review it, then apply the configuration."},
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/", setup.handlePage)
	mux.HandleFunc("/setup", setup.handleSetup)
	mux.HandleFunc("/wizard.js", setup.handleAsset)
	mux.HandleFunc("/wizard.css", setup.handleAsset)
	mux.HandleFunc("/api/config", setup.handleConfiguration)
	mux.HandleFunc("/api/logo", setup.handleLogo)
	mux.HandleFunc("/api/probe", setup.handleProbe)
	mux.HandleFunc("/api/apply", setup.handleApply)
	mux.HandleFunc("/api/status", setup.handleStatus)
	setup.httpServer = &http.Server{
		Handler:           wizardSecurityHeaders(mux),
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       30 * time.Second,
	}

	url := "http://" + setup.address + "/setup?token=" + url.QueryEscape(token)
	fmt.Fprintln(stdout, "FYP Portal setup is listening on loopback only.")
	fmt.Fprintf(stdout, "Run on your workstation: ssh -L %d:127.0.0.1:%d <user>@<server>\n", listener.Addr().(*net.TCPAddr).Port, listener.Addr().(*net.TCPAddr).Port)
	fmt.Fprintf(stdout, "Then open: %s\n", url)
	fmt.Fprintf(stdout, "The setup link expires in %d minutes.\n", int(wizardSessionLifetime.Minutes()))

	go func() {
		timer := time.NewTimer(wizardSessionLifetime)
		defer timer.Stop()
		<-timer.C
		setup.mutex.Lock()
		finished := setup.status.State == "complete"
		setup.mutex.Unlock()
		if !finished {
			_ = setup.httpServer.Shutdown(context.Background())
		}
	}()

	err = setup.httpServer.Serve(listener)
	if err != nil && !errors.Is(err, http.ErrServerClosed) {
		fmt.Fprintf(stderr, "setup: server failed: %v\n", err)
		return 1
	}
	setup.mutex.Lock()
	defer setup.mutex.Unlock()
	if setup.status.State == "complete" {
		return 0
	}
	fmt.Fprintln(stderr, "setup: server stopped before completion")
	return 1
}

func wizardSecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Cache-Control", "no-store")
		writer.Header().Set("Content-Security-Policy", "default-src 'self'; img-src 'self' blob:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'")
		writer.Header().Set("X-Content-Type-Options", "nosniff")
		writer.Header().Set("Referrer-Policy", "no-referrer")
		next.ServeHTTP(writer, request)
	})
}

func (setup *wizardServer) expectedOrigin() string {
	return "http://" + setup.address
}

func (setup *wizardServer) handlePage(writer http.ResponseWriter, request *http.Request) {
	if request.URL.Path != "/" {
		http.NotFound(writer, request)
		return
	}
	if !setup.authorized(request, false) {
		http.Error(writer, "Setup authentication is required.", http.StatusUnauthorized)
		return
	}
	writer.Header().Set("Content-Type", "text/html; charset=utf-8")
	page, err := wizardAssets.ReadFile("wizard.html")
	if err != nil {
		http.Error(writer, "Setup page is unavailable.", http.StatusInternalServerError)
		return
	}
	_, _ = writer.Write(page)
}

func (setup *wizardServer) handleAsset(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet || !setup.authorized(request, false) {
		http.Error(writer, "Setup authentication is required.", http.StatusUnauthorized)
		return
	}
	name := strings.TrimPrefix(request.URL.Path, "/")
	if name != "wizard.js" && name != "wizard.css" {
		http.NotFound(writer, request)
		return
	}
	contents, err := wizardAssets.ReadFile(name)
	if err != nil {
		http.NotFound(writer, request)
		return
	}
	if strings.HasSuffix(name, ".css") {
		writer.Header().Set("Content-Type", "text/css; charset=utf-8")
	} else {
		writer.Header().Set("Content-Type", "text/javascript; charset=utf-8")
	}
	_, _ = writer.Write(contents)
}

func (setup *wizardServer) handleSetup(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet || request.Host != setup.address || time.Now().After(setup.expiresAt) {
		http.Error(writer, "Setup link has expired.", http.StatusGone)
		return
	}
	provided := request.URL.Query().Get("token")
	setup.mutex.Lock()
	valid := setup.setupToken != "" && subtle.ConstantTimeCompare([]byte(provided), []byte(setup.setupToken)) == 1
	if valid {
		session, err := randomWizardToken()
		if err != nil {
			setup.mutex.Unlock()
			http.Error(writer, "Unable to start setup session.", http.StatusInternalServerError)
			return
		}
		setup.setupToken = ""
		setup.session = session
		setup.sessionExpiry = time.Now().Add(wizardSessionLifetime)
		http.SetCookie(writer, &http.Cookie{
			Name:     "fyp_setup_session",
			Value:    session,
			Path:     "/",
			HttpOnly: true,
			SameSite: http.SameSiteStrictMode,
			MaxAge:   int(wizardSessionLifetime.Seconds()),
		})
	}
	setup.mutex.Unlock()
	if !valid {
		http.Error(writer, "Setup link is invalid or has already been used.", http.StatusUnauthorized)
		return
	}
	http.Redirect(writer, request, "/", http.StatusSeeOther)
}

func (setup *wizardServer) authorized(request *http.Request, requireOrigin bool) bool {
	if request.Host != setup.address {
		return false
	}
	if requireOrigin && request.Header.Get("Origin") != setup.expectedOrigin() {
		return false
	}
	cookie, err := request.Cookie("fyp_setup_session")
	if err != nil {
		return false
	}
	setup.mutex.Lock()
	defer setup.mutex.Unlock()
	return time.Now().Before(setup.sessionExpiry) && setup.session != "" && subtle.ConstantTimeCompare([]byte(cookie.Value), []byte(setup.session)) == 1
}

func decodeWizardJSON(request *http.Request, destination any) error {
	decoder := json.NewDecoder(io.LimitReader(request.Body, 96*1024))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		return errors.New("request is invalid")
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return errors.New("request is invalid")
	}
	return nil
}

func writeWizardJSON(writer http.ResponseWriter, status int, value any) {
	writer.Header().Set("Content-Type", "application/json; charset=utf-8")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(value)
}

func (setup *wizardServer) handleConfiguration(writer http.ResponseWriter, request *http.Request) {
	if !setup.authorized(request, request.Method == http.MethodPost) {
		http.Error(writer, "Setup authentication is required.", http.StatusUnauthorized)
		return
	}
	if request.Method == http.MethodGet {
		writeWizardJSON(writer, http.StatusOK, map[string]string{"mode": string(setup.mode)})
		return
	}
	if request.Method != http.MethodPost {
		writer.Header().Set("Allow", "GET, POST")
		http.Error(writer, "Method not allowed.", http.StatusMethodNotAllowed)
		return
	}
	var configuration wizardConfiguration
	if err := decodeWizardJSON(request, &configuration); err != nil {
		writeWizardJSON(writer, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	setup.mutex.Lock()
	logo := setup.logoBase64
	setup.mutex.Unlock()
	if err := normaliseWizardConfiguration(&configuration, setup.mode, logo); err != nil {
		writeWizardJSON(writer, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	setup.mutex.Lock()
	setup.configuration = &configuration
	setup.status = wizardStatus{State: "ready", Message: "Configuration saved. Review the settings, then apply them."}
	setup.mutex.Unlock()
	writeWizardJSON(writer, http.StatusOK, map[string]string{"message": "Configuration saved."})
}

func (setup *wizardServer) handleLogo(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost || !setup.authorized(request, true) {
		http.Error(writer, "Setup authentication is required.", http.StatusUnauthorized)
		return
	}
	request.Body = http.MaxBytesReader(writer, request.Body, wizardLogoLimit+1024)
	if err := request.ParseMultipartForm(wizardLogoLimit + 1024); err != nil {
		writeWizardJSON(writer, http.StatusBadRequest, map[string]string{"error": "Logo upload is too large or invalid."})
		return
	}
	file, _, err := request.FormFile("logo")
	if err != nil {
		writeWizardJSON(writer, http.StatusBadRequest, map[string]string{"error": "A PNG logo is required."})
		return
	}
	defer file.Close()
	contents, err := io.ReadAll(io.LimitReader(file, wizardLogoLimit+1))
	if err != nil || len(contents) > wizardLogoLimit {
		writeWizardJSON(writer, http.StatusBadRequest, map[string]string{"error": "Logo upload is too large."})
		return
	}
	logo, err := reencodeWizardLogo(base64.StdEncoding.EncodeToString(contents))
	if err != nil {
		writeWizardJSON(writer, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	setup.mutex.Lock()
	setup.logoBase64 = logo
	setup.mutex.Unlock()
	writeWizardJSON(writer, http.StatusOK, map[string]string{"message": "Logo validated."})
}

func reencodeWizardLogo(encoded string) (string, error) {
	contents, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil || len(contents) == 0 || len(contents) > wizardLogoLimit {
		return "", errors.New("branding logo must be a PNG no larger than 2 MiB")
	}
	configuration, err := png.DecodeConfig(bytes.NewReader(contents))
	if err != nil || configuration.Width < 1 || configuration.Width > 2048 || configuration.Height < 1 || configuration.Height > 2048 {
		return "", errors.New("branding logo must be a PNG from 1 to 2048 pixels in each dimension")
	}
	picture, err := png.Decode(bytes.NewReader(contents))
	if err != nil {
		return "", errors.New("branding logo must be a valid PNG")
	}
	var output bytes.Buffer
	if err := png.Encode(&output, picture); err != nil || output.Len() > wizardLogoLimit {
		return "", errors.New("branding logo cannot be safely re-encoded within 2 MiB")
	}
	return base64.StdEncoding.EncodeToString(output.Bytes()), nil
}

func normaliseWizardConfiguration(configuration *wizardConfiguration, mode wizardMode, logoBase64 string) error {
	if mode == installWizard {
		request := configuration.installationRequest(logoBase64)
		if err := normaliseInstallRequest(&request); err != nil {
			return err
		}
		*configuration = wizardConfigurationFromInstallationRequest(request)
		return nil
	}
	if configuration.Domain != "" || configuration.Database.Mode != "" || configuration.Database.URI != "" || configuration.Storage.Mode != "" || configuration.Storage.Endpoint != "" || configuration.Storage.BrowserEndpoint != "" || configuration.Storage.Region != "" || configuration.Storage.AccessKeyID != "" || configuration.Storage.SecretAccessKey != "" || configuration.Storage.BucketName != "" || configuration.Storage.ForcePathStyle {
		return errors.New("database and storage destinations cannot be changed through fypctl configure")
	}
	if configuration.Administrator.Name != "" || configuration.Administrator.Email != "" || configuration.Administrator.RollNo != "" || configuration.Administrator.Password != "" {
		return errors.New("administrator bootstrap cannot be repeated")
	}
	if err := normaliseInstallationMail(&configuration.Mail); err != nil {
		return err
	}
	configuration.Branding.UniversityName = strings.TrimSpace(configuration.Branding.UniversityName)
	configuration.Branding.PrimaryColor = strings.ToLower(strings.TrimSpace(configuration.Branding.PrimaryColor))
	configuration.Branding.AccentColor = strings.ToLower(strings.TrimSpace(configuration.Branding.AccentColor))
	if configuration.Branding.UniversityName == "" || len(configuration.Branding.UniversityName) > 120 || !colorPattern.MatchString(configuration.Branding.PrimaryColor) || !colorPattern.MatchString(configuration.Branding.AccentColor) {
		return errors.New("branding configuration is invalid")
	}
	if logoBase64 != "" {
		if _, err := reencodeWizardLogo(logoBase64); err != nil {
			return err
		}
	}
	return normaliseInstallationPreferences(&configuration.Retention, &configuration.Backup)
}

func (configuration wizardConfiguration) installationRequest(logoBase64 string) installationRequest {
	var request installationRequest
	request.Domain = configuration.Domain
	request.Database = configuration.Database
	request.Storage = configuration.Storage
	request.Mail = configuration.Mail
	request.Bootstrap.UniversityName = configuration.Branding.UniversityName
	request.Bootstrap.PrimaryColor = configuration.Branding.PrimaryColor
	request.Bootstrap.AccentColor = configuration.Branding.AccentColor
	request.Bootstrap.Administrator.Name = configuration.Administrator.Name
	request.Bootstrap.Administrator.Email = configuration.Administrator.Email
	request.Bootstrap.Administrator.RollNo = configuration.Administrator.RollNo
	request.Bootstrap.Administrator.Password = configuration.Administrator.Password
	request.Setup = installationSetup{Configured: true, LogoBase64: logoBase64, Retention: configuration.Retention, Backup: configuration.Backup}
	return request
}

func wizardConfigurationFromInstallationRequest(request installationRequest) wizardConfiguration {
	return wizardConfiguration{
		Domain:   request.Domain,
		Database: request.Database,
		Storage:  request.Storage,
		Mail:     request.Mail,
		Branding: wizardBranding{
			UniversityName: request.Bootstrap.UniversityName,
			PrimaryColor:   request.Bootstrap.PrimaryColor,
			AccentColor:    request.Bootstrap.AccentColor,
		},
		Administrator: wizardAdministrator{
			Name: request.Bootstrap.Administrator.Name, Email: request.Bootstrap.Administrator.Email,
			RollNo: request.Bootstrap.Administrator.RollNo, Password: request.Bootstrap.Administrator.Password,
		},
		Retention: request.Setup.Retention,
		Backup:    request.Setup.Backup,
	}
}

func (setup *wizardServer) handleProbe(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost || !setup.authorized(request, true) {
		http.Error(writer, "Setup authentication is required.", http.StatusUnauthorized)
		return
	}
	var input struct {
		Target string `json:"target"`
	}
	if err := decodeWizardJSON(request, &input); err != nil {
		writeWizardJSON(writer, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	setup.mutex.Lock()
	configuration := setup.configuration
	setup.mutex.Unlock()
	if configuration == nil {
		writeWizardJSON(writer, http.StatusBadRequest, map[string]string{"error": "Save the configuration before testing connections."})
		return
	}
	if err := probeWizardConnection(input.Target, *configuration); err != nil {
		writeWizardJSON(writer, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	writeWizardJSON(writer, http.StatusOK, map[string]string{"message": "Connection is reachable."})
}

func probeWizardConnection(target string, configuration wizardConfiguration) error {
	switch target {
	case "database":
		if configuration.Database.Mode != "external" {
			return errors.New("local MongoDB will be checked as part of installation")
		}
		parsed, err := url.Parse(configuration.Database.URI)
		if err != nil {
			return errors.New("database endpoint is invalid")
		}
		host := parsed.Hostname()
		port := parsed.Port()
		if parsed.Scheme == "mongodb+srv" {
			_, records, err := net.LookupSRV("mongodb", "tcp", host)
			if err != nil || len(records) == 0 {
				return errors.New("MongoDB SRV endpoint is unreachable")
			}
			host, port = strings.TrimSuffix(records[0].Target, "."), strconv.Itoa(int(records[0].Port))
		}
		if port == "" {
			port = "27017"
		}
		return probeTCP(host, port)
	case "storage":
		if configuration.Storage.Mode != "external" {
			return errors.New("local object storage will be checked as part of installation")
		}
		return probeURL(configuration.Storage.Endpoint)
	case "mail":
		if configuration.Mail.Host == "" {
			return errors.New("SMTP is not configured")
		}
		return probeTCP(configuration.Mail.Host, strconv.Itoa(configuration.Mail.Port))
	default:
		return errors.New("unknown connection test")
	}
}

func probeURL(value string) error {
	parsed, err := url.Parse(value)
	if err != nil || parsed.Hostname() == "" {
		return errors.New("endpoint is invalid")
	}
	port := parsed.Port()
	if port == "" {
		if parsed.Scheme == "https" {
			port = "443"
		} else {
			port = "80"
		}
	}
	return probeTCP(parsed.Hostname(), port)
}

func probeTCP(host, port string) error {
	connection, err := net.DialTimeout("tcp", net.JoinHostPort(host, port), 5*time.Second)
	if err != nil {
		return errors.New("endpoint is unreachable")
	}
	return connection.Close()
}

func (setup *wizardServer) handleApply(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost || !setup.authorized(request, true) {
		http.Error(writer, "Setup authentication is required.", http.StatusUnauthorized)
		return
	}
	setup.mutex.Lock()
	if setup.configuration == nil {
		setup.mutex.Unlock()
		writeWizardJSON(writer, http.StatusBadRequest, map[string]string{"error": "Save the configuration before applying it."})
		return
	}
	if setup.status.State == "running" {
		setup.mutex.Unlock()
		writeWizardJSON(writer, http.StatusConflict, map[string]string{"error": "An operation is already running."})
		return
	}
	configuration := *setup.configuration
	logo := setup.logoBase64
	setup.status = wizardStatus{State: "running", Message: "Applying configuration. Keep this browser open."}
	setup.mutex.Unlock()
	go setup.apply(configuration, logo)
	writeWizardJSON(writer, http.StatusAccepted, map[string]string{"message": "Operation started."})
}

func (setup *wizardServer) apply(configuration wizardConfiguration, logoBase64 string) {
	var err error
	if setup.mode == installWizard {
		err = setup.runInstall(configuration, logoBase64)
	} else {
		err = runConfigurationUpdate(setup.paths, configuration, logoBase64)
	}
	setup.mutex.Lock()
	if err != nil {
		setup.status = wizardStatus{State: "failed", Message: "Operation failed. Correct the settings and retry, or inspect fypctl logs."}
	} else {
		setup.status = wizardStatus{State: "complete", Message: "Configuration complete. This protected setup server will now stop."}
	}
	setup.mutex.Unlock()
	if err == nil {
		go func() {
			time.Sleep(3 * time.Second)
			_ = setup.httpServer.Shutdown(context.Background())
		}()
	}
}

func (setup *wizardServer) runInstall(configuration wizardConfiguration, logoBase64 string) error {
	request := configuration.installationRequest(logoBase64)
	contents, err := json.MarshalIndent(request, "", "  ")
	if err != nil {
		return fmt.Errorf("encode installation request: %w", err)
	}
	if err := ensureSecureDirectory(setup.paths.StateDir, 0); err != nil {
		return err
	}
	path := filepath.Join(setup.paths.StateDir, "wizard-install-request.json")
	if err := writeAtomically(path, append(contents, '\n'), 0); err != nil {
		return err
	}
	executable, err := os.Executable()
	if err != nil {
		return fmt.Errorf("locate installer binary: %w", err)
	}
	command := exec.Command(executable, "--request", path)
	command.Dir, err = installationSource()
	if err != nil {
		return err
	}
	output, err := command.CombinedOutput()
	if err != nil {
		return fmt.Errorf("installer failed: %s", strings.TrimSpace(string(output)))
	}
	if err := os.Remove(path); err != nil {
		return fmt.Errorf("remove installation request: %w", err)
	}
	return nil
}

func (setup *wizardServer) handleStatus(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet || !setup.authorized(request, false) {
		http.Error(writer, "Setup authentication is required.", http.StatusUnauthorized)
		return
	}
	setup.mutex.Lock()
	status := setup.status
	setup.mutex.Unlock()
	if status.State == "running" && setup.mode == installWizard {
		if journal, err := readInstallationJournal(setup.paths, 0); err == nil && journal != nil && journal.CurrentStep != "" {
			status.Message = "Installing: " + journal.CurrentStep
		}
	}
	writeWizardJSON(writer, http.StatusOK, status)
}

func runConfigurationUpdate(paths Paths, configuration wizardConfiguration, logoBase64 string) error {
	release, err := AcquireOperationLock(paths, 0)
	if err != nil {
		return err
	}
	defer release()
	if err := updateRuntimeMail(paths, configuration.Mail); err != nil {
		return err
	}
	redactor, err := loadRedactor(paths)
	if err != nil {
		return err
	}
	if err := applyPortalConfiguration(paths, redactor, configuration.Branding, configuration.Retention, logoBase64); err != nil {
		return err
	}
	return applyBackupSchedule(paths, redactor, configuration.Backup.Enabled, configuration.Backup.DailyAt, configuration.Backup.Keep)
}

func updateRuntimeMail(paths Paths, mail installationMail) error {
	settings, err := loadSettings(paths)
	if err != nil {
		return err
	}
	for key := range settings {
		if strings.HasPrefix(key, "SMTP_") {
			delete(settings, key)
		}
	}
	if mail.Host != "" {
		for _, key := range []string{"EMAIL_USER", "EMAIL_APP_PASSWORD", "EMAIL_FROM_NAME", "EMAIL_REPLY_TO"} {
			delete(settings, key)
		}
		settings["SMTP_HOST"] = mail.Host
		settings["SMTP_PORT"] = strconv.Itoa(mail.Port)
		settings["SMTP_TLS_MODE"] = mail.TLSMode
		settings["SMTP_FROM_ADDRESS"] = mail.From
		settings["SMTP_FROM_NAME"] = mail.FromName
		if mail.Username != "" {
			settings["SMTP_USER"] = mail.Username
			settings["SMTP_PASSWORD"] = mail.Password
		}
		if mail.ReplyTo != "" {
			settings["SMTP_REPLY_TO"] = mail.ReplyTo
		}
	}
	contents, err := envContents(settings)
	if err != nil {
		return err
	}
	if err := WriteProtectedConfig(paths.ConfigPath, contents, 0); err != nil {
		return err
	}
	redactor := newRedactor(settings)
	arguments, err := dockerComposeArgs(paths, 0, "up", "--detach")
	if err != nil {
		return err
	}
	_, err = commandOutput(context.Background(), redactor, "docker", arguments, nil)
	return err
}

func applyPortalConfiguration(paths Paths, redactor redactor, branding wizardBranding, retention installationRetention, logoBase64 string) error {
	payload := struct {
		Branding struct {
			UniversityName string `json:"universityName"`
			PrimaryColor   string `json:"primaryColor"`
			AccentColor    string `json:"accentColor"`
			LogoBase64     string `json:"logoBase64,omitempty"`
		} `json:"branding"`
		Retention installationRetention `json:"retention"`
	}{Retention: retention}
	payload.Branding.UniversityName = branding.UniversityName
	payload.Branding.PrimaryColor = branding.PrimaryColor
	payload.Branding.AccentColor = branding.AccentColor
	payload.Branding.LogoBase64 = logoBase64
	contents, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("encode portal configuration: %w", err)
	}
	command, err := dockerComposeArgs(paths, 0, "exec", "-T", "app", "node", "scripts/configure-portal.mjs")
	if err != nil {
		return err
	}
	_, err = commandOutput(context.Background(), redactor, "docker", command, bytes.NewReader(contents))
	return err
}
