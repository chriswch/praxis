# Templates and Heuristics

Use these templates and heuristics when splitting a Feature Brief into story slices. Match the fields to `references/slice-map.spec.md`.

## Table of Contents
- Story Slicing Heuristics
- Slice Template (JSON and Markdown)
- Worked Example (SSO Feature Brief → Slice Map)

## Story Slicing Heuristics

- Slice **vertically** (end-to-end behavior) instead of by layer (frontend-only/backend-only).
- Start with a **walking skeleton** — the thinnest possible end-to-end path that proves the integration/architecture works.
- Then add slices for:
  - validation / error states
  - edge cases
  - permissions / roles
  - performance / accessibility
  - telemetry / analytics
- If a story is too big: split by persona, workflow step, data subset, or capability tier (read → create → edit → bulk).
- When unknowns are material: note them as `open_unknowns` on the slice and suggest a spike in the sequence rationale.
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
      "SP-initiated flow only; IdP-initiated flow deferred"
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
      "title": "SAML handshake with a test IdP",
      "story": "As an enterprise user, I want to initiate a SAML login and be redirected to my IdP, so that I can authenticate without a local password.",
      "scope_in": [
        "SP-initiated SAML 2.0 redirect to IdP",
        "Consume SAML assertion and create a session",
        "Works with a test/stub IdP (not yet Okta/Azure AD)"
      ],
      "scope_out": [
        "User provisioning on first login (S-002)",
        "Account linking (S-003)",
        "Okta/Azure AD-specific configuration (S-004)"
      ],
      "sequence_rationale": "Walking skeleton — proves the SAML integration works end-to-end. Uses a test IdP to remove external dependencies from the first slice."
    },
    {
      "id": "S-002",
      "title": "Provision user on first SSO login",
      "story": "As a new enterprise user logging in via SSO for the first time, I want an account to be created automatically, so that I don't need a separate signup step.",
      "scope_in": [
        "Create user record from SAML assertion attributes (email, name)",
        "Mark user as SSO-provisioned",
        "Handle missing/incomplete SAML attributes gracefully"
      ],
      "scope_out": [
        "Account linking for existing users (S-003)",
        "SCIM provisioning (out of feature scope)"
      ],
      "sequence_rationale": "Requires the SAML handshake from S-001 to be working. Without provisioning, only pre-existing users could log in via SSO.",
      "open_unknowns": [
        "Whether SSO users bypass email verification — blocked by Q-001"
      ]
    },
    {
      "id": "S-003",
      "title": "Link SSO identity to existing accounts",
      "story": "As an existing user whose company enables SSO, I want my SSO identity linked to my existing account, so that I keep my data and don't get a duplicate account.",
      "scope_in": [
        "Match SSO email to existing user record",
        "Link SSO identity to existing account on first SSO login",
        "User can still log in with email/password after linking (until org enforces SSO-only)"
      ],
      "scope_out": [
        "SSO-only enforcement (defer to follow-up)",
        "Conflict resolution for email mismatches"
      ],
      "sequence_rationale": "Builds on S-001 (handshake) and S-002 (provisioning). Linking prevents duplicate accounts when rolling out SSO to existing users."
    },
    {
      "id": "S-004",
      "title": "Okta and Azure AD configuration",
      "story": "As a platform admin, I want to configure SSO for Okta and Azure AD, so that our enterprise prospects can use their existing identity providers.",
      "scope_in": [
        "Config-file-based SSO setup for Okta",
        "Config-file-based SSO setup for Azure AD",
        "Documentation for admin setup steps"
      ],
      "scope_out": [
        "Admin UI for SSO config (deferred post-v1)",
        "IdP-initiated flow (out of feature scope)"
      ],
      "sequence_rationale": "Final slice — swaps the test IdP from S-001 for real IdPs. Lower risk once the core SAML flow is proven."
    }
  ]
}
```
