import { vi } from 'vitest';

// @cpt-dod:cpt-frontx-dod-react-bindings-extension-slot:p1

type MockShadowHostTarget = HTMLElement | typeof HTMLDivElement;

/**
 * Makes getRootNode() resolve to a real shadow root backed by `host`.
 */
// @cpt-begin:cpt-frontx-dod-react-bindings-extension-slot:p1:inst-mock-shadow-host
export function mockShadowHost(
  target: MockShadowHostTarget,
  host: HTMLElement = document.createElement('div')
): { host: HTMLElement; shadowRoot: ShadowRoot } {
  const shadowRoot = host.attachShadow({ mode: 'open' });

  if (target === HTMLDivElement) {
    vi.spyOn(
      HTMLDivElement.prototype as Pick<HTMLElement, 'getRootNode'>,
      'getRootNode'
    ).mockReturnValue(shadowRoot);
  } else {
    vi.spyOn(target as Pick<HTMLElement, 'getRootNode'>, 'getRootNode').mockReturnValue(
      shadowRoot
    );
  }

  return { host, shadowRoot };
}
// @cpt-end:cpt-frontx-dod-react-bindings-extension-slot:p1:inst-mock-shadow-host
