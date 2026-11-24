/**
 * Comment/string/regex-aware scan for the import forms of emitted unit
 * source: the dynamic `import(...)` calls the mint-time rewrite turns
 * into the lazy-import ABI (`UnitDynamicImportRewriter`), and the static
 * `import` and `export ... from` specifiers the mint-time rewrite binds
 * to blob URLs and its survivor checks inspect, and the `import.meta.url`
 * token sequences the mint-time rewrite replaces. One walk reports all
 * three, so a text is lexed once however many rewrites and checks read it.
 *
 * Two shapes of dynamic call reach the ABI: a literal call — the first
 * argument is one string literal or a template literal with no
 * substitution — and a statically bounded pattern — the first argument
 * is one template literal with at least one substitution and non-empty
 * fixed text before its first or after its last substitution. Anything
 * else (`import(expr)`, a concatenation, a template with no fixed text)
 * is fully opaque and is not reported. An optional second argument
 * (import attributes) and a trailing comma are tolerated; only the first
 * argument is read. A static record is the specifier string of an
 * `import "x"`, `import ... from "x"` or `export ... from "x"` statement;
 * a string literal, an `import(...)` call, `import.meta` or a comment
 * is never one. A meta-URL record spans the `import`, `meta` and `url`
 * words of `import.meta.url` or `import.meta?.url` with any whitespace
 * and comments between them; a longer word (`import.meta.urlx`), a member
 * (`o.import.meta.url`), a string and a comment are never one. The scan lives in the `./unit-format` contract
 * directory but is NOT re-exported through `index.ts`: the public
 * contract surface stays the fetch-list types.
 *
 * The scan is a small lexer, not a regex: it tracks code (with brace
 * depth inside `${...}`), line/block comments, string literals, template
 * literals and regex literals, so `import(` inside a string, comment or
 * regex cannot false-positive, an `import` separated from its `(` only by
 * whitespace and comments cannot slip through, and a member call such as
 * `obj.import(x)` is never read as a dynamic import. A `/` divides when
 * the last significant token ends an operand — an identifier or number
 * that is not one of the keywords after which an expression starts, a
 * string, a template, a regex, `]`, a `)` that does not close the head of
 * an `if`, `while`, `for` or `with`, or a postfix `++`/`--` — and opens a
 * regex otherwise.
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

/**
 * A located static import or export specifier: the string literal of
 * `import "x"`, `import ... from "x"` or `export ... from "x"`.
 */
export interface StaticImportRecord {
  readonly kind: 'import' | 'export';
  /** The specifier's runtime value. */
  readonly specifier: string;
  /** Index of the specifier literal's opening quote. */
  readonly start: number;
  /** Index just past the specifier literal's closing quote. */
  readonly end: number;
}

/** A located `import.meta.url` token sequence. */
export interface ImportMetaUrlRecord {
  /** Index of the `import` keyword. */
  readonly start: number;
  /** Index just past the `url` word. */
  readonly end: number;
}

/** Everything one walk of a text reports. */
export interface UnitScan {
  readonly calls: DynamicImportCall[];
  readonly imports: StaticImportRecord[];
  readonly metaUrls: ImportMetaUrlRecord[];
}

/**
 * Keywords after which an expression starts, so a following `/` opens a
 * regex rather than divides. `of` is not here: it is a keyword only inside
 * a `for (` head, and minifiers emit it as a plain identifier elsewhere.
 */
const EXPRESSION_KEYWORDS: ReadonlySet<string> = new Set([
  'return',
  'typeof',
  'void',
  'delete',
  'in',
  'instanceof',
  'else',
  'case',
  'do',
  'throw',
  'new',
  'yield',
  'await',
]);

/** Keywords whose parenthesised head, once closed, is followed by a statement. */
const CONTROL_HEAD_KEYWORDS: ReadonlySet<string> = new Set([
  'if',
  'while',
  'for',
  'with',
]);

/** First words of an `export` that declares rather than re-exports. */
const EXPORT_DECLARATION_KEYWORDS: ReadonlySet<string> = new Set([
  'const',
  'let',
  'var',
  'function',
  'class',
  'async',
  'default',
]);

export class DynamicImportScan {
  protected constructor() {}

  /** Every literal and bounded-pattern dynamic-import call, in source order. */
  static scanCalls(source: string): DynamicImportCall[] {
    return DynamicImportScan.scan(source).calls;
  }

  /**
   * Every static import and re-export specifier, in source order: the
   * specifier literal of `import "x"`, `import ... from "x"` and
   * `export ... from "x"`.
   */
  static scanImports(source: string): StaticImportRecord[] {
    return DynamicImportScan.scan(source).imports;
  }

  /**
   * Every record of the text — dynamic calls, static specifiers and
   * `import.meta.url` sequences — from one walk, in source order.
   */
  static scan(source: string): UnitScan {
    return DynamicImportScan.walk(source);
  }

  private static isIdentifierChar(c: string): boolean {
    const k = c.charCodeAt(0);
    return (
      (k >= 97 && k <= 122) ||
      (k >= 65 && k <= 90) ||
      (k >= 48 && k <= 57) ||
      k === 95 ||
      k === 36 ||
      k >= 0x80
    );
  }

  private static isDigit(c: string | undefined): boolean {
    if (c === undefined) return false;
    const k = c.charCodeAt(0);
    return k >= 48 && k <= 57;
  }

  /** The characters `\s` matches. */
  private static isWhitespace(c: string): boolean {
    const k = c.charCodeAt(0);
    return (
      k === 32 ||
      (k >= 9 && k <= 13) ||
      (k >= 0xa0 &&
        (k === 0xa0 ||
          k === 0x1680 ||
          (k >= 0x2000 && k <= 0x200a) ||
          k === 0x2028 ||
          k === 0x2029 ||
          k === 0x202f ||
          k === 0x205f ||
          k === 0x3000 ||
          k === 0xfeff))
    );
  }

  private static walk(source: string): UnitScan {
    const calls: DynamicImportCall[] = [];
    const imports: StaticImportRecord[] = [];
    const metaUrls: ImportMetaUrlRecord[] = [];
    const n = source.length;
    // Frames: the top-level code, a template literal's text, and the code
    // of a `${...}` substitution (with its own brace depth, so a `}` that
    // closes an object literal does not end the substitution).
    type Frame = { type: 'code' | 'template'; depth: number };
    const stack: Frame[] = [{ type: 'code', depth: 0 }];
    const top = (): Frame => stack[stack.length - 1];
    // Whether the last significant token ends an operand, so that a `/`
    // divides; whether it was a single `.`, so that a following word is a
    // member name; the last word, for the head of a control statement; and
    // for each open parenthesis whether it opened such a head.
    let afterOperand = false;
    let afterDot = false;
    let lastWord = '';
    // The word before `lastWord`, so a `for await (` head is known.
    let prevWord = '';
    const parens: boolean[] = [];
    // For each open parenthesis whether it opened a `for` head: only there
    // is `of` a keyword, and only while the head can still be a for-of: a
    // `;` at the head's own depth makes it a classic loop, where `of` is an
    // identifier. `nest` counts the brackets, braces and substitutions open
    // inside the head, in which `of` is an identifier too.
    type ForHead = { head: boolean; classic: boolean; nest: number };
    const forHeads: ForHead[] = [];
    const openNest = (): void => {
      const h = forHeads[forHeads.length - 1];
      if (h) h.nest += 1;
    };
    const closeNest = (): void => {
      const h = forHeads[forHeads.length - 1];
      if (h && h.nest > 0) h.nest -= 1;
    };
    const token = (endsOperand: boolean): void => {
      afterOperand = endsOperand;
      afterDot = false;
      lastWord = '';
      prevWord = '';
    };
    let i = 0;
    // Reads the word at `i`: advances past it and updates the token state;
    // an `import` or `export` that is not a member is read as an import form.
    const readWord = (): void => {
      const wordStart = i;
      i = DynamicImportScan.skipWord(source, i);
      // Only a word of at most ten characters (`instanceof`) can be a
      // keyword this scan tests for, so a longer one is not copied out.
      const word = i - wordStart <= 10 ? source.slice(wordStart, i) : '_';
      const member = afterDot;
      if (!member && (word === 'import' || word === 'export')) {
        i = DynamicImportScan.readImportForm(
          source,
          wordStart,
          word,
          stack.length === 1,
          calls,
          imports,
          metaUrls
        );
      }
      const opensExpression =
        word === 'of'
          ? ((h) => h !== undefined && h.head && !h.classic && h.nest === 0)(
              forHeads[forHeads.length - 1]
            )
          : EXPRESSION_KEYWORDS.has(word);
      afterOperand = member || !opensExpression;
      afterDot = false;
      prevWord = member ? '' : lastWord;
      lastWord = member ? '' : word;
    };
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
          token(true);
          i += 1;
          continue;
        }
        if (c === '$' && source[i + 1] === '{') {
          stack.push({ type: 'code', depth: 0 });
          openNest();
          token(false);
          i += 2;
          continue;
        }
        i += 1;
        continue;
      }
      const k = source.charCodeAt(i);
      if (k === 32 || k === 10 || k === 9 || k === 13) {
        i += 1;
        continue;
      }
      if (
        (k >= 97 && k <= 122) ||
        (k >= 65 && k <= 90) ||
        (k >= 48 && k <= 57) ||
        k === 95 ||
        k === 36
      ) {
        readWord();
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
        token(true);
        continue;
      }
      if (c === '`') {
        stack.push({ type: 'template', depth: 0 });
        i += 1;
        continue;
      }
      if (c === '/') {
        if (afterOperand) {
          token(false);
          i += 1;
        } else {
          i = DynamicImportScan.skipRegex(source, i);
          token(true);
        }
        continue;
      }
      if (c === '{') {
        top().depth += 1;
        openNest();
        token(false);
        i += 1;
        continue;
      }
      if (c === '}') {
        if (top().depth > 0) {
          top().depth -= 1;
          closeNest();
        } else if (stack.length > 1) {
          // The substitution ends: back into the template's text.
          stack.pop();
          closeNest();
          i += 1;
          continue;
        }
        token(false);
        i += 1;
        continue;
      }
      if (DynamicImportScan.isWhitespace(c)) {
        i += 1;
        continue;
      }
      if (c === '(') {
        const forHead =
          !afterDot &&
          (lastWord === 'for' || (lastWord === 'await' && prevWord === 'for'));
        parens.push(forHead || (!afterDot && CONTROL_HEAD_KEYWORDS.has(lastWord)));
        forHeads.push({ head: forHead, classic: false, nest: 0 });
        token(false);
        i += 1;
        continue;
      }
      if (c === ')') {
        forHeads.pop();
        token(!(parens.pop() ?? false));
        i += 1;
        continue;
      }
      if (c === '[') {
        openNest();
        token(false);
        i += 1;
        continue;
      }
      if (c === ';') {
        const h = forHeads[forHeads.length - 1];
        if (h && h.nest === 0) h.classic = true;
        token(false);
        i += 1;
        continue;
      }
      if (c === ']') {
        closeNest();
        token(true);
        i += 1;
        continue;
      }
      if ((c === '+' || c === '-') && source[i + 1] === c) {
        // A postfix `++`/`--` leaves the operand it follows an operand; a
        // prefix one starts an expression.
        token(afterOperand);
        i += 2;
        continue;
      }
      if (c === '.') {
        if (source[i + 1] === '.' && source[i + 2] === '.') {
          token(false);
          i += 3;
          continue;
        }
        token(false);
        afterDot = true;
        i += 1;
        continue;
      }
      if (c === '#') {
        // A private name's `#` is part of the member name that follows: it
        // leaves a preceding `.` in force, so `o.#import(x)` stays a member.
        i += 1;
        continue;
      }
      if (DynamicImportScan.isIdentifierChar(c)) {
        readWord();
        continue;
      }
      token(false);
      i += 1;
    }
    return { calls, imports, metaUrls };
  }

  /**
   * The end of the identifier or number starting at `start`: an
   * identifier runs over identifier characters; a number also takes its
   * decimal point and exponent sign.
   */
  private static skipWord(source: string, start: number): number {
    const n = source.length;
    let i = start;
    const numeric = DynamicImportScan.isDigit(source[start]);
    while (i < n) {
      const k = source.charCodeAt(i);
      if (
        (k >= 97 && k <= 122) ||
        (k >= 65 && k <= 90) ||
        (k >= 48 && k <= 57) ||
        k === 95 ||
        k === 36 ||
        k >= 0x80
      ) {
        i += 1;
        continue;
      }
      const c = source[i];
      if (DynamicImportScan.isIdentifierChar(c)) {
        i += 1;
      } else if (numeric && c === '.' && DynamicImportScan.isDigit(source[i + 1])) {
        i += 1;
      } else if (
        numeric &&
        (c === '+' || c === '-') &&
        /[eE]/.test(source[i - 1]) &&
        !/^0[xX]/.test(source.slice(start, i)) &&
        DynamicImportScan.isDigit(source[i + 1])
      ) {
        i += 1;
      } else {
        break;
      }
    }
    return i;
  }

  /**
   * Read what an `import` or `export` keyword at `keywordStart` begins:
   * a dynamic call, collected into `calls`, or a static specifier,
   * collected into `imports` when the keyword sits in top-level code.
   * Returns the index to continue scanning from, just past the keyword.
   */
  private static readImportForm(
    source: string,
    keywordStart: number,
    keyword: 'import' | 'export',
    topLevel: boolean,
    calls: DynamicImportCall[],
    imports: StaticImportRecord[],
    metaUrls: ImportMetaUrlRecord[]
  ): number {
    const afterKeyword = keywordStart + keyword.length;
    const open = DynamicImportScan.skipTrivia(source, afterKeyword);
    if (keyword === 'export') {
      const record = topLevel
        ? DynamicImportScan.staticRecord(source, afterKeyword, 'export')
        : undefined;
      if (record !== undefined) imports.push(record);
      return afterKeyword;
    }
    if (source[open] === '(') {
      const first = DynamicImportScan.firstArgument(source, open + 1);
      if (first !== undefined) {
        const close = DynamicImportScan.callEnd(source, first.end);
        if (close !== undefined) {
          calls.push(
            first.kind === 'literal'
              ? {
                  kind: 'literal',
                  start: keywordStart,
                  closeParen: close,
                  specifier: first.specifier,
                }
              : {
                  kind: 'pattern',
                  start: keywordStart,
                  closeParen: close,
                  argStart: first.argStart,
                  argEnd: first.end,
                }
          );
        }
      }
      return afterKeyword;
    }
    if (source[open] === '.') {
      const end = DynamicImportScan.metaUrlEnd(source, open);
      if (end !== undefined) metaUrls.push({ start: keywordStart, end });
      return afterKeyword;
    }
    const record = topLevel
      ? DynamicImportScan.staticRecord(source, afterKeyword, 'import')
      : undefined;
    if (record !== undefined) imports.push(record);
    return afterKeyword;
  }

  /**
   * The end of `import.meta.url` / `import.meta?.url` whose `.` after
   * `import` sits at `dot`, or `undefined` when the words that follow are
   * not exactly `meta` and `url`.
   */
  private static metaUrlEnd(source: string, dot: number): number | undefined {
    const wordAt = (position: number): { word: string; end: number } => {
      const end = DynamicImportScan.skipWord(source, position);
      return { word: source.slice(position, end), end };
    };
    let i = DynamicImportScan.skipTrivia(source, dot + 1);
    const meta = wordAt(i);
    if (meta.word !== 'meta') return undefined;
    i = DynamicImportScan.skipTrivia(source, meta.end);
    if (source[i] === '?' && source[i + 1] === '.') i += 2;
    else if (source[i] === '.') i += 1;
    else return undefined;
    i = DynamicImportScan.skipTrivia(source, i);
    const url = wordAt(i);
    return url.word === 'url' ? url.end : undefined;
  }

  /**
   * The specifier of the static statement whose keyword ends at
   * `position`: a bare string (`import "x"`), or a clause of names,
   * `*`, `as`, commas and one brace group followed by `from` and a
   * string. Anything else — an expression, a declaration, `import.meta`,
   * a clause that never reaches `from "x"` — is no static specifier.
   */
  private static staticRecord(
    source: string,
    position: number,
    kind: 'import' | 'export'
  ): StaticImportRecord | undefined {
    const n = source.length;
    let i = DynamicImportScan.skipTrivia(source, position);
    const asRecord = (open: number): StaticImportRecord | undefined => {
      const end = DynamicImportScan.skipString(source, open);
      const specifier = DynamicImportScan.decodeString(
        source.slice(open + 1, end - 1)
      );
      return specifier === undefined
        ? undefined
        : { kind, specifier, start: open, end };
    };
    const isQuote = (c: string | undefined): boolean => c === "'" || c === '"';
    if (kind === 'import' && isQuote(source[i])) return asRecord(i);
    let closedBraces = false;
    let first = true;
    while (i < n) {
      const c = source[i];
      if (c === '{' && !closedBraces) {
        let j = i + 1;
        for (;;) {
          j = DynamicImportScan.skipTrivia(source, j);
          const d = source[j];
          if (d === '}') break;
          if (isQuote(d)) {
            j = DynamicImportScan.skipString(source, j);
          } else if (d === ',') {
            j += 1;
          } else if (d !== undefined && DynamicImportScan.isIdentifierChar(d)) {
            j = DynamicImportScan.skipWord(source, j);
          } else {
            return undefined;
          }
        }
        closedBraces = true;
        first = false;
        i = DynamicImportScan.skipTrivia(source, j + 1);
        continue;
      }
      if ((c === ',' || c === '*') && !closedBraces) {
        first = false;
        i = DynamicImportScan.skipTrivia(source, i + 1);
        continue;
      }
      if (c !== undefined && DynamicImportScan.isIdentifierChar(c)) {
        const end = DynamicImportScan.skipWord(source, i);
        const word = source.slice(i, end);
        const next = DynamicImportScan.skipTrivia(source, end);
        if (word === 'from' && isQuote(source[next])) return asRecord(next);
        if (
          closedBraces ||
          (kind === 'export' && first && EXPORT_DECLARATION_KEYWORDS.has(word))
        ) {
          return undefined;
        }
        first = false;
        i = next;
        continue;
      }
      return undefined;
    }
    return undefined;
  }

  /** Index after the whitespace and comments starting at `position`. */
  private static skipTrivia(source: string, position: number): number {
    const n = source.length;
    let i = position;
    for (;;) {
      while (i < n && DynamicImportScan.isWhitespace(source[i])) i += 1;
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
   * zero from `position`, reading past strings, templates, regex literals
   * and comments; `undefined` when the source ends first.
   */
  private static skipBalanced(
    source: string,
    position: number,
    terminators: string
  ): number | undefined {
    const n = source.length;
    let depth = 0;
    let i = position;
    // Whether the last significant token ends an operand, so that a `/`
    // divides rather than opens a regex; whether it was a `.`.
    let afterOperand = false;
    let afterDot = false;
    while (i < n) {
      const c = source[i];
      if (c === "'" || c === '"') {
        i = DynamicImportScan.skipString(source, i);
        afterOperand = true;
        afterDot = false;
        continue;
      }
      if (c === '`') {
        const end = DynamicImportScan.templateEnd(source, i);
        if (end === undefined) return undefined;
        i = end.end;
        afterOperand = true;
        afterDot = false;
        continue;
      }
      if (c === '/' && (source[i + 1] === '/' || source[i + 1] === '*')) {
        i = DynamicImportScan.skipTrivia(source, i);
        continue;
      }
      if (c === '/' && !afterOperand) {
        i = DynamicImportScan.skipRegex(source, i);
        afterOperand = true;
        afterDot = false;
        continue;
      }
      if (depth === 0 && terminators.includes(c)) return i;
      if (DynamicImportScan.isWhitespace(c)) {
        i += 1;
        continue;
      }
      if (DynamicImportScan.isIdentifierChar(c)) {
        const end = DynamicImportScan.skipWord(source, i);
        afterOperand = afterDot || !EXPRESSION_KEYWORDS.has(source.slice(i, end));
        afterDot = false;
        i = end;
        continue;
      }
      if (c === '(' || c === '[' || c === '{') depth += 1;
      if (c === ')' || c === ']' || c === '}') depth -= 1;
      afterOperand = c === ')' || c === ']' || c === '}';
      afterDot = c === '.';
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
}
