# Templates and Heuristics

Use these templates and heuristics when splitting a Feature Brief into story slices. Match the fields to `references/slice-map.spec.md`.

## Table of Contents
- Story Slicing Heuristics
- Slice Template (JSON and Markdown)
- Worked Example (SSO Feature Brief → Slice Map)

## Story Slicing Heuristics

- Slice **vertically** (end-to-end behavior) instead of by layer (frontend-only/backend-only).
- Start with a **walking skeleton** — the thinnest end-to-end path that delivers value to one real user with one real integration. Use real dependencies (a real IdP, a real database, a real API), not stubs or test doubles. The skeleton proves the architecture BY delivering value, not instead of it.
- Then add slices for:
  - validation / error states
  - edge cases
  - permissions / roles
  - performance / accessibility
  - telemetry / analytics
- If a story is too big: split by persona, workflow step, data subset, or capability tier (read → create → edit → bulk).
- When unknowns are material: note them as `open_unknowns` on the slice and suggest a spike in the sequence rationale.
- **Spikes are not slices.** If you need to validate a technology or integration before committing, that's a spike — a time-boxed throwaway experiment handled by `clarifying-intent`. Don't put spikes in the slice map as user stories.
- **INVEST litmus test** for each slice: "If we shipped this slice and stopped, would at least one real user get value from it?" If the answer is "only if combined with a later slice," merge or restructure.
- Each slice should be independently testable — a developer should be able to write failing tests for this slice without needing later slices.

## Slice Template

### JSON

```json
{
  "id": "S-001",
  "title": "Short, outcome-focused title",
  "story": "As a [persona], I want [capability], so that [value].",
  "scope_in": [
    "Specific behavior this slice covers",
    "Another behavior this slice covers"
  ],
  "scope_out": [
    "Behavior explicitly deferred to S-002",
    "Behavior explicitly deferred to a later slice or follow-up"
  ],
  "sequence_rationale": "Why this slice is in this position in the build order.",
  "open_unknowns": [
    "Optional: deferrable unknowns specific to this slice"
  ]
}
```

### Markdown

```markdown
#### S-001: Short, outcome-focused title

**Story:** As a [persona], I want [capability], so that [value].

**In scope:**
- Specific behavior this slice covers
- Another behavior this slice covers

**Out of scope:**
- Behavior explicitly deferred to S-002
- Behavior explicitly deferred to a later slice or follow-up

**Sequence rationale:** Why this slice is in this position in the build order.

**Open unknowns:**
- Optional: deferrable unknowns specific to this slice
```

## Worked Example

### Input: Feature Brief

> **Problem / Why Now**
> Users can only log in with email/password. Several enterprise prospects require SSO, and we're losing deals over it.
>
> **Goal & Success Criteria**
> Support SAML-based SSO so that enterprise users can authenticate via their identity provider. Success: at least one enterprise customer onboarded with SSO within 6 weeks.
>
> **Scope**
> - In: SAML 2.0 SP-initiated flow, user provisioning on first login, linking SSO identity to existing accounts.
> - Out: SCIM provisioning, IdP-initiated flow (defer to follow-up), MFA changes.
>
> **Constraints & Risks**
> - Must not break existing email/password login.
> - Must support Okta and Azure AD (the two IdPs our prospects use).
>
> **Open Questions**
> - (Blocking) Should SSO users bypass email verification on first login?
> - (Deferrable) Do we need an admin UI for SSO config, or is config-file-based acceptable for v1?

### Output: Slice Map

```json
{
  "meta": {
    "project": "Acme App",
    "source": "Feature Brief: SAML SSO",
    "generated_at": "2026-02-15T10:00:00Z",
    "feature_summary": "Add SAML 2.0 SSO so enterprise users can authenticate via their identity provider (Okta, Azure AD).",
    "assumptions": [
      "Config-file-based SSO setup is acceptable for v1 (admin UI deferred)",
      "SP-initiated flow only; IdP-initiated flow deferred",
      "Okta is the higher-priority IdP (first prospect uses Okta)"
    ],
    "open_questions": [
      {
        "id": "Q-001",
        "question": "Should SSO users bypass email verification on first login?",
        "blocking": true,
        "owner": "product"
      }
    ]
  },
  "slices": [
    {
      "id": "S-001",
      "title": "SSO login with Okta for existing users",
      "story": "As an existing enterprise user, I want to log in via my company's Okta, so that I can authenticate without a local password.",
      "scope_in": [
        "SP-initiated SAML 2.0 redirect to Okta",
        "Consume SAML assertion, match email to existing user, create session",
        "Config-file-based Okta setup",
        "Existing email/password login continues to work"
      ],
      "scope_out": [
        "New user provisioning on first SSO login (S-002)",
        "Account linking for users with mismatched emails (S-003)",
        "Azure AD support (S-004)"
      ],
      "sequence_rationale": "Walking skeleton — thinnest path that delivers real user value. An existing enterprise user can actually log in via Okta. Proves the SAML integration end-to-end with a real IdP, not a stub."
    },
    {
      "id": "S-002",
      "title": "Provision new user on first SSO login",
      "story": "As a new enterprise user logging in via SSO for the first time, I want an account to be created automatically, so that I don't need a separate signup step.",
      "scope_in": [
        "Create user record from SAML assertion attributes (email, name)",
        "Mark user as SSO-provisioned",
        "Handle missing/incomplete SAML attributes gracefully"
      ],
      "scope_out": [
        "Account linking for existing users with different email (S-003)",
        "SCIM provisioning (out of feature scope)"
      ],
      "sequence_rationale": "Builds on S-001. Without provisioning, only pre-existing users can log in via SSO. This slice enables onboarding new enterprise users.",
      "open_unknowns": [
        "Whether SSO users bypass email verification — blocked by Q-001"
      ]
    },
    {
      "id": "S-003",
      "title": "Link SSO identity to existing accounts",
      "story": "As an existing user whose company enables SSO, I want my SSO identity linked to my existing account even if my SSO email differs, so that I keep my data and don't get a duplicate account.",
      "scope_in": [
        "Link SSO identity to existing account on first SSO login when emails differ",
        "User can still log in with email/password after linking (until org enforces SSO-only)"
      ],
      "scope_out": [
        "SSO-only enforcement (defer to follow-up)",
        "Conflict resolution for ambiguous matches"
      ],
      "sequence_rationale": "Builds on S-001 and S-002. Handles the edge case where SSO email doesn't match the existing account email — prevents duplicate accounts during enterprise rollout."
    },
    {
      "id": "S-004",
      "title": "Azure AD support",
      "story": "As an enterprise user whose company uses Azure AD, I want to log in via SSO, so that I can authenticate with my company's identity provider.",
      "scope_in": [
        "Config-file-based Azure AD setup",
        "Azure AD-specific SAML attribute mapping",
        "Documentation for Azure AD admin setup"
      ],
      "scope_out": [
        "Admin UI for SSO config (deferred post-v1)",
        "IdP-initiated flow (out of feature scope)"
      ],
      "sequence_rationale": "Final slice — extends SSO to the second target IdP. Lower risk because the SAML infrastructure is proven from S-001."
    }
  ]
}
```

#### Why this slicing works

Each slice passes the INVEST litmus test — "If we shipped this slice and stopped, would at least one real user get value?"

| Slice | Value if shipped alone |
|---|---|
| S-001 | Yes — existing Okta users can log in via SSO today. |
| S-001 + S-002 | Yes — new users can also onboard via SSO. |
| S-001 + S-002 + S-003 | Yes — users with mismatched emails don't get duplicated. |
| S-001–S-004 | Yes — Azure AD users can also log in. |

Compare with the anti-pattern of starting with a test/stub IdP: slices S-001 through S-003 would deliver no user value because no real user can authenticate against a test IdP. The "so that" clause in each story would be aspirational, not actually delivered.
