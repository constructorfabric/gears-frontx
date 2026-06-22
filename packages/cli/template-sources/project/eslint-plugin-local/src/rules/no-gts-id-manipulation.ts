/**
 * @fileoverview Prevent explicit manipulation of GTS IDs.
 *
 * GTS IDs use two legitimate formats (URI `gts://...` in schema `$id`s and
 * plain entity IDs without the prefix). Application code must not embed
 * knowledge of these formats via regex replacement, splitting, or slicing —
 * that couples callers to an internal convention of the type system.
 *
 * Banned patterns (when applied to strings containing GTS markers):
 *   - `.replace(/^gts:\/\//, '')`
 *   - `.replace('gts://', '')`
 *   - `.split('~')` on GTS IDs
 *   - `.slice()` / `.substring()` / `.substr()` on GTS IDs
 *   - `.match()` / `.matchAll()` on GTS IDs
 *   - Regex literals containing `gts://` or `gts\\.` markers
 *   - String literals containing `gts://` used as transformation arguments
 *
 * Allowed (read-only predicates and equality):
 *   - `.includes(actionId)` / `.startsWith(...)` / `.endsWith(...)`
 *   - `id === otherId`
 *
 * @author Gears FrontX Team
 */

import type { Rule } from 'eslint';
import type { CallExpression, MemberExpression, Identifier, Literal } from 'estree';

const TRANSFORM_METHODS = new Set([
  'replace',
  'replaceAll',
  'split',
  'slice',
  'substring',
  'substr',
  'match',
  'matchAll',
]);

/** Substring markers that indicate GTS format knowledge in literals/regex source */
const GTS_MARKER_SUBSTRINGS = [
  'gts:', // URI scheme prefix (matches `gts://` in both plain strings and regex `gts:\\/\\/`)
  'gts.', // Entity ID prefix (matches `gts.frontx.mfes...`)
  String.raw`gts\.`, // Regex-escaped entity ID prefix (matches `/gts\./` literal in regex source)
];

function textContainsGtsMarker(text: string): boolean {
  return GTS_MARKER_SUBSTRINGS.some((m) => text.includes(m));
}

function literalContainsGtsMarker(node: Literal): boolean {
  if (typeof node.value === 'string') {
    return textContainsGtsMarker(node.value);
  }
  // RegExp literal (detected via node.regex in estree)
  const regexNode: Literal & { regex?: { pattern: string } } = node;
  if (regexNode.regex) {
    return textContainsGtsMarker(regexNode.regex.pattern);
  }
  return false;
}

function nodeContainsGtsMarker(
  node: CallExpression['arguments'][number] | MemberExpression['object'],
): boolean {
  if (node.type === 'Literal') return literalContainsGtsMarker(node);
  if (node.type === 'TemplateLiteral') {
    return node.quasis.some((q) => textContainsGtsMarker(q.value.raw));
  }
  return false;
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Prevent explicit manipulation of GTS IDs via string transformation methods (replace, split, slice, match, etc.) with GTS format markers.',
      category: 'Type System',
      recommended: true,
    },
    messages: {
      noManipulation:
        'GTS VIOLATION: Do not manipulate GTS IDs via `.{{method}}()` with GTS format markers. ' +
        'Both `gts://...` (schema $id) and plain entity IDs are legitimate formats — do not strip prefixes, split on `~`, or parse IDs. ' +
        'Use read-only predicates (`.includes()`, `.startsWith()`, `===`) or delegate to the type system.',
    },
    schema: [],
  },

  create(context: Rule.RuleContext): Rule.RuleListener {
    return {
      CallExpression(node: CallExpression) {
        if (node.callee.type !== 'MemberExpression') return;
        const callee = node.callee;
        if (callee.property.type !== 'Identifier') return;

        const method = callee.property.name;
        if (!TRANSFORM_METHODS.has(method)) return;

        // Flag when the receiver OR any argument embeds a GTS marker.
        // `'gts.foo...'.split('~')` has the marker on callee.object, not in args.
        const hasGtsMarker =
          nodeContainsGtsMarker(callee.object) ||
          node.arguments.some((arg) => nodeContainsGtsMarker(arg));
        if (!hasGtsMarker) return;

        context.report({
          node,
          messageId: 'noManipulation',
          data: { method },
        });
      },
    };
  },
};

export = rule;
