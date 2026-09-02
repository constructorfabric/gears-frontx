# Guideline: The Variant Axis This Shell Declares

The kit's verification walk repeats its screen coverage over one caller-declared
variant axis — a set of values, a control that opens them, an option handle per
value, and the switcher label each value is confirmed from. The kit's driver
knows nothing about what such an axis stands for. **In a project built on this
shell, that axis is the theme registry**, and this file is what a run reads to
fill the driver's `--variant-*` flags in. It is a code-verified snapshot: if the
files named below change, this file must be updated to match.

Authoritative files:

- `src-app/app/main.tsx` — where the themes are registered and the default applied
- `src-app/app/themes/` — one module per theme, each exporting its id and `name`
- `packages/studio/src/testIds.ts` — the overlay's verification handles
- `packages/studio/src/sections/ThemeSelector.tsx` — the switcher the walk drives

## The set comes from the registration, not from the dropdown

`main.tsx` registers the shell's themes one call at a time and then applies the
default:

```ts
app.themeRegistry.register(defaultTheme);
app.themeRegistry.register(lightTheme);
app.themeRegistry.register(darkTheme);
app.themeRegistry.register(draculaTheme);
app.themeRegistry.register(draculaLargeTheme);
app.themeRegistry.apply(DEFAULT_THEME_ID);
```

Those five calls are the set: ids `default`, `light`, `dark`, `dracula` and
`dracula-large`, each declared beside its `name` in its own module under
`src-app/app/themes/`. Read the set from there. The switcher's dropdown
enumerates what the switcher chose to offer, which is a different question, and a
set taken from it is a set nothing confirmed.

A project that added or removed a theme changed this list, and the count of
registered ids is the count the walk covers.

## The handles

`packages/studio/src/testIds.ts` is a verification API rather than a styling
hook, and its values are what the driver is given:

| Driver flag | Value | Declared as |
|---|---|---|
| `--variant-switcher` | `studio-theme-trigger` | `STUDIO_THEME_TRIGGER_TESTID` |
| `--variant-option` | `studio-theme-option-{variant}` | `studioThemeOptionTestId(themeId)` |
| `--panel-expand` | `studio-expand` | `STUDIO_EXPAND_TESTID` |
| `--panel-collapse` | `studio-collapse` | `STUDIO_COLLAPSE_TESTID` |

The option id is keyed on the theme's **registry id**, not its display name, so
`{variant}` substitutes the same strings the registration above lists and no
label map is needed to reach an option.

The trigger's own text is the active theme's `name` with each hyphen-separated
word capitalised — `dracula-large` reads back as `Dracula Large`. `ThemeSelector`
resolves that text through the registry list on purpose, so the trigger reads
back the same label the option carried and the driver's whole-word confirmation
has something to agree with.

## `dracula` and `dracula-large` are walked in two invocations

The driver confirms a value from the switcher label by requiring the value's name
to occupy a whole run of the label's words. `Dracula Large` satisfies that test
for `dracula` as well as for `dracula-large`, so a label reading `Dracula Large`
cannot say which of the two is applied. The driver refuses the pair on the
arguments, before a browser is reached:

```
variants "dracula" and "dracula-large" cannot be told apart from a switcher
label: a label reading "dracula-large" names "dracula" as well
```

`--variant-labels` does not resolve it here, because the labels the trigger
actually prints stand in the same relation to each other. **Walk the two in
separate invocations instead**, each with a capture directory of its own and both
appending to the same coverage file:

```bash
DRIVER=<installed kit root>/skills/project-scaffolding/scripts/verify-walk.mjs

node "$DRIVER" \
  --host <dev server origin> \
  --screens <name>:<route>:<ready testid>,... \
  --capdir "$CAPDIR/pass-1" \
  --variants default,light,dark,dracula \
  --variant-switcher studio-theme-trigger \
  --variant-option 'studio-theme-option-{variant}' \
  --panel-expand studio-expand \
  --panel-collapse studio-collapse \
  --menu '<a screen menu item testid, with {screen} or {extensionId} in it>' \
  --coverage <targetDir>/.frontx/verification-coverage.md

node "$DRIVER" \
  --host <dev server origin> \
  --screens <name>:<route>:<ready testid>,... \
  --capdir "$CAPDIR/pass-2" \
  --variants dracula-large \
  --variant-switcher studio-theme-trigger \
  --variant-option 'studio-theme-option-{variant}' \
  --panel-expand studio-expand \
  --panel-collapse studio-collapse \
  --menu '<a screen menu item testid, with {screen} or {extensionId} in it>' \
  --coverage <targetDir>/.frontx/verification-coverage.md
```

The two runs land five rows in one coverage file under one header. **The second
run's row reads `first variant` in the distinctness cell**, because `dracula-large`
has no predecessor inside its own invocation — which is true of that run and is
not a claim that the theme was never compared. Say so in the report, and compare
that pair's captures across the two capture directories by hand if the comparison
is wanted: the two runs are separate walks, and the driver compares only within
one.

Splitting the walk this way is a property of these two theme names, not of the
shell. A project whose registered ids are all distinguishable by label walks them
in one invocation.
