// @cpt-dod:cpt-frontx-dod-ai-upgrade-orchestration-flow-complete:p1
// @cpt-dod:cpt-frontx-dod-template-ai-extensions-contract-conformance:p1
//
// Read-side projection of the CLI project-state contract used by extension
// discovery and upgrade orchestration. CLI-only ownership and recovery
// metadata are opaque to the kit, except for the status of bundle materialization.
export interface PreviousOrigin {
  origin: string;
  version: string;
}

export interface TemplateEntry {
  origin: string;
  version: string;
  targets: string[];
  previous?: PreviousOrigin;
  pendingPostCommit?: { ai: 'pending' | 'done' | 'not-required' };
}

export interface ProjectStateDocument {
  formatVersion: 1 | 2 | 3;
  templates: Record<string, TemplateEntry>;
  projectOwnedRoots: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function hasOriginVersion(value: unknown): boolean {
  return isRecord(value) && typeof value.origin === 'string' && typeof value.version === 'string';
}

function isTemplateEntry(value: unknown, formatVersion: number): value is TemplateEntry {
  if (!isRecord(value) || !hasOriginVersion(value) || !isStringArray(value.targets)) return false;
  if (value.previous !== undefined && !hasOriginVersion(value.previous)) return false;
  const pending = value.pendingPostCommit;
  if (pending === undefined) return true;
  if (formatVersion !== 3 || !isRecord(pending)) return false;
  return pending.ai === 'pending' || pending.ai === 'done' || pending.ai === 'not-required';
}

export function isProjectStateDocument(value: unknown): value is ProjectStateDocument {
  if (!isRecord(value)) return false;
  const { formatVersion, templates, projectOwnedRoots } = value;
  if (formatVersion !== 1 && formatVersion !== 2 && formatVersion !== 3) return false;
  if (!isRecord(templates) || !isStringArray(projectOwnedRoots)) return false;
  return Object.values(templates).every(entry => isTemplateEntry(entry, formatVersion));
}

// Looks up the `TemplateEntry` for the NAMED template in the project's
// single state document — `undefined` when the document's `templates` map
// holds no matching entry. A lookup, not a search: `templates` is already
// keyed by name.
export function selectTemplateEntry(document: ProjectStateDocument, templateName: string): TemplateEntry | undefined {
  return Object.prototype.hasOwnProperty.call(document.templates, templateName) ? document.templates[templateName] : undefined;
}
