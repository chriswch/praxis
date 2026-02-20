# Slice Map Spec (v1)

Use this spec for the default output of the `slicing-stories` skill. The goal is an ordered list of thin story outlines — just enough for `clarifying-intent` to pick up each slice and produce a full Story-Level Behavioral Spec without re-asking "what are we building?"

## Table of Contents
- Conventions (IDs, uniqueness, ordering)
- Top-Level Shape (`meta` + `slices`)
- `meta` fields and `OpenQuestion` schema
- `Slice` fields
- Example (API Authentication slice map)

## Conventions

- **Canonical JSON**: The Slice Map is a JSON object and must be valid JSON (no comments, trailing commas). When presenting results in chat, you may also include a human-readable Markdown rendering, but the JSON must conform to this spec.
- **IDs**:
  - Slices: `S-001`, `S-002`, ...
  - Questions: `Q-001`, `Q-002`, ...
- **Uniqueness**: Every `id` must be unique across all slices and questions.
- **Ordering**: The `slices` array is ordered — position in the array IS the build sequence. Slice 0 is built first.

## Top-Level Shape

```json
{
  "meta": { },
  "slices": [ ]
}
```

### `meta` (required)

- `project` (string, required): Product/project name.
- `source` (string, required): Where the input came from (the Feature Brief).
- `generated_at` (string, required): ISO-8601 UTC timestamp (use `Z`).
- `feature_summary` (string, required): 1-2 sentence summary of the feature being sliced.
- `assumptions` (string[], required): Assumptions made to proceed without blockers.
- `open_questions` (OpenQuestion[], required): Unresolved questions that impact scope/behavior.

#### `OpenQuestion`

- `id` (string, required): `Q-###`.
- `question` (string, required)
- `blocking` (boolean, required): Whether this question blocks slicing or downstream spec work.
- `owner` (string, required): `product` | `engineering` | `design` | `tbd`.

### `slices` (Slice[], required; must not be empty)

Ordered list of story outlines. Position in the array determines build sequence.

#### `Slice`

- `id` (string, required): `S-###`. Sequential: `S-001`, `S-002`, etc.
- `title` (string, required): Short, outcome-focused title.
- `story` (string, required): "As a X, I want Y, so that Z."
- `scope_in` (string[], required): What this slice covers.
- `scope_out` (string[], required): What is explicitly deferred to other slices.
- `sequence_rationale` (string, required): Why this slice is in this position in the build order.
- `open_unknowns` (string[], optional): Deferrable unknowns specific to this slice.

## Example

```json
{
  "meta": {
    "project": "Acme API",
    "source": "Feature Brief: API Authentication",
    "generated_at": "2026-02-01T12:00:00Z",
    "feature_summary": "Add token-based authentication to the API so that only authenticated clients can access endpoints.",
    "assumptions": [
      "JWT is acceptable (team has prior experience)",
      "Manual key issuance is acceptable for v1"
    ],
    "open_questions": [
      {
        "id": "Q-001",
        "question": "Should we support OAuth2 client credentials flow, or is a simpler signed-JWT scheme enough?",
        "blocking": false,
        "owner": "engineering"
      }
    ]
  },
  "slices": [
    {
      "id": "S-001",
      "title": "Auth middleware rejects unauthenticated requests",
      "story": "As an API consumer, I want unauthenticated requests to be rejected with 401, so that the API is protected from unauthorized access.",
      "scope_in": [
        "Middleware checks for a valid Bearer token in the Authorization header",
        "Returns 401 with JSON error body if missing or invalid",
        "Passes through to handler if valid",
        "Health-check endpoint is exempt"
      ],
      "scope_out": [
        "Token issuance and storage (S-002)",
        "Token expiry and refresh (S-003)",
        "Client migration (S-004)"
      ],
      "sequence_rationale": "Walking skeleton — proves the auth integration works end-to-end. All subsequent slices build on this middleware.",
      "open_unknowns": [
        "Token signature algorithm (HS256 vs RS256) — does not block; middleware can accept either"
      ]
    },
    {
      "id": "S-002",
      "title": "Client credential issuance and storage",
      "story": "As a platform admin, I want to issue API credentials to clients, so that they can authenticate against the middleware.",
      "scope_in": [
        "Admin endpoint to create client credentials",
        "Credentials stored securely",
        "Admin endpoint to revoke credentials"
      ],
      "scope_out": [
        "Self-service key rotation (deferred post-v1)",
        "Token expiry and refresh (S-003)"
      ],
      "sequence_rationale": "Without credentials, the middleware from S-001 has no tokens to validate. This slice makes auth usable."
    },
    {
      "id": "S-003",
      "title": "Token expiry and refresh",
      "story": "As an API consumer, I want tokens to expire and be refreshable, so that compromised tokens have limited impact.",
      "scope_in": [
        "Tokens include an expiry claim",
        "Middleware rejects expired tokens",
        "Refresh endpoint issues new tokens"
      ],
      "scope_out": [
        "Client migration (S-004)",
        "Self-service key rotation (deferred post-v1)"
      ],
      "sequence_rationale": "Builds on S-001 (middleware) and S-002 (credentials). Expiry is required before exposing auth to existing clients."
    },
    {
      "id": "S-004",
      "title": "Existing clients migrated to use tokens",
      "story": "As an existing API consumer, I want to be migrated to token-based auth, so that the API can enforce authentication without breaking my integration.",
      "scope_in": [
        "Migration guide for existing clients",
        "Dual-mode period: accept both unauthenticated and authenticated requests",
        "Sunset deadline for unauthenticated access"
      ],
      "scope_out": [
        "External partner onboarding (S-005)"
      ],
      "sequence_rationale": "Requires all auth infrastructure (S-001 through S-003) to be in place. Migration is higher priority than new partner onboarding."
    },
    {
      "id": "S-005",
      "title": "External partner onboarding flow",
      "story": "As an external partner, I want a clear onboarding process to get API credentials, so that I can integrate with the API.",
      "scope_in": [
        "Partner onboarding documentation",
        "Credential issuance workflow for partners",
        "Partner-specific rate limits or scoping (if needed)"
      ],
      "scope_out": [
        "Fine-grained authorization (deferred to follow-up feature)"
      ],
      "sequence_rationale": "Final slice — builds on the complete auth stack. Lower urgency than migrating existing clients."
    }
  ]
}
```
