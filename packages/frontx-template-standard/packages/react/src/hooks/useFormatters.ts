/**
 * useFormatters Hook - Locale-aware formatters
 *
 * Returns formatters that use i18nRegistry.getLanguage() internally.
 * Calls useTranslation() so the component re-renders when language changes.
 *
 * React Layer: L3
 */
// @cpt-flow:cpt-frontx-flow-react-bindings-use-formatters:p1
// @cpt-dod:cpt-frontx-dod-react-bindings-formatters-hook:p1

import { useMemo } from 'react';
import {
  formatDate as formatDateFn,
  formatTime as formatTimeFn,
  formatDateTime as formatDateTimeFn,
  formatRelative as formatRelativeFn,
  formatNumber as formatNumberFn,
  formatPercent as formatPercentFn,
  formatCompact as formatCompactFn,
  formatCurrency as formatCurrencyFn,
  compareStrings as compareStringsFn,
  createCollator as createCollatorFn,
} from '@gears-frontx/framework';
import type { UseFormattersReturn } from '../types';
import { useTranslation } from './useTranslation';

/**
 * Hook for accessing locale-aware formatters (date, number, currency, sort).
 *
 * Formatters use the current app language from i18nRegistry.getLanguage().
 * Re-renders when language changes via useTranslation() subscription.
 *
 * @returns Object with formatDate, formatTime, formatDateTime, formatRelative,
 *   formatNumber, formatPercent, formatCompact, formatCurrency, compareStrings, createCollator
 *
 * @example
 * ```tsx
 * const { formatDate, formatCurrency } = useFormatters();
 * return (
 *   <span>{formatDate(new Date(), 'short')}</span>
 *   <span>{formatCurrency(99.99, 'USD')}</span>
 * );
 * ```
 */
// @cpt-begin:cpt-frontx-flow-react-bindings-use-formatters:p1:inst-call-formatters
// @cpt-begin:cpt-frontx-dod-react-bindings-formatters-hook:p1:inst-call-formatters
export function useFormatters(): UseFormattersReturn {
  // @cpt-begin:cpt-frontx-flow-react-bindings-use-formatters:p1:inst-subscribe-via-translation
  // useTranslation() subscribes to language changes so this component re-renders
  // when language changes; formatters read i18nRegistry.getLanguage() at call time
  const { language } = useTranslation();
  // @cpt-end:cpt-frontx-flow-react-bindings-use-formatters:p1:inst-subscribe-via-translation

  // @cpt-begin:cpt-frontx-flow-react-bindings-use-formatters:p1:inst-return-formatters
  // @cpt-begin:cpt-frontx-flow-react-bindings-use-formatters:p1:inst-formatters-read-locale
  // @cpt-begin:cpt-frontx-flow-react-bindings-use-formatters:p1:inst-recompute-on-lang
  return useMemo<UseFormattersReturn>(
    () => {
      void language; // re-run when language changes so formatters see new locale
      return {
        formatDate: formatDateFn,
        formatTime: formatTimeFn,
        formatDateTime: formatDateTimeFn,
        formatRelative: formatRelativeFn,
        formatNumber: formatNumberFn,
        formatPercent: formatPercentFn,
        formatCompact: formatCompactFn,
        formatCurrency: formatCurrencyFn,
        compareStrings: compareStringsFn,
        createCollator: createCollatorFn,
      };
    },
    [language]
  );
  // @cpt-end:cpt-frontx-flow-react-bindings-use-formatters:p1:inst-return-formatters
  // @cpt-end:cpt-frontx-flow-react-bindings-use-formatters:p1:inst-formatters-read-locale
  // @cpt-end:cpt-frontx-flow-react-bindings-use-formatters:p1:inst-recompute-on-lang
}
// @cpt-end:cpt-frontx-flow-react-bindings-use-formatters:p1:inst-call-formatters
// @cpt-end:cpt-frontx-dod-react-bindings-formatters-hook:p1:inst-call-formatters
