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

**Modern Practice (researched)**
- `.praxis/stack-profile.md` (2026-06): middleware-based auth with the verifier injected behind a small interface remains current Express practice; inline `jsonwebtoken` calls in route handlers are the anti-pattern. Direction agrees — no divergence.

**Approach**
Create an auth middleware that extracts the Bearer token from the `Authorization` header and verifies it using a `TokenVerifier` interface (a single `verify(token: string)` method). Mount it in `app.ts` after the health-check route but before protected routes, so health-check stays exempt without conditional logic. Inject the verifier as a dependency so tests can provide a stub — no real token infrastructure needed for this slice.

**Data & Contract Shape**
- `TokenVerifier`: one method, `verify(token: string) -> Claims`. Throws on an invalid token rather than returning `Claims | null` — a nullable return puts the same "did this work?" branch in every caller.
- `Claims`: `sub: string` (required) · `exp: number` (required). No optional fields: a token that omits either is invalid, not partially valid.
- Makes impossible: a request reaching a handler with unverified or half-parsed claims.

**Reversal Cost**
- Most expensive decision to undo once tests exist: throwing from `verify` rather than returning a nullable. Every test and every caller encodes the choice.
- The alternative wins if: a caller legitimately needs to continue on a bad token (optional auth on a mixed public/private route). No such route exists in this slice's scope.

**First Test**
- File: `tests/middleware/auth.test.ts`
- Layer: unit — the middleware in isolation, with a stubbed `TokenVerifier`
- Test: "returns 401 with `{ error: 'authentication_required' }` when no Authorization header is present" (from spec's error/edge case AC).

**Risks / Spikes**
- Token format: the spec defers the signature algorithm decision (HS256 vs RS256). This slice doesn't need to decide — the `TokenVerifier` interface abstracts it. No spike needed.

**What NOT to Change**
- Health-check endpoint (`GET /health`) must remain publicly accessible.
- Existing integration tests must not break — they will need valid test tokens added (noted in spec's "what must not break").

**Handoff to implementation**
- Implementation starts from the First Test above (unit layer); the remaining acceptance criteria become the other test cases. Test ordering and refactoring belong to the TDD loop — the sketch does not prescribe them.
- Feedback loop: if mounting order in `app.ts` is more complex than expected (e.g., route grouping), update the change map.

---

## Minimal Sketch Example

> Input: Story-Level Behavioral Spec for "Add created_at timestamp to user records."
> Triage: Small (1–2 days). Research (cache-first) + locate + pattern match.

### Design Sketch: Add created_at timestamp to user records

**Change Map**
- `src/models/user.ts` — add `createdAt: Date` field to the `User` type
- `src/repositories/user-repository.ts` — set `createdAt` to `new Date()` in the `create()` method
- `src/migrations/` — new migration to add `created_at` column
- `tests/repositories/user-repository.test.ts` — add assertion for `createdAt` on user creation

**Existing Patterns**
- The `Order` model already has `createdAt` (see `src/models/order.ts`). Follow the same pattern: `Date` type, set in repository, exposed in API response.
- Migrations follow the `NNNN-description.sql` naming convention in `src/migrations/`.

**Data & Contract Shape**
- `User.createdAt: Date` — **required, not `Date | undefined`**. Every user has a creation time; the only reason to make it optional would be that the migration backfill is awkward, which is a loading concern, not a domain one. Backfill existing rows in the migration instead.
- Makes impossible: a `User` in memory whose age cannot be computed — which is what would push a null check into every consumer.

**Reversal Cost**
- Most expensive decision to undo once tests exist: the required-vs-optional call above. Widening `Date` to `Date | undefined` later is easy; narrowing it back is not, because by then callers handle the undefined case.
- The alternative wins if: the backfill cannot produce a real timestamp for existing rows and a wrong one is worse than none. Check the table before writing the migration.

**Modern Practice (researched)**
- `.praxis/stack-profile.md` (2026-06): current SQL practice defaults creation timestamps at the database (`DEFAULT now()`), keeping them consistent under concurrent writers.

**Divergence & Recommendation**
- Researched practice: DB-side `DEFAULT now()` for `created_at`.
- Current codebase: `Order` sets `createdAt` in the repository (`src/models/order.ts` pattern).
- Chosen direction & why: project consistency wins — follow the repository-set pattern so `User` and `Order` share one convention; a mixed convention would cost more than the researched benefit here. Conform; revisit if timestamp skew across writers ever matters.

**First Test**
- File: `tests/repositories/user-repository.test.ts`
- Layer: integration — the repository against a test database
- Test: "sets createdAt to current time when creating a user" (from spec's happy-path AC).

**What NOT to Change**
- Existing user creation API response shape — `createdAt` is additive, not a breaking change.

---

## Skip Example

> Input: "Rename the `getUser` function to `findUserById` in `src/services/user-service.ts`."
> Triage: Trivial. No sketch needed.

**Decision**: Skip design sketch. The change is a single rename with no architectural decisions. Proceed directly to TDD: update tests to use the new name (Red), rename the function (Green), verify no other call sites break (Refactor).
