# .ai Documentation Guidelines

## CRITICAL (AI: READ THIS FIRST)
- Files must stay under 100 lines.
- ASCII only. No unicode arrows, emojis, smart quotes, or decorative symbols.
- One concern per file. Do not mix topics.
- Never duplicate rules from other .ai/targets/*.md files. Always reference them.
- Use short declarative rules with these keywords:
  MUST, REQUIRED, FORBIDDEN, STOP, DETECT, BAD, GOOD.

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

## THREE-LEVEL GUIDELINES HIERARCHY
HAI3 projects support a 3-level guidelines hierarchy:
- Level 1 (HAI3): .ai/GUIDELINES.md and .ai/targets/ - managed by CLI, updated via hai3 update.
- Level 2 (Company): .ai/company/GUIDELINES.md and .ai/company/targets/ - preserved on update.
- Level 3 (Project): .ai/project/GUIDELINES.md and .ai/project/targets/ - preserved on update.
Routing: GUIDELINES.md routes to company/ and project/ when relevant to context.
Preservation: hai3 update NEVER modifies company/ or project/ directories.
Commands: See .ai/targets/AI_COMMANDS.md for command hierarchy.

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
3) If the rule belongs to specific targets, reference that file instead of duplicating.
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

## CLI DELEGATION
- REQUIRED: Commands DELEGATE to hai3 CLI for scaffolding.
- FORBIDDEN: Implementing file generation logic in commands.
- REQUIRED: Commands run validation after scaffolding.
- PROTECTION: CLI runs type-check, lint, arch:check automatically.

## OUTPUT POLICY
When updating a file:
- Modify the file directly in the workspace.
- Do not output rewritten content unless the user asks for it.
- Do not generate proposals or drafts unless requested.
