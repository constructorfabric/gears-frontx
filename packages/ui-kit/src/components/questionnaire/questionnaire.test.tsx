import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
  QuestionnaireChoices,
  QuestionnaireDescription,
  QuestionnaireError,
  QuestionnaireInput,
  QuestionnaireItem,
  QuestionnaireNext,
  QuestionnairePrevious,
  QuestionnaireProgress,
  QuestionnaireSkip,
  QuestionnaireSubmit,
  QuestionnaireTitle,
} from './questionnaire';
import styles from './questionnaire.module.css';

afterEach(cleanup);

const ITEMS = [
  { name: 'role', choices: [{ value: 'engineer' }, { value: 'designer' }], required: true },
  { name: 'notes' },
];

// `aria-hidden="true"` (stamped by the primitive on a hidden nav button —
// see questionnaire.tsx's QuestionnairePrevious/Skip/Next doc comments)
// makes its accessible name resolve to "" per the accname algorithm, even
// when a hidden-state-inclusive `getByRole(..., { hidden: true })` query is
// used — the name computation itself, not the role/visibility filter, is
// what's affected. Locating by the button's own label text sidesteps that:
// text queries aren't tied to the accessibility tree.
function navButton(name: string) {
  const button = screen.getByText(name).closest('button');
  if (!button) {
    throw new Error(`no <button> ancestor for text "${name}"`);
  }
  return button;
}

function renderQuestionnaire() {
  return render(
    <Questionnaire items={ITEMS} defaultItem="role">
      <QuestionnaireProgress />
      <QuestionnaireItem name="role" required>
        <QuestionnaireTitle>What's your role?</QuestionnaireTitle>
        <QuestionnaireDescription>Pick one.</QuestionnaireDescription>
        <QuestionnaireChoices>
          <QuestionnaireChoice value="engineer">Engineer</QuestionnaireChoice>
          <QuestionnaireChoice value="designer">Designer</QuestionnaireChoice>
        </QuestionnaireChoices>
        <QuestionnaireError />
      </QuestionnaireItem>
      <QuestionnaireItem name="notes">
        <QuestionnaireTitle>Anything else?</QuestionnaireTitle>
        <QuestionnaireInput placeholder="Optional notes" />
      </QuestionnaireItem>
      <QuestionnaireActions>
        <QuestionnairePrevious />
        <QuestionnaireSkip />
        <QuestionnaireNext />
        <QuestionnaireSubmit />
      </QuestionnaireActions>
    </Questionnaire>,
  );
}

describe('Questionnaire', () => {
  it('renders the current item and keeps the rest hidden/inert', () => {
    renderQuestionnaire();
    expect(screen.getByText("What's your role?").tagName).toBe('LEGEND');
    const activeFieldset = screen.getByText("What's your role?").closest('fieldset');
    expect(activeFieldset).toHaveProperty('hidden', false);
    const nextFieldset = screen.getByText('Anything else?').closest('fieldset');
    expect(nextFieldset).toHaveProperty('hidden', true);
    expect(nextFieldset?.hasAttribute('inert')).toBe(true);
  });

  it('renders a radio-type choice with a kit-styled indicator, unchecked by default', () => {
    renderQuestionnaire();
    const input = screen.getByRole('radio', { name: 'Engineer' });
    expect(input.getAttribute('type')).toBe('radio');
    const choice = input.closest(`.${styles.choice}`);
    expect(choice).toBeTruthy();
    expect(choice?.getAttribute('data-type')).toBe('radio');
    expect(choice?.hasAttribute('data-checked')).toBe(false);
  });

  it('checks a choice on click and reflects it via data-checked', () => {
    renderQuestionnaire();
    const input = screen.getByRole('radio', { name: 'Engineer' });
    fireEvent.click(input);
    expect(input).toHaveProperty('checked', true);
    const choice = input.closest(`.${styles.choice}`);
    expect(choice?.hasAttribute('data-checked')).toBe(true);
  });

  it('renders the progress indicator with the kit class and a role of progressbar', () => {
    renderQuestionnaire();
    const progress = screen.getByRole('progressbar');
    expect(progress.className).toContain(styles.progress);
    expect(progress.textContent).toContain('1');
  });

  it('hides Previous on the first item and Skip on a required item', () => {
    renderQuestionnaire();
    expect(navButton('Previous')).toHaveProperty('hidden', true);
    expect(navButton('Skip')).toHaveProperty('hidden', true);
    expect(navButton('Next')).toHaveProperty('hidden', false);
  });

  it('advances to the next item and reveals Previous', () => {
    renderQuestionnaire();
    fireEvent.click(screen.getByRole('radio', { name: 'Engineer' }));
    fireEvent.click(navButton('Next'));
    expect(screen.getByText('Anything else?').closest('fieldset')).toHaveProperty(
      'hidden',
      false,
    );
    expect(navButton('Previous')).toHaveProperty('hidden', false);
  });

  it('composes the kit Input for the freeform item via the render prop', () => {
    renderQuestionnaire();
    fireEvent.click(screen.getByRole('radio', { name: 'Engineer' }));
    fireEvent.click(navButton('Next'));
    const input = screen.getByPlaceholderText('Optional notes') as HTMLInputElement;
    expect(input.className).toContain('input');
    fireEvent.change(input, { target: { value: 'Looking forward to it' } });
    expect(input.value).toBe('Looking forward to it');
  });

  it('shows Submit instead of Next on the last item', () => {
    renderQuestionnaire();
    fireEvent.click(screen.getByRole('radio', { name: 'Engineer' }));
    fireEvent.click(navButton('Next'));
    expect(navButton('Submit')).toHaveProperty('hidden', false);
    expect(navButton('Next')).toHaveProperty('hidden', true);
  });

  it('renders a checkbox-type choice when the item is multiple', () => {
    render(
      <Questionnaire items={[{ name: 'tags', choices: [{ value: 'a' }] }]} defaultItem="tags">
        <QuestionnaireItem name="tags" multiple>
          <QuestionnaireChoices>
            <QuestionnaireChoice value="a">A</QuestionnaireChoice>
          </QuestionnaireChoices>
        </QuestionnaireItem>
      </Questionnaire>,
    );
    const input = screen.getByRole('checkbox', { name: 'A' });
    expect(input.getAttribute('type')).toBe('checkbox');
    expect(input.closest(`.${styles.choice}`)?.getAttribute('data-type')).toBe('checkbox');
  });

  it('marks a required, unanswered item invalid via data-invalid once attempted', () => {
    render(
      <Questionnaire items={[{ name: 'role', required: true }]} defaultItem="role">
        <QuestionnaireItem name="role" required invalid>
          <QuestionnaireError />
        </QuestionnaireItem>
      </Questionnaire>,
    );
    const error = screen.getByRole('alert');
    expect(error.className).toContain(styles.error);
    expect(error).toHaveProperty('hidden', false);
  });

  it('disables a choice marked disabled and dims it', () => {
    render(
      <Questionnaire
        items={[{ name: 'role', choices: [{ value: 'a', disabled: true }] }]}
        defaultItem="role"
      >
        <QuestionnaireItem name="role">
          <QuestionnaireChoices>
            <QuestionnaireChoice value="a" disabled>
              A
            </QuestionnaireChoice>
          </QuestionnaireChoices>
        </QuestionnaireItem>
      </Questionnaire>,
    );
    const input = screen.getByRole('radio', { name: 'A' });
    expect(input).toHaveProperty('disabled', true);
    expect(input.closest(`.${styles.choice}`)?.hasAttribute('data-disabled')).toBe(true);
  });
});
