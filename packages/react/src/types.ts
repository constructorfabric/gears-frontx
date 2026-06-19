/**
 * @gears-frontx/react - Type Definitions
 *
 * Core types for HAI3 React bindings.
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
} from '@gears-frontx/framework';
import type { MfeContextValue } from './mfe/MfeContext';

// Re-export imported types for convenience
export type { HAI3Config, HAI3App };

// ============================================================================
// Type Aliases
// ============================================================================

// From @gears-frontx/store
type Selector<TResult, TState = RootState> = (state: TState) => TResult;

// Language is imported from @gears-frontx/framework
type TranslationParams = Record<string, string | number | boolean>;

// ============================================================================
// HAI3 Provider Props
// ============================================================================

/**
 * HAI3 Provider Props
 * Props for the main HAI3Provider component.
 *
 * @example
 * ```tsx
 * <HAI3Provider config={{ devMode: true }}>
 *   <App />
 * </HAI3Provider>
 *
 * // With pre-built app
 * const app = createHAI3().use(screensets()).use(microfrontends()).build();
 * <HAI3Provider app={app}>
 *   <App />
 * </HAI3Provider>
 *
 * // With MFE bridge (for MFE components)
 * <HAI3Provider mfeBridge={{ bridge, extensionId, domainId }}>
 *   <MyMfeApp />
 * </HAI3Provider>
 * ```
 */
export interface HAI3ProviderProps {
  /** Child components */
  children: ReactNode;
  /** HAI3 configuration */
  config?: HAI3Config;
  /** Pre-built HAI3 app instance (optional) */
  app?: HAI3App;
  /** MFE bridge context (for MFE components) */
  mfeBridge?: MfeContextValue;
}

// ============================================================================
// Hook Return Types
// ============================================================================

/**
 * useHAI3 Hook Return Type
 * Returns the HAI3 app instance from context.
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
