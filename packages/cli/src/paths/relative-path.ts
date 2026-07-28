// Path-shape predicates shared by the modules that accept a path-like string
// from outside the CLI: a subtree segment in a developer-supplied source-spec
// and an identity a template's manifest declares. Both end up addressing a
// location under a root the CLI owns, so both answer to one rule rather than to
// two that can drift apart.

// A safe relative path: no surrounding whitespace, not absolute, no backslash,
// no unsafe character, and no empty, "." or ".." segment. Rejecting rather than
// normalizing keeps one spelling per addressed location and keeps the value
// unable to climb out of the root it is resolved against.
export function isSafeRelativePath(value: string): boolean {
  if (value.trim() !== value) return false;
  if (value.startsWith('/') || value.includes('\\')) return false;
  if (hasUnsafePathChar(value)) return false;
  return value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

// Characters that must never reach a filesystem adapter in a path-like value.
// A control character (NUL among them) makes the platform API throw, which
// escapes the result union every caller here returns instead. A colon carries a
// Windows drive designator, so `C:/outside` would be an absolute path on one
// platform and an ordinary relative segment on the other — neither a template
// identity nor a subtree segment has a legitimate use for either.
function hasUnsafePathChar(value: string): boolean {
  if (value.includes(':')) return true;
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

// Whether one identity would be materialized inside the other's content path.
// Identity is used as a path under the inventory root, so a scoped `@acme/tools`
// and an `@acme/tools/extra` occupy nested directories: a bounded update of the
// outer one clears its directory recursively and takes the inner one's files
// with it, leaving the inner template listed in the index with nothing on disk.
export function pathsNest(a: string, b: string): boolean {
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}
