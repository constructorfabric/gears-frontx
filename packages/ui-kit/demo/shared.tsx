import type { CSSProperties, ReactNode } from 'react';

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ display: 'grid', gap: 'var(--space-4)' }}>
      {/* Heading 1 off the ramp, not a hand-set 20/600 — the demo is the
          first thing a consumer copies from, and llms.txt tells them to use
          the roles rather than invent sizes. */}
      <h2
        style={{
          margin: 0,
          fontSize: 'var(--text-heading-1-size)',
          lineHeight: 'var(--text-heading-1-line-height)',
          fontWeight: 'var(--text-heading-1-weight)' as CSSProperties['fontWeight'],
          letterSpacing: 'var(--text-heading-1-tracking)',
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 'var(--space-3)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function DemoIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 2v12M2 8h12" strokeLinecap="round" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
    </svg>
  );
}
