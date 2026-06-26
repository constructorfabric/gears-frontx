// @cpt-component:cpt-frontx-component-cli:p1
// @cpt-constraint:cpt-frontx-constraint-cli-template-independence:p1
// Zero template content is bundled in this package.
// All template resolution happens at runtime via source-spec.

export { parseSourceSpec } from './spec-parser/parse.js';
export type { StructuredRef, ParseError, ParseResult } from './spec-parser/types.js';

export { resolveToInventory } from './resolver/resolve.js';
export type { FetchFn, InventoryReadyRecord, ResolutionError, ResolveResult } from './resolver/types.js';

export { TemplateInventory } from './inventory/TemplateInventory.js';
export { InventoryIndex } from './inventory/InventoryIndex.js';
export { InventoryStore } from './inventory/InventoryStore.js';
export { InventoryState } from './inventory/types.js';
export type { InventoryEntry, InventoryError, InventoryResult } from './inventory/types.js';

export { installCommand } from './commands/install.js';
export type { InstallCommandResult } from './commands/install.js';

export { listCommand } from './commands/list.js';
export type { ListEntry } from './commands/list.js';

export { updateLocalCommand } from './commands/update-local.js';
export type { UpdateLocalResult } from './commands/update-local.js';

export { validateManifestContract } from './manifest/validate-contract.js';
export { validateCommand } from './commands/validate.js';
export type {
  TemplateManifest,
  CompositionRef,
  ManifestViolation,
  ManifestValidationResult,
  ManifestValidationState,
  ReadFileFn,
} from './manifest/types.js';
export type { ValidateCommandResult } from './commands/validate.js';
export { MANIFEST_FILENAME, MANIFEST_SCHEMA_VERSION, RECOGNIZED_KINDS } from './manifest/types.js';
