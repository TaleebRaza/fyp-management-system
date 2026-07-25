# Refactoring Release Checklist

## Before merge

- [ ] Change has one purpose and one owner.
- [ ] Behavior-preservation note is complete.
- [ ] Database impact is `None`.
- [ ] Storage impact is `None`.
- [ ] API contract impact is compatible.
- [ ] Rollback instruction is written.
- [ ] `npm run check` passes.
- [ ] `npm test` passes.
- [ ] `npm run build:verify` passes.
- [ ] Preview smoke tests pass for affected roles.
- [ ] `Progress.md` and milestone checkboxes are updated.

## Deployment

- [ ] Deploy during a normal monitored window; no maintenance mode.
- [ ] Confirm deployment uses the expected Git commit.
- [ ] Confirm homepage and authentication page load.
- [ ] Run only the smoke tests related to the changed workflow.
- [ ] Check application and Sentry logs for new errors.

## Rollback trigger

Rollback immediately for authentication failure, authorization regression, broken dashboard loading, incorrect report totals, upload/read failure, or a new elevated error rate.

## Rollback action

1. Revert the single cleanup commit or pull request.
2. Redeploy the previous known-good commit.
3. Repeat the affected smoke test.
4. Record the failure in `Progress.md` before retrying the refactor.
