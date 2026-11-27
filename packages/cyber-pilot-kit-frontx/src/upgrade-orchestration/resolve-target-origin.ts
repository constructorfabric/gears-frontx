/** Replace the recorded remote selector with the exact Git ref requested by the caller. */
export function resolveTargetOrigin(
  recordedOrigin: string,
  targetRef: string,
): { ok: true; origin: string } | { ok: false; message: string } {
  const colonIdx = recordedOrigin.indexOf(':');
  if (colonIdx === -1) {
    return {
      ok: false,
      message: `Recorded origin "${recordedOrigin}" carries no "host:" prefix, so the target ref "${targetRef}" cannot be resolved to an origin.`,
    };
  }

  const host = recordedOrigin.slice(0, colonIdx);
  const remainder = recordedOrigin.slice(colonIdx + 1);

  // The one local-origin scheme the engine recognizes (`resolver/types.ts`'s
  // `LOCAL_ORIGIN_PREFIX`); there is no second spelling for it.
  if (host === 'path') {
    return {
      ok: false,
      message: `"${recordedOrigin}" is a local origin with no version ref to rebase, so the target ref "${targetRef}" cannot be resolved to an origin. Upgrade a locally-originated template by naming the new origin directly.`,
    };
  }

  const atIdx = remainder.indexOf('@');
  if (atIdx === -1 || atIdx === remainder.length - 1) {
    return {
      ok: false,
      message: `Recorded origin "${recordedOrigin}" carries no "@ref" version selector to rebase onto the target ref "${targetRef}".`,
    };
  }

  return { ok: true, origin: `${host}:${remainder.slice(0, atIdx)}@${targetRef}` };
}
