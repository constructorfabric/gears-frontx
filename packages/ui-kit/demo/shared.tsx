import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

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

/*
 * Renders its children, then prints what the browser actually laid them out
 * as. A size step is only shipped when the measured rect matches the drawn
 * number - the kit's CSS-source tests assert token names, not pixels, so
 * nothing in the test suite can catch a step that renders 34 where the
 * token says 32. This block is where that check happens, in both themes,
 * without anyone reading a screenshot.
 *
 * `of` maps a label to a CSS selector resolved inside this block's own
 * subtree, so a demo can measure the control, a part of it, or both.
 */
export function Measure({ of, children }: { of: Record<string, string>; children: ReactNode }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<string[]>([]);

  // `of` is an object literal at every call site, so its identity changes on
  // every render and would restart the effect each time it runs. A demo
  // block's selectors are static markup, so the first ones are the only
  // ones: freezing them in state gives the effect a stable dependency
  // without a ref written during render.
  const [targets] = useState(of);

  useLayoutEffect(() => {
    function measure() {
      const host = hostRef.current;
      if (!host) {
        return;
      }
      setRows(
        Object.entries(targets).map(([label, selector]) => {
          const element = host.querySelector(selector);
          if (!element) {
            return `${label}: no match for ${selector}`;
          }
          const rect = element.getBoundingClientRect();
          const computed = getComputedStyle(element);
          const box = `${round(rect.width)}x${round(rect.height)}`;
          const radius = computed.borderRadius;
          const padding = `${computed.paddingBlockStart}/${computed.paddingInlineStart}`;
          const type = `${computed.fontSize}/${computed.lineHeight} ${computed.fontWeight}`;
          return `${label}: ${box} radius ${radius} pad ${padding} type ${type}`;
        }),
      );
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [targets]);

  return (
    <div ref={hostRef} style={{ display: 'grid', gap: 'var(--space-3)' }}>
      {children}
      <pre
        style={{
          margin: 0,
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-micro-size)',
          lineHeight: 'var(--text-micro-line-height)',
          color: 'var(--muted-foreground)',
          whiteSpace: 'pre-wrap',
        }}
      >
        {rows.join('\n')}
      </pre>
    </div>
  );
}

// Sub-pixel rects are real (a flex row can land a control on 35.99), so the
// block reports two decimals and drops the trailing zeros rather than
// rounding a near-miss into a pass.
function round(value: number) {
  return Number(value.toFixed(2)).toString();
}
