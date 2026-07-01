# Examples

Filled-in examples showing the two-phase flow. Use as style reference, not rigid format.

## Table of Contents

- Cross-phase example: API authentication (Feature Brief → slice → Story Spec)
- Story-only example: Add pagination to /orders (brief Phase A, substantive Phase B)
- Greenfield example: New MVP first slice (substantive Phase A, minimal Phase B)

---

## Cross-Phase Example: API Authentication

> Input: "We need to add authentication to our API."

This is feature-sized in an existing system. Phase A runs fully and produces a Feature Brief; Phase B runs per-slice on later invocations.

### Phase A — Product Space (this invocation)

After Background distillation and two rounds of questions:

**Feature Brief**

**Problem / Why Now**
- The API is currently open — any client with the URL can read and write data. This blocks onboarding external partners who require access control, and exposes us to incidents if internal endpoints leak.

**Background**
- Current state: API is open; clients send requests with no credentials.
- Pain: legal flagged this 3 weeks ago; one prospective partner walked because of it.
- Considered: API gateway with key auth (rejected as overkill for our size); shared secret in headers (rejected for poor revocation story); per-client JWT.
- Stakeholders: platform team (owns the API), prospective partners (need auth to onboard), legal (flagged the gap).

**User Context**
- Persona: integrating engineer at a partner company.
- Trigger: onboarding a new partner that needs read access to specific resources.
- Current workaround: we don't onboard external partners.

**Goal & Success Criteria**
- All existing endpoints reject unauthenticated requests with 401.
- At least one external partner onboarded using the new auth flow within 6 weeks.

**Hypothesis & Validation Plan**
- Hypothesis: partner-grade auth will unblock at least 2 stalled partner deals because credential management is the stated blocker in both.
- Validation: confirm with 2 prospective partners that the proposed auth flow meets their requirements before building (interview); after launch, track onboarding completion rate.
- Kill criterion: if partner interviews reveal they require OAuth2/SAML (not just JWT), revisit before building.

**Scope**
- In: authentication for all API endpoints; client credential issuance and revocation.
- Out: fine-grained per-resource authorization (deferred to follow-up); user-facing login UI (this is API-to-API only); rate limiting (handled separately).

**Constraints & Risks**
- Must not break the existing frontend and mobile app — backwards-compatible rollout required.
- Target: production within 3 sprints.

**What Must Not Break** (high-level)
- Frontend and mobile app keep working through the migration.
- Health-check endpoint remains publicly accessible (monitoring depends on it).

**Decisions & Rationale**
- Decision: JWT with shared secret (HS256) for v1.
- Options considered: API key with HMAC, OAuth2 client credentials, mTLS.
- Why JWT: team has prior experience; covers v1 needs; leaves room to upgrade to OAuth2 if partner interviews surface that requirement.

**Open Questions**
- (Deferrable) HS256 vs RS256 — decide when building the token-issuance slice.

**Downstream Handoff**
- Split via `slicing-stories`, which owns the slice map and ordering. (It reads as roughly four behaviors — auth middleware, token issuance, client migration, partner onboarding — but the actual map and first-slice pick are `slicing-stories`' call.)

### Phase A checkpoint (manual mode)

User confirms the Feature Brief. The skill recommends `slicing-stories` and stops. Phase B runs on each slice when this skill is re-invoked.

---

### Phase B (per-slice) — Slice 1: "Auth middleware rejects unauthenticated requests"

On this invocation, Phase A is brief (the Feature Brief carries the product-space context). Phase B does the bulk.

**Story-Level Behavioral Spec**

**Problem**
The API currently accepts all requests regardless of authentication. We need middleware that rejects unauthenticated requests with 401 so subsequent auth slices have a foundation.

**User Context**
Internal frontend and mobile app continue working through a transitional shim; new auth flow is used by future external partners.

**Scope**
- In: middleware checks for a valid Bearer token in the Authorization header; returns 401 with a JSON error body if missing or invalid; passes through to the handler if valid.
- Out: token issuance, key rotation, user-facing errors, authorization (permission checks).

**Acceptance Criteria**
- Happy path: Given a request with a valid Bearer token, when it hits any protected endpoint, then pass through to the route handler with client identity attached to the request context.
- Error: Given a request with no Authorization header, when it hits any protected endpoint, then return 401 with `{"error": "authentication_required"}`.
- Error: Given a request with an invalid or expired Bearer token, when it hits any protected endpoint, then return 401 with `{"error": "invalid_token"}`.
- Boundary: Given a health-check endpoint (`GET /health`), when it receives a request with no token, then return 200 (health-check is exempt).

_System Space (engineering) — appended below the product-readable tier above; never interleaved with it._

**Observable Signals**
- Curl any non-health endpoint without an Authorization header → 401 response with `authentication_required` body.
- Curl `/health` without a token → 200.
- Log line per rejection: structured log with the rejected endpoint and reason (`missing_header` / `invalid_token`).
- Metric `auth.rejections.total` increments per rejected request, tagged by reason.

**What Must Not Break**
- `GET /health` remains publicly accessible.
- Existing integration tests that call API endpoints get updated to include a valid test token, not deleted.
- Frontend and mobile app continue working — they pass through a backwards-compatible auth shim during migration.

**Constraints**
- Performance: middleware adds < 5ms latency per request — token validation should not require a network call per request.

**Decisions & Rationale** (Phase B)
- Decision: rejection responses use a JSON body, not plain text or HTML.
- Options considered: plain-text error, no body.
- Why: API consumers are programmatic; a JSON body lets clients parse the error reason without string-matching.

**Open Unknowns**
- Token signature algorithm (HS256 vs RS256) — does not block this slice; middleware can accept either; decide when building the issuance slice.

**Downstream Handoff**
- Design sketch optional: middleware registration is well-known in this framework.
- TDD: ACs above become the test cases.
- Feedback loop: if implementation reveals an endpoint that should be exempt but isn't in the spec, update here.

### Phase B checkpoint (manual mode)

User confirms. Hand off to `sketching-design` or `driving-tdd`.

---

## Story-Only Example: Add Pagination to /orders

> Input: "Add limit/offset pagination to the /orders endpoint."

Story-sized in an existing system. Phase A is brief (the user story is clear); Phase B does the bulk.

### Phase A (brief)

Reflect back: "Add `limit` and `offset` query parameters to `GET /orders` so callers can page through large result sets, instead of loading everything at once."

User confirms — no further Phase A questions needed.

### Phase B

After reading the orders endpoint module:

- Current behavior: `GET /orders` returns the full result set, ordered by creation date descending. No existing pagination. Called by the internal dashboard and two external partner integrations.

**Story-Level Behavioral Spec**

**Problem**
`GET /orders` returns the full result set; callers with many orders see slow responses and high memory use. Pagination lets them request specific pages.

**Scope**
- In: `limit` and `offset` query parameters; response includes total count and current page info.
- Out: cursor-based pagination, sort customization.

**Acceptance Criteria**
- Happy path: Given `?limit=20&offset=40`, when the request is made, then return at most 20 orders starting from the 41st (orders 41–60), plus the total count of matching orders.
- Default: Given no pagination parameters, when the request is made, then return the first 50 orders (default limit) starting from offset 0, plus the total count. No breaking change to existing field shapes.
- Boundary: Given `?limit=0`, when the request is made, then return 400 with `{"error": "invalid_limit"}`.
- Boundary: Given `?limit=1000` (max is 500), then return 400 with `{"error": "limit_too_large", "max": 500}`.
- Error: Given a negative offset, then return 400 with `{"error": "invalid_offset"}`.

_System Space (engineering) — appended below the product-readable tier above; never interleaved with it._

**Observable Signals**
- Response body now includes `total`, `limit`, `offset` fields alongside the existing `orders` array.
- Log line per request includes the limit and offset values used.
- Internal dashboard continues working with default behavior (no caller updates required).

**What Must Not Break**
- Existing callers that don't pass pagination params continue to receive a response with an `orders` array in the same shape.
- The internal dashboard call pattern (no params) returns the first 50 orders — the same start as the previous full list.
- Both external partner integrations continue working unchanged until they opt-in to pagination.

**Constraints**
- Default limit chosen as 50 because existing callers typically work with result counts in this range — switching to required pagination would be a breaking change to phase in.

**Decisions & Rationale**
- Decision: default limit 50, not unlimited.
- Options considered: keep unlimited as default; enforce pagination from day one.
- Why 50: avoids breaking existing callers while still capping worst-case payload.

**Open Unknowns**
- Whether to include the total-count field unconditionally or only when pagination params are passed (defer — easy to change later).

**Downstream Handoff**
- TDD: ACs become test cases. Sketch likely unneeded — the endpoint is small.

---

## Greenfield Example: New MVP First Slice

> Input: "I want to build a recipe sharing app for hobby cooks. Let's start with the first slice."

New project. Phase A runs substantively (the idea is vague); Phase B is minimal (no existing system to read).

### Phase A — Product Space (extended)

After several rounds of questions:

- Persona settled: hobby cook who already takes phone photos of recipe results and wants a tidier place to keep them.
- Walking skeleton agreed: "Logged-in user uploads a photo + title + ingredients; can see their own list of recipes."
- Hypothesis: "Hobby cooks will return weekly to add at least one recipe if the upload flow is under 60 seconds."
- Validation: 5 user interviews after 2 weeks live; track weekly add-rate per user.
- Out of scope: sharing with others, search, comments, follower graph — all deferred.

### Phase B — System Space (minimal)

No existing system to read. Phase B confirms:

- Target runtime: SvelteKit on Vercel; Postgres on Supabase.
- Top-level system flow for the slice: browser → SvelteKit form → Supabase auth → Supabase storage (photo) + Postgres (record).
- Observable signals to define for the first slice (since there's no system yet, these become the build target):
  - User can complete upload and see their recipe in their list within 60 seconds.
  - Photo persists across page reloads.
  - Server log shows one INSERT per submission.

**Story-Level Behavioral Spec**

**Problem**
Hobby cooks have no easy place to keep their own recipes with photos. Need a way to upload a recipe and see their own list.

**Scope**
- In: signed-in user uploads photo + title + ingredients; recipes list shows only this user's recipes.
- Out: sharing, search, comments, edit/delete (deferred to subsequent slices).

**Acceptance Criteria**
- Happy path: Given a signed-in user, when they submit a recipe form with title, ingredients, and photo, then the recipe appears in their list with the photo visible.
- Error: Given a missing title, when they submit, then the form shows an inline error and does not submit.
- Error: Given an oversized photo (> 5 MB), when they submit, then the form shows an inline error.
- Boundary: Given an unsigned-in user, when they visit the upload page, then they are redirected to sign-in.

_System Space (engineering) — appended below the product-readable tier above; never interleaved with it._

**Observable Signals**
- After upload, the recipe is visible in `/recipes` with photo and title.
- Photo persists on page reload.
- One row per submission in the `recipes` table; one object per submission in the storage bucket.

**What Must Not Break**
- (Greenfield — nothing yet.)

**Constraints**
- Time-to-recipe under 60 seconds on a 4G connection — measured end-to-end.

**Decisions & Rationale**
- Decision: signed-in only from the start, no anonymous uploads.
- Options considered: anonymous-first to lower friction, sign-in later.
- Why: per-user recipe lists require identity; adding auth later would require a data migration.

**Downstream Handoff**
- Sketch needed (greenfield — the placement of the form, the storage call, the list query all need a direction).
- TDD: ACs become the test cases.
