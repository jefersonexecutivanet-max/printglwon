# Security Specification - Printer Monitor

## 1. Data Invariants
1. **Printers**: Any printer must have a valid `name`, `ip`, and `status`. Only signed-in users can view, create, edit, or delete printers.
2. **Logs**: Logs are append-only. Only signed-in users can view or write logs. No updates or deletes are allowed on log records to preserve audit trail integrity.
3. **Alerts**: Alerts record warning and status details. Updates are permitted to change alert status to `resolved` and set `resolvedAt`.
4. **Users**: A user can only write their own profile entry under `users/{userId}` where `userId` equals their UID.

## 2. The Dirty Dozen (Vulnerable Payloads)
1. **Unauthenticated Read**: Attempting to read `/printers/p123` or `/logs/l123` with `request.auth == null` -> `PERMISSION_DENIED`.
2. **Unauthenticated Create**: Attempting to write a printer without login -> `PERMISSION_DENIED`.
3. **Printer Shadow Update**: An authenticated user attempting to alter a printer's IP and adding an unauthorized field like `isAdminPrivileged` -> `PERMISSION_DENIED` (handled by validation schemas or explicit field matches).
4. **CreatedBy Spoofing**: Attempting to register another user's email in `users/usr456` while logged in as `usr123` -> `PERMISSION_DENIED`.
5. **Log Update**: Attempting to update a log record at `/logs/log123` -> `PERMISSION_DENIED`.
6. **Log Delete**: Attempting to delete a log record at `/logs/log123` -> `PERMISSION_DENIED`.
7. **Jammed Path Exceeding Limit**: Attempting to set an ID longer than 128 characters or containing unsafe special characters in printers path -> `PERMISSION_DENIED`.
8. **Malicious Larger Severity**: Attempting to write an alert with an invalid severity value (e.g., "ultra-critical") -> `PERMISSION_DENIED`.
9. **Manipulating timestamps**: Attempting to write manually set custom future Client timestamps for `createdAt` of a printer instead of `request.time` -> `PERMISSION_DENIED`.
10. **Tampering with users email**: A user trying to set their own profile role to "SuperAdmin" or modify their email during profile update -> `PERMISSION_DENIED`.
11. **Alert Timestamp Tampering**: Modifying the original create timestamp of an alert during status resolution -> `PERMISSION_DENIED`.
12. **Bypassing exact parameters**: Adding unrequested fields to a log, such as custom debugging objects -> `PERMISSION_DENIED`.

## 3. Deployment Rules Audit
The rules defined in `DRAFT_firestore.rules` close all these update gaps:
- Catch-all `allow read, write: if false;` applies to everything else.
- All writes compare against `request.time` ensuring temporal security constraints.
- Named operations and strict types protect printer, alert, log, and user data collections.
- `isOwner(userId)` enforces strict identity integrity for profile mutations.

We proceed with using the rules.
