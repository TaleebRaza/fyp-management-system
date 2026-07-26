# Progress

## Current milestone

Knowledge-based student password recovery — implementation and automated validation complete on `main` (2026-07-26).

Evidence: all five requested identity inputs are verified server-side; teammate roll number is required only when a real teammate exists; successful verification creates a 15-minute one-time token; focused tests, TypeScript, changed-file lint, repository lint, and production build pass.

Decision: retain the existing two endpoints, rate limiting, cooldown, bcrypt, password policy, and reset storage fields. Email remains available only for unrelated notification features.

Risk: knowledge-based recovery has lower assurance for solo students. Next action is a database-backed browser check using one solo student and one team student before deployment.
