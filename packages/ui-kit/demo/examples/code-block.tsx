import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockContent,
  CodeBlockCopyButton,
  CodeBlockFooter,
  CodeBlockHeader,
  CodeBlockLine,
  CodeBlockTitle,
} from '@gears-frontx/ui-kit';
import { FileCodeIcon, TerminalIcon } from 'lucide-react';

import { Section } from '../shared';

const INSTALL = 'npm install\nnpm run dev';
const LONG_LINE =
  'npx frontx create my-product --template github:example/templates@main//template-shell --yes';
const SOURCE = `export function greet(name: string) {
  const message = \`Hello, \${name}\`;

  return message;
}`;

export default function CodeBlockExample() {
  return (
    <>
      <Section title="Header">
        <CodeBlock>
          <CodeBlockHeader>
            <CodeBlockTitle>
              <TerminalIcon />
              Terminal
            </CodeBlockTitle>
            <CodeBlockActions>
              <CodeBlockCopyButton value={INSTALL} />
            </CodeBlockActions>
          </CodeBlockHeader>
          <CodeBlockContent aria-label="Install and start">{INSTALL}</CodeBlockContent>
        </CodeBlock>
      </Section>

      <Section title="Floating actions">
        <CodeBlock>
          <CodeBlockActions>
            <CodeBlockCopyButton value={INSTALL} />
          </CodeBlockActions>
          <CodeBlockContent aria-label="Install">{INSTALL}</CodeBlockContent>
        </CodeBlock>
      </Section>

      <Section title="Line numbers">
        <CodeBlock>
          <CodeBlockHeader>
            <CodeBlockTitle>
              <FileCodeIcon />
              src/greet.ts
            </CodeBlockTitle>
          </CodeBlockHeader>
          <CodeBlockContent aria-label="src/greet.ts" lineNumbers>
            {SOURCE}
          </CodeBlockContent>
        </CodeBlock>
      </Section>

      <Section title="Diff">
        <CodeBlock>
          <CodeBlockContent aria-label="Diff of greet.ts" lineNumbers>
            <CodeBlockLine>export function greet(name: string) {'{'}</CodeBlockLine>
            <CodeBlockLine variant="removed">{'  return `Hi ${name}`;'}</CodeBlockLine>
            <CodeBlockLine variant="added">{'  return `Hello, ${name}`;'}</CodeBlockLine>
            <CodeBlockLine>{'}'}</CodeBlockLine>
          </CodeBlockContent>
        </CodeBlock>
      </Section>

      <Section title="Wrap and small size">
        <div style={{ display: 'grid', gap: 'var(--space-3)', maxWidth: '20rem' }}>
          <CodeBlock size="sm">
            <CodeBlockContent aria-label="Create a project">{LONG_LINE}</CodeBlockContent>
          </CodeBlock>
          <CodeBlock size="sm">
            <CodeBlockContent aria-label="Create a project, wrapped" wrap>
              {LONG_LINE}
            </CodeBlockContent>
          </CodeBlock>
        </div>
      </Section>

      <Section title="Destructive with footer">
        <CodeBlock variant="destructive">
          <CodeBlockHeader>
            <CodeBlockTitle>Build failed</CodeBlockTitle>
          </CodeBlockHeader>
          <CodeBlockContent aria-label="Build error">
            {'Error: Cannot find module "./missing"'}
          </CodeBlockContent>
          <CodeBlockFooter>Exit code 1</CodeBlockFooter>
        </CodeBlock>
      </Section>
    </>
  );
}
