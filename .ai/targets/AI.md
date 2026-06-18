<!-- @standalone:override -->
# .ai Documentation Guidelines

## CRITICAL (AI: READ THIS FIRST)
- Files must stay under 100 lines.
- ASCII only. No unicode arrows, emojis, smart quotes, or decorative symbols.
- One concern per file. Do not mix topics.
- Never duplicate rules from other .ai/targets/*.md files. Always reference them.
- Use short declarative rules with these keywords:
  MUST, REQUIRED, FORBIDDEN, STOP, DETECT, BAD, GOOD.
- Apply updates using UPDATE_GUIDELINES.md.

## STRUCTURE
- Start every file with one of:
  AI WORKFLOW (REQUIRED)
  or
  CRITICAL RULES
- Group content logically: WORKFLOW, RULES, CHECKLIST.
- Use single-line bullets. No multi-line examples.
- Keep headings minimal and consistent.

## KEYWORDS (GREP-FRIENDLY)
- REQUIRED or MUST: enforceable rules.
- FORBIDDEN or NEVER: anti-patterns.
- DETECT: grep pattern lines.
- BAD and GOOD: short inline contrasts.
- PROTECTION: validation or guard behavior.
- DELEGATE: command routes to CLI.
- LAYER: SDK architecture tier (sdk, framework, react, app).
  Commands and targets filtered by layer. Variants: .sdk.md, .framework.md, .react.md.
  Fallback chain: react -> framework -> sdk -> base. Layer stored in frontx.config.json.

## RULE FORMAT
Rules must follow one of these forms:
- FORBIDDEN: text
- REQUIRED: text
- MUST: text
- STOP: condition
- DETECT: grep -rn "pattern" path

No extra commentary. No examples. No code blocks.

## DECISION RULES
1) Use .ai/GUIDELINES.md to route to the correct file.
2) Check if the requested rule already exists in another target file.
3) If the rule belongs to UIKIT, UICORE, EVENTS, STYLING, THEMES, or API, reference that file instead of duplicating.
4) Modify only the specific rule or section directly impacted by the requested change.

## VALIDATION RULES
Before saving updates:
- No duplicated rules across files.
- No unicode characters.
- No examples or multi-line explanations.
- Section count remains the same unless the user requested otherwise.
- File remains under 100 lines.

## STOP CONDITIONS
Stop and ask the user before:
- Adding content that belongs in a different target file.
- Changing routing entries in .ai/GUIDELINES.md.
- Adding narrative explanation instead of rules.
- Adding new rule categories.
- Implementing logic directly instead of delegating to CLI.

## COMMAND NAMESPACES
- hai3dev-*: internal monorepo commands, NEVER shipped to user projects.
- hai3-*: user project commands, shipped via CLI templates.
- Location: internal/ for hai3dev-*, user/ for hai3-*.

## CLI DELEGATION
- REQUIRED: Commands DELEGATE to hai3 CLI for scaffolding.
- FORBIDDEN: Implementing file generation logic in commands.
- REQUIRED: Commands run validation after scaffolding.
- PROTECTION: CLI runs type-check, lint, arch:check automatically.

## UPDATE POLICY
- All rules must be minimal and strictly formatted.
- If repeated errors occur, rewrite the rule to be more strict.
- Resolve conflicts by clarifying the rule, not duplicating it.
- Follow UPDATE_GUIDELINES.md for all edits.

## OUTPUT POLICY
When updating a file:
- Modify the file directly in the workspace.
- Do not output rewritten content unless the user asks for it.
- Do not generate proposals or drafts unless requested.
