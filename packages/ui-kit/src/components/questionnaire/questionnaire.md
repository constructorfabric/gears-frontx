# Questionnaire

A single-item-at-a-time multi-step form: one question visible at a time,
with progress, required/skip/invalid state, and keyboard shortcuts handled
for you. Behavior comes from **`@shadcn/react/questionnaire`**, a headless,
zero-runtime-dep engine — a dependency deviation from the kit's usual Base
UI foundation, approved 2026-08-20 (see `shadcn-porting-map.md`), taken
because Base UI ships no multi-step-form primitive. This file supplies CSS
Modules styling, composes the kit `Button` for navigation and the kit
`Input` for freeform answers (matching upstream's own composition), and
hand-rolls the choice indicator (see `QuestionnaireChoice`'s doc comment
in `questionnaire.tsx` for why that one piece can't literally reuse the
kit's `Checkbox`/`RadioGroupItem` components).

Composition: `Questionnaire` (root `<form>`, holds `items`/current item) →
one `QuestionnaireItem` per question (`QuestionnaireTitle`,
`QuestionnaireDescription`, either `QuestionnaireChoices` of
`QuestionnaireChoice` or a single `QuestionnaireInput`, then
`QuestionnaireError`) → `QuestionnaireActions` with
`QuestionnairePrevious`/`QuestionnaireSkip`/`QuestionnaireNext`/
`QuestionnaireSubmit`.

## When to use

- A short, focused form best answered one question at a time — onboarding,
  a survey, a setup wizard — where seeing every field at once would
  overwhelm rather than help.

## When not to use

- A form where the user benefits from seeing multiple related fields
  together (an address, a billing profile) — compose `Field`/`Input`/
  `Select` directly instead.
- A long form the user is expected to skim, save, and return to — this
  component has no persistence or free navigation between arbitrary steps
  beyond Previous/Next.

## Props (kit level)

`Questionnaire` (root, a native `<form>`):

| Prop | Type | Notes |
|------|------|-------|
| `items` | `{ name, choices?, required?, disabled? }[]` | The full question list — drives validation independent of what's actually rendered as `QuestionnaireItem`s |
| `item` / `defaultItem` | `string` | Controlled/uncontrolled current item name |
| `onItemChange` | `(item: string) => void` | |
| `shortcuts` | `'letters' \| 'numbers'` | Assigns a keyboard shortcut to each choice, shown via `QuestionnaireChoiceShortcut` |

`QuestionnaireItem`: `name` (matches an `items` entry), `required`,
`multiple` (renders every child `QuestionnaireChoice` as a checkbox
instead of a radio), `invalid`, `onStatusChange`.

`QuestionnaireChoice`: `value`, `disabled`. Renders the hidden native
input, a checkbox-square or radio-circle indicator (picked automatically
from the parent item's `multiple`), the label text (`children`), and a
shortcut hint slot.

`QuestionnaireInput`: any text `<input>` prop (`type`, `placeholder`,
`maxLength`, ...) plus `render` — defaults to composing the kit `Input`.

Navigation (`QuestionnairePrevious`/`QuestionnaireSkip`/`QuestionnaireNext`/
`QuestionnaireSubmit`), each:

| Prop | Type | Default |
|------|------|---------|
| `variant` | kit `Button` variant | `'outline'` (Previous/Skip), `'default'` (Next/Submit) |
| `size` | kit `Button` size | `'default'` |
| `render` | element to render as | a kit `Button` |

Each is hidden (native `hidden`+`inert`, not just visually) when it
doesn't apply — `Previous` on the first item, `Skip` on a `required` item,
`Next` past the last item, `Submit` before it.

## Deviations from upstream

- **Choice indicator is hand-rolled, not a `Checkbox`/`RadioGroupItem`
  composition.** Those kit components wrap Base UI's `Checkbox`/`Radio`
  primitives, which render as `<span role="checkbox"|"radio">` — never a
  real `<input>`. The questionnaire engine needs its `ChoiceInput` to BE a
  native input (constraint validation, `name`-based radio grouping), so
  this file instead re-implements the same visual language (box size,
  border, checked/dot/check treatment, disabled dim, invalid border) from
  `checkbox.module.css`/`radio-group.module.css` directly here, keyed off
  this element's own `data-type`/`data-checked`/`data-disabled`/
  `data-invalid` attributes.
- **`ChoiceInput`/`ChoiceLabel`/`ChoiceShortcut` are exported standalone.**
  Upstream only uses them internally inside its `QuestionnaireChoice`. This
  kit exports all three too, for a consumer building a fully custom choice
  layout without `QuestionnaireChoice`'s built-in indicator markup.
- **No manual default text.** Upstream's wrapper supplies `children ??
  'Previous'` (and similarly for Skip/Next/Submit/the progress text/the
  error message) because its underlying primitive renders nothing without
  it. The installed `@shadcn/react` version already supplies sensible
  default content for `QuestionnaireProgress`, `QuestionnaireError`, and
  each navigation button — this wrapper only forwards `children`/`render`
  when a consumer wants to override that default, it never hardcodes
  English strings that would need translating.
- **Usable default spacing.** Upstream ships `Questionnaire`/
  `QuestionnaireItem` with no gap at all, leaving all spacing to the
  consuming app's own layout classes. This kit adds a default `gap` on
  both (`--space-6` on the root, `--space-4` on each item) so the
  composition in the examples below looks correct with zero extra
  consumer CSS — the same "a usable component needs..." reasoning
  `collapsible.tsx` documents for its own default styling.

## Examples

```tsx
import {
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
  QuestionnaireChoices,
  QuestionnaireError,
  QuestionnaireInput,
  QuestionnaireItem,
  QuestionnaireNext,
  QuestionnairePrevious,
  QuestionnaireProgress,
  QuestionnaireSkip,
  QuestionnaireSubmit,
  QuestionnaireTitle,
} from '@gears-frontx/ui-kit';

const items = [
  { name: 'role', choices: [{ value: 'engineer' }, { value: 'designer' }], required: true },
  { name: 'notes' },
];

function Onboarding() {
  return (
    <Questionnaire items={items} defaultItem="role" onSubmit={handleSubmit}>
      <QuestionnaireProgress />
      <QuestionnaireItem name="role" required>
        <QuestionnaireTitle>What's your role?</QuestionnaireTitle>
        <QuestionnaireChoices>
          <QuestionnaireChoice value="engineer">Engineer</QuestionnaireChoice>
          <QuestionnaireChoice value="designer">Designer</QuestionnaireChoice>
        </QuestionnaireChoices>
        <QuestionnaireError />
      </QuestionnaireItem>
      <QuestionnaireItem name="notes">
        <QuestionnaireTitle>Anything else we should know?</QuestionnaireTitle>
        <QuestionnaireInput placeholder="Optional" />
      </QuestionnaireItem>
      <QuestionnaireActions>
        <QuestionnairePrevious />
        <QuestionnaireSkip />
        <QuestionnaireNext />
        <QuestionnaireSubmit />
      </QuestionnaireActions>
    </Questionnaire>
  );
}
```

## Anti-patterns

- Do not render a `QuestionnaireChoice` for a value missing from the
  parent `QuestionnaireItem`'s `choices` in `items` — the engine warns
  (console) and the choice won't participate in validation/shortcuts.
- Do not reach for `Checkbox`/`RadioGroupItem` to restyle
  `QuestionnaireChoice`'s indicator — see "Deviations" above for why that
  swap breaks native input semantics the engine depends on. Restyle via
  `questionnaire.module.css`'s own classes/tokens instead.
- Do not assume `QuestionnaireNext`/`QuestionnaireSubmit` are mutually
  exclusive by conditional rendering — both should always be mounted
  (matching the examples above); the primitive hides whichever doesn't
  apply, which is also what lets its transition-free `hidden` swap happen
  without a flash of the wrong button.
