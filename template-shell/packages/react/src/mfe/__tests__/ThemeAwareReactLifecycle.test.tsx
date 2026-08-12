/**
 * Unit tests for the style-adoption half of ThemeAwareReactLifecycle.
 *
 * The cascade inside a shadow root is settled by document order once specificity
 * ties, so these cases assert the position of the adopted host stylesheets rather
 * than any computed colour: jsdom does not resolve a shadow-tree cascade, and the
 * position is the whole mechanism the invariant rests on.
 */
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { createFrontX, type ChildMfeBridge } from '@gears-frontx/framework';
import { ThemeAwareReactLifecycle } from '../ThemeAwareReactLifecycle';

/**
 * Stands in for the shell's Tailwind preflight. Neutral, test-owned CSS, but the
 * shape is the one that caused the defect: an attribute selector at specificity
 * (0,1,0) that ties with a single-class component rule.
 */
const HOST_PREFLIGHT_CSS = "button, [type='submit'] { background-color: transparent; }";

const HOST_LINK_HREF = 'https://shell.test/assets/shell.css';

/** Stands in for the MFE's compiled stylesheet, which MfeHandlerMF injects before mount. */
const MFE_BUTTON_CSS = '._variantDefault { background-color: var(--primary); }';

const MFE_LINK_HREF = 'https://remote.test/assets/blank-mfe.css';

class ProbeLifecycle extends ThemeAwareReactLifecycle {
  /** Widens the protected hook so a case can exercise adoption without a full mount. */
  adoptInto(shadowRoot: ShadowRoot): void {
    this.adoptHostStylesIntoShadowRoot(shadowRoot);
  }

  protected renderContent(_bridge: ChildMfeBridge): React.ReactNode {
    return null;
  }
}

function adoptIntoFreshLifecycle(shadowRoot: ShadowRoot): void {
  new ProbeLifecycle(createFrontX().build()).adoptInto(shadowRoot);
}

function appendHostStyle(css: string): void {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
}

function appendHostLink(href: string): void {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

function shadowRootHoldingMfeStyle(css: string): ShadowRoot {
  const shadowRoot = document.createElement('div').attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = css;
  shadowRoot.appendChild(style);
  return shadowRoot;
}

function shadowRootHoldingMfeLink(href: string): ShadowRoot {
  const shadowRoot = document.createElement('div').attachShadow({ mode: 'open' });
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  shadowRoot.appendChild(link);
  return shadowRoot;
}

/** Identifies each stylesheet node in cascade order: inline CSS for a style, href for a link. */
function cascadeOrder(shadowRoot: ShadowRoot): string[] {
  return Array.from(shadowRoot.querySelectorAll('style, link[rel="stylesheet"]')).map((el) =>
    el instanceof HTMLLinkElement ? el.href : (el.textContent ?? '')
  );
}

describe('ThemeAwareReactLifecycle.adoptHostStylesIntoShadowRoot', () => {
  afterEach(() => {
    document.head.querySelectorAll('style, link[rel="stylesheet"]').forEach((el) => el.remove());
  });

  it('places the adopted host stylesheet ahead of an MFE stylesheet already in the shadow root, so a tied host rule cannot win on document order', () => {
    appendHostStyle(HOST_PREFLIGHT_CSS);
    const shadowRoot = shadowRootHoldingMfeStyle(MFE_BUTTON_CSS);

    adoptIntoFreshLifecycle(shadowRoot);

    expect(cascadeOrder(shadowRoot)).toEqual([HOST_PREFLIGHT_CSS, MFE_BUTTON_CSS]);
  });

  it('places adopted host <link> stylesheets ahead of the MFE <link> that MfeHandlerMF injected before mount', () => {
    appendHostLink(HOST_LINK_HREF);
    const shadowRoot = shadowRootHoldingMfeLink(MFE_LINK_HREF);

    adoptIntoFreshLifecycle(shadowRoot);

    expect(cascadeOrder(shadowRoot)).toEqual([HOST_LINK_HREF, MFE_LINK_HREF]);
  });

  it('keeps adopted styles ahead of adopted links within the block it moves to the front', () => {
    appendHostStyle(HOST_PREFLIGHT_CSS);
    appendHostLink(HOST_LINK_HREF);
    const shadowRoot = shadowRootHoldingMfeStyle(MFE_BUTTON_CSS);

    adoptIntoFreshLifecycle(shadowRoot);

    expect(cascadeOrder(shadowRoot)).toEqual([HOST_PREFLIGHT_CSS, HOST_LINK_HREF, MFE_BUTTON_CSS]);
  });

  it('leaves the MFE stylesheet last when styles arrive after adoption, as initializeStyles adds them', () => {
    appendHostStyle(HOST_PREFLIGHT_CSS);
    const shadowRoot = shadowRootHoldingMfeStyle(MFE_BUTTON_CSS);

    adoptIntoFreshLifecycle(shadowRoot);
    const lateStyle = document.createElement('style');
    lateStyle.textContent = ':host { color: red; }';
    shadowRoot.appendChild(lateStyle);

    expect(cascadeOrder(shadowRoot)).toEqual([
      HOST_PREFLIGHT_CSS,
      MFE_BUTTON_CSS,
      ':host { color: red; }',
    ]);
  });
});
