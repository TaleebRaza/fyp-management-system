# Code Cleanup — Milestone 1 Verification Baseline

## Purpose

This milestone locks down the current behavior before the next structural refactor. It adds focused regression tests, a repeatable verification command, and a manual smoke-test checklist. It does not intentionally change production behavior, API contracts, database schemas, permissions, storage keys, or UI design.

## Automated verification

Install dependencies first:

```bash
npm install
```

Run only the focused unit tests:

```bash
npm run test:unit
```

Run the complete refactor verification gate:

```bash
npm run verify:refactor
```

The complete gate runs, in order:

1. ESLint.
2. Focused Node.js unit tests.
3. A production Next.js build.

A cleanup commit should not be considered complete until `npm run verify:refactor` succeeds.

## Covered behavior

The unit tests now protect:

- Password-reset academic knowledge matching.
- Admin report-row selectors.
- Admin CSV generation and quote handling.
- Admin HTML report escaping and totals.
- Supervisor project filtering, searching, option generation, and statistics.
- Project-review eligibility rules.
- Team-capacity normalization.

## Manual smoke-test checklist

Complete this checklist after any refactor that touches dashboards, API routes, project submission, broadcasts, authentication, team membership, or reports.

### Authentication and password reset

- [ ] Student, supervisor, and admin accounts can sign in.
- [ ] Invalid credentials are rejected without exposing account details.
- [ ] Password-reset academic verification rejects one incorrect factor at a time.
- [ ] Password reset succeeds with all correct factors.
- [ ] The new password works and the old password no longer works.

### Admin reports

- [ ] The reports dialog opens without an exception.
- [ ] Every report option renders the expected rows.
- [ ] Empty reports show a clear empty state.
- [ ] HTML report preview opens and displays escaped labels/notes correctly.
- [ ] CSV download opens in spreadsheet software with intact commas, quotes, and line breaks.
- [ ] Collected-fine reports show the correct total.
- [ ] Opening or downloading a report does not create an unexpected database record.

### Broadcasts

- [ ] A supervisor can send a text broadcast.
- [ ] A supervisor can record, preview, cancel, and send a voice broadcast.
- [ ] Failed uploads show an error and do not create a broken broadcast.
- [ ] Students see only broadcasts they are authorized to receive.

### Student project workflow

- [ ] Project draft text is restored after a refresh.
- [ ] Invalid file types are rejected.
- [ ] Oversized PDFs are rejected.
- [ ] A valid PDF uploads and the project submission succeeds.
- [ ] The project stage and status displayed after submission are correct.
- [ ] A fined student cannot access restricted project actions.
- [ ] A fine affecting one team member applies consistently to the team where intended.

### Supervisor review workflow

- [ ] Search matches student names, roll numbers, programs, project titles, domains, tools, statuses, batches, and semesters.
- [ ] Program, batch, submitted, and review-queue filters can be combined.
- [ ] Review-queue counts match projects with a PDF and no final review decision.
- [ ] Approve, reject, and request-changes actions update the intended team.
- [ ] Stage advancement after approval remains correct.
- [ ] The previous-stage PDF cleanup behavior remains correct.

### Team management

- [ ] Default teams accept no more than two members.
- [ ] An explicitly expanded team accepts a third member.
- [ ] Invalid or expired invite/migration codes are rejected.
- [ ] Student migration moves only the selected student.
- [ ] Removing a supervised team leaves it in a consistent state.

## Commit rule

Keep behavior changes and structural refactors in separate commits. When a test exposes an existing bug, first document the failing behavior, then fix it in a dedicated bug-fix commit rather than silently changing expectations inside the cleanup commit.
