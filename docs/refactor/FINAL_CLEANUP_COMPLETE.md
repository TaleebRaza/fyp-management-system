# Code Cleanup Complete

Target commit before installation: `522fc57771015c28512cc5b3d2706f98f3a1d17f`

## Final milestone

The final cleanup milestone decomposes the password-reset client flow and thins the two password-reset API routes.

### Frontend boundaries

- `PasswordResetFlow.tsx`: layout and step composition only.
- `usePasswordResetFlow.ts`: recovery state machine and user feedback.
- `passwordResetApi.ts`: browser API contracts.
- `VerifyAcademicDetailsForm.tsx`: verification form rendering.
- `SetNewPasswordForm.tsx`: password form rendering.
- `passwordResetOptions.ts`: deterministic batch and program options.

### Backend boundaries

- Route files parse the request body, call one service function, and produce a response.
- `passwordResetValidation.ts` normalizes and validates untrusted request input.
- `passwordResetService.ts` owns database access, knowledge matching, rate limits, reset tokens, cooldowns, hashing, and atomic password updates.

## Preserved behavior

- Existing endpoints and request fields.
- Existing response messages and status codes.
- Five verification attempts per rate-limit window.
- Ten reset attempts per rate-limit window.
- Fifteen-minute reset-token expiry.
- Five-hour password-change cooldown.
- Teammate verification for students with a team.
- Password length validation and one-time token consumption.

## Verification

Run:

```bash
npm run test:unit
npm run lint
npm run build
```

The planned cleanup milestones are complete after these checks pass.
