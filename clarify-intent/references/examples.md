# Examples

Filled-in examples showing what good output looks like for each template. Use these as a style reference, not as rigid formats.

## Table of Contents
- Feature Brief example
- Story-Level Behavioral Spec example

---

## Feature Brief Example

> Input: "We need to add authentication to our API."

**Problem / Opportunity**
- The API is currently open — any client with the URL can read and write data. This blocks onboarding external partners who require access control.

**Goal**
- Protect API endpoints so that only authenticated clients can access them, with permissions scoped per client.

**Success Criteria**
- All existing endpoints reject unauthenticated requests with 401.
- At least one external partner can onboard using the new auth flow.

**Audience / Stakeholders**
- API consumers (internal frontend, mobile app, external partners).
- Platform team (owns the API gateway and infrastructure).

**In Scope**
- Authentication (verifying identity) for all API endpoints.
- Client credential issuance and revocation.

**Out of Scope**
- Fine-grained authorization (per-resource permissions) — deferred to a follow-up.
- User-facing login UI (this is API-to-API auth only).
- Rate limiting (handled separately).

**Constraints**
- Must not break the existing frontend and mobile app (backwards compatible rollout).
- Must support token-based auth (team convention; no session cookies for API).
- Target: production-ready within 3 sprints.

**Assumptions (if unanswered)**
- JWT is acceptable (team has prior experience; no objection raised).
- A shared secret or public/private key pair per client is sufficient for v1.

**Open Questions**
- (Blocker) Do external partners need self-service key rotation, or is manual issuance acceptable for v1?
- (Nice-to-have) Should we support OAuth2 client credentials flow, or is a simpler signed-JWT scheme enough?

**Risks**
- Retrofitting auth onto an existing API may surface endpoints with implicit assumptions about open access.
- Rolling out auth without a migration period could break existing clients.

**Downstream Handoff**
- Split into vertical slices via `agile-issue-splitter`. Candidate slices:
  1. Auth middleware rejects unauthenticated requests (smallest, highest-risk — proves the approach).
  2. Client credential issuance and storage.
  3. Token validation and expiry.
  4. Existing clients migrated to use tokens.
  5. External partner onboarding flow.
- Pick slice 1 first. Produce a Story-Level Behavioral Spec for it.

---

## Story-Level Behavioral Spec Example

> Input: Slice 1 from the Feature Brief above — "Auth middleware rejects unauthenticated requests."

**Problem**
The API currently accepts all requests regardless of authentication. We need middleware that rejects unauthenticated requests with 401 so that subsequent auth slices have a foundation to build on.

**Scope**
- In: A middleware that checks for a valid Bearer token in the Authorization header; returns 401 with a JSON error body if missing or invalid; passes through to the handler if valid.
- Out: Token issuance, key rotation, user-facing errors, authorization (permission checks).

**Acceptance Criteria** (Given / When / Then)
- Happy path: Given a request with a valid Bearer token, when it hits any protected endpoint, then pass the request through to the route handler with the client identity attached to the request context.
- Error / edge case: Given a request with no Authorization header, when it hits any protected endpoint, then return 401 with `{"error": "authentication_required"}`.
- Error / edge case: Given a request with an invalid or expired Bearer token, when it hits any protected endpoint, then return 401 with `{"error": "invalid_token"}`.
- Boundary: Given a health-check endpoint (`GET /health`), when it receives a request with no token, then return 200 (health-check is exempt).

**Constraints**
- Performance: Middleware must add < 5ms latency per request (token validation should not require a network call on every request).

**What Must Not Break**
- The health-check endpoint must remain publicly accessible (monitoring depends on it).
- Existing integration tests that call API endpoints must be updated to include a valid test token, not deleted.

**Open Unknowns**
- Token signature algorithm (HS256 vs RS256) — does not block this slice; middleware can accept either and we decide when building the issuance slice.

**Downstream Handoff**
- Lightweight design sketch: identify where middleware is registered, which router/framework hook to use, how to inject a token-verifier dependency. This is a direction, not a blueprint — TDD's refactor step is where the real design emerges.
- Then TDD: acceptance criteria above become test cases. Red → Green → Refactor.
- **Feedback loop**: If implementation reveals the spec was wrong or incomplete, return here and update this spec before continuing. The spec is a living artifact, not a contract.
