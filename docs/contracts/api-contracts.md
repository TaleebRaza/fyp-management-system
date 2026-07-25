# API Contracts

Generated from route and frontend source at commit `443dc1572fa90a66a4f40ca3f9f3dbeb7fbe86d6` on 2026-07-25T15:58:30.945Z.

## Contract-freeze rule

During code cleanup, existing route paths, methods, request fields, status codes, response keys, authentication behavior, roles, and user-facing messages remain compatible. Inconsistencies are documented, not silently fixed.

## Static-analysis note

This inventory is intentionally dependency-free and conservative. “No explicit route-local check detected” does not prove a route is public; middleware or a called helper may enforce access. Dynamic object spreads and computed response fields may not be fully expanded. Review the listed source file before changing a route.

## Route inventory

| Path | Methods | Authentication | Roles | JSON body fields | Form fields | Query fields | Route params | Statuses | Response keys | Source |
|---|---|---|---|---|---|---|---|---|---|---|
| `/api/add-supervisor` | POST | No explicit route-local check detected | public or middleware-protected | email, migrationCode, name, password, rollNo | — | — | — | 201, 400, 500, implicit success | error, message | `app/api/add-supervisor/route.ts` |
| `/api/admin/fines` | GET, PATCH | Authenticated database-backed user | authenticated | — | — | q | — | 400, 403, 404, 409, 500, implicit success | clearedAmount, currentLateFine, error, finePayment, lateFineAccrual, message, studentId | `app/api/admin/fines/route.ts` |
| `/api/admin/promote-batch` | POST | Authenticated database-backed user | authenticated | targetBatch | — | — | — | 200, 400, 401, 500, implicit success | error, message | `app/api/admin/promote-batch/route.ts` |
| `/api/admin/registration-policy` | GET, PUT | Authenticated database-backed user | authenticated | closedMessage, isOpen, punishment | — | — | — | 400, 403, 500, implicit success | error, message, policy | `app/api/admin/registration-policy/route.ts` |
| `/api/admin/reports` | GET | Authenticated database-backed user | authenticated | — | — | — | — | 200, 401, 500, implicit success | activeStudents, assignedStudents, deactivatedStudents, error, finedStudents, generatedAt, projects, projectsWithPdf, reviewQueue, students, supervisors, totalFineAmount, totals, unassignedStudents | `app/api/admin/reports/route.ts` |
| `/api/admin/students` | GET | Authenticated database-backed user | authenticated | — | — | batch, limit, page, program, search, status | — | 200, 401, 500, implicit success | error, limit, page, pagination, students, total, totalPages | `app/api/admin/students/route.ts` |
| `/api/admin/supervisors` | GET | Authenticated database-backed user | authenticated | — | — | — | — | 401, 500, implicit success | error | `app/api/admin/supervisors/route.ts` |
| `/api/admin/toggle-student` | POST | Authenticated database-backed user | authenticated | isActive, studentId | — | — | — | 200, 401, 404, 500, implicit success | error, message | `app/api/admin/toggle-student/route.ts` |
| `/api/admin/update-batch` | POST | Authenticated database-backed user | authenticated | newBatch, targetUserId | — | — | — | 200, 401, 500, implicit success | error | `app/api/admin/update-batch/route.ts` |
| `/api/admin/update-email` | POST | Authenticated database-backed user | authenticated | newEmail, targetUserId | — | — | — | 200, 400, 401, 404, 500, implicit success | error, message, user | `app/api/admin/update-email/route.ts` |
| `/api/admin/update-program` | POST | Authenticated database-backed user | authenticated | newProgram, targetUserId | — | — | — | 200, 401, 500, implicit success | error | `app/api/admin/update-program/route.ts` |
| `/api/admin/update-supervisor-slots` | POST | Authenticated database-backed user | authenticated | extraSlots, supervisorId | — | — | — | 200, 400, 401, 404, 500, implicit success | error, extraSlots, maxSlots, message, supervisor | `app/api/admin/update-supervisor-slots/route.ts` |
| `/api/auth/[...nextauth]` | GET, POST | NextAuth-managed | provider-defined | — | — | — | nextauth | implicit success | — | `app/api/auth/[...nextauth]/route.ts` |
| `/api/auth/forgot-password` | POST | No explicit route-local check detected | public or middleware-protected | email, rollNo | — | — | — | 200, 400, 429, 500, implicit success | error, message | `app/api/auth/forgot-password/route.ts` |
| `/api/auth/reset-password` | POST | No explicit route-local check detected | public or middleware-protected | code, newPassword, rollNo | — | — | — | 200, 400, 404, 429, 500, implicit success | error, message | `app/api/auth/reset-password/route.ts` |
| `/api/cron/voice-cleanup` | GET | Cron secret/header | system | — | — | — | — | 200, 401, 500, implicit success | error, message | `app/api/cron/voice-cleanup/route.ts` |
| `/api/dashboard/student` | GET, POST | Authenticated database-backed user | student | action, batch, desc, domain, domains, id, pdfUrl, program, supervisorId, title, tools | — | — | — | 200, 400, 401, 403, 404, 409, 429, 500, implicit success | code, error, fineRestriction, freedBytes, invalidDomains, message, project, student, supervisor, supervisorBroadcast, teamFineRestriction | `app/api/dashboard/student/route.ts` |
| `/api/dashboard/supervisor` | GET, POST | Authenticated database-backed user | authenticated | action, migrationCode, projectId, remarks, status, studentId | — | — | — | 200, 400, 401, 404, 500, implicit success | error, message, migrationCode, projects | `app/api/dashboard/supervisor/route.ts` |
| `/api/dashboard/supervisor/broadcast` | POST, DELETE | Authenticated database-backed user | authenticated | broadcastContent, broadcastSize, broadcastType | — | — | — | 200, 400, 401, 404, 500, implicit success | error, message | `app/api/dashboard/supervisor/broadcast/route.ts` |
| `/api/delete-supervisor` | POST | Authenticated database-backed user | authenticated | id | — | — | — | 200, 401, 404, 500, implicit success | error, message | `app/api/delete-supervisor/route.ts` |
| `/api/export-pdf` | GET | Authenticated database-backed user | admin | — | — | batch, id, name, program | — | 200, 400, 401, 500, implicit success | — | `app/api/export-pdf/route.ts` |
| `/api/headline` | GET, POST | Authenticated database-backed user | authenticated | text | — | — | — | 200, 403, 500, implicit success | error, headline, message | `app/api/headline/route.ts` |
| `/api/project/join` | POST | Authenticated database-backed user | authenticated | inviteCode | — | — | — | 200, 400, 401, 403, 404, 409, 429, 500, implicit success | code, error, fineRestriction, message | `app/api/project/join/route.ts` |
| `/api/read-pdf` | GET | Authenticated database-backed user | authenticated | — | — | url | — | 307, 400, 401, 404, implicit success | — | `app/api/read-pdf/route.ts` |
| `/api/register` | POST | No explicit route-local check detected | public or middleware-protected | batch, email, name, password, program, rollNo, supervisorId | — | — | — | 201, 400, 403, 404, 409, 500, implicit success | code, email, error, message, password, policy, punishment | `app/api/register/route.ts` |
| `/api/registration-policy` | GET | No explicit route-local check detected | public or middleware-protected | — | — | — | — | 500, implicit success | error | `app/api/registration-policy/route.ts` |
| `/api/supervisors` | GET | No explicit route-local check detected | public or middleware-protected | — | — | — | — | 200, 500, implicit success | error | `app/api/supervisors/route.ts` |
| `/api/supervisors/toggle-notifications` | POST | Authenticated database-backed user | authenticated | enabled, id | — | — | — | 200, 401, 500, implicit success | error, message | `app/api/supervisors/toggle-notifications/route.ts` |
| `/api/templates` | GET | Authenticated database-backed user | student | — | — | stage | — | 200, 400, 401, 403, 500, implicit success | code, defaultFormat, error, stage, templates | `app/api/templates/route.ts` |
| `/api/upload` | POST | Authenticated database-backed user | student | contentType, filename, fileSize | — | — | — | 400, 401, 403, 404, 500, implicit success | code, error, fineRestriction, teamFineRestriction, uploadUrl, url | `app/api/upload/route.ts` |
| `/api/voice` | GET, POST, PATCH | Authenticated database-backed user | authenticated | blobUrl, noteId, projectId | — | projectId | — | 201, 400, 401, 403, 500, implicit success | error, message, note, notes | `app/api/voice/route.ts` |
| `/api/voice/upload` | POST | Authenticated database-backed user | supervisor | contentType, fileSize, projectId | — | — | — | 400, 401, 403, 500, implicit success | error, key, uploadUrl | `app/api/voice/upload/route.ts` |

## Frontend API references

| Referenced path | Source files |
|---|---|
| `/api/add-supervisor` | components/dashboards/AdminDashboard.tsx |
| `/api/admin/fines` | components/admin/FineManagementPanel.tsx |
| `/api/admin/promote-batch` | components/dashboards/AdminDashboard.tsx |
| `/api/admin/registration-policy` | components/admin/RegistrationControlPanel.tsx |
| `/api/admin/reports` | components/dashboards/AdminDashboard.tsx |
| `/api/admin/students` | components/dashboards/AdminDashboard.tsx |
| `/api/admin/supervisors` | components/dashboards/AdminDashboard.tsx |
| `/api/admin/toggle-student` | components/dashboards/AdminDashboard.tsx |
| `/api/admin/update-batch` | components/dashboards/AdminDashboard.tsx |
| `/api/admin/update-email` | components/dashboards/AdminDashboard.tsx |
| `/api/admin/update-program` | components/dashboards/AdminDashboard.tsx |
| `/api/admin/update-supervisor-slots` | components/dashboards/AdminDashboard.tsx |
| `/api/auth/forgot-password` | app/page.tsx |
| `/api/auth/reset-password` | app/page.tsx |
| `/api/dashboard/student` | components/dashboards/StudentDashboard.tsx |
| `/api/dashboard/supervisor` | components/dashboards/SupervisorDashboard.tsx |
| `/api/dashboard/supervisor/broadcast` | components/dashboards/BroadcastWidget.tsx |
| `/api/delete-supervisor` | components/dashboards/AdminDashboard.tsx |
| `/api/export-pdf` | components/dashboards/SupervisorDashboard.tsx |
| `/api/headline` | components/dashboards/AdminDashboard.tsx, components/dashboards/StudentDashboard.tsx |
| `/api/project/join` | components/dashboards/StudentDashboard.tsx |
| `/api/register` | app/page.tsx |
| `/api/registration-policy` | app/page.tsx |
| `/api/supervisors` | app/page.tsx, components/dashboards/StudentDashboard.tsx |
| `/api/supervisors/toggle-notifications` | components/dashboards/AdminDashboard.tsx |
| `/api/templates` | components/dashboards/StudentDashboard.tsx |
| `/api/upload` | components/dashboards/StudentDashboard.tsx |
| `/api/voice` | components/ui/VoiceChat.tsx |
| `/api/voice/upload` | components/dashboards/BroadcastWidget.tsx, components/ui/VoiceChat.tsx |

## User-facing route messages

### `/api/add-supervisor`

- Failed to add supervisor.
- Missing required fields.
- Password must be 10 to 128 characters.
- Supervisor added successfully!
- This Username/ID or Email already exists!

### `/api/admin/fines`

- Administrator access is required.
- Enter at least two characters to search for a student.
- Fine payment details saved.
- Invalid student account.
- Late-registration fine compounding has resumed from the frozen amount.
- Late-registration fine compounding is paused.
- Payment verified and the student upload restriction was removed.
- Student not found.
- The payment was not marked as resolved. Refresh the student record and try again.
- The student fine record could not be updated.
- Unable to load fine management.
- Unable to update fine management.

### `/api/admin/promote-batch`

- Batch is required
- Failed to promote batch
- Successfully promoted ${result.modifiedCount} students in ${targetBatch} to 8th Semester!
- Unauthorized admin request.

### `/api/admin/registration-policy`

- Add a short punishment title.
- Add the message students should see while registration is closed.
- Administrator access is required.
- Explain the punishment that will apply to new registrations.
- Fine amount must be between 1 and ${MAX_FINE_AMOUNT.toLocaleString()} PKR.
- Registration status must be open or closed.
- Unable to load the registration policy.
- Unable to update the registration policy.

### `/api/admin/reports`

- Failed to fetch report data
- Unauthorized admin request.

### `/api/admin/students`

- Failed to fetch students
- Unauthorized admin request.

### `/api/admin/supervisors`

- Failed to fetch supervisors
- Unauthorized admin request.
- Unknown error

### `/api/admin/toggle-student`

- Failed to update student status
- Student account ${isActive ? 'restored' : 'deactivated'} successfully
- Student not found
- Unauthorized admin request.

### `/api/admin/update-batch`

- Failed to update batch.
- Unauthorized admin request.

### `/api/admin/update-email`

- Email updated successfully.
- Failed to update email.
- Please enter a valid email address.
- Student or supervisor ID is required.
- This email is already in use.
- Unauthorized admin request.
- User not found.

### `/api/admin/update-program`

- Failed to update program.
- Unauthorized admin request.

### `/api/admin/update-supervisor-slots`

- ${supervisor.name} now has ${safeExtraSlots} extra slot${safeExtraSlots === 1 ? '' : 's'}.
- Extra slots must be a whole number.
- Extra slots must be between 0 and ${MAX_EXTRA_SUPERVISOR_SLOTS}.
- Failed to update supervisor slots.
- Invalid supervisor selected.
- Supervisor not found.
- Unauthorized admin request.

### `/api/auth/forgot-password`

- A password reset code has been sent to the Gmail address you entered.
- A reset code has already been sent. Please wait ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'} before requesting a new code.
- Enter a valid Gmail address ending in @gmail.com.
- Failed to process request.
- Failed to send reset code. Please try again later.
- If an account exists for that roll number, a reset code will be sent shortly.
- Password was changed recently. Please try again in ${hoursLeft} hours.
- Roll number and Gmail address are required.
- Too many password reset requests. Please try again in an hour.

### `/api/auth/reset-password`

- Failed to reset password.
- Password successfully updated! You can now log in.
- Reset code is invalid or has expired.
- Roll number, a valid 6-digit code, and a password of 10 to 128 characters are required.
- Too many password reset attempts. Please try again in an hour.
- User not found.

### `/api/cron/voice-cleanup`

- Failed to execute scheduled cleanup.
- Unauthorized access.

### `/api/dashboard/student`

- A project utilizing these core concepts has already been approved for another team. Please select a unique topic.
- Cannot assign. The selected supervisor has reached maximum capacity (${maxSlots} slots).
- Cannot change supervisor. The selected supervisor is full (${maxSlots} slots).
- Failed to change supervisor.
- Failed to fetch dashboard data
- Failed to process request
- Failed to update Program/Batch.
- Invalid batch selected.
- Invalid program selected.
- Invalid student account.
- Invalid student or supervisor.
- Invalid uploaded PDF.

### `/api/dashboard/supervisor`

- Action failed
- Failed to fetch projects
- Invalid project selected.
- Invalid student selected.
- Migration code is required.
- Migration failed. Please try again.
- Project not found.
- Status updated and timeline advanced!
- Student migrated successfully. Project status and timeline were preserved.
- Student not found
- Team removed successfully!
- This team can now add a third member.

### `/api/dashboard/supervisor/broadcast`

- Broadcast cleared.
- Broadcast published successfully!
- Failed to clear broadcast.
- Failed to publish broadcast.
- Missing required broadcast fields.
- Supervisor not found.
- Unauthorized: Supervisor access required.

### `/api/delete-supervisor`

- Failed to delete supervisor
- Supervisor deleted successfully
- Supervisor not found
- Unauthorized admin request.

### `/api/export-pdf`

- Failed to generate Excel report
- Supervisor ID is required
- Unauthorized

### `/api/headline`

- Failed to fetch headline
- Failed to update headline
- Forbidden: Only administrators can broadcast headlines.
- Headline updated successfully!

### `/api/project/join`

- Batch Mismatch! You are in ${student.batch || 'an unknown batch'}, but this team belongs to ${firstMember.batch || 'another batch'} students.
- Capacity Firewall: The supervisor assigned to this team has reached their absolute student limit (${maxSlots} slots).
- Failed to join team
- Invalid Invite Code! Please check the code and try again.
- Invite code is required.
- Program Mismatch! You are in ${student.program}, but this team belongs to ${firstMember.program} students.
- Project changes are locked until the administrator clears your outstanding fine.
- Student not found
- Successfully joined the team!
- This team is already full (maximum ${teamCapacity} students).
- Too many failed invite-code attempts. Try again later.
- Unauthorized student request.

### `/api/read-pdf`

- Unknown error

### `/api/register`

- Enter a valid email address.
- Invalid program selected.
- Invalid supervisor selected.
- Name, email, roll number, password, and batch are required.
- Password must be 10 to 128 characters.
- Registration failed. Please try again.
- Registration failed. The selected supervisor has reached maximum capacity (${maxSlots} slots).
- Registration successful! You can now sign in.${punishmentMessage}
- Selected supervisor was not found.
- This roll number or email is already registered.
- This student is already registered.

### `/api/registration-policy`

- Unable to load the registration policy.

### `/api/supervisors`

- Failed to fetch supervisors
- Unknown error

### `/api/supervisors/toggle-notifications`

- Failed to update settings
- Notification settings updated
- Unauthorized admin request.

### `/api/templates`

- Internal Server Error
- Invalid stage.
- One or more Word templates are unavailable.
- Only stage-based Word template requests are supported.
- Template is not available for your current project stage.
- Unauthorized

### `/api/upload`

- A valid file size is required.
- File exceeds 4MB limit.
- Security Violation: Invalid file type.
- Server token generation routing aborted.
- Student account not found.
- System storage capacity reached.
- Unauthorized: Authentication token missing or invalid.

### `/api/voice`

- Failed to fetch notes
- Failed to save note
- Failed to update note
- Invalid voice note upload.
- Invalid voice note.
- Note marked as played
- Project ID required
- Project not found or access denied.
- Unauthorized
- Uploaded voice note is invalid.
- Voice note not found or access denied.
- Voice note saved

### `/api/voice/upload`

- Failed to generate secure upload route
- Project ID required for voice notes.
- Project not found or access denied.
- System storage capacity reached. Contact Administrator.
- Unauthorized
- Unknown error
- Voice note exceeds 1MB limit.
- Voice notes must use the audio/webm format.

## Protected workflows requiring characterization tests next

- NextAuth credential login and session role mapping
- Forgot-password and reset-password responses and rate limits
- Registration policy and registration transaction behavior
- Student dashboard, team, project, stage, fine restriction, upload, and submission behavior
- Supervisor assignment, review, and communication behavior
- Admin reports, fines, registration policy, users, programs, batches, and supervisor slots
- PDF read/export and voice upload/read/cleanup behavior
