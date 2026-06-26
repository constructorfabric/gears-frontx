<!-- @standalone -->
# frontx:rules - Show FrontX Rules for Specific Area

Ask the user which area they want rules for, or detect from context.

## ROUTING TABLE

| Area | Target file |
|------|-------------|
| Data flow / events | .ai/targets/EVENTS.md |
| API layer | .ai/targets/API.md |
| packages/uicore | .ai/targets/UICORE.md |
| src/screensets | .ai/targets/SCREENSETS.md |
| src/themes | .ai/targets/THEMES.md |
| Styling anywhere | .ai/targets/STYLING.md |
| AI documentation | .ai/targets/AI.md |

Then:

1. Read the applicable target file
2. Summarize the CRITICAL RULES section (3-7 rules)
3. List STOP CONDITIONS
4. Show PRE-DIFF CHECKLIST items
5. Provide common violation examples with fixes

Format output as:

## Critical Rules
[List 3-7 key rules in your own words]

## Stop Conditions
[When to stop and ask]

## Common Violations
[Show BAD -> GOOD examples]

## Pre-Diff Checklist
[Checklist from target file]

## Reference
Full rules: `.ai/targets/{FILE}.md`
