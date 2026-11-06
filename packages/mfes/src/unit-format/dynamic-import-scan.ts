/**
 * Comment/string/regex-aware scan for a dynamic `import(...)` in emitted
 * unit or pack source.
 *
 * A unit MAY carry a dynamic `import(...)` with a literal specifier: at
 * mint time the runtime rewrites each literal call whose target resolves
 * to a unit (a relative module of the same package, or a shared
 * package/subpath) into the per-load lazy resolver, and leaves
 * non-literal calls untouched (see `graph-file.ts`). The scan is used by
 * the mint-time rewriter (`UnitDynamicImportRewriter`), so it lives in
 * the `./unit-format` contract directory — it is NOT re-exported through
 * `index.ts`: the public contract surface stays types plus
 * `UnitFormatConformance`.
 *
 * The scan is a small lexer, not a regex: it tracks code, line/block
 * comments, string literals, template literals (including code nested in
 * `${...}`), and regex literals, so `import(` inside a string, comment
 * or regex cannot false-positive and an `import` separated from its
 * `(` only by whitespace and comments cannot slip through. A `/` is
 * read as a regex opener when the last significant
 * code character cannot end an operand (start of input or one of
 * `(,=:[!&|?{};+-*%^~<>` or the `return` keyword); anything else is a
 * division and scanning continues in code state.
 *
 * One class per file (`runtime_style`).
 *
 * @packageDocumentation
 * @internal
 */
/** A dynamic `import('<literal>')` call site the scanner located. */
export interface DynamicImportLiteralCall {
  /** Index of the `import` keyword. */
  readonly start: number;
  /** Index of the call's `(` (after any whitespace/comments). */
  readonly openParen: number;
  /** Index of the call's closing `)`. */
  readonly closeParen: number;
  /** The literal specifier text, unquoted. */
  readonly specifier: string;
}

export class DynamicImportScan {
  protected constructor() {}

  /** Whether `source` carries a dynamic `import(...)` call. */
  static containsDynamicImport(source: string): boolean {
    const n = source.length;
    const isWordChar = (c: string): boolean => /[\w$]/.test(c);
    // 'code' | 'template' frames; `${` pushes 'code', the matching `}`
    // pops back to the template literal it interrupted.
    const stack: Array<'code' | 'template'> = ['code'];
    const top = (): 'code' | 'template' => stack[stack.length - 1];
    // Last significant code character, for the regex/division heuristic.
    let lastSignificant = '';
    let i = 0;
    while (i < n) {
      const c = source[i];
      if (top() === 'template') {
        if (c === '\\') {
          i += 2;
          continue;
        }
        if (c === '`') {
          stack.pop();
          i += 1;
          continue;
        }
        if (c === '$' && source[i + 1] === '{') {
          stack.push('code');
          i += 2;
          continue;
        }
        i += 1;
        continue;
      }
      // code state
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
        const quote = c;
        i += 1;
        while (i < n && source[i] !== quote) {
          if (source[i] === '\\') i += 1;
          i += 1;
        }
        i += 1;
        lastSignificant = quote;
        continue;
      }
      if (c === '`') {
        stack.push('template');
        i += 1;
        continue;
      }
      if (c === '/') {
        const next = source[i + 1];
        if (
          lastSignificant === '' ||
          '(,=:[!&|?{};+-*%^~<>'.includes(lastSignificant) ||
          (next !== '/' && next !== '*' && DynamicImportScan.afterKeyword(source, i))
        ) {
          // regex literal — scan to its unescaped '/', honouring classes.
          i += 1;
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
          // regex flags
          while (i < n && /[a-z]/i.test(source[i])) i += 1;
          lastSignificant = '/';
          continue;
        }
        lastSignificant = '/';
        i += 1;
        continue;
      }
      if (c === '}') {
        if (stack.length > 1) stack.pop();
        lastSignificant = '}';
        i += 1;
        continue;
      }
      if (/\s/.test(c)) {
        i += 1;
        continue;
      }
      if (c === 'i' && source.startsWith('import', i)) {
        const prev = i > 0 ? source[i - 1] : '';
        if (!isWordChar(prev) && prev !== '.') {
          // Skip whitespace AND comments between `import` and `(`.
          let j = i + 'import'.length;
          for (;;) {
            while (j < n && /\s/.test(source[j])) j += 1;
            if (source[j] === '/' && source[j + 1] === '/') {
              j += 2;
              while (j < n && source[j] !== '\n') j += 1;
              continue;
            }
            if (source[j] === '/' && source[j + 1] === '*') {
              j += 2;
              while (
                j < n &&
                !(source[j] === '*' && source[j + 1] === '/')
              ) {
                j += 1;
              }
              j += 2;
              continue;
            }
            break;
          }
          if (source[j] === '(') return true;
          i = j;
          continue;
        }
      }
      lastSignificant = c;
      i += 1;
    }
    return false;
  }

  /**
   * Every `import('<literal>')` call site in `source` — dynamic-import
   * calls whose entire argument list is one string literal (whitespace
   * and comments tolerated inside the parens). Uses the same
   * comment/string/template/regex-aware lexing as
   * {@link containsDynamicImport}, so an `import(` inside a string,
   * comment, template literal text or regex is never reported and an
   * `import` separated from its `(` only by whitespace and comments is.
   * A call with a non-literal argument (`import(expr)`, `import('x' + y)`,
   * `import()` with several arguments) is not reported: the mint-time
   * rewriter leaves those untouched. A literal containing a backslash
   * escape is not reported either — its runtime value may differ from
   * the source text.
   */
  static literalCalls(source: string): DynamicImportLiteralCall[] {
    const calls: DynamicImportLiteralCall[] = [];
    const n = source.length;
    const isWordChar = (c: string): boolean => /[\w$]/.test(c);
    const stack: Array<'code' | 'template'> = ['code'];
    const top = (): 'code' | 'template' => stack[stack.length - 1];
    let lastSignificant = '';
    let i = 0;
    while (i < n) {
      const c = source[i];
      if (top() === 'template') {
        if (c === '\\') {
          i += 2;
          continue;
        }
        if (c === '`') {
          stack.pop();
          i += 1;
          continue;
        }
        if (c === '$' && source[i + 1] === '{') {
          stack.push('code');
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
        const quote = c;
        i += 1;
        while (i < n && source[i] !== quote) {
          if (source[i] === '\\') i += 1;
          i += 1;
        }
        i += 1;
        lastSignificant = quote;
        continue;
      }
      if (c === '`') {
        stack.push('template');
        i += 1;
        continue;
      }
      if (c === '/') {
        const next = source[i + 1];
        if (
          lastSignificant === '' ||
          '(,=:[!&|?{};+-*%^~<>'.includes(lastSignificant) ||
          (next !== '/' && next !== '*' && DynamicImportScan.afterKeyword(source, i))
        ) {
          i += 1;
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
          lastSignificant = '/';
          continue;
        }
        lastSignificant = '/';
        i += 1;
        continue;
      }
      if (c === '}') {
        if (stack.length > 1) stack.pop();
        lastSignificant = '}';
        i += 1;
        continue;
      }
      if (/\s/.test(c)) {
        i += 1;
        continue;
      }
      if (c === 'i' && source.startsWith('import', i)) {
        const prev = i > 0 ? source[i - 1] : '';
        if (!isWordChar(prev) && prev !== '.') {
          let j = i + 'import'.length;
          for (;;) {
            while (j < n && /\s/.test(source[j])) j += 1;
            if (source[j] === '/' && source[j + 1] === '/') {
              j += 2;
              while (j < n && source[j] !== '\n') j += 1;
              continue;
            }
            if (source[j] === '/' && source[j + 1] === '*') {
              j += 2;
              while (
                j < n &&
                !(source[j] === '*' && source[j + 1] === '/')
              ) {
                j += 1;
              }
              j += 2;
              continue;
            }
            break;
          }
          if (source[j] === '(') {
            const literal = DynamicImportScan.literalArgument(source, j + 1);
            if (literal !== undefined) {
              calls.push({
                start: i,
                openParen: j,
                closeParen: literal.closeParen,
                specifier: literal.specifier,
              });
            }
          }
          i = j;
          continue;
        }
      }
      lastSignificant = c;
      i += 1;
    }
    return calls;
  }

  /**
   * Parse the argument list of a call whose `(` sits just before
   * `position`: whitespace/comments, then one string literal, then
   * whitespace/comments, then `)`. Returns the unquoted specifier text
   * and the `)` index, or `undefined` for anything else — a non-literal
   * argument, extra arguments, an unterminated literal, or a literal
   * containing an escape (whose runtime value could differ from its
   * source text).
   */
  private static literalArgument(
    source: string,
    position: number,
  ): { specifier: string; closeParen: number } | undefined {
    const n = source.length;
    let i = position;
    const skipTrivia = (): void => {
      for (;;) {
        while (i < n && /\s/.test(source[i])) i += 1;
        if (source[i] === '/' && source[i + 1] === '/') {
          i += 2;
          while (i < n && source[i] !== '\n') i += 1;
          continue;
        }
        if (source[i] === '/' && source[i + 1] === '*') {
          i += 2;
          while (i < n && !(source[i] === '*' && source[i + 1] === '/')) {
            i += 1;
          }
          i += 2;
          continue;
        }
        return;
      }
    };
    skipTrivia();
    const quote = source[i];
    if (quote !== "'" && quote !== '"') return undefined;
    i += 1;
    const specifierStart = i;
    while (i < n && source[i] !== quote) {
      if (source[i] === '\\') return undefined;
      i += 1;
    }
    if (i >= n) return undefined;
    const specifier = source.slice(specifierStart, i);
    i += 1;
    skipTrivia();
    if (source[i] !== ')') return undefined;
    return { specifier, closeParen: i };
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
