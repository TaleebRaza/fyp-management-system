# Student-to-Admin Message Plan

## Goal

Add one compact floating **Message admin** control to every student dashboard. A student can send either text or a WebM voice recording of at most 60 seconds. The admin dashboard shows the current message with the student's name, roll number, and program.

Keep the feature deliberately small: one current message per student, two narrow API surfaces, one student widget, one admin panel, and the existing storage workflow. Do not add chat threads, realtime delivery, notifications, message history, or a generic messaging framework.

## Required state rules

| Current state | Student action | Result |
| --- | --- | --- |
| No message | Send text or voice | Store one pending message. |
| Pending, not acknowledged | Send another | Reject on the server with `409`; disable it in the UI. |
| Pending | Delete | Remove the database reference immediately, make audio inaccessible immediately, queue physical R2 deletion, and allow another message. |
| Acknowledged | Send text or voice | Replace the same database fields; if the old message is audio, queue its R2 object for deletion. |
| Acknowledged | Delete | Clear the fields and queue audio deletion when applicable. |

Acknowledgement must mean:

- Text: the admin explicitly opens the message detail, then the UI marks that exact message as seen.
- Voice: the audio reaches `ended`; merely loading or starting it does not count as heard.
- Acknowledgement targets an immutable message ID, so a stale browser tab cannot acknowledge or delete a newer replacement.

## Minimal data model

Extend the existing `User` document rather than creating a message collection. Student identity already lives there, and one document per student naturally represents one current message.

Add these nullable fields to `models/User.ts`:

- `studentMessageId`: server-generated UUID, maximum 128 characters.
- `studentMessageType`: `text | audio | null`.
- `studentMessageContent`: validated text or a normalized R2 key.
- `studentMessageSize`: verified R2 bytes, zero for text.
- `studentMessageCreatedAt`: server timestamp.
- `studentMessageAcknowledgedAt`: null until the admin sees/hears this exact message.

Do not copy the student's name, roll number, or program into message fields. The admin query can select those authoritative fields from the same user document, avoiding duplicated identity data and a migration.

Add a partial admin-list index on `{ role: 1, studentMessageCreatedAt: -1 }` for student documents with a message. Add it to the existing index manifest and apply it through the repository's established index audit/apply flow. Existing users need no backfill.

## Shared limits

Define one set of constants in `config/appSettings.ts` and use them in both UI and server code:

- Text: 500 characters after trimming.
- Voice duration: 60 seconds.
- Voice upload: `audio/webm`, at most 1 MiB.

The 500-character text ceiling matches the existing small text composer. Reject empty or over-limit text instead of silently truncating it.

The browser recorder must stop automatically at 60 seconds, but that is only a usability guard. The server must also inspect the uploaded WebM and reject a missing, invalid, non-audio, non-finite, or over-60-second duration. Use a maintained WebM-aware metadata parser against the already bounded 1 MiB object; do not trust a client-supplied duration or write a custom EBML parser. [`music-metadata`](https://github.com/Borewit/music-metadata) is the single justified dependency because the standard library and current dependencies do not provide media-duration validation.

## Storage changes

Reuse `reserveUpload`, `finalizeUploadReservation`, the storage ledger, and `StorageDeletionOutbox`.

1. Add a `student-message` upload kind and the server-owned key shape `student-messages/<studentId>/<messageId>.webm` in `lib/storageValidation.ts` and `models/UploadReservation.ts`.
2. Require the voice upload request to declare the `student-message` purpose. Permit it only for an authenticated student and derive the owner ID and object key from that session, never from request data.
3. Add a partial unique reservation index on `{ ownerId: 1, kind: 1 }` for pending `student-message` reservations. This closes concurrent presign spam while leaving existing PDF, project voice-note, and supervisor broadcast behavior unchanged.
4. Reuse the same idempotency key while retrying one recording. Before a new reservation, cancel an expired reservation for that student; return `409` if another unexpired student-message upload is already in flight.
5. During finalization, download at most the verified 1 MiB object, verify WebM signature/content type/bytes/duration, then atomically swap the student's message fields and finalize the storage ledger reservation.
6. If finalization loses the one-message race, cancel its reservation so the uploaded object is durably queued for cleanup rather than left orphaned.
7. Extend `lib/security/storage.ts` so only the owning student and an admin can receive a signed URL for a `student-messages/` object. Supervisors and other students must receive not-found/access-denied responses.
8. Extend `lib/storageReferenceSafety.ts`, `scripts/audit-storage-keys.mjs`, and `scripts/audit-storage-integrity.mjs` so student-message audio is counted as an active reference and cannot be deleted as an orphan.

Deletion remains consistent with the repository's existing safety model: the database reference and authorization disappear in the transaction, while physical R2 deletion is performed by the durable outbox worker. Do not perform direct object deletion inside the request.

## API surface

### Student: `/api/dashboard/student/message`

- `GET`: return only the authenticated student's current message and acknowledgement state. Use `Cache-Control: no-store`.
- `POST` text: validate the discriminated body, then create or replace only when no message exists or the current message is acknowledged.
- `POST` audio: finalize only a key owned by the authenticated student and reserved as `student-message`; apply the same state gate in the final transaction.
- `DELETE`: require the current `messageId`; clear only that authenticated student's matching message and enqueue audio deletion in the same transaction.

Use `requireCurrentUser(req, ['student'])`, which also supplies the existing same-origin mutation guard. Add the existing account-and-IP rate limiter to reserve, finalize, text-send, and delete operations. Return stable `400`, `401`, `409`, and `429` responses without logging message text, keys, signed URLs, or media metadata.

### Admin: `/api/admin/student-messages`

- `GET`: admin-only, return current student messages sorted newest first, selecting only message fields plus `_id`, `name`, `rollNo`, and `program`. Use `Cache-Control: no-store`.
- `PATCH`: admin-only, accept `studentId` and `messageId`; set `studentMessageAcknowledgedAt` only if both still match and it is currently null. Make retries idempotent.

Do not mutate state in `GET`. The admin UI calls `PATCH` after opening a text detail or after audio playback ends.

## Student dashboard UI

Add one focused `components/student/StudentMessageWidget.tsx` and mount it once beside `DashboardShell` in `components/dashboards/StudentDashboard.tsx` so it is available on every student tab.

- Use a compact fixed circular button at the bottom-right with safe-area offsets, an accessible label, keyboard focus, and a tooltip/title.
- Keep its z-index below existing dialogs and the mobile navigation. Verify the 44–48 px control does not cover actions or content at supported mobile and desktop widths; add only scoped clearance if an actual collision is found.
- Open the repository's existing `Dialog`; do not create another modal system.
- Reuse `BroadcastModeSelector`, `AudioBroadcastForm`, `useAudioRecorder`, `TextArea`, and existing buttons where their wording/props fit. Add small props for neutral placeholder/labels instead of copying components or refactoring the supervisor broadcast feature.
- Fetch status when the dialog opens, and refresh after send/delete. Do not poll or add WebSockets.
- While unacknowledged, show the submitted message, its pending status, and a delete action; hide/disable sending.
- Once acknowledged, show that the admin has seen/heard it and allow a replacement.
- Keep a generated audio message ID/idempotency key stable through upload retries. Disable close/mode/delete actions during a mutation to prevent accidental duplicate requests.
- Confirm deletion and present server errors without discarding a locally recorded preview.

## Admin dashboard UI

Add a `messages` tab to `components/dashboards/AdminDashboard.tsx` and a focused `components/admin/StudentMessagesPanel.tsx`.

- Load messages only while the tab is open and include a manual refresh button; no background polling or realtime service.
- Show sender name, roll number, program, type, sent time, and New/Seen state.
- Open the selected message in the existing `Dialog`. Render text as React text, never injected HTML.
- For audio, use the existing authenticated media route and acknowledge on the audio element's `ended` event.
- For text, acknowledge the selected immutable message ID after its detail is rendered.
- Update the matching card locally after acknowledgement; refetch only after an error or explicit refresh.
- Show an empty state when no student has sent a message.

## Transaction and failure behavior

Centralize the small repeated server operation that enqueues deletion of the current audio message. For create, replace, and delete:

1. Start the existing MongoDB/storage transaction.
2. Match the authenticated student, the expected message ID/state, and the allowed transition.
3. Validate and normalize any old audio key before changing the document.
4. Check shared references and enqueue deletion when replacing/deleting audio.
5. Write or clear all message fields together.
6. Commit; only then return success.

If R2 upload, metadata validation, ledger conversion, deletion enqueue, or the database write fails, keep the previous message intact. A failed uploaded object must remain attached to a pending/cancelled reservation so existing cleanup can reclaim it.

## Tests

Add the smallest tests that prove the owned contracts, following the existing Node test setup:

1. Storage validation: new key generation/normalization/ownership, WebM signature, bounded size, valid duration, missing duration, and duration over 60 seconds.
2. State/API structure: student/admin role gates, same-origin mutations, server-owned identity, exact message-ID matching, `409` while unacknowledged, acknowledgement idempotency, and no mutation in admin `GET`.
3. Concurrency: two send/finalize attempts for one student produce one current message; the loser is cancelled/queued for cleanup.
4. Replacement/deletion: text and audio transitions, old audio outbox creation, immediate loss of media authorization, and the ability to send again after delete.
5. Access control: admin and owner can read audio; another student and a supervisor cannot.
6. UI structure: the widget is mounted once outside tab branches, the 60-second recorder is reused, pending state disables send, text acknowledgement happens on detail display, and audio acknowledgement happens only on `ended`.

Manual acceptance on current Chrome/Firefox plus a narrow mobile viewport:

- Send text, confirm identity on admin, confirm a second send is blocked, open it as admin, then replace it.
- Send a 60-second voice message, reject a deliberately over-limit WebM through the API, play it partially (still blocked), play it to completion (replacement allowed), and verify old media becomes inaccessible after replacement.
- Delete pending text and voice messages, refresh both dashboards, and confirm the message is gone and the student can send again.
- Deny microphone permission, interrupt an upload, retry it, and confirm no duplicate message or permanent lock.
- Check launcher/dialog placement, keyboard focus, and content clearance on every student tab.

## Validation and rollout

1. Run targeted new tests first, then `npm run lint`, `npm run test:unit`, and `npm run build`.
2. Run the read-only index and storage audits.
3. Apply the additive indexes with the established confirmed index command before enabling the UI. No data migration or downtime is required because all new user fields are nullable.
4. Deploy the server/model/storage changes before exposing the student widget and admin tab if deployment is split.
5. After deployment, send/delete one test voice message, run the storage integrity audit, and confirm used/reserved bytes and deletion-outbox processing remain consistent.

## Explicitly out of scope

- Message history or chat threads.
- Multiple admins claiming/assigning messages.
- Email, push, badge counts, or realtime notifications.
- Student-to-supervisor routing.
- Attachments other than one WebM voice recording.
- Admin deletion or replies.
- Logging message content.

Add any of these only when there is a concrete requirement; none is needed to satisfy this feature.
