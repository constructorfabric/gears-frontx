/**
 * Backward Compatibility Exports
 *
 * These exports provide backward compatibility with @gears-frontx/uicore API.
 * They are singletons that mirror the old API.
 *
 * NOTE: These are exported for migration convenience but may be deprecated
 * in future major versions. Prefer using the plugin architecture.
 */

// ACCOUNTS_DOMAIN constant for backward compatibility
// NOTE: AccountsApiService has been moved to CLI templates
// This constant is kept for legacy code that references it
export const ACCOUNTS_DOMAIN = 'accounts' as const;

// ============================================================================
// Singleton Registries (backward compatibility)
// ============================================================================
