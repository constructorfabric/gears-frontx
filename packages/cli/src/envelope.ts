// The shared discriminated-union envelope every CLI command's `--json` mode
// emits, fixed by `cpt-frontx-adr-cli-machine-readable-output`: exactly one
// JSON value on stdout, `{"ok": true, "data": {...}}` on success or
// `{"ok": false, "error": {"code", "message", "details"}}` on failure or a
// decision the caller must make. This module fixes only the outer shape and
// the shared sixteen-code vocabulary; a command's own `data` payload shape
// remains owned by that command's FEATURE (ADR "More Information"), and no
// command is wired to this yet — `cli.ts` and the existing bespoke
// `--json` shapes (`commands/list.ts`'s `ListJsonEnvelope`, `upgrade`'s own
// status shape) are untouched; retrofitting them is a separate, later step.
//
// No `@cpt-` marker on this module: the ADR and the cli-invocation FEATURE's
// "Uniform Envelope Dispatch" DoD (`cpt-frontx-dod-cli-invocation-json-
// envelope-dispatch`) assign an ID to the DISPATCHER'S rendering step — the
// act of routing a dispatched command's outcome through this shape at the
// `cli.ts` entrypoint — not to this helper module itself, which no command
// consumes yet. Neither artifact fixes a distinct ID for "the envelope
// helper" as its own traceable unit, so none is invented here.

/**
 * The v1 vocabulary of stable `error.code` values — sixteen codes, exactly
 * as `cpt-frontx-adr-cli-machine-readable-output` names them. A genuinely
 * new failure mode is added by amending that ADR's list, never invented
 * locally by a command.
 */
export type ErrorCode =
  | 'INVALID_MANIFEST'
  | 'VERSION_MISMATCH'
  | 'TEMPLATE_NOT_REGISTERED'
  | 'TARGET_CONFLICT'
  | 'CONTENT_CONFLICT'
  | 'EXISTING_PATHS_REQUIRE_DECISION'
  | 'CONFIRMATION_REQUIRED'
  | 'ORIGIN_UNAVAILABLE'
  | 'PROJECT_INVALID'
  | 'REGISTRATION_CONFLICT'
  | 'TARGETS_EXIST'
  | 'TARGET_NOT_APPLIED'
  | 'INVALID_PATH'
  | 'NOTHING_TO_RESTORE'
  | 'INVALID_INPUT'
  | 'INTERNAL';

export interface EnvelopeError {
  code: ErrorCode;
  message: string;
  // Optional, not defaulted: the ADR shows `details` populated in its
  // examples (e.g. `CONFIRMATION_REQUIRED`'s delete/preserve lists) but
  // states no field-level requirement that every failure carry one, and
  // several codes (e.g. `INTERNAL`, `NOTHING_TO_RESTORE`) have no natural
  // structured payload beyond the message. Omitting the key when a caller
  // supplies nothing keeps a code that legitimately has no extra data from
  // carrying an invented empty `{}` that a consumer might mistake for an
  // intentional, meaningful-but-empty payload.
  details?: Record<string, unknown>;
}

export interface OkEnvelope<T> {
  ok: true;
  data: T;
}

export interface ErrEnvelope {
  ok: false;
  error: EnvelopeError;
}

export type Envelope<T> = OkEnvelope<T> | ErrEnvelope;

/** Constructs the success variant: `{ok: true, data}`. */
export function ok<T>(data: T): OkEnvelope<T> {
  return { ok: true, data };
}

/**
 * Constructs the failure variant: `{ok: false, error: {code, message,
 * details}}`. `details` is omitted from the returned object entirely when
 * not given — see `EnvelopeError.details`'s doc comment for why this
 * constructor does not default it to `{}`.
 */
export function err(code: ErrorCode, message: string, details?: Record<string, unknown>): ErrEnvelope {
  return details === undefined ? { ok: false, error: { code, message } } : { ok: false, error: { code, message, details } };
}
