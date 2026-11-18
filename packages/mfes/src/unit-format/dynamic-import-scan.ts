/**
 * Comment/string/regex-aware scan for the dynamic `import(...)` calls of
 * emitted unit source that the mint-time rewrite turns into the
 * lazy-import ABI (`UnitDynamicImportRewriter`).
 *
 * Two shapes reach the ABI: a literal call — the first argument is one
 * string literal or a template literal with no substitution — and a statically bounded pattern — the first argument
 * is one template literal with at least one substitution and non-empty
 * fixed text before its first or after its last substitution. Anything
 * else (`import(expr)`, a concatenation, a template with no fixed text)
 * is fully opaque and is not reported. An optional second argument
 * (import attributes) and a trailing comma are tolerated; only the first
 * argument is read. The scan lives in the `./unit-format` contract
 * directory but is NOT re-exported through `index.ts`: the public
 * contract surface stays the fetch-list types.
 *
 * The scan is a small lexer, not a regex: it tracks code (with brace
 * depth inside `${...}`), line/block comments, string literals, template
 * literals and regex literals, so `import(` inside a string, comment or
 * regex cannot false-positive, an `import` separated from its `(` only by
 * whitespace and comments cannot slip through, and a member call such as
 * `obj.import(x)` is never read as a dynamic import. A `/` is read as a
 * regex opener when the last significant code character cannot end an
 * operand (start of input or one of `(,=:[!&|?{};+-*%^~<>` or the
 * `return` keyword); anything else is a division.
 *
 * One class per file (`runtime_style`).
 *
 * @packageDocumentation
 * @internal
 */

/** A located dynamic-import call: a literal specifier or a bounded pattern. */
export type DynamicImportCall =
  | {
      readonly kind: 'literal';
      /** Index of the `import` keyword. */
      readonly start: number;
      /** Index of the call's closing `)`. */
      readonly closeParen: number;
      /** The literal specifier's runtime value. */
      readonly specifier: string;
    }
  | {
      readonly kind: 'pattern';
      /** Index of the `import` keyword. */
      readonly start: number;
      /** Index of the call's closing `)`. */
      readonly closeParen: number;
      /** Index of the template literal's opening backtick. */
      readonly argStart: number;
      /** Index just past the template literal's closing backtick. */
      readonly argEnd: number;
    };

/** The first argument of a call, when it is a literal or a bounded pattern. */
type FirstArgument =
  | { kind: 'literal'; specifier: string; end: number }
  | { kind: 'pattern'; argStart: number; end: number };

export class DynamicImportScan {
  protected constructor() {}

  /** Every literal and bounded-pattern dynamic-import call, in source order. */
  static scanCalls(source: string): DynamicImportCall[] {
    const calls: DynamicImportCall[] = [];
    const n = source.length;
    const isWordChar = (c: string): boolean => /[\w$]/.test(c);
    // Frames: the top-level code, a template literal's text, and the code
    // of a `${...}` substitution (with its own brace depth, so a `}` that
    // closes an object literal does not end the substitution).
    type Frame = { type: 'code' | 'template'; depth: number };
    const stack: Frame[] = [{ type: 'code', depth: 0 }];
    const top = (): Frame => stack[stack.length - 1];
    // The last two significant code characters, for the regex/division and
    // member-access heuristics.
    let prev = '';
    let prev2 = '';
    const significant = (c: string): void => {
      prev2 = prev;
      prev = c;
    };
    let i = 0;
    while (i < n) {
      const c = source[i];
      if (top().type === 'template') {
        if (c === '\\') {
          i += 2;
          continue;
        }
        if (c === '`') {
          stack.pop();
          // A closed template ends an operand: a following `/` divides.
          significant('`');
          i += 1;
          continue;
        }
        if (c === '$' && source[i + 1] === '{') {
          stack.push({ type: 'code', depth: 0 });
          prev = '';
          prev2 = '';
          i += 2;
          continue;
        }
        i += 1;
        continue;
      }
      if (c === '/' && source[i + 1] === '/') {
        i += 2;
        while (i < n && source[i] !== '\n') i += 1;
        continue;
      }
      if (c === '/' && source[i + 1] === '*') {
        i += 2;
        while (i < n && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
        i += 2;
        continue;
      }
      if (c === "'" || c === '"') {
        i = DynamicImportScan.skipString(source, i);
        significant(c);
        continue;
      }
      if (c === '`') {
        stack.push({ type: 'template', depth: 0 });
        i += 1;
        continue;
      }
      if (c === '/') {
        const next = source[i + 1];
        if (
          prev === '' ||
          '(,=:[!&|?{};+-*%^~<>'.includes(prev) ||
          (next !== '/' && next !== '*' && DynamicImportScan.afterKeyword(source, i))
        ) {
          i = DynamicImportScan.skipRegex(source, i);
          significant('/');
          continue;
        }
        significant('/');
        i += 1;
        continue;
      }
      if (c === '{') {
        top().depth += 1;
        significant(c);
        i += 1;
        continue;
      }
      if (c === '}') {
        if (top().depth > 0) {
          top().depth -= 1;
        } else if (stack.length > 1) {
          // The substitution ends: back into the template's text.
          stack.pop();
          i += 1;
          continue;
        }
        significant(c);
        i += 1;
        continue;
      }
      if (/\s/.test(c)) {
        i += 1;
        continue;
      }
      if (c === 'i' && source.startsWith('import', i)) {
        const before = i > 0 ? source[i - 1] : '';
        const memberAccess = prev === '.' && prev2 !== '.';
        if (!isWordChar(before) && before !== '.' && !memberAccess) {
          const open = DynamicImportScan.skipTrivia(source, i + 'import'.length);
          if (source[open] === '(') {
            const first = DynamicImportScan.firstArgument(source, open + 1);
            if (first !== undefined) {
              const close = DynamicImportScan.callEnd(source, first.end);
              if (close !== undefined) {
                calls.push(
                  first.kind === 'literal'
                    ? {
                        kind: 'literal',
                        start: i,
                        closeParen: close,
                        specifier: first.specifier,
                      }
                    : {
                        kind: 'pattern',
                        start: i,
                        closeParen: close,
                        argStart: first.argStart,
                        argEnd: first.end,
                      }
                );
              }
            }
          }
          i = open;
          continue;
        }
      }
      significant(c);
      i += 1;
    }
    return calls;
  }

  /** Index after the whitespace and comments starting at `position`. */
  private static skipTrivia(source: string, position: number): number {
    const n = source.length;
    let i = position;
    for (;;) {
      while (i < n && /\s/.test(source[i])) i += 1;
      if (source[i] === '/' && source[i + 1] === '/') {
        i += 2;
        while (i < n && source[i] !== '\n') i += 1;
        continue;
      }
      if (source[i] === '/' && source[i + 1] === '*') {
        i += 2;
        while (i < n && !(source[i] === '*' && source[i + 1] === '/')) i += 1;
        i += 2;
        continue;
      }
      return i;
    }
  }

  /** Index just past the string literal opening at `open`. */
  private static skipString(source: string, open: number): number {
    const quote = source[open];
    let i = open + 1;
    while (i < source.length && source[i] !== quote) {
      if (source[i] === '\\') i += 1;
      i += 1;
    }
    return i + 1;
  }

  /** Index just past the regex literal (and its flags) opening at `open`. */
  private static skipRegex(source: string, open: number): number {
    const n = source.length;
    let i = open + 1;
    let inClass = false;
    while (i < n && source[i] !== '\n') {
      const r = source[i];
      if (r === '\\') {
        i += 1;
      } else if (r === '[') {
        inClass = true;
      } else if (r === ']') {
        inClass = false;
      } else if (r === '/' && !inClass) {
        break;
      }
      i += 1;
    }
    i += 1;
    while (i < n && /[a-z]/i.test(source[i])) i += 1;
    return i;
  }

  /**
   * The first argument of a call whose `(` sits just before `position`:
   * one string literal or one bounded template pattern, followed by `,` or
   * `)`. `undefined` for anything else — an opaque expression, a
   * concatenation, an unbounded template, a malformed literal.
   */
  private static firstArgument(
    source: string,
    position: number
  ): FirstArgument | undefined {
    const i = DynamicImportScan.skipTrivia(source, position);
    const quote = source[i];
    let first: FirstArgument | undefined;
    if (quote === "'" || quote === '"') {
      const end = DynamicImportScan.skipString(source, i);
      const specifier = DynamicImportScan.decodeString(
        source.slice(i + 1, end - 1)
      );
      if (specifier === undefined) return undefined;
      first = { kind: 'literal', specifier, end };
    } else if (quote === '`') {
      const walked = DynamicImportScan.templateEnd(source, i);
      if (walked === undefined) return undefined;
      if (walked.substitutions === 0) {
        // A template with no substitution is a string literal by another
        // spelling.
        const specifier = DynamicImportScan.decodeString(
          source.slice(i + 1, walked.end - 1)
        );
        if (specifier === undefined) return undefined;
        first = { kind: 'literal', specifier, end: walked.end };
      } else if (walked.bounded) {
        first = { kind: 'pattern', argStart: i, end: walked.end };
      } else {
        return undefined;
      }
    } else {
      return undefined;
    }
    const after = DynamicImportScan.skipTrivia(source, first.end);
    return source[after] === ',' || source[after] === ')' ? first : undefined;
  }

  /**
   * The index of the call's closing `)`, given the end of its first
   * argument: an optional second argument (import attributes) and an
   * optional trailing comma are tolerated and not read.
   */
  private static callEnd(source: string, firstEnd: number): number | undefined {
    let i = DynamicImportScan.skipTrivia(source, firstEnd);
    if (source[i] === ')') return i;
    if (source[i] !== ',') return undefined;
    i = DynamicImportScan.skipTrivia(source, i + 1);
    if (source[i] === ')') return i;
    const secondEnd = DynamicImportScan.skipBalanced(source, i, ',)');
    if (secondEnd === undefined) return undefined;
    i = secondEnd;
    if (source[i] === ',') i = DynamicImportScan.skipTrivia(source, i + 1);
    return source[i] === ')' ? i : undefined;
  }

  /**
   * The index of the first character of `terminators` at bracket depth
   * zero from `position`, reading past strings, templates and comments;
   * `undefined` when the source ends first.
   */
  private static skipBalanced(
    source: string,
    position: number,
    terminators: string
  ): number | undefined {
    const n = source.length;
    let depth = 0;
    let i = position;
    while (i < n) {
      const c = source[i];
      if (c === "'" || c === '"') {
        i = DynamicImportScan.skipString(source, i);
        continue;
      }
      if (c === '`') {
        const end = DynamicImportScan.templateEnd(source, i);
        if (end === undefined) return undefined;
        i = end.end;
        continue;
      }
      if (c === '/' && (source[i + 1] === '/' || source[i + 1] === '*')) {
        i = DynamicImportScan.skipTrivia(source, i);
        continue;
      }
      if (depth === 0 && terminators.includes(c)) return i;
      if (c === '(' || c === '[' || c === '{') depth += 1;
      if (c === ')' || c === ']' || c === '}') depth -= 1;
      i += 1;
    }
    return undefined;
  }

  /**
   * Walk a template literal opening at `open`: the index just past its
   * closing backtick, its substitution count and whether non-empty fixed
   * text sits before the first or after the last substitution.
   */
  private static templateEnd(
    source: string,
    open: number
  ): { end: number; substitutions: number; bounded: boolean } | undefined {
    const n = source.length;
    let i = open + 1;
    let substitutions = 0;
    let prefix = false;
    let sinceLast = false;
    while (i < n) {
      const c = source[i];
      if (c === '\\') {
        sinceLast = true;
        i += 2;
        continue;
      }
      if (c === '`') {
        return {
          end: i + 1,
          substitutions,
          bounded: substitutions > 0 && (prefix || sinceLast),
        };
      }
      if (c === '$' && source[i + 1] === '{') {
        if (substitutions === 0) prefix = sinceLast;
        substitutions += 1;
        sinceLast = false;
        const close = DynamicImportScan.skipBalanced(source, i + 2, '}');
        if (close === undefined) return undefined;
        i = close + 1;
        continue;
      }
      sinceLast = true;
      i += 1;
    }
    return undefined;
  }

  /**
   * The runtime value of a string literal's body, or `undefined` for an
   * escape this scan does not decode (a legacy octal escape or a
   * malformed `\x`/`\u`).
   */
  private static decodeString(body: string): string | undefined {
    let out = '';
    for (let i = 0; i < body.length; i += 1) {
      const c = body[i];
      if (c !== '\\') {
        out += c;
        continue;
      }
      i += 1;
      const e = body[i];
      const simple: Record<string, string> = {
        n: '\n',
        t: '\t',
        r: '\r',
        b: '\b',
        f: '\f',
        v: '\v',
        '0': '\0',
      };
      if (e === undefined) return undefined;
      if (e in simple) {
        if (e === '0' && /\d/.test(body[i + 1] ?? '')) return undefined;
        out += simple[e];
      } else if (e === 'x') {
        const hex = body.slice(i + 1, i + 3);
        if (!/^[0-9a-fA-F]{2}$/.test(hex)) return undefined;
        out += String.fromCharCode(parseInt(hex, 16));
        i += 2;
      } else if (e === 'u') {
        let hex: string;
        if (body[i + 1] === '{') {
          const close = body.indexOf('}', i + 2);
          if (close < 0) return undefined;
          hex = body.slice(i + 2, close);
          i = close;
        } else {
          hex = body.slice(i + 1, i + 5);
          i += 4;
        }
        if (!/^[0-9a-fA-F]{1,6}$/.test(hex)) return undefined;
        const code = parseInt(hex, 16);
        if (code > 0x10ffff) return undefined;
        out += String.fromCodePoint(code);
      } else if (/[1-9]/.test(e)) {
        return undefined;
      } else if (e === '\n') {
        // A line continuation contributes nothing.
      } else {
        out += e;
      }
    }
    return out;
  }

  /**
   * Whether the word ending just before `position` is `return` — the one
   * keyword after which a `/` opens a regex rather than divides (the
   * other expression keywords a regex may follow are covered by their
   * trailing significant character: `(`, `,`, `:` ...).
   */
  private static afterKeyword(source: string, position: number): boolean {
    let j = position;
    while (j > 0 && /\s/.test(source[j - 1])) j -= 1;
    const end = j;
    while (j > 0 && /[\w$]/.test(source[j - 1])) j -= 1;
    return source.slice(j, end) === 'return';
  }
}
