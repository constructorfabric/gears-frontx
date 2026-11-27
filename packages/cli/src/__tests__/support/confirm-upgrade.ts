// The upgrade confirmation protocol for CLI-driving tests: an automated
// `upgrade … --yes` must name the reviewed plan (`--plan-digest`). A call that
// does not is preceded by its review (the same args without `--yes`), whose
// planDigest is appended. A review without a digest (a refusal or a no-op) is
// answered by the original call unchanged, so its outcome is still asserted.
const needsDigest = (args: readonly string[]): boolean =>
  args[0] === 'upgrade' && args.includes('--yes') && !args.some((a) => a.startsWith('--plan-digest='));

function digestOf(result: unknown): string | undefined {
  const r = result as { envelope?: unknown; error?: unknown } | null;
  const envelope = (r && 'envelope' in r ? r.envelope : r) as { error?: { details?: { planDigest?: unknown } } } | null;
  const digest = envelope?.error?.details?.planDigest;
  return typeof digest === 'string' ? digest : undefined;
}

export function withReviewedDigest<R>(args: string[], call: (args: string[]) => R): R {
  if (!needsDigest(args)) return call(args);
  const digest = digestOf(call(args.filter((a) => a !== '--yes')));
  return call(digest === undefined ? args : [...args, `--plan-digest=${digest}`]);
}

export async function withReviewedDigestAsync<R>(args: string[], call: (args: string[]) => Promise<R>): Promise<R> {
  if (!needsDigest(args)) return call(args);
  const digest = digestOf(await call(args.filter((a) => a !== '--yes')));
  return call(digest === undefined ? args : [...args, `--plan-digest=${digest}`]);
}
