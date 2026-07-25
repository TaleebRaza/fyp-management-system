## Purpose

<!-- One module or one workflow only. -->

## Behavior preservation

- [ ] Existing API paths, status codes, and response shapes remain compatible.
- [ ] Existing role and permission behavior remains compatible.
- [ ] Existing user workflow and UI behavior remain compatible.

Describe the behavior that must remain unchanged:

## Impact statements

**Database impact:** None / describe explicitly

**Storage impact:** None / describe explicitly

**API contract impact:** None / backward-compatible addition only

## Verification

- [ ] `npm run check`
- [ ] `npm test`
- [ ] `npm run build:verify`
- [ ] Relevant student smoke test
- [ ] Relevant supervisor smoke test
- [ ] Relevant admin smoke test

## Rollback

<!-- State the exact commit-revert or file-level rollback instruction. -->

## Scope control

- [ ] Cleanup is not mixed with a feature.
- [ ] Cleanup is not mixed with a behavior-changing bug fix.
- [ ] Pull request stays within 15 files and 400 non-generated changed lines, or explains why not.
