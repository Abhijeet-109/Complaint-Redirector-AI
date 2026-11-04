# Flatkart Security Hardening Progress

This checklist tracks the work required by [`Security.md`](Security.md). The project rule is to preserve working behavior and runtime data while implementing security changes in small, reviewable phases.

## Operating constraints

- Do not apply schema migrations or write to the configured PostgreSQL database without a separately reviewed rollout and backup.
- The production database target has not been selected; defer database-specific migrations and policies until it is chosen.
- Preserve the tracked ChromaDB and document artifacts. The working tree currently reports `backend/ChromaDB/chroma.sqlite3` as modified; leave it untouched pending the user's direction.
- Test routes against isolated databases and stub the model/vector-store stack when those routes do not exercise it.
- Do not deploy or claim production readiness from code-level checks alone.

## Phase status

| Phase | Status | Notes |
|---|---|---|
| 0 — Baseline and threat model | Complete | Audit returned and accepted. Frontend production build passed. Full dependency/history scan and a complete backend regression remain outstanding. |
| 1 — Low-risk hardening | In progress | Production JWT and PostgreSQL SSL/CORS validation, production test-route exclusion, bounded PDF/DOCX ingestion, email HTML escaping, sanitized OAuth/email logs, and explicit no-source-map build are implemented. Complete remaining audit and safe regression. |
| 2 — Persistent abuse controls | In progress | Complaint quota and persistent five-failure/24-hour login lockout code are implemented. The local development configuration disables lockout, and its configured PostgreSQL database has no `login_throttles` table; enablement and schema setup remain pending. PostgreSQL concurrency verification remains. |
| 3 — Authentication and browser security | In progress | JWT issuer/expiry enforcement and targeted XSS fixes are in place. Browser token transport remains localStorage; do not switch to cookies without an explicit migration and end-to-end coverage. |
| 4 — Database-specific and conditional controls | Not started | Evaluate database-specific access policies after the database target is selected, complete webhook/SSRF review, and establish reproducible dependency inputs before upgrades. |
| 5 — Final regression and Docker readiness | Not started | No Docker configuration is present. Perform the final permitted checks and provide a readiness report; do not deploy. |

## Control checklist

| # | Security control | Status | Evidence / remaining work |
|---:|---|---|---|
| 2 | SQL injection | Partially reviewed | Inspected backend access uses SQLAlchemy ORM; no `text()` or interpolated SQL found in the application routes. Complete the full-repository and injection test review. |
| 3 | XSS | Partially implemented | Removed product-card `dangerouslySetInnerHTML` and escaped complaint, department, customer name, and email in notification HTML. Audit remaining rich-text/chat rendering. |
| 4 | CSRF | Partially reviewed | API uses explicit Bearer authorization from localStorage; preserve OAuth state/PKCE and document browser threat model. |
| 5 | Document uploads | Partially implemented | Extension/MIME/signature checks, 25 MB and batch limits, DOCX archive bounds, Drive download limit, and PDF page cap added; deployment request-body limits and full regression remain. |
| 6 | BOLA / IDOR | Partially reviewed | Existing customer ownership and handler-department checks found; cover all routes with authorization tests. |
| 7 | Five complaints per user per day | Partially implemented | Added a PostgreSQL row lock and UTC-day count; isolated SQLite tests cover day boundaries. Route threshold behavior and real PostgreSQL concurrency still need isolated integration tests. |
| 8 | JWT secrets and validation | Partially implemented | Production startup rejects weak/missing signing keys and non-SSL database URLs. Tokens now require issuer, issued-at, and 12-hour expiry claims; document the legacy-session cutover and rotate the exposed old signing key. |
| 9 | Server-side secrets | Partially reviewed | `.env.example` now lists variable names/placeholders. Git recovery objects contain credential material; rotate the affected SMTP/JWT credentials and review history cleanup before deployment. |
| 10 | Password storage | Partially reviewed | `pwdlib` recommended hashing and shared account hashing found; audit length limits and every password-change path. |
| 11 | CORS | Partially implemented | Exact configurable origins, production HTTPS requirement, restricted methods/headers; preflight unit check passes. Actual deployment origins remain unset. |
| 12 | Frontend token exposure | Pending | `flatkart_token` remains in localStorage; preserve current contract and define a staged migration. The current 12-hour token expiry limits exposure duration but does not protect against XSS. |
| 13 | Server-side permissions | Partially implemented | Existing role checks remain; `/api/v1/test/*` router is now excluded when `APP_ENV=production`. Audit all route dependencies and public legacy routes. |
| 14 | Database row-level security | Deferred | Database target is undecided; design policies only after its role and connection model are known. |
| 15 | Webhook signatures | Likely not applicable | No webhook route found in inspected route set; complete repository-wide search before final classification. |
| 16 | SSRF | Partially reviewed | Drive uses fixed Google API destinations and validated IDs; no arbitrary URL fetch found. Complete repository-wide search. |
| 17 | Production source maps | Implemented and build-verified | Vite explicitly sets `build.sourcemap=false`; production build output contained JS/CSS and no source-map files. |
| 18 | Default credentials and insecure defaults | Partially implemented | Removed the hardcoded bootstrap password; provisioning now requires protected environment variables and refuses to elevate an existing non-super-admin account. Credential material remains in Git recovery objects and needs rotation/history review. |
| 19 | Sensitive data in logs | Partially implemented | OAuth callbacks, saved OAuth state and complaint email failures now log sanitized failure categories; broader exception and access-log review remains. |
| 20 | Dependency vulnerabilities | Pending | Backend requirements and environment template were empty; package lock is ignored. Establish reproducible dependencies before scanning/upgrading. |
| 21 | Failed-login lockout | Partially implemented | Code has HMAC-digested normalized email/IP counters, five failures then 24-hour lockout, same generic response, dummy password verification, success reset, expiry reset, and 30-failure IP backstop. Six isolated SQLite API tests pass. Local `.env` does not enable lockout and the configured PostgreSQL database lacks `login_throttles`; schema setup and enablement remain pending. Concurrent PostgreSQL integration remains. |
| 22 | Regression/release protection | Partially complete | 36 focused isolated tests, Python compilation, protected route tests, frontend production build, and `git diff --check` passed. Full API/model/database regression remains unsafe until data paths are isolated. |
| 23 | Mandatory phases | In progress | Continue in order with a reviewable checkpoint and rollback note for each phase. |
| 24 | Rollback and compatibility | In progress | Preserve current role, complaint, document and OAuth contracts; document forward recovery for any non-reversible migration. |
| 25 | Final report | Pending | Provide the requested full control table, exact diff, test results, environment names, migration/session impacts, and remaining risks. |

## Checkpoints and rollback

- Phase 1 checkpoint: focused tests, Python compilation, production frontend build, and `git diff --check` passed. Revert the related source changes as a unit if a verified regression appears; restore deployment environment settings from the prior approved configuration. No schema migration was applied.
- Complaint quota checkpoint: UTC boundary tests pass against an isolated in-memory database. Roll back by reverting the route check and helper module; this adds no schema and does not alter existing complaint rows.
- Login lockout schema is not applied. Once the database target is selected, prepare and review the appropriate migration, backup/restore plan, and isolated integration suite.
- Login counter policy: successful login resets that email's consecutive-failure count; a locked email is reset after the 24-hour lock expires; otherwise an unlocked counter expires after 24 hours without another failed attempt. IP failures use a 24-hour window and block at 30 failures.
- Authentication release step: tokens created before the JWT claim enforcement have no required expiration and will be rejected after deployment. Coordinate reauthentication, deploy the new `JWT_SECRET_KEY`, and provide a user login window before the cutover; do not release without that notice.

## Required credential response

- Treat the SMTP credential and JWT signing key found in Git recovery objects as exposed. Rotate the SMTP app credential with the mail provider and update `SMTP_PASSWORD` in the protected runtime environment.
- Generate a new high-entropy JWT signing key and update `JWT_SECRET_KEY` through the deployment secret manager. This invalidates sessions signed by the previous key; schedule user reauthentication and remove/expire old keys from deployment configuration.
- Review repository history and Git recovery objects with an approved repository maintenance process. Do not rewrite shared history or delete recovery data as part of this code change.
- No credential rotation, account write, bootstrap execution, database write, or history rewrite was performed here.

