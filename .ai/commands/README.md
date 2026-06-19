# HAI3 AI Commands

## Command Distribution

HAI3 commands are distributed across packages based on their layer:

| Package | Layer | Commands |
|---------|-------|----------|
| `@gears-frontx/api` | L1 SDK | `hai3-new-api-service` |
| `@gears-frontx/framework` | L2 Framework | `hai3-new-action`, `hai3-validate`, `hai3-fix-violation`, `hai3-quick-ref`, `hai3-rules` |
| `@gears-frontx/react` | L3 React | `hai3-new-screenset`, `hai3-new-screen`, `hai3-new-component`, `hai3-duplicate-screenset` |

## Monorepo-Only Commands

Commands in this directory (`user/`) are monorepo-specific and NOT shipped with packages:

- `hai3-arch-explain.md` - Explains HAI3 architecture (references monorepo internals)
- `hai3-review-pr.md` - Reviews PRs against HAI3 guidelines (references monorepo targets)

## Internal Commands

Commands in `internal/` are for HAI3 development only:

- `hai3dev-publish.md` - Publish packages to NPM
- `hai3dev-release.md` - Create releases
- `hai3dev-test-packages.md` - Test packages
- `hai3dev-update-guidelines.md` - Update AI guidelines

## How Commands Are Composed

When users run `hai3 ai sync --detect-packages`, the CLI:

1. Scans `node_modules/@gears-frontx/*/commands/` for package commands
2. Composes commands based on installed packages
3. Generates tool-specific output:
   - `.claude/commands/` for Claude Code
   - `.cursor/commands/` for Cursor
   - `.windsurf/workflows/` for Windsurf
   - `.github/copilot-commands/` for GitHub Copilot

Users only get commands for packages they have installed:
- SDK-only project (`@gears-frontx/api`) → Only `hai3-new-api-service`
- Framework project → API + Framework commands
- Full React project → All commands from all packages
