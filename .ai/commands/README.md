# FrontX AI Commands

## Command Distribution

FrontX commands are distributed across packages based on their layer:

| Package | Layer | Commands |
|---------|-------|----------|
| `@gears-frontx/api` | L1 SDK | `frontx-new-api-service` |
| `@gears-frontx/framework` | L2 Framework | `frontx-new-action`, `frontx-validate`, `frontx-fix-violation`, `frontx-quick-ref`, `frontx-rules` |
| `@gears-frontx/react` | L3 React | `frontx-new-screenset`, `frontx-new-screen`, `frontx-new-component`, `frontx-duplicate-screenset` |

## Monorepo-Only Commands

Commands in this directory (`user/`) are monorepo-specific and NOT shipped with packages:

- `frontx-arch-explain.md` - Explains FrontX architecture (references monorepo internals)
- `frontx-review-pr.md` - Reviews PRs against FrontX guidelines (references monorepo targets)

## Internal Commands

Commands in `internal/` are for FrontX development only:

- `frontxdev-publish.md` - Publish packages to NPM
- `frontxdev-release.md` - Create releases
- `frontxdev-test-packages.md` - Test packages
- `frontxdev-update-guidelines.md` - Update AI guidelines

## How Commands Are Composed

When users run `frontx ai sync --detect-packages`, the CLI:

1. Scans `node_modules/@gears-frontx/*/commands/` for package commands
2. Composes commands based on installed packages
3. Generates tool-specific output:
   - `.claude/commands/` for Claude Code
   - `.cursor/commands/` for Cursor
   - `.windsurf/workflows/` for Windsurf
   - `.github/copilot-commands/` for GitHub Copilot

Users only get commands for packages they have installed:
- SDK-only project (`@gears-frontx/api`) → Only `frontx-new-api-service`
- Framework project → API + Framework commands
- Full React project → All commands from all packages
