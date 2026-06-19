/**
 * MFE Module - MFE context and hooks for @gears-frontx/react
 *
 * Provides React integration for MFE components.
 */

export { MfeContext, useMfeContext, type MfeContextValue } from './MfeContext';
export { MfeProvider, type MfeProviderProps } from './MfeProvider';
export {
  useMfeBridge,
  useSharedProperty,
  useHostAction,
  useDomainExtensions,
  useRegisteredPackages,
  useActivePackage,
} from './hooks';
export { RefContainerProvider } from './components/RefContainerProvider';
export { ExtensionDomainSlot, type ExtensionDomainSlotProps } from './components/ExtensionDomainSlot';
