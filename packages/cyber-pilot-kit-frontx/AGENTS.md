---
description: "Agent navigation rules for FrontX ecosystem package boundaries, CLI, and MFEs, and the standing rules for how work in a FrontX project is searched for, built, and verified."
---

# FrontX AI Tooling Kit — Agent Navigation Rules

## Package Boundaries (always enforce)

- Ecosystem packages: `mfes`, `gts-plugin`, `api`, `cli`, `cyber-pilot-kit-frontx`
- Template packages: the active template (external, source-spec-resolved) and its sub-packages
- Never add ecosystem→template imports; never add template→ecosystem src-level coupling

## When running a command

- macOS ships no `timeout` command, so a call wrapped in `timeout <seconds> ...` dies with "command not found" and reads as a broken tool rather than a missing binary. Bound a slow call with the timeout parameter the tool issuing it already carries, never with a shell wrapper

## When searching the filesystem

- Scope every search to the tree being worked in: the project directory, the repository, or the single package under change. Never search from `/`, from the home directory, or from any parent of the working tree
- An unscoped search is not thorough, it is a scan of everything the machine holds. One `find /` issued during a scaffolding run cost 93.6 seconds of pure filesystem walk and surfaced nothing the project tree did not already carry
- A path that is not where it should be is absent. Widen the search inside the tree, or report the absence; widening past the tree answers a different question than the one asked

## When adding code to ecosystem packages

- Check DESIGN.md for the relevant component boundary constraint (MFES-*, API-*, CLI-*, KIT-*)
- Run `npm run build` and `npm run test` inside the package before reporting done
- All resource ids in kit manifests MUST begin with `frontx_` (KIT-1)

## When implementing an action a user invokes

- The action must let a user reach the outcome its own label names, carrying data they supplied. A handler that produces the payload itself - a constant, an empty field, a record nobody entered - is a stub: the control is there and the outcome the user came for is not reachable
- Where an intent names an action but says nothing about how the user's data gets in, that gap is what to report. Filling it with a fixed value satisfies the wording of the intent and defeats the action

## When verifying a user interface

- Judge the rendered pixels, not the tree behind them. A DOM snapshot proves an element exists and a click proves it can be operated; neither proves a person can see it. Every interactive element must be visually distinguishable while at rest, in every theme the interface supports - one that emerges only under hover or focus fails
- The theme an interface opens in is one of the themes it supports, never the set. A pass that captured only that theme has seen a fraction of the surface: switch into each remaining theme and capture it there, or report the verification as partial and name the themes left unopened. A run that reported a verified interface while a whole theme stayed unopened claimed a coverage it never had
- A screenshot is evidence only once it has been examined. Take one per screen per theme, in the states that carry the meaning - a form before it is submitted, a list before and after it changes - with no debug or development overlay across the surface, and read each for what a structural check cannot see: elements invisible or cramped, panels over content, layers colliding. Verification is not complete while a captured screenshot is unexamined
- A judgement on a screenshot names what it looked at: which elements, in which state, in which theme. "Looks correct" records a feeling and conceals whatever went unexamined, and a cramped button survived two consecutive runs behind judgements phrased that way
- A workaround is a finding. If confirming something took piercing a shadow root, evaluating script, or reading markup the interface does not display, then the user cannot perceive it either. Record it as a defect - a check that needed the bypass did not pass
- The headless browser starts through `npx --yes agent-browser`; its binary is not on `PATH`, and five consecutive runs each spent 20 to 40 seconds rediscovering that. When a Chrome debug port is already listening on 9222, attach to it with `agent-browser connect 9222` instead of launching a second browser: attaching returned every screenshot in the run that used it, where a self-launched browser hung three times in the run before

## When working with the CLI

- CLI resolves templates by source-spec at runtime; it bundles no template content
- Source-spec format: `host:owner/repo[//subtree]@ref` — the optional `//subtree` addresses a template occupying a subdirectory of a repository
- Supported commands are `install`, `list`, `update-local`, `validate`, `seed`, `add`, `upgrade`, and `help`
- `seed` applies a template into a **new** repository, `add` into an **existing** one; both take the identity the template's own manifest declares, which is what `list` reports. `seed` refuses a target that already holds content and names the exact rule in its refusal - read that rather than reproducing the rule here, since a copy of it in this file is a copy that falls out of step
- `list --json` is the machine-readable form: one record per installed template carrying its identity, pinned reference, source address, and declared description

## When a request is to create or extend a project

- Route it first — the routing section of this kit's `SKILL.md` maps each kind of request (create, apply a held reference, add a unit, upgrade, validate) to the capability or command that serves it. Read the routing table there; it is the only copy, and restating it here is how the two fall out of step
- **This kit describes no procedure for adding a unit inside ground an applied template owns** — no MFE package, no screen. That template owns its scaffold, its naming and its registration steps, and states them in the skills it activated under `.frontx/ai/<template-identity>/`. Writing such a procedure here would put solution knowledge in the solution-agnostic base and go stale the moment the template changed

## When working with MFEs

- MFEs register through `@gears-frontx/mfes` DefaultMfeRegistry
- Extension domains control which MFEs may mount (`cpt-frontx-component-extension-domain-governance`)
- Isolation is via blob-URL sandboxing (`cpt-frontx-component-mfe-isolation`)
