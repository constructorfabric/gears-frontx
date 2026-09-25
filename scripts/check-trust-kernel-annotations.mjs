#!/usr/bin/env node

/**
 * MFE dynamic-code trust-kernel annotation check.
 *
 * ADR-0011 (cpt-frontx-adr-mfe-load-isolation) requires every exported
 * function-valued declaration in the audited trust kernel to carry a
 * documented safety rationale — the annotation contract .codacy.yaml's
 * exclusion for this file relies on. This script is that check.
 *
 * FAIL-CLOSED BY DESIGN. Recognizing a fixed list of export-form spellings
 * (`export function`, `export const f = () => {}`, `export default f`, ...)
 * and silently skipping anything outside that list is unsound: a spelling
 * the list does not name (`export const f = (() => {}) as Fn`, `...
 * satisfies Fn`, ...) passes unchecked, not because it was verified safe
 * but because it was never looked at — a list that must be exhaustive to
 * be safe is not a safety property, it is a to-do list.
 *
 * This script instead classifies EVERY exported declaration into exactly
 * one of three outcomes, with no fourth "didn't recognize it, moved on"
 * outcome:
 *
 *   - FUNCTION-VALUED — the declaration is (after unwrapping type-only
 *     wrappers: parens, `as`, `satisfies`, `!`, `<T>`) an arrow function or
 *     function expression, or a `function` declaration. Its own JSDoc is
 *     checked for a real, own-line, non-empty `@safety-reviewed` and `@why`.
 *   - DEFINITELY NOT FUNCTION-VALUED — a declaration whose value can never
 *     be a function by construction: a type/interface/enum declaration (no
 *     runtime value at all), or a variable initializer that is a literal
 *     (string/number/boolean/null/object/array/regex/template with no
 *     function inside it). No annotation is required or checked.
 *   - UNSUPPORTED — anything that is neither of the above: a call
 *     expression initializer (might return a function — `export const f =
 *     memoize(() => {})`), a re-export naming a binding this file has no
 *     local declaration for (an import re-export, or a re-export `from`
 *     another module), a destructured export, an exported class or
 *     namespace, or any expression/declaration shape this script has no
 *     case for. THIS OUTCOME FAILS THE CHECK, unconditionally, with a
 *     message naming the export and telling the reader to either extend
 *     this script to classify the form or rewrite the export so it is
 *     unambiguous. An export this script cannot understand must never pass
 *     silently.
 *
 * Tag recognition reads `ts.getJSDocTags(node)`, which returns real
 * `JSDocTag` nodes, and `tagStartsOwnLine` additionally requires the tag to
 * begin its own comment line (only the `*` gutter precedes its `@`) so that
 * a sentence merely mentioning "@why" mid-prose — which JSDoc's own grammar
 * would otherwise parse into a real tag node with real comment text — is
 * still rejected.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_KERNEL_FILE = path.resolve(
  __dirname,
  '../packages/mfes/src/handler/mfe-handler-mf/mf-dynamic-module-ops.ts',
);

/** Outcome tags for `classify*` functions. */
const FUNCTION_VALUED = 'function-valued';
const NOT_FUNCTION_VALUED = 'not-function-valued';
const UNSUPPORTED = 'unsupported';

/**
 * True when `tag` begins its own comment line — i.e. only the JSDoc `*`
 * gutter (and whitespace) precedes its `@` on that source line. A tag
 * parsed from prose that merely mentions "@tagname" mid-sentence fails
 * this, because real text precedes the `@` on that line.
 * @param {ts.JSDocTag} tag
 * @param {ts.SourceFile} sourceFile
 * @returns {boolean}
 */
function tagStartsOwnLine(tag, sourceFile) {
  const fullText = sourceFile.getFullText();
  const tagStart = tag.getStart(sourceFile);
  const { line } = sourceFile.getLineAndCharacterOfPosition(tagStart);
  const lineStartPos = sourceFile.getPositionOfLineAndCharacter(line, 0);
  const prefix = fullText.slice(lineStartPos, tagStart);
  return prefix.replace(/^[ \t]*\*?[ \t]*/, '') === '';
}

/**
 * @param {ts.NodeArray<ts.JSDocComment> | string | undefined} comment
 * @returns {string}
 */
function commentText(comment) {
  if (comment === undefined) return '';
  if (typeof comment === 'string') return comment;
  return ts.getTextOfJSDocComment(comment) ?? '';
}

/**
 * A tag counts as present only when it is a real `JSDocTag` node (not text
 * matching "@name" inside prose), starts its own comment line, and carries
 * a non-empty comment.
 * @param {ts.Node} node
 * @param {ts.SourceFile} sourceFile
 * @param {string} tagName
 * @returns {boolean}
 */
function hasRealNonEmptyTag(node, sourceFile, tagName) {
  const tags = ts.getJSDocTags(node);
  return tags.some(
    (tag) =>
      tag.tagName.text === tagName &&
      tagStartsOwnLine(tag, sourceFile) &&
      commentText(tag.comment).trim().length > 0,
  );
}

/** @param {ts.Node} node */
function hasExportModifier(node) {
  if (!ts.canHaveModifiers(node)) return false;
  const modifiers = ts.getModifiers(node) ?? [];
  return modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

/**
 * Unwrap every layer of a type-only wrapper expression — none of these
 * change the RUNTIME value being exported, only how TypeScript types it, so
 * unwrapping them cannot hide a function behind a "recognized non-function"
 * classification: `(expr)`, `expr as T`, `expr satisfies T`, `expr!`,
 * `<T>expr`.
 * @param {ts.Expression} expr
 * @returns {ts.Expression}
 */
function unwrapTypeOnly(expr) {
  let current = expr;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (ts.isParenthesizedExpression(current)) {
      current = current.expression;
    } else if (ts.isAsExpression(current)) {
      current = current.expression;
    } else if (ts.isSatisfiesExpression(current)) {
      current = current.expression;
    } else if (ts.isNonNullExpression(current)) {
      current = current.expression;
    } else if (ts.isTypeAssertionExpression(current)) {
      current = current.expression;
    } else {
      return current;
    }
  }
}

/** Expression kinds provably incapable of holding a function value. */
const LITERAL_EXPRESSION_KINDS = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NumericLiteral,
  ts.SyntaxKind.BigIntLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateExpression,
  ts.SyntaxKind.RegularExpressionLiteral,
  ts.SyntaxKind.TrueKeyword,
  ts.SyntaxKind.FalseKeyword,
  ts.SyntaxKind.NullKeyword,
  ts.SyntaxKind.ObjectLiteralExpression,
  ts.SyntaxKind.ArrayLiteralExpression,
]);

/**
 * Classify a value-bearing expression. `localDecls` resolves an identifier
 * reference back to a previously classified top-level declaration (so
 * `const f = () => {}; export default f;` inherits `f`'s classification);
 * an identifier this file has no local record of is UNSUPPORTED rather than
 * assumed safe, because it may be an imported function this script has no
 * way to inspect.
 * @param {ts.Expression} expr
 * @param {Map<string, { outcome: string, node: ts.Node }>} localDecls
 * @param {ts.Node} ownerNode
 * @returns {{ outcome: string, node: ts.Node, reason?: string }}
 */
function classifyExpression(expr, localDecls, ownerNode) {
  const unwrapped = unwrapTypeOnly(expr);

  if (ts.isArrowFunction(unwrapped) || ts.isFunctionExpression(unwrapped)) {
    return { outcome: FUNCTION_VALUED, node: ownerNode };
  }
  if (LITERAL_EXPRESSION_KINDS.has(unwrapped.kind)) {
    return { outcome: NOT_FUNCTION_VALUED, node: ownerNode };
  }
  if (ts.isIdentifier(unwrapped)) {
    const resolved = localDecls.get(unwrapped.text);
    if (resolved !== undefined) {
      return { outcome: resolved.outcome, node: resolved.node };
    }
    return {
      outcome: UNSUPPORTED,
      node: ownerNode,
      reason: `references "${unwrapped.text}", which has no local declaration in this file (an import?) — this script cannot verify a binding it cannot inspect`,
    };
  }
  return {
    outcome: UNSUPPORTED,
    node: ownerNode,
    reason: `initializer is a ${ts.SyntaxKind[unwrapped.kind]}, which this script has no classification rule for — it may or may not be function-valued at runtime (e.g. a call expression could return a function)`,
  };
}

/**
 * Enumerate every top-level statement's classification, in three groups:
 * `checked` (function-valued exports to verify annotations on), `skipped`
 * (exports provably not function-valued), and `unsupported` (exports this
 * script refuses to pass silently). Every exported declaration lands in
 * exactly one of these three lists — there is no fourth "ignored" case.
 * @param {ts.SourceFile} sourceFile
 * @returns {{
 *   checked: Array<{ name: string, node: ts.Node }>,
 *   unsupported: Array<{ name: string, reason: string }>,
 * }}
 */
function classifyExports(sourceFile) {
  /** @type {Map<string, { outcome: string, node: ts.Node }>} */
  const localDecls = new Map();
  /** @type {Array<{ name: string, node: ts.Node }>} */
  const checked = [];
  /** @type {Array<{ name: string, reason: string }>} */
  const unsupported = [];

  /**
   * @param {string} name
   * @param {{ outcome: string, node: ts.Node, reason?: string }} classification
   * @param {boolean} isExported
   */
  const record = (name, classification, isExported) => {
    localDecls.set(name, { outcome: classification.outcome, node: classification.node });
    if (!isExported) return;
    if (classification.outcome === FUNCTION_VALUED) {
      checked.push({ name, node: classification.node });
    } else if (classification.outcome === UNSUPPORTED) {
      unsupported.push({ name, reason: classification.reason ?? 'unsupported export form' });
    }
    // NOT_FUNCTION_VALUED exported declarations need no further action.
  };

  for (const statement of sourceFile.statements) {
    const isExported = hasExportModifier(statement);

    if (ts.isFunctionDeclaration(statement)) {
      const name = statement.name?.text ?? '(default)';
      record(name, { outcome: FUNCTION_VALUED, node: statement }, isExported);
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      // A `let`/`var` binding can be reassigned after its declaration — its
      // INITIALIZER shape proves nothing about what the binding holds by
      // the time anything imports it (`export let f = 0; f = () => 1;` is
      // exported-function-valued at runtime despite a numeric literal
      // initializer). Only `const` makes the initializer's classification
      // trustworthy for the binding's entire lifetime, so any mutable
      // exported binding is UNSUPPORTED regardless of what its initializer
      // looks like — conservative by construction, not by enumerating the
      // ways a reassignment could hide a function.
      const isMutable = (statement.declarationList.flags & ts.NodeFlags.Const) === 0;

      for (const decl of statement.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) {
          if (isExported) {
            unsupported.push({
              name: decl.name.getText(sourceFile),
              reason: 'destructuring export pattern — this script cannot classify individual bound names',
            });
          }
          continue;
        }
        const classification = isMutable
          ? {
              outcome: UNSUPPORTED,
              node: statement,
              reason: 'exported via a mutable (let/var) binding — a later reassignment could make it function-valued regardless of its initializer, which this script cannot verify; use const, or accept this failing until reviewed',
            }
          : decl.initializer === undefined
            ? { outcome: NOT_FUNCTION_VALUED, node: statement }
            : classifyExpression(decl.initializer, localDecls, statement);
        record(decl.name.text, classification, isExported);
      }
      continue;
    }

    // Type-level declarations carry no runtime value at all, so they can
    // never be function-valued — this is knowable from the declaration
    // kind alone, with no need to inspect content.
    if (
      ts.isTypeAliasDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isEnumDeclaration(statement)
    ) {
      if (isExported) {
        // Not registered in localDecls: these produce no runtime binding a
        // value-position `export { X }` or identifier reference could name.
      }
      continue;
    }

    if (ts.isExportDeclaration(statement)) {
      // `export * from './other'` or `export { x } from './other'` — no
      // local declaration exists in this file to check.
      if (statement.moduleSpecifier !== undefined) {
        const label = statement.exportClause === undefined ? '*' : 'named re-export';
        unsupported.push({
          name: `export ${label} from another module`,
          reason: 'this script only inspects local declarations in this file; a re-export from another module cannot be checked here',
        });
        continue;
      }
      const clause = statement.exportClause;
      if (clause === undefined || !ts.isNamedExports(clause)) continue;
      for (const element of clause.elements) {
        const localName = (element.propertyName ?? element.name).text;
        const resolved = localDecls.get(localName);
        if (resolved === undefined) {
          unsupported.push({
            name: element.name.text,
            reason: `re-exports "${localName}", which has no local declaration this script tracked earlier in the file`,
          });
        } else if (resolved.outcome === FUNCTION_VALUED) {
          checked.push({ name: element.name.text, node: resolved.node });
        } else if (resolved.outcome === UNSUPPORTED) {
          unsupported.push({
            name: element.name.text,
            reason: `re-exports "${localName}", whose own declaration this script could not classify`,
          });
        }
      }
      continue;
    }

    // `ExportAssignment` covers BOTH `export default <expr>;` and the
    // CommonJS-style `export = <expr>;` — it is an export by virtue of
    // being this specific statement kind, not via a modifier, so it is
    // handled here unconditionally rather than being gated behind the
    // `isExported`/`hasExportModifier` check the rest of this loop uses
    // (which returns false for this node kind and would otherwise let it
    // fall through to the bottom catch-all with `isExported` wrongly false
    // — the exact silent-skip bug this rewrite exists to close).
    if (ts.isExportAssignment(statement)) {
      if (statement.isExportEquals) {
        // `export = expr;` has no place in an ES module (this kernel is
        // one) and this script has no classification rule for it — fail
        // rather than silently ignore, so introducing one is caught
        // immediately instead of quietly bypassing the annotation contract.
        unsupported.push({
          name: 'export=',
          reason: 'export = assignment is a CommonJS-style export; this script only classifies ES module export forms',
        });
        continue;
      }
      const classification = classifyExpression(statement.expression, localDecls, statement);
      if (classification.outcome === FUNCTION_VALUED) {
        checked.push({ name: 'default', node: classification.node });
      } else if (classification.outcome === UNSUPPORTED) {
        unsupported.push({ name: 'default', reason: classification.reason ?? 'unsupported export form' });
      }
      continue;
    }

    // `export as namespace X;` (a `NamespaceExportDeclaration`) is, like
    // `ExportAssignment` above, an export by virtue of being this specific
    // statement kind rather than via a modifier — `hasExportModifier` would
    // return false for it and let it reach the bottom catch-all with
    // `isExported` wrongly false, the same silent-skip shape closed above.
    // It names no runtime value this script can classify, so it is
    // unsupported unconditionally.
    if (ts.isNamespaceExportDeclaration(statement)) {
      unsupported.push({
        name: statement.name.text,
        reason: 'export as namespace declares a UMD global name, not a function-valued binding; this script has no classification rule for it',
      });
      continue;
    }

    // Any other statement kind — ImportDeclaration/ImportEqualsDeclaration
    // (not exports, ignored), or anything exported this script has no case
    // for (ClassDeclaration, ModuleDeclaration, ...). An exported statement
    // of an unrecognized kind is UNSUPPORTED, never silently ignored.
    if (isExported) {
      const nameNode = ts.getNameOfDeclaration(
        /** @type {ts.Declaration} */ (/** @type {unknown} */ (statement)),
      );
      unsupported.push({
        name: nameNode !== undefined ? nameNode.getText(sourceFile) : '(unnamed)',
        reason: `exported ${ts.SyntaxKind[statement.kind]}, which this script has no classification rule for`,
      });
    }
  }

  return { checked, unsupported };
}

/**
 * The parser recovers from a syntax error by producing its best-effort AST
 * for the rest of the file rather than stopping — which means a malformed
 * file can still yield statements this script classifies (or, worse, fails
 * to recognize as exports at all) as if the parse had succeeded cleanly. A
 * file the parser could not read cleanly must never produce a pass; this
 * reads the parser's own diagnostic list rather than re-deriving "is this
 * file well-formed" some other way. `parseDiagnostics` is populated by
 * `ts.createSourceFile` but not part of the public `ts.SourceFile` type, so
 * TypeScript itself cannot check this access — the runtime property has been
 * present and stable across TypeScript's parser for many major versions and
 * is how other tooling (including intellisense-adjacent tools built on this
 * compiler) reads the same information.
 * @param {ts.SourceFile} sourceFile
 * @returns {readonly ts.Diagnostic[]}
 */
function getParseDiagnostics(sourceFile) {
  const withParseDiagnostics = /** @type {{ parseDiagnostics?: readonly ts.Diagnostic[] }} */ (
    /** @type {unknown} */ (sourceFile)
  );
  return withParseDiagnostics.parseDiagnostics ?? [];
}

/**
 * @param {string} source
 * @param {string} kernelFile
 * @returns {Array<{ functionName: string, reason: string }>}
 */
function findViolations(source, kernelFile) {
  const sourceFile = ts.createSourceFile(
    kernelFile,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    ts.ScriptKind.TS,
  );

  const parseDiagnostics = getParseDiagnostics(sourceFile);
  if (parseDiagnostics.length > 0) {
    // Classification over a syntactically broken file is meaningless — do
    // not attempt it; fail on the parse error itself instead.
    return parseDiagnostics.map((diagnostic) => ({
      functionName: '(parse error)',
      reason: `${path.relative(process.cwd(), kernelFile)} did not parse cleanly: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`,
    }));
  }

  const { checked, unsupported } = classifyExports(sourceFile);
  /** @type {Array<{ functionName: string, reason: string }>} */
  const violations = [];

  for (const { name, node } of checked) {
    const hasSafetyReviewed = hasRealNonEmptyTag(node, sourceFile, 'safety-reviewed');
    const hasWhy = hasRealNonEmptyTag(node, sourceFile, 'why');
    if (!hasSafetyReviewed || !hasWhy) {
      const tags = [];
      if (!hasSafetyReviewed) tags.push('@safety-reviewed');
      if (!hasWhy) tags.push('@why');
      violations.push({
        functionName: name,
        reason: `missing ${tags.join(' and ')} as a real, own-line JSDoc tag with a non-empty value`,
      });
    }
  }

  for (const { name, reason } of unsupported) {
    violations.push({
      functionName: name,
      reason: `unsupported export form — extend check-trust-kernel-annotations.mjs to classify it, or rewrite the export so its runtime value is unambiguous (${reason})`,
    });
  }

  return violations;
}

function main() {
  const kernelFile = process.argv[2] ?? DEFAULT_KERNEL_FILE;
  const source = readFileSync(kernelFile, 'utf8');
  const violations = findViolations(source, kernelFile);

  if (violations.length > 0) {
    console.error(
      `TRUST-KERNEL ANNOTATION VIOLATION (cpt-frontx-adr-mfe-load-isolation): ${path.relative(process.cwd(), kernelFile)} has exported declarations that fail the annotation contract:`,
    );
    for (const { functionName, reason } of violations) {
      console.error(`  - ${functionName}: ${reason}`);
    }
    process.exit(1);
  }

  console.log(
    `Trust-kernel annotation check passed: every exported declaration in ${path.relative(process.cwd(), kernelFile)} is either verified (@safety-reviewed + @why) or provably not function-valued.`,
  );
  process.exit(0);
}

main();
