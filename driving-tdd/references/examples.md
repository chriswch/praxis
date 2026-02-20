# TDD Loop — Worked Examples

Use these as style references, not rigid formats.

## Table of Contents
- Full Example: Auth Middleware (medium, 4 ACs, with session summary)
- Feedback Loop Example (spec ambiguity discovered during TDD)
- Minimal Example (trivial triage, one AC)

---

## Full Example: Auth Middleware

**Input**: Story-Level Behavioral Spec — "Auth middleware rejects unauthenticated requests" (from `clarifying-intent`). Design sketch identified `src/middleware/auth.ts` as the target file, `src/middleware/request-logger.ts` as the existing pattern, and `tests/middleware/auth.test.ts` as the test file.

### AC Checklist (after step 1)

| # | Acceptance Criterion | Test Name | Status |
|---|---|---|---|
| 1 | Given no Authorization header, when request hits a protected endpoint, then respond 401 `{ "error": "missing_token" }` | rejects requests without auth header | Pending |
| 2 | Given an expired token, when request hits a protected endpoint, then respond 401 `{ "error": "token_expired" }` | rejects requests with expired token | Pending |
| 3 | Given a valid token, when request hits a protected endpoint, then call next handler with `req.userId` set | passes authenticated requests through with userId | Pending |
| 4 | Given no token on a health-check endpoint, then respond 200 (bypass auth) | allows health-check without auth | Pending |

**Order rationale**: AC 1 is the simplest — proves the middleware intercepts at all. AC 3 is the happy-path walking skeleton. AC 2 and 4 are edge cases. Reordered: 1 → 3 → 2 → 4.

### Cycle 1 — AC 1: rejects requests without auth header

**Red**

```typescript
// tests/middleware/auth.test.ts
describe("auth middleware", () => {
  it("rejects requests without auth header", async () => {
    const res = await request(app).get("/api/users");
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "missing_token" });
  });
});
```

Run: `npm test -- auth.test.ts` → **FAIL** (no auth middleware wired in, route responds normally). Fails for the right reason.

**Green**

```typescript
// src/middleware/auth.ts
export function authMiddleware(req, res, next) {
  if (!req.headers.authorization) {
    return res.status(401).json({ error: "missing_token" });
  }
  next();
}
```

Register in `src/app.ts` following the same pattern as `request-logger.ts`. Run: `npm test` → **ALL GREEN**.

**Refactor**: Nothing — one function, four lines. Move on.

### Cycle 2 — AC 3: passes authenticated requests through

**Red**

```typescript
it("passes authenticated requests through with userId", async () => {
  const token = createTestToken({ userId: "user-123" });
  const res = await request(app)
    .get("/api/users")
    .set("Authorization", `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(res.body.userId).toBe("user-123");
});
```

Run → **FAIL** (middleware rejects everything — token verification not implemented). Correct failure.

**Green**

```typescript
export function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header) {
    return res.status(401).json({ error: "missing_token" });
  }
  const token = header.replace("Bearer ", "");
  const payload = verifyToken(token);
  req.userId = payload.userId;
  next();
}
```

Run: `npm test` → **ALL GREEN**.

**Refactor**: Extract `Bearer ` parsing into a helper? Only one call site — skip. Rule of three not met.

### Cycles 3–4

Same pattern. AC 2 adds expiry check in a catch block. AC 4 adds a path check that bypasses auth for `/health`.

### Session Summary

```markdown
### TDD Summary: Auth middleware rejects unauthenticated requests

**ACs Completed**: 4 / 4

**Tests Added**
- tests/middleware/auth.test.ts: rejects requests without auth header — AC 1
- tests/middleware/auth.test.ts: passes authenticated requests through with userId — AC 3
- tests/middleware/auth.test.ts: rejects requests with expired token — AC 2
- tests/middleware/auth.test.ts: allows health-check without auth — AC 4

**Design Decisions (emerged during refactor)**
- Followed request-logger.ts pattern: export a single function, register in app.ts middleware chain
- Kept token verification inline — only one consumer, no need for a class

**Spec Feedback**
- None — spec was accurate

**Suite Status**: All green
```

---

## Feedback Loop Example

During Cycle 3 (AC 2: expired tokens), the test revealed a problem. The spec says respond with `token_expired`, but `verifyToken` throws a generic `InvalidTokenError` for both expired and malformed tokens. The middleware can't distinguish the two cases.

**Discovery logged:**

| # | Discovery | Type | Action |
|---|---|---|---|
| 1 | `verifyToken` throws the same error for expired and malformed tokens — can't produce separate error codes | Ambiguous AC | Return to `clarifying-intent`: should expired and malformed tokens return the same error, or switch to a library that distinguishes them? |

**What happened**: Paused TDD. Returned to `clarifying-intent`. Decision: use a single `invalid_token` error for both cases (simpler, no library change). Updated the spec's AC 2. Resumed TDD with the revised AC.

This is the feedback loop working as designed — not a failure of planning.

---

## Minimal Example (Trivial Triage)

**Input**: Story-Level Behavioral Spec — "Add `created_at` timestamp to user records." One AC. Design sketch skipped (trivial change).

**Triage**: Trivial — one AC, one file, obvious implementation. Skip the AC checklist and session summary.

**One cycle**: Red (assert `user.createdAt` is within 1 second of `Date.now()`). Green (add `createdAt: new Date()` to the create function). Refactor (nothing — one line). Run full suite. Done.
