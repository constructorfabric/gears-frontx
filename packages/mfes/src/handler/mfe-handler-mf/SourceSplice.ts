/**
 * Offset splice over a text read once: every rewrite of a minted text
 * (specifier bindings, `import.meta.url`, dynamic-import calls) is
 * recorded as an edit against the original offsets and applied in one pass,
 * so the text is lexed once and no edit shifts another's offsets.
 *
 * One class per file (`runtime_style`); every member is static.
 *
 * @packageDocumentation
 * @internal
 */

/** Replace `source.slice(start, end)` with `text`. */
export interface SourceEdit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

export class SourceSplice {
  protected constructor() {}

  /**
   * `source` with every edit applied. An edit that begins inside the span
   * of an earlier edit is dropped: the earlier replacement supersedes the
   * text it covers (a rewritten call's discarded attributes, a nested call
   * whose outer call is rewritten).
   */
  static apply(source: string, edits: readonly SourceEdit[]): string {
    if (edits.length === 0) return source;
    const ordered = [...edits].sort((a, b) => a.start - b.start || b.end - a.end);
    const parts: string[] = [];
    let cursor = 0;
    for (const edit of ordered) {
      if (edit.start < cursor) continue;
      parts.push(source.slice(cursor, edit.start), edit.text);
      cursor = edit.end;
    }
    parts.push(source.slice(cursor));
    return parts.join('');
  }
}
