'use client';

/*
 * The directive is load-bearing here, not just on portal-container.tsx: the
 * provider module is shared by every overlay that resolves a portal target,
 * so Rollup hoists it into a shared chunk and this entry publishes as a bare
 * re-export facade. The build derives each chunk's 'use client' banner from
 * the modules that chunk contains, and a facade contains only this file, so
 * the facade carries the banner only if this file declares it. The
 * client boundary is then visible at the subpath without following the
 * re-export (verify-consumer.sh checks an entry carries the banner exactly
 * when its public.ts declares it), and PortalContainerProvider reads
 * context in its render.
 */
export {
  PortalContainerProvider,
  type PortalContainerProviderProps,
  usePortalContainer,
  type PortalContainer,
} from './portal-container.js';
