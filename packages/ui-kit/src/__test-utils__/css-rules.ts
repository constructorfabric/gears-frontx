import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * A lightweight rule splitter, not a real CSS parser — shared by every test
 * that reads selector/declaration pairs out of a stylesheet (tokens.test.ts's
 * token-scale and theme-sync guards, button.test.tsx's focus-ring contrast
 * guard). Matches each innermost `selector { declarations-without-nested-braces }`
 * pair. An @media/@keyframes wrapper's own `{` never closes before hitting
 * the nested rule's `{`, so `[^{}]*` fails to match it and the wrapper is
 * skipped on its own — only real declaration blocks come out of this.
 * Comments are stripped first: otherwise the "selector" capture (which runs
 * back to the previous `}`) swallows whatever comment precedes the rule, and
 * prose mentioning a dotted filename (`theme.css`, `tokens.test.ts`) parses
 * as a bogus leading class.
 */

export interface CssRule {
  selector: string;
  body: string;
}

export function extractRules(css: string): CssRule[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  return Array.from(withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g), (match) => ({
    selector: (match[1] ?? '').trim(),
    // The trailing `}` the outer match consumes is put back onto the end
    // of `body` (not just left out) so a declaration-scanning regex can
    // use `[;}]` as its terminator and still catch a rule's LAST
    // declaration when it has no trailing semicolon (`padding: 12px }` —
    // valid CSS, invisible to a `;`-only terminator; see
    // tokens.test.ts's metric-scale guard, the case this was fixed for).
    body: `${match[2] ?? ''}}`,
  }));
}

export interface CssDeclaration {
  prop: string;
  value: string;
}

/*
 * Every declaration in a rule's body, in source order — custom properties
 * (`--foo: ...`) and ordinary properties (`color: ...`) alike, since
 * `[a-z-]` as the first character class matches both a letter and the
 * leading `-` of `--foo`.
 *
 * `[;}]` as the terminator, not `;` alone: a rule's last declaration is
 * valid CSS without a trailing semicolon (`padding: 12px }`), and a
 * `;`-only terminator never matches that declaration at all — silently
 * exempting it from whatever the caller checks. `body` always ends in `}`
 * (see extractRules), so this terminator always finds the end of the last
 * declaration whether or not the source had a semicolon there. The value
 * capture excludes both terminators so a `}`-terminated value doesn't carry
 * the brace along.
 *
 * The array is the primitive, not the map below: a guard scanning for a
 * banned value has to see BOTH declarations of a twice-declared property,
 * since collapsing to the winning one would hide the loser from the scan.
 */
export function declarations(body: string): CssDeclaration[] {
  return Array.from(body.matchAll(/([a-z-][a-z0-9-]*)\s*:\s*([^;}]+)[;}]/g), (match) => ({
    prop: match[1] ?? '',
    value: (match[2] ?? '').trim(),
  }));
}

/*
 * The same declarations as a name->value map, for callers comparing two
 * blocks token by token. Last declaration of a given name wins, matching
 * how the cascade would resolve two declarations of one property in a rule.
 */
export function declarationMap(body: string): Map<string, string> {
  return new Map(declarations(body).map(({ prop, value }) => [prop, value]));
}

/*
 * Reads one stylesheet and answers "what does this exact selector declare
 * for this property". For the tests that pin a drawn value jsdom cannot
 * compute (no layout). The FIRST rule with the selector is read, so a
 * selector repeated inside an @media block resolves to its plain copy.
 */
export function declaredIn(
  moduleUrl: string,
  file: string,
): (selector: string, prop: string) => string | undefined {
  // `moduleUrl` is the calling test's `import.meta.url`, and `file` sits
  // beside it. Not `new URL(file, import.meta.url)`: Vite rewrites that
  // pattern into an asset URL, which is no file path.
  const rules = extractRules(readFileSync(join(dirname(fileURLToPath(moduleUrl)), file), 'utf8'));
  return (selector, prop) => {
    const rule = rules.find((candidate) => candidate.selector === selector);
    return rule ? declarationMap(rule.body).get(prop) : undefined;
  };
}
