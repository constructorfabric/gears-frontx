import { useState } from 'react';

import {
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
  QuestionnaireChoiceShortcut,
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
} from '@gears-frontx/ui-kit';

import { Section } from '../shared';

const ITEMS = [
  {
    name: 'role',
    choices: [{ value: 'engineer' }, { value: 'designer' }, { value: 'pm' }],
    required: true,
  },
  {
    name: 'interests',
    choices: [
      { value: 'frontend' },
      { value: 'backend' },
      { value: 'design-systems' },
      { value: 'devops' },
    ],
  },
  { name: 'team-size', choices: [{ value: 'solo' }, { value: 'small' }, { value: 'large' }] },
  { name: 'feedback' },
];

const SHORTCUT_ITEMS = [
  {
    name: 'plan',
    choices: [{ value: 'free' }, { value: 'pro' }, { value: 'enterprise', disabled: true }],
    required: true,
  },
];

function DefaultDemo() {
  const [result, setResult] = useState<string | null>(null);
  return (
    <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
      <Questionnaire
        items={ITEMS}
        defaultItem="role"
        style={{ maxWidth: '28rem' }}
        onSubmit={(event) => {
          event.preventDefault();
          setResult(JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))));
        }}
      >
        <QuestionnaireProgress />

        <QuestionnaireItem name="role" required>
          <QuestionnaireTitle>What's your primary role?</QuestionnaireTitle>
          <QuestionnaireChoices>
            <QuestionnaireChoice value="engineer">Engineer</QuestionnaireChoice>
            <QuestionnaireChoice value="designer">Designer</QuestionnaireChoice>
            <QuestionnaireChoice value="pm">Product manager</QuestionnaireChoice>
          </QuestionnaireChoices>
          <QuestionnaireError />
        </QuestionnaireItem>

        <QuestionnaireItem name="interests" multiple>
          <QuestionnaireTitle>What are you interested in?</QuestionnaireTitle>
          <QuestionnaireDescription>Pick as many as apply.</QuestionnaireDescription>
          <QuestionnaireChoices>
            <QuestionnaireChoice value="frontend">Frontend</QuestionnaireChoice>
            <QuestionnaireChoice value="backend">Backend</QuestionnaireChoice>
            <QuestionnaireChoice value="design-systems">Design systems</QuestionnaireChoice>
            <QuestionnaireChoice value="devops">DevOps</QuestionnaireChoice>
          </QuestionnaireChoices>
        </QuestionnaireItem>

        <QuestionnaireItem name="team-size">
          <QuestionnaireTitle>How big is your team?</QuestionnaireTitle>
          <QuestionnaireChoices>
            <QuestionnaireChoice value="solo">Just me</QuestionnaireChoice>
            <QuestionnaireChoice value="small">2-10 people</QuestionnaireChoice>
            <QuestionnaireChoice value="large">10+ people</QuestionnaireChoice>
          </QuestionnaireChoices>
        </QuestionnaireItem>

        <QuestionnaireItem name="feedback">
          <QuestionnaireTitle>Anything you'd like us to know?</QuestionnaireTitle>
          <QuestionnaireDescription>Optional — skip if nothing comes to mind.</QuestionnaireDescription>
          <QuestionnaireInput placeholder="Type your answer" />
        </QuestionnaireItem>

        <QuestionnaireActions>
          <QuestionnairePrevious />
          <QuestionnaireSkip />
          <QuestionnaireNext />
          <QuestionnaireSubmit />
        </QuestionnaireActions>
      </Questionnaire>

      {result && (
        <pre
          style={{
            margin: 0,
            maxWidth: '28rem',
            overflowX: 'auto',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-3)',
            backgroundColor: 'var(--muted)',
            color: 'var(--muted-foreground)',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-mono-size)',
          }}
        >
          {result}
        </pre>
      )}
    </div>
  );
}

function ShortcutsDemo() {
  return (
    <Questionnaire items={SHORTCUT_ITEMS} defaultItem="plan" shortcuts="letters" style={{ maxWidth: '28rem' }}>
      <QuestionnaireItem name="plan" required>
        <QuestionnaireTitle>Pick a plan</QuestionnaireTitle>
        <QuestionnaireChoices>
          <QuestionnaireChoice value="free">
            Free
            <QuestionnaireChoiceShortcut />
          </QuestionnaireChoice>
          <QuestionnaireChoice value="pro">
            Pro
            <QuestionnaireChoiceShortcut />
          </QuestionnaireChoice>
          <QuestionnaireChoice value="enterprise" disabled>
            Enterprise (contact us)
            <QuestionnaireChoiceShortcut />
          </QuestionnaireChoice>
        </QuestionnaireChoices>
        <QuestionnaireError />
      </QuestionnaireItem>
      <QuestionnaireActions>
        <QuestionnaireSubmit />
      </QuestionnaireActions>
    </Questionnaire>
  );
}

export default function QuestionnaireExample() {
  return (
    <>
      <Section title="Default">
        <DefaultDemo />
      </Section>

      <Section title="Shortcuts & disabled">
        <ShortcutsDemo />
      </Section>
    </>
  );
}
