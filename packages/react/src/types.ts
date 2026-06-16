/**
 * @gears-frontx/react - Type Definitions
 *
 * Core types for FrontX React bindings.
 * Provides type-safe hooks and components.
 *
 * Now using real imports from @gears-frontx/framework since packages are built together.
 */

import type { ReactNode } from 'react';
import type {
  HAI3Config,
  HAI3App,
  RootState,
  Language,
  Formatters,
  AccessQuery,
  AccessRecord,
} from '@gears-frontx/framework';
import type { MfeContextValue } from './mfe/MfeContext';

// Re-export imported types for convenience
export type { HAI3Config, HAI3App };

// ============================================================================
// API Hook Result Types
// ============================================================================

/**
 * HAI3-owned query result type.
 * Returned by useApiQuery — callers depend on this contract, not on TanStack internals.
 */
// @cpt-FEATURE:implement-endpoint-descriptors:p3
// @cpt-begin:implement-endpoint-descriptors:p3:inst-api-query-result
export interface ApiQueryResult<TData, TError = Error> {
  data: TData | undefined;
  error: TError | null;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  refetch: () => Promise<unknown>;
}
// @cpt-end:implement-endpoint-descriptors:p3:inst-api-query-result

/**
 * HAI3-owned suspense query result type.
 * Returned by useApiSuspenseQuery — callers depend on this contract, not on TanStack internals.
 */
// @cpt-begin:cpt-frontx-dod-request-lifecycle-use-api-query:p2:inst-suspense-query-result
export interface ApiSuspenseQueryResult<TData, TError = Error> {
  data: TData;
  error: TError | null;
  isFetching: boolean;
  refetch: () => Promise<void>;
}
// @cpt-end:cpt-frontx-dod-request-lifecycle-use-api-query:p2:inst-suspense-query-result

/**
 * HAI3-owned infinite query result type.
 * Returned by useApiInfiniteQuery for descriptor-driven pagination.
 */
// @cpt-begin:cpt-frontx-dod-request-lifecycle-use-api-query:p2:inst-infinite-query-result
export interface ApiInfiniteQueryResult<TPage, TError = Error> {
  data: readonly TPage[] | undefined;
  error: TError | null;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  isFetchingNextPage: boolean;
  isFetchingPreviousPage: boolean;
  fetchNextPage: () => Promise<void>;
  fetchPreviousPage: () => Promise<void>;
  refetch: () => Promise<void>;
}
// @cpt-end:cpt-frontx-dod-request-lifecycle-use-api-query:p2:inst-infinite-query-result

/**
 * HAI3-owned suspense infinite query result type.
 * Returned by useApiSuspenseInfiniteQuery for descriptor-driven pagination.
 */
// @cpt-begin:cpt-frontx-dod-request-lifecycle-use-api-query:p2:inst-suspense-infinite-query-result
export interface ApiSuspenseInfiniteQueryResult<TPage, TError = Error> {
  data: readonly TPage[];
  error: TError | null;
  isFetching: boolean;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  isFetchingNextPage: boolean;
  isFetchingPreviousPage: boolean;
  fetchNextPage: () => Promise<void>;
  fetchPreviousPage: () => Promise<void>;
  refetch: () => Promise<void>;
}
// @cpt-end:cpt-frontx-dod-request-lifecycle-use-api-query:p2:inst-suspense-infinite-query-result

/**
 * HAI3-owned mutation result type.
 * Returned by useApiMutation — callers depend on this contract, not on TanStack internals.
 */
// @cpt-begin:implement-endpoint-descriptors:p3:inst-api-mutation-result
export interface ApiMutationResult<TData, TError = Error, TVariables = void> {
  mutate: (variables: TVariables) => void;
  mutateAsync: (variables: TVariables) => Promise<TData>;
  isPending: boolean;
  error: TError | null;
  data: TData | undefined;
  reset: () => void;
}
// @cpt-end:implement-endpoint-descriptors:p3:inst-api-mutation-result

// ============================================================================
// Type Aliases
// ============================================================================

// From @gears-frontx/store
type Selector<TResult, TState = RootState> = (state: TState) => TResult;

// Language is imported from @gears-frontx/framework
type TranslationParams = Record<string, string | number | boolean>;

// ============================================================================
// FrontX Provider Props
// ============================================================================

/**
 * FrontX Provider Props
 * Props for the main FrontXProvider component.
 *
 * @example
 * ```tsx
 * <FrontXProvider config={{ devMode: true }}>
 *   <App />
 * </FrontXProvider>
 *
 * // With pre-built app
 * const app = createFrontX().use(microfrontends()).build();
 * <FrontXProvider app={app}>
 *   <App />
 * </FrontXProvider>
 *
 * // With MFE bridge (for MFE components)
 * <FrontXProvider mfeBridge={{ bridge, extensionId, domainId }}>
 *   <MyMfeApp />
 * </FrontXProvider>
 *
 * // QueryCache is resolved from the app's plugin composition
 * <FrontXProvider app={app}>
 *   <MyMfeApp />
 * </FrontXProvider>
 * ```
 */
export interface HAI3ProviderProps {
  /** Child components */
  children: ReactNode;
  /** FrontX configuration */
  config?: HAI3Config;
  /** Pre-built FrontX app instance (optional) */
  app?: HAI3App;
  /** MFE bridge context (for MFE components) */
  mfeBridge?: MfeContextValue;
}

// ============================================================================
// Hook Return Types
// ============================================================================

/**
 * useFrontX Hook Return Type
 * Returns the FrontX app instance from context.
 */
export type UseHAI3Return = HAI3App;

/**
 * useAppSelector Hook
 * Type-safe selector hook for Redux state.
 *
 * @template TResult - The result type of the selector
 */
export type UseAppSelector = <TResult>(selector: Selector<TResult>) => TResult;

/**
 * useAppDispatch Hook Return Type
 * Returns the typed dispatch function.
 */
export type UseAppDispatchReturn = (action: unknown) => unknown;

/**
 * useTranslation Hook Return Type
 * Translation utilities.
 */
export interface UseTranslationReturn {
  /** Translate a key */
  t: (key: string, params?: TranslationParams) => string;
  /** Current language */
  language: Language | null;
  /** Change language */
  setLanguage: (language: Language) => void;
  /** Check if current language is RTL */
  isRTL: boolean;
}

/**
 * useScreenTranslations Hook Return Type
 * Screen-level translation loading state.
 */
export interface UseScreenTranslationsReturn {
  /** Whether translations are loaded */
  isLoaded: boolean;
  /** Loading error (if any) */
  error: Error | null;
}

/**
 * useTheme Hook Return Type
 * Theme utilities.
 */
export interface UseThemeReturn {
  /** Current theme ID */
  currentTheme: string | undefined;
  /** All available themes */
  themes: Array<{ id: string; name: string }>;
  /** Change theme */
  setTheme: (themeId: string) => void;
}

/**
 * useFormatters Hook Return Type
 * Locale-aware formatters (locale from i18nRegistry.getLanguage()).
 * References @gears-frontx/i18n Formatters so signatures stay in sync.
 */
export type UseFormattersReturn = Formatters;

/**
 * useCanAccess Hook Return Type
 * Result of an RBAC access check.
 * allow is false until an explicit 'allow' decision arrives (pessimistic default).
 */
export interface UseCanAccessResult {
  allow: boolean;
  isResolving: boolean;
}

/**
 * CanAccess Component Props.
 * Pessimistic: renders `denied` (or `loading`) until an authoritative 'allow' arrives.
 */
export interface CanAccessProps<TRecord extends AccessRecord = AccessRecord> {
  query: AccessQuery<TRecord>;
  /** Content rendered when access is explicitly allowed. */
  allowed: ReactNode;
  /** Content rendered on deny or error. Defaults to null. */
  denied?: ReactNode;
  /** Optional slot shown while the decision is resolving. Falls back to `denied`. */
  loading?: ReactNode;
}
