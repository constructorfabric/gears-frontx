// The same stylesheet, imported a second time for its text rather than its
// class map. A CSS module gives the hashed class names under a plain import
// and the compiled CSS under `?inline`; a screen needs both, and only the
// second can be handed to a shadow root.
import workspaceStyles from '../styles/workspace.module.css?inline';

/**
 * Puts this package's own layout CSS inside the shadow root a screen mounts
 * into, from an `initializeStyles` override on the lifecycle.
 *
 * The alternative - a plain `import './workspace.module.css'` - leaves
 * delivery to the federation build's CSS attribution, which is allowed to
 * hoist a stylesheet shared by two exposes into a common chunk. The
 * attribution list then comes out empty, the host injects nothing, and the
 * screen renders unstyled with no error anywhere. Travelling with the
 * lifecycle chunk cannot be lost that way.
 *
 * Kit component CSS needs none of this: the host imports the kit, and the
 * lifecycle clones every host stylesheet into the shadow root before this
 * runs - which is also why these rules win on equal specificity where they
 * override one.
 */
export function appendWorkspaceStyles(container: Element | ShadowRoot): void {
  const style = document.createElement('style');
  style.textContent = workspaceStyles;
  container.appendChild(style);
}
