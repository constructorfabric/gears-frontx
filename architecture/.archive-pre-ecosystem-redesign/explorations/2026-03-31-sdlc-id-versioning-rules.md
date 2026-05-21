# Exploration: SDLC Kit Rules for Artifact ID Versioning

Date: 2026-03-31

## Research question

When do SDLC kit rules require appending a version suffix (`-v2`, `-v3`) to a Cypilot artifact ID, and when should the ID remain unchanged? Specifically: does a bug fix to an existing requirement's description warrant ID versioning?

Secondary questions:
- What are the rules for cross-artifact ID consistency when an ID is versioned?
- What happens to code markers when an ID is versioned?
- What does DECOMPOSITION.md show when other artifacts have already been versioned?

## Scope

**In scope**: All SDLC kit rules files (`rules.md` for PRD, DESIGN, FEATURE, DECOMPOSITION, CODEBASE), the traceability spec, and the constraints.toml. The specific case of `cpt-frontx-fr-mfe-action-types` vs `cpt-frontx-fr-mfe-action-types-v2`.

**Out of scope**: Whether the specific PR change is correct or incorrect -- this exploration presents the rules as written.

## Findings

### 1. PRD versioning rules

File: `.cypilot/config/kits/sdlc/artifacts/PRD/rules.md`, lines 69-72.

The PRD rules state (verbatim):

```
- [ ] When editing existing PRD: increment version in frontmatter
- [ ] When changing capability definition: add `-v{N}` suffix to ID or increment existing version
  - Format: `cpt-{hierarchy-prefix}-cap-{slug}-v2`, `cpt-{hierarchy-prefix}-cap-{slug}-v3`, etc.
- [ ] Keep changelog of significant changes
```

The trigger phrase is "when changing capability definition." The rules do not define what constitutes a "change" to a capability definition versus a correction or clarification. There is no carve-out for bug fixes, typo corrections, or wording clarifications.

**Confidence:** Corroborated -- exact text from the rules file.

### 2. DESIGN versioning rules

File: `.cypilot/config/kits/sdlc/artifacts/DESIGN/rules.md`, lines 70-73.

The DESIGN rules state (verbatim):

```
- [ ] When editing existing DESIGN: increment version in frontmatter
- [ ] When changing type/component definition: add `-v{N}` suffix to ID or increment existing version
- [ ] Format: `cpt-{hierarchy-prefix}-type-{slug}-v2`, `cpt-{hierarchy-prefix}-comp-{slug}-v3`, etc.
- [ ] Keep changelog of significant changes
```

The trigger phrase is "when changing type/component definition." Same observation: no distinction between substantive changes and corrections.

**Confidence:** Corroborated -- exact text from the rules file.

### 3. FEATURE versioning rules

File: `.cypilot/config/kits/sdlc/artifacts/FEATURE/rules.md`, lines 77-80.

The FEATURE rules state (verbatim):

```
- [ ] When editing existing FEATURE: increment version in frontmatter
- [ ] When flow/algo/state/dod significantly changes: add `-v{N}` suffix to ID
- [ ] Keep changelog of significant changes
- [ ] Versioning code markers must match: `@cpt-{kind}:cpt-{system}-{kind}-{slug}-v2:p{N}`
```

The trigger phrase here is notably different: "when flow/algo/state/dod **significantly** changes." The word "significantly" is present in the FEATURE rules but absent from the PRD and DESIGN rules. The FEATURE rules also explicitly note that code markers must match the versioned ID.

**Confidence:** Corroborated -- exact text from the rules file.

### 4. DECOMPOSITION versioning rules

File: `.cypilot/config/kits/sdlc/artifacts/DECOMPOSITION/rules.md`.

The DECOMPOSITION rules contain **no versioning section**. There are no rules about when or how to version DECOMPOSITION IDs, and no rules about how DECOMPOSITION should handle versioned IDs from upstream artifacts (PRD, DESIGN).

**Confidence:** Corroborated -- verified by reading the entire file (375 lines). No "versioning" heading or `-v{N}` mention exists.

### 5. CODEBASE versioning rules

File: `.cypilot/config/kits/sdlc/codebase/rules.md`, lines 124-129.

The CODEBASE rules state (verbatim):

```
- [ ] When design ID versioned (`-v2`): update code markers to match
- [ ] Marker format with version: `@cpt-flow:{cpt-id}-v2:p{N}`
- [ ] Migration: update all markers when design version increments
- [ ] Keep old markers commented during transition (optional)
```

This establishes that when a design ID is versioned, code markers **must** be updated to match. Old markers may optionally be kept as comments during transition.

**Confidence:** Corroborated -- exact text from the rules file.

### 6. Traceability spec versioning rules

File: `.cypilot/.core/architecture/specs/traceability.md`, lines 316-323.

The traceability spec states:

```
When design IDs are versioned:

| Design ID | Code Marker |
|-----------|-------------|
| `cpt-app-feature-auth-flow-login` | `@cpt-flow:cpt-app-feature-auth-flow-login:p1` |
| `cpt-app-feature-auth-flow-login-v2` | `@cpt-flow:cpt-app-feature-auth-flow-login-v2:p1` |

When design version increments, update all code markers. Old markers may be kept commented during transition.
```

This confirms the CODEBASE rules: code markers must exactly match the design ID, including any version suffix. The `-v2` suffix is part of the ID itself, not a separate metadata field.

**Confidence:** Corroborated -- exact text from the spec.

### 7. Cross-artifact ID consistency: current state of the codebase

The current state of the repository shows an inconsistency:

| Artifact | ID used | Line |
|----------|---------|------|
| PRD.md | `cpt-frontx-fr-mfe-action-types-v2` | 502 |
| DESIGN.md | `cpt-frontx-fr-mfe-action-types-v2` | 97 |
| FEATURE.md | `cpt-frontx-fr-mfe-action-types-v2` | 387 |
| DECOMPOSITION.md | `cpt-frontx-fr-mfe-action-types` (no `-v2`) | 129 |

DECOMPOSITION references the old ID without the `-v2` suffix. PRD, DESIGN, and FEATURE all use the `-v2` suffix.

**Confidence:** Corroborated -- verified by grepping the codebase.

### 8. What the rules do NOT say

The following are **absent** from all rules files:

1. **No definition of "change" vs "fix"** -- No rule distinguishes between a substantive change to a capability/type definition and a correction or bug fix to the same definition. The PRD and DESIGN rules use "when changing" without qualification. Only the FEATURE rules add the qualifier "significantly."

2. **No exemption for bug fixes** -- No rule states that bug fixes, corrections, or clarifications are exempt from ID versioning.

3. **No exemption for wording-only changes** -- No rule states that changes to the description/definition text (without changing the semantic meaning) are exempt from versioning.

4. **No DECOMPOSITION versioning guidance** -- No rule in DECOMPOSITION addresses how to handle upstream ID versioning. There is no cascade rule that says "when a PRD ID is versioned, update the DECOMPOSITION reference."

5. **No definition of "significantly"** -- The FEATURE rules use "significantly changes" as a trigger, but no rule defines what qualifies as significant versus insignificant.

6. **No rollback rule** -- No rule addresses what to do if an ID was incorrectly versioned (whether to revert or keep the versioned ID).

**Confidence:** Corroborated -- verified by reading all five rules files in full.

### 9. The `-v{N}` suffix is part of the ID, not metadata

The traceability spec (lines 80-92) defines the ID format as:

```
cpt-{hierarchy-prefix}-{kind}-{slug}
```

The regex is: `` `cpt-[a-z0-9][a-z0-9-]+` ``

The `-v2` suffix becomes part of the `{slug}` portion. Once an ID is versioned, `cpt-frontx-fr-mfe-action-types-v2` is a **different ID** from `cpt-frontx-fr-mfe-action-types`. They are two distinct identifiers in the system.

The ID naming convention (line 104) shows an example: `api-gateway-v2` as a valid slug for "API Gateway v2". This confirms that version suffixes are part of the slug namespace.

**Confidence:** Substantiated -- inferred from the ID format spec and regex pattern.

## Comparison

| Aspect | PRD rules | DESIGN rules | FEATURE rules | DECOMPOSITION rules | CODEBASE rules |
|--------|-----------|--------------|---------------|---------------------|----------------|
| Versioning trigger | "changing capability definition" | "changing type/component definition" | "**significantly** changes" | (none) | "design ID versioned" |
| Bug fix exemption | Not mentioned | Not mentioned | Not mentioned | N/A | N/A |
| Format specified | `-v2`, `-v3` | `-v2`, `-v3` | `-v{N}` | N/A | `-v2` |
| Cross-artifact sync | Not mentioned | Not mentioned | Not mentioned | Not mentioned | Must match design ID |

## Key takeaways

- The SDLC kit rules require ID versioning when a definition "changes" (PRD, DESIGN) or "significantly changes" (FEATURE), but no rule defines what constitutes a "change" versus a "correction" or "bug fix." (Corroborated)

- Only the FEATURE rules include the qualifier "significantly" before "changes." The PRD and DESIGN rules use "when changing" without qualification, which is a broader trigger. (Corroborated)

- Once an ID is versioned, it becomes a distinct ID in the system. All cross-artifact references and code markers must use the exact versioned ID. (Corroborated)

- The DECOMPOSITION rules contain no versioning section and no guidance on how to handle versioned upstream IDs, which creates a gap. The current codebase shows this gap: DECOMPOSITION.md references the old unversioned ID while PRD, DESIGN, and FEATURE use the `-v2` ID. (Corroborated)

- No rule in any artifact's rules file provides an exemption for bug fixes, corrections, or non-semantic wording changes. The rules are silent on this distinction. (Corroborated)

## Open questions

1. **What qualifies as a "change" vs a "correction"?** The rules do not define this boundary. A team decision is needed on whether the `-v2` suffix was warranted for this specific case.

2. **Should DECOMPOSITION be updated?** If the `-v2` ID is kept, DECOMPOSITION.md line 129 references a non-existent ID (`cpt-frontx-fr-mfe-action-types` without `-v2`). This is a cross-artifact consistency violation regardless of whether the versioning was warranted.

3. **What does "significantly" mean in FEATURE rules?** The FEATURE rules use a higher bar ("significantly changes") than PRD/DESIGN rules ("changing"). No definition of "significant" is provided.

4. **Is there a rollback procedure?** If the team determines the versioning was incorrect, no rule addresses how to revert a versioned ID or whether the `-v2` should simply be removed from all artifacts.

## Sources

1. `.cypilot/config/kits/sdlc/artifacts/PRD/rules.md` (lines 69-72) -- PRD versioning requirements
2. `.cypilot/config/kits/sdlc/artifacts/DESIGN/rules.md` (lines 70-73) -- DESIGN versioning requirements
3. `.cypilot/config/kits/sdlc/artifacts/FEATURE/rules.md` (lines 77-80) -- FEATURE versioning requirements with "significantly" qualifier
4. `.cypilot/config/kits/sdlc/artifacts/DECOMPOSITION/rules.md` (full file, 375 lines) -- absence of versioning rules
5. `.cypilot/config/kits/sdlc/codebase/rules.md` (lines 124-129) -- code marker versioning requirements
6. `.cypilot/.core/architecture/specs/traceability.md` (lines 80-92, 316-323) -- ID format spec and code marker versioning examples
7. `.cypilot/config/kits/sdlc/constraints.toml` -- ID kind definitions and cross-artifact reference rules (no versioning rules found)
