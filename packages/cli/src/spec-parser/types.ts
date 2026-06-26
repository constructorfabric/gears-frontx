// @cpt-algo:cpt-frontx-algo-template-resolution-parse-spec:p1

export interface StructuredRef {
  host: string;
  owner: string;
  repo: string;
  ref: string;
}

export interface ParseError {
  message: string;
}

export type ParseResult =
  | { ok: true; value: StructuredRef }
  | { ok: false; error: ParseError };
