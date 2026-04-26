# Verify and Adapt — Worked Examples

Use these as style references, not rigid formats.

## Table of Contents
- Full example: Auth Middleware (medium, multi-slice)
- Minimal example (trivial/small, single-slice)
- Rework example (gap found during verification)
- Escalation example (wrong constraint discovered)

---

## Full Example: Auth Middleware

**Input**: TDD just completed for "Auth middleware rejects unauthenticated requests." 4 ACs, all green. Feedback log has one entry (expired vs. malformed token ambiguity, already resolved via clarifying-intent). This is slice S-001 of a multi-slice auth feature.

### Verification: Auth middleware rejects unauthenticated requests

**Spec**: Story-Level Behavioral Spec from clarifying-intent

**Acceptance Check**

| # | Acceptance Criterion | Test | Verdict | Notes |
|---|---|---|---|---|
| 1 | Given no Authorization header → 401 `missing_token` | rejects requests without auth header | Match | |
| 2 | Given an expired or malformed token → 401 `invalid_token` | rejects requests with expired token | Refined | Originally "expired token → `token_expired`"; updated during TDD feedback loop to use `invalid_token` for both cases |
| 3 | Given a valid token → call next with `req.userId` | passes authenticated requests through with userId | Match | |
| 4 | Given no token on health-check → 200 | allows health-check without auth | Match | |

**"What Must Not Break" Check**
- Health-check endpoint (`GET /health`) remains publicly accessible: Confirmed
- Existing integration tests pass with test tokens added: Confirmed

**Suite Status**: All green (47 tests, 0 failures)

**Spec Updates**
- AC 2: Updated to "Given an expired or malformed token → 401 `invalid_token`" (Refined during implementation: `verifyToken` throws the same error for both cases; single error code is simpler and sufficient)

**Emerged Design Knowledge**
- Auth middleware follows the request-logger.ts pattern: single exported function, registered in app.ts middleware chain. Future middleware slices should follow this same pattern.
- Mounting order in app.ts determines auth exemption — health-check is mounted before auth middleware. No conditional logic needed for public routes.

**Slice Impact**
- S-002 "Role-based access control": No impact — role checking will layer on top of userId, which is now available on `req`.
- S-003 "Token refresh endpoint": Simplified — the `invalid_token` error code decision means refresh logic doesn't need to distinguish expiry from malformation. One fewer branch.
- S-004 "Rate limiting per user": No impact.

**Routing**: Next slice → S-002 "Role-based access control"

---

## Minimal Example

**Input**: TDD completed for "Add `created_at` timestamp to user records." 1 AC, trivial change. Single slice (no slice map).

**Triage**: Small — quick sanity check, no formal artifact.

**Check**: Spec says "Given a new user is created, then `createdAt` is set to the current time." Test asserts `user.createdAt` is within 1 second of `Date.now()`. Match. Suite all green. Spec accurate, no updates needed.

**Routing**: Done.

---

## Rework Example

**Input**: TDD completed for "Search endpoint returns filtered results." 3 ACs, but during verification, AC 3 (pagination) has a test that only checks the first page — it doesn't verify that `nextPage` token actually works when passed back.

**Acceptance Check** (abbreviated):

| # | AC | Test | Verdict | Notes |
|---|---|---|---|---|
| 1 | Search by name returns matching results | filters results by name query | Match | |
| 2 | Empty search returns 400 | rejects empty search query | Match | |
| 3 | Results > 20 are paginated with a `nextPage` token | paginates results over 20 | **Gap** | Test creates 25 records and checks first page has 20, but doesn't verify passing `nextPage` returns remaining 5 |

**Suite Status**: All green (but AC 3 coverage is incomplete)

**Routing**: Rework — return to driving-tdd. Write a failing test that passes the `nextPage` token and asserts the second page contains the remaining records. Then make it green. Return here after.

---

## Escalation Example

**Input**: TDD completed for "Webhook delivery with retry." During implementation, discovered that the message queue (RabbitMQ) the spec assumed doesn't exist in the infrastructure — the team uses Redis Streams. The behavioral ACs (retry on failure, dead-letter after 3 attempts) are still valid, but the constraint and approach are wrong.

**Spec Updates**
- Constraints section assumed RabbitMQ; infrastructure uses Redis Streams.
- ACs are behaviorally correct but untestable against the assumed infrastructure.

**Routing**: Escalate — return to clarifying-intent. Update the spec's constraints to reflect Redis Streams. Then re-run sketching-design (the change map is different). Then resume driving-tdd. The behavioral ACs likely survive unchanged; the implementation path changes.

This is not a planning failure — it's the feedback loop catching an incorrect assumption before it compounds across multiple slices.
