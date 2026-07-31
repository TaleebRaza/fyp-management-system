# Dynamic Fine Management System — Implementation Milestones

## Overview

The Dynamic Fine Management System will be implemented in five milestones. The milestones are ordered so that the core fine model and calculation engine are completed before restrictions, payment clearance, administration interfaces, and reporting features are added.

Each milestone includes its scope and completion criteria.

---

## Milestone 1 — Fine Data Model and Policy Engine

### Objective

Create the core data structures and business rules required to define, generate, calculate, and track fines independently from student account records.

### Requirements

- Create a reusable **Fine Type** model.
- Create a configurable **Fine Policy** model.
- Create a separate **Student Fine Record** for every fine imposed on a student.
- Allow one student to have multiple simultaneous fines.
- Support the following fine statuses:
  - Scheduled
  - Accruing
  - Paused
  - Pending Payment
  - Payment Submitted
  - Under Verification
  - Paid
  - Waived
  - Cancelled
  - Disputed
- Store the following information for every fine:
  - Student
  - Fine type
  - Reason
  - Original amount
  - Current amount
  - Accrued amount
  - Deadline
  - Grace period
  - Number of late days
  - Calculation policy version
  - Status
  - Administrative notes
  - Creation and modification history
- Support these calculation methods:
  - Fixed amount
  - Fine per late day
  - Starting amount plus daily amount
  - Maximum fine cap
- Support policy activation and deactivation.
- Support policy pause and resume.
- Ensure paused days are excluded from future accumulation.
- Preserve paid, waived, and cancelled fine records as historical records.
- Prevent duplicate fines for the same student, fine type, project stage, and policy version.
- Create server-side services for:
  - Fine calculation
  - Fine generation
  - Fine recalculation
  - Fine status transitions
- Record an audit entry for every policy and fine-record change.

### Initial Fine Types

- Late Registration Fine
- Late PDF Submission Fine
- Manual Administrative Fine

### Completion Criteria

- Administrators can create and configure fine policies.
- The system can generate separate Fine Records for students.
- Fine amounts are calculated consistently on the server.
- Fine accumulation can be paused and resumed.
- Historical fine records remain unchanged unless an explicit administrative correction is performed.
- Automated tests cover fine calculations, status transitions, duplicate prevention, and policy versioning.

---

## Milestone 2 — Fine Generation and Deadline Management

### Objective

Implement the automatic and manual workflows that create fines for late registration, late PDF submission, and administrative reasons.

### Requirements

### Late Registration Fine

- Configure:
  - Registration deadline
  - Grace period
  - Starting amount
  - Daily fine rate
  - Maximum amount
  - Applicable programs
  - Applicable batches
  - Effective date
  - Default restrictions
- Automatically identify students who register after the configured deadline.
- Calculate late days using the configured time zone.
- Create individual Fine Records for affected students.
- Allow the administrator to pause and resume accumulation.
- Allow the administrator to change the registration deadline.
- When a deadline changes, provide these application modes:
  - New students only
  - All unresolved fines
  - Selected students
  - Preview only
- Before retroactive recalculation, show:
  - Number of affected students
  - Previous deadline
  - New deadline
  - Previous total amount
  - Projected total amount
  - Students whose fines increase
  - Students whose fines decrease
  - Students whose fines become zero

### Late PDF Submission Fine

- Configure separate policies for:
  - Proposal PDF
  - Thesis draft
  - Final thesis
  - Final deliverables
  - Future submission stages
- Support:
  - Fixed fine after deadline
  - Fine per late day
  - Starting amount plus daily amount
  - Grace period
  - Maximum fine
  - Pause and resume
- Allow the administrator to choose a liability mode:
  - Individual liability
  - All-member liability
  - Shared team liability
- Stop accumulation when an accepted submission is received, according to policy.
- Define how rejected submissions and resubmissions affect the fine.
- Link every PDF fine to:
  - Project
  - Submission stage
  - Submission deadline
  - Relevant team members

### Manual Administrative Fine

- Allow an administrator to assign a fine to:
  - One student
  - Multiple students
  - A project team
  - A program
  - A batch
  - All active students
- Require:
  - Fine title
  - Reason
  - Amount
  - Due date
  - Notes
  - Selected restrictions
  - Whether accumulation is enabled
  - Whether disputes are permitted

### Completion Criteria

- Late registration fines can be generated automatically.
- Late PDF submission fines can be generated according to project-stage policies.
- Administrators can create manual fines.
- Deadline changes can be previewed before being applied.
- Retroactive recalculation does not modify paid, waived, or cancelled records without explicit correction.
- Bulk generation actions are protected against duplicate execution.
- Automated tests cover late-day calculations, liability modes, deadline changes, and bulk fine creation.

---

## Milestone 3 — Restriction and Enforcement Engine

### Objective

Create a centralized restriction engine that converts unresolved fines into enforceable portal restrictions.

### Requirements

### Restriction Types

Support the following restriction types:

1. PDF Upload Restriction
2. Login Restriction
3. Supervisor Disband or Supervisor Selection Restriction
4. Team Disband or Team Membership Restriction
5. No Operational Restriction

### Restriction Scope

Allow restrictions to be configured at these levels:

- Global default
- Fine Type default
- Program or batch rule
- Project or team rule
- Individual student override
- Individual Fine Record override

### Restriction Precedence

Use this precedence order:

`Fine Record override → Student override → Fine Type rule → Global default`

The administrator interface must show where each effective restriction originated.

### Multiple Fines

- Combine restrictions from all unresolved fines.
- Resolving one fine must remove only the restrictions contributed by that fine.
- A restriction must remain active while another unresolved fine still requires it.
- The No Operational Restriction option must be mutually exclusive with operational restrictions for the same fine.

### PDF Upload Restriction

- Block the fined student from uploading project PDFs.
- Block the entire team when any team member has an active team-upload restriction.
- Enforce the rule on:
  - Upload routes
  - Final submission routes
  - Any future project-document routes
- Show whether the restriction belongs to:
  - The current student
  - Another team member
- Enforce the rule on the server, not only in the interface.

### Login Restriction

Support two modes:

- Payment-only portal access
- Complete account lock

Payment-only access should be the default.

The login restriction must:

- Affect new and existing sessions.
- Prevent normal student API access.
- Keep payment and fine-status pages accessible when payment-only mode is used.
- Remain separate from the portal's general account-active status.

### Supervisor Restriction

Support two explicit actions:

- Disband supervisor from the entire project.
- Detach only the fined student after removing the student from the team or project.

The system must:

- Preserve the previous supervisor relationship.
- Prevent restricted students from selecting another supervisor.
- Avoid mismatched student and project supervisor records.
- Warn all affected team members before project-level disbanding.

### Team Restriction

When applied to an individual student:

- Remove only the fined student from the team.
- Preserve the remaining members' project, files, supervisor, domains, and submission history.
- Prevent the fined student from:
  - Creating a team
  - Joining a team
  - Rejoining the previous team
- Store a restoration snapshot.
- Mark an incomplete team according to the configured team-completion rule.

### No Operational Restriction

- Allow the student to continue using the portal.
- Keep the fine active and visible.
- Continue fine accumulation when applicable.
- Continue reminders and administrative reporting.

### Completion Criteria

- All restriction decisions are calculated by one central service.
- Protected API routes enforce effective restrictions.
- Team upload restrictions work across both team members.
- Login restrictions do not interfere with unrelated account suspensions.
- Team and supervisor disband actions preserve consistent project data.
- Restriction removal is correctly recalculated when one of multiple fines is resolved.
- Automated tests cover restriction precedence, multiple fines, team effects, login modes, and disband workflows.

---

## Milestone 4 — Payment, Verification, Clearance, and Restoration

### Objective

Implement the complete fine-payment lifecycle and provide administrators with a safe one-button clearance process.

### Requirements

### Payment Configuration

Allow administrators to configure:

- Payment method
- Account title
- Account or wallet number
- Payment instructions
- Required proof
- Verification contact information

### Student Payment Submission

Allow students to submit:

- Payment reference
- Paid amount
- Payment date
- Payment proof
- Optional message
- Fine Records being paid

Submitting payment proof must not automatically mark a fine as paid unless an automatic payment-verification service is configured.

### Administrative Payment Verification

Allow administrators to:

- Verify one Fine Record.
- Verify all outstanding fines for a student.
- Reject payment proof with a reason.
- Record offline payments.
- Waive a fine.
- Correct an incorrectly calculated fine.
- Add discounts or adjustments.
- Partially settle a fine when partial payments are enabled.

### One-Button Clearance

Provide a **Verify Payment and Clear Fine Restrictions** action.

Before confirmation, show:

- Student
- Selected Fine Records
- Outstanding amount
- Settled amount
- Restrictions to be removed
- Team and project effects
- Previous team or supervisor relationships
- Payment reference
- Actions that cannot be automatically restored

The clearance action must atomically:

1. Mark selected fines as paid.
2. Record payment and administrator information.
3. Remove restrictions caused by the selected fines.
4. Recalculate remaining effective restrictions.
5. Restore access where permitted.
6. Notify the student.
7. Refresh affected team and project permissions.
8. Create an audit record.

### Restoration Rules

Payment must automatically restore eligibility but must not silently recreate dissolved relationships.

Allow administrators to:

- Restore previous team membership.
- Restore the previous supervisor.
- Let the student make a new selection.
- Leave the student unassigned.

Restoration is allowed only when:

- The project still exists.
- The team has capacity.
- The supervisor has capacity.
- No conflicting assignment exists.
- All relevant accounts remain active.

### Completion Criteria

- Students can view payment instructions and submit proof.
- Administrators can accept, reject, waive, correct, and settle fines.
- One-button clearance removes only fine-related restrictions.
- Unrelated account or academic restrictions remain intact.
- Multiple fine records are handled correctly during partial or complete settlement.
- Relationship restoration validates current team and supervisor capacity.
- Payment and clearance actions are atomic and auditable.
- Automated tests cover payment status transitions, failed clearance rollbacks, multiple fines, and relationship restoration.

---

## Milestone 5 — Admin Fine Portal, Student Experience, Reporting, and Audit

### Objective

Deliver the complete administrative and student-facing fine-management experience.

### Admin Fine Tab

Create the following sections:

### Fine Overview

Display:

- Total outstanding amount
- Total collected amount
- Total waived amount
- Number of fined students
- Number of restricted students
- Active accumulation policies
- Pending payment verifications
- Students blocked from login
- Projects blocked from submission

### Fine Types

Allow administrators to:

- Create Fine Types
- Edit policies
- Activate and deactivate policies
- Pause and resume accumulation
- Change deadlines
- Preview recalculation
- Configure calculation rules
- Configure default restrictions
- View policy history

### Fine Control

Allow administrators to:

- Configure global restrictions
- Configure Fine Type restrictions
- Apply bulk restrictions
- Select programs and batches
- Select projects and teams
- Configure individual student overrides
- Preview affected users before applying changes

### Fined Students

Allow administrators to:

- Search by name or roll number
- Filter by program
- Filter by batch
- Filter by Fine Type
- Filter by restriction
- Filter by payment status
- View the complete fine breakdown
- Add or modify a fine
- Waive a fine
- Clear one or all fines
- View team and supervisor impact

### Payment Verification

Display:

- Submitted payment proofs
- Payment references
- Submitted amounts
- Submission dates
- Fine Records being paid
- Verification history
- Accept and reject actions

### Audit History

Display every:

- Fine creation
- Fine recalculation
- Deadline change
- Pause and resume action
- Restriction assignment
- Team disband
- Supervisor disband
- Payment submission
- Payment verification
- Waiver
- Manual correction
- Clearance
- Restoration action

### Student Fine Experience

Students with active fines must see:

- Persistent dashboard banner
- Fine summary card
- Restricted-action messages
- Payment-only page when applicable
- Fine notifications

Students must be able to view:

- Total outstanding amount
- Fine breakdown
- Original amount
- Accrued amount
- Number of late days
- Fine reason
- Fine status
- Applied restrictions
- Payment instructions
- Payment-verification status
- Dispute or contact instructions

### Notifications

Notify students when:

- A fine is imposed.
- A fine starts accumulating.
- A fine amount changes.
- A deadline changes retroactively.
- A restriction is applied.
- A teammate's fine blocks project uploads.
- A team or supervisor is disbanded.
- Payment proof is received.
- Payment is accepted or rejected.
- A fine is waived.
- Restrictions are removed.

Notify administrators when:

- Payment proof requires verification.
- A fine is disputed.
- A bulk action fails or partially completes.
- A restoration action requires manual review.

### Reporting

Allow reporting by:

- Fine Type
- Program
- Batch
- Student
- Project
- Supervisor
- Restriction
- Payment status
- Date range
- Amount collected
- Amount outstanding
- Amount waived

Reports must distinguish between:

- Generated fines
- Collected fines
- Outstanding fines
- Waived fines
- Corrected fines
- Cancelled fines

### Safety and Usability

- Require an impact preview before bulk or destructive actions.
- Require explicit confirmation and an administrative reason.
- Protect against repeated submissions.
- Show the source of each active restriction.
- Clearly distinguish fine restrictions from unrelated account restrictions.
- Ensure all administrative actions are auditable.
- Add pagination and bounded queries for large student and audit lists.
- Add loading, empty, error, and partial-failure states.
- Ensure the interface is usable on desktop and mobile layouts.

### Completion Criteria

- The Admin Fine tab supports the complete fine lifecycle.
- Students can always understand their fine amount, status, and restrictions.
- Administrators can manage policies, restrictions, payments, and restorations without editing database records directly.
- Reports produce accurate totals and filters.
- Bulk actions include previews and confirmation.
- Audit history can reconstruct every material fine-related action.
- End-to-end tests cover the principal admin and student workflows.

---

# Progress

## Overall Progress

**98% complete**

## Milestone Status

| Milestone | Status | Progress |
|---|---|---:|
| Milestone 1 — Fine Data Model and Policy Engine | Completed | 100% |
| Milestone 2 — Fine Generation and Deadline Management | Completed | 100% |
| Milestone 3 — Restriction and Enforcement Engine | Completed | 100% |
| Milestone 4 — Payment, Verification, Clearance, and Restoration | Implemented; database E2E pending | 95% |
| Milestone 5 — Admin Fine Portal, Student Experience, Reporting, and Audit | Implemented; browser E2E pending | 95% |

## Current Implementation State

- Milestones 1–3 are implemented with separate Fine Type, versioned Fine Policy, Student Fine Record, Restriction Rule, and Fine Audit collections.
- Registration, project-stage submission, manual assignment, deadline preview/application, liability modes, pause/resume, and duplicate-safe bulk generation use the server-side fine services.
- A central restriction engine resolves fine-record, student, project/team, program/batch, fine-type, policy, and global rules and reports the source of each effective restriction.
- Upload, submission, supervisor-selection, team-membership, and login paths enforce dynamic restrictions on the server. Payment-only sessions retain fine-status access, while complete-lock restrictions reject new and existing sessions.
- Structural team and supervisor enforcement requires an explicit preview and confirmation, stores restoration snapshots, runs transactionally, and does not delete storage objects.
- Fine Payment records are separate from Student Fine records and use per-student idempotency keys. Student proof submissions use isolated `fine-proofs/` storage keys, the existing reservation/finalization ledger, size and file-signature validation, and ownership checks.
- Payment submission, rejection, partial settlement, waiver, correction, discounts, charges, and administrator-recorded offline payments are implemented. Overlapping payments awaiting review are rejected.
- The payment-clearance preview shows the selected fines, current outstanding and settled amounts, restrictions, project effects, and restorable relationship snapshots. Verification, allocation, fine status changes, audits, and notification-outbox entries commit in one transaction. Offline payment creation and verification use that same transaction boundary.
- Fine resolution removes only the selected fine records' contributions. Team or supervisor relationships are never silently recreated; administrators must preview and explicitly choose team, supervisor, both, or leave-unassigned restoration, with current account, assignment, team, and supervisor-capacity checks.
- The Admin Fine tab now includes overview totals, policy and deadline controls, all restriction scopes, fine search and advanced filters, manual fine assignment, corrections and adjustments, payment verification/history, offline payment recording, restoration, CSV reporting, pagination, and audit history.
- The student Fine tab now includes a persistent dashboard warning, live fine balances, restriction sources, payment instructions, proof submission, dispute handling, verification history, and fine audit notifications. Payment-only sessions can access only the fine/proof flow, not unrelated project documents.
- Automated tests cover calculation, allocation, partial-payment policy, idempotency and active-payment guards, transaction/storage safety wiring, restriction precedence, multiple fines, policy logic, and structural workflows. Lint, TypeScript, unit tests, and the production build pass.
- The repository does not currently include a browser E2E harness or a disposable database integration environment. Principal browser and failed-transaction rollback E2E tests remain the final validation work; they must use isolated test services, never production data or storage.
- Existing embedded fine data remains a compatibility path. It is not migrated or mutated automatically, and the dynamic bulk generator skips legacy fined students to prevent double charging.
- Production Mongoose auto-indexing is disabled. New indexes are declared for review and can be applied only through the existing explicitly guarded index script; no migration, index-apply, storage-repair, or cleanup command was run during this implementation.

## Progress Update Rules

Update this section whenever work is completed.

For each milestone:

- Change `Not Started` to `In Progress` when implementation begins.
- Record completed requirements under the relevant milestone.
- Change the milestone to `Completed` only after its completion criteria and tests pass.
- Calculate overall progress from the combined completion of all five milestones.
