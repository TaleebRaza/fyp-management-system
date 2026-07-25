# Production and Preview Smoke-Test Scenarios

Use designated non-production test accounts or approved test records. Never create or modify real student data solely for a smoke test.

## Shared

- [ ] Landing page loads without a console-blocking error.
- [ ] Valid login reaches the correct role dashboard.
- [ ] Invalid credentials show the existing error behavior.
- [ ] Logout ends the session and returns to the public flow.

## Student

- [ ] Student dashboard loads the existing profile, supervisor, team, project, stage, and fine information.
- [ ] A read-only navigation action works.
- [ ] Existing submission state and PDF controls render correctly.
- [ ] Fine-restricted and unrestricted states match existing records.

## Supervisor

- [ ] Supervisor dashboard loads assigned projects.
- [ ] Pending review counts and project filters match existing records.
- [ ] Opening a submission does not change its state.
- [ ] Broadcast and voice-note history render without writing new storage objects.

## Admin

- [ ] Admin dashboard loads user and project summaries.
- [ ] Reports load and show the same totals as the previous production commit.
- [ ] Fine search returns the expected existing student.
- [ ] Registration-policy screen displays the current policy without saving it.

## File access

- [ ] An existing authorized PDF can be opened.
- [ ] An unauthorized role cannot access a protected PDF.
- [ ] Existing template downloads remain reachable.

## Result record

Record commit, preview URL, tester, date, affected roles, passed scenarios, failed scenarios, and rollback decision in the pull request.
