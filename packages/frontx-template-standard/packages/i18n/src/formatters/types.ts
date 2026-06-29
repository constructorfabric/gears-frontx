/**
 * Formatters type - Canonical type for the locale-aware formatters object.
 * Use this (e.g. UseFormattersReturn) instead of re-declaring the 10 function signatures.
 */

import type { formatDate, formatTime, formatDateTime, formatRelative } from './dateFormatter';
import type { formatNumber, formatPercent, formatCompact } from './numberFormatter';
import type { formatCurrency } from './currencyFormatter';
import type { compareStrings, createCollator } from './sortUtils';

export interface Formatters {
  formatDate: typeof formatDate;
  formatTime: typeof formatTime;
  formatDateTime: typeof formatDateTime;
  formatRelative: typeof formatRelative;
  formatNumber: typeof formatNumber;
  formatPercent: typeof formatPercent;
  formatCompact: typeof formatCompact;
  formatCurrency: typeof formatCurrency;
  compareStrings: typeof compareStrings;
  createCollator: typeof createCollator;
}
