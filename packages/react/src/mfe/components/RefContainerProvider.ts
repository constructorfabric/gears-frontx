/**
 * Ref Container Provider
 *
 * Concrete ContainerProvider that wraps a React ref.
 * Created by React components (like ExtensionDomainSlot) for use
 * by framework-level domain registration code.
 *
 * @packageDocumentation
 */
// @cpt-dod:cpt-hai3-dod-react-bindings-ref-container-provider:p1

import type { RefObject } from 'react';
import { ContainerProvider } from '@gears-frontx/framework';

/**
 * Concrete ContainerProvider that wraps a React ref.
 *
 * This provider reads the container element from a React ref at mount time.
 * It is designed to be created by React components but passed to domain
 * registration code (framework-level).
 *
 * Usage pattern:
 * 1. React component creates a ref via `useRef<HTMLDivElement>(null)`
 * 2. Framework-level code creates `RefContainerProvider` wrapping the ref
 * 3. Framework-level code passes the provider to `registerDomain(domain, provider)`
 * 4. When mount_ext is dispatched, the provider returns `ref.current`
 */
// @cpt-begin:cpt-hai3-dod-react-bindings-ref-container-provider:p1:inst-1
export class RefContainerProvider extends ContainerProvider {
  constructor(private readonly containerRef: RefObject<HTMLDivElement>) {
    super();
  }

  getContainer(_extensionId: string): Element {
    if (!this.containerRef.current) {
      throw new Error('Container ref is not attached -- component may not be mounted yet');
    }
    return this.containerRef.current;
  }

  releaseContainer(_extensionId: string): void {
    // No-op for React ref -- the ref lifecycle is managed by React.
    // Container cleanup happens when the component unmounts.
  }
}
// @cpt-end:cpt-hai3-dod-react-bindings-ref-container-provider:p1:inst-1
