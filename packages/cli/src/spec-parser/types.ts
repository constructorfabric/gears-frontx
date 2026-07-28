// @cpt-algo:cpt-frontx-algo-template-resolution-parse-spec:p1

export interface StructuredRef {
  host: string;
  owner: string;
  repo: string;
  // Optional subtree the template occupies inside the repository, addressed by
  // the `//<subtree>` segment (cpt-frontx-adr-source-spec-subdirectory-addressing).
  // Absent — not empty — when the reference addresses the repository root, so a
  // reference written before the segment existed parses into the same shape.
  subtree?: string;
  ref: string;
}

export interface ParseError {
  message: string;
}

export type ParseResult =
  | { ok: true; value: StructuredRef }
  | { ok: false; error: ParseError };
