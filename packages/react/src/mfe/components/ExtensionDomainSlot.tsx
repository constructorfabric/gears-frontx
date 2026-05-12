/**
 * Extension Domain Slot Component
 *
 * Per-domain React component that provides the DOM root for a registered domain.
 * Delegates root attachment to the per-domain ExtensionMounter obtained from the
 * registry. What extensions live inside the root is a domain-policy concern (the
 * active MountStrategy plus the domain implementation's ContainerHooks), not a
 * slot-API concern.
 *
 * The slot is uniform across all cardinalities (Exclusive / Optional / Concurrent).
 * Mount and unmount actions are dispatched by the host application via
 * registry.executeActionsChain — NOT by this component.
 *
 * @packageDocumentation
 */
// @cpt-flow:cpt-frontx-flow-react-bindings-extension-domain-slot:p1
// @cpt-state:cpt-frontx-state-react-bindings-extension-slot:p1
// @cpt-dod:cpt-frontx-dod-react-bindings-extension-slot:p1

import React, { useEffect, useRef, useState } from 'react';
import type { MfeRegistry } from '@cyberfabric/framework';

/**
 * Props for ExtensionDomainSlot component
 */
export interface ExtensionDomainSlotProps {
  /**
   * The screensets registry instance.
   */
  registry: MfeRegistry;

  /**
   * The domain ID for this slot.
   */
  domainId: string;

  /**
   * Optional CSS class name for the root container div.
   */
  className?: string;

  /**
   * Optional callback invoked after mounter.attach(element) returns.
   * Receives the root element that was attached.
   */
  onAttached?: (root: Element) => void;

  /**
   * Optional callback invoked after mounter.detach() returns on cleanup.
   */
  onDetached?: () => void;

  /**
   * Optional loading placeholder rendered before the mounter has been attached.
   * Defaults to null (no visual placeholder).
   */
  loadingComponent?: React.ReactNode;
}

/**
 * Extension Domain Slot Component
 *
 * Renders a single root `<div>` per domain instance. On ref-attach, resolves the
 * per-domain mounter via registry.getMounter(domainId) and calls mounter.attach(element).
 * On cleanup, calls mounter.detach() which mass-unmounts every currently-mounted
 * extension in the domain so no orphan DOM trees or slice/registry desync remain.
 *
 * @example
 * ```tsx
 * <ExtensionDomainSlot
 *   registry={registry}
 *   domainId={HAI3_SCREEN_DOMAIN}
 *   loadingComponent={<Loading />}
 *   onAttached={(root) => console.log('Root attached:', root)}
 * />
 * ```
 */
// @cpt-begin:cpt-frontx-flow-react-bindings-extension-domain-slot:p1:inst-render-slot
// @cpt-begin:cpt-frontx-dod-react-bindings-extension-slot:p1:inst-render-slot
export function ExtensionDomainSlot(props: ExtensionDomainSlotProps): React.ReactElement {
  const {
    registry,
    domainId,
    className,
    onAttached,
    onDetached,
    loadingComponent = null,
  } = props;

  const rootRef = useRef<HTMLDivElement | null>(null);

  // Callbacks in refs so effect deps stay minimal — inline parent handlers do not
  // re-run the attach/detach effect on every parent render.
  const onAttachedRef = useRef(onAttached);
  const onDetachedRef = useRef(onDetached);
  onAttachedRef.current = onAttached;
  onDetachedRef.current = onDetached;

  // @cpt-begin:cpt-frontx-state-react-bindings-extension-slot:p1:inst-slot-attached
  // Tracks whether the mounter has been attached to the DOM root.
  // The loading placeholder is shown until attached becomes true.
  const [attached, setAttached] = useState(false);
  // @cpt-end:cpt-frontx-state-react-bindings-extension-slot:p1:inst-slot-attached

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    // @cpt-begin:cpt-frontx-flow-react-bindings-extension-domain-slot:p1:inst-attach-root
    // Resolve the per-domain mounter and attach the DOM root.
    // The mounter owns all per-extension container placement under this root.
    const mounter = registry.getMounter(domainId);
    mounter.attach(root);
    // @cpt-end:cpt-frontx-flow-react-bindings-extension-domain-slot:p1:inst-attach-root

    // @cpt-begin:cpt-frontx-state-react-bindings-extension-slot:p1:inst-slot-attached
    setAttached(true);
    // @cpt-end:cpt-frontx-state-react-bindings-extension-slot:p1:inst-slot-attached

    onAttachedRef.current?.(root);

    // @cpt-begin:cpt-frontx-flow-react-bindings-extension-domain-slot:p1:inst-detach-root
    return () => {
      // Mass-unmount every extension currently mounted in the domain.
      // detach() is async (awaits per-extension unmounts) but React cleanup is
      // synchronous; we deliberately fire-and-forget here.
      void mounter.detach();

      // @cpt-begin:cpt-frontx-state-react-bindings-extension-slot:p1:inst-slot-detached
      setAttached(false);
      // @cpt-end:cpt-frontx-state-react-bindings-extension-slot:p1:inst-slot-detached

      onDetachedRef.current?.();
    };
    // @cpt-end:cpt-frontx-flow-react-bindings-extension-domain-slot:p1:inst-detach-root
    // @cpt-begin:cpt-frontx-state-react-bindings-extension-slot:p2:inst-slot-stable-rerender
    // ATTACHED → ATTACHED (no-op) when parent supplies the same domainId and
    // registry on re-render: useEffect dep equality short-circuits the attach/detach pair.
  }, [registry, domainId]);
    // @cpt-end:cpt-frontx-state-react-bindings-extension-slot:p2:inst-slot-stable-rerender

  // @cpt-begin:cpt-frontx-flow-react-bindings-extension-domain-slot:p1:inst-show-loading
  // Render the loading placeholder until the mounter has been attached.
  // Once attached, render the root div with null children — multi-mount children
  // are placed imperatively under this root by the per-domain mounter.
  return (
    <div
      ref={rootRef}
      className={className}
      data-domain-id={domainId}
    >
      {!attached ? loadingComponent : null}
    </div>
  );
  // @cpt-end:cpt-frontx-flow-react-bindings-extension-domain-slot:p1:inst-show-loading
}
// @cpt-end:cpt-frontx-flow-react-bindings-extension-domain-slot:p1:inst-render-slot
// @cpt-end:cpt-frontx-dod-react-bindings-extension-slot:p1:inst-render-slot
