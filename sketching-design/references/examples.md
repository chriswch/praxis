# Examples

Filled-in examples showing what good design sketch output looks like. Use these as a style reference, not as rigid formats.

## Table of Contents
- Full sketch example (medium story)
- Minimal sketch example (small story)
- Skip example (trivial change)

---

## Full Sketch Example

> Input: Story-Level Behavioral Spec for "Auth middleware rejects unauthenticated requests" (from `clarifying-intent` examples).

### Design Sketch: Auth middleware rejects unauthenticated requests

**Change Map**
- `src/middleware/` — new file `auth.ts` for the auth middleware
- `src/app.ts` — register the middleware on the Express app (before route handlers)
- `src/routes/health.ts` — no change needed (health route is mounted before auth middleware, so it stays exempt without special-case logic)
- `tests/middleware/` — new file `auth.test.ts` for middleware tests

**Existing Patterns**
- Follows the pattern in `src/middleware/request-logger.ts`: export a factory function that returns an Express middleware, registered in `app.ts` via `app.use()`.
- Error responses follow the existing `{ error: string }` JSON shape used by `src/middleware/error-handler.ts`.
- Tests follow the pattern in `tests/middleware/request-logger.test.ts`: use `supertest` against a minimal Express app with the middleware mounted.

**Approach**
Create an auth middleware that extracts the Bearer token from the `Authorization` header and verifies it using a `TokenVerifier` interface (a single `verify(token: string)` method). Mount it in `app.ts` after the health-check route but before protected routes, so health-check stays exempt without conditional logic. Inject the verifier as a dependency so tests can provide a stub — no real token infrastructure needed for this slice.

**First Test**
- File: `tests/middleware/auth.test.ts`
- Test: "returns 401 with `{ error: 'authentication_required' }` when no Authorization header is present" (from spec's error/edge case AC).

**Risks / Spikes**
- Token format: the spec defers the signature algorithm decision (HS256 vs RS256). This slice doesn't need to decide — the `TokenVerifier` interface abstracts it. No spike needed.

**What NOT to Change**
- Health-check endpoint (`GET /health`) must remain publicly accessible.
- Existing integration tests must not break — they will need valid test tokens added (noted in spec's "what must not break").

**Downstream Handoff**
- TDD: write the 401-no-header test first, then 401-invalid-token, then 200-valid-token passthrough. Refactor to extract shared test setup.
- Feedback loop: if mounting order in `app.ts` is more complex than expected (e.g., route grouping), update the change map.

---

## Minimal Sketch Example

> Input: Story-Level Behavioral Spec for "Add created_at timestamp to user records."
> Triage: Small (1–2 days). Locate + pattern match only.

### Design Sketch: Add created_at timestamp to user records

**Change Map**
- `src/models/user.ts` — add `createdAt: Date` field to the `User` type
- `src/repositories/user-repository.ts` — set `createdAt` to `new Date()` in the `create()` method
- `src/migrations/` — new migration to add `created_at` column
- `tests/repositories/user-repository.test.ts` — add assertion for `createdAt` on user creation

**Existing Patterns**
- The `Order` model already has `createdAt` (see `src/models/order.ts`). Follow the same pattern: `Date` type, set in repository, exposed in API response.
- Migrations follow the `NNNN-description.sql` naming convention in `src/migrations/`.

**First Test**
- File: `tests/repositories/user-repository.test.ts`
- Test: "sets createdAt to current time when creating a user" (from spec's happy-path AC).

**What NOT to Change**
- Existing user creation API response shape — `createdAt` is additive, not a breaking change.

---

## Skip Example

> Input: "Rename the `getUser` function to `findUserById` in `src/services/user-service.ts`."
> Triage: Trivial. No sketch needed.

**Decision**: Skip design sketch. The change is a single rename with no architectural decisions. Proceed directly to TDD: update tests to use the new name (Red), rename the function (Green), verify no other call sites break (Refactor).
