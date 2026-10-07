/**
 * Execution change
 *
 * What one `mount_ext`/`unmount_ext` execution physically changed in its
 * domain's mount set: the difference between the set read immediately before
 * the domain's strategy ran and the set read immediately after it settled.
 * A mount that fails and is rolled back leaves no trace in the set, so it is
 * not among the mounted; an Optional displacement or an Exclusive eviction
 * leaves the set, so it is among the unmounted. Occupants nested in a hosted
 * extension's own registry live in that registry's own mount sets and never
 * enter this one.
 *
 * @packageDocumentation
 * @internal
 */
// @cpt-algo:cpt-frontx-algo-extension-domain-governance-mount-execution:p2

/**
 * @param before - The domain's mount set read before the strategy ran.
 * @param after - The domain's mount set read after the strategy settled.
 * @param onlySubject - When given, only this extension id is considered: a
 *   domain whose executions overlap (Concurrent) attributes to an execution
 *   only the subject it addresses. Omitted for a domain whose executions the
 *   occupancy queue serializes.
 * @returns The ids the execution mounted and the ids it unmounted.
 */
export function executionChange(
  before: readonly string[],
  after: readonly string[],
  onlySubject?: string
): { mounted: string[]; unmounted: string[] } {
  const considered = (id: string): boolean => onlySubject === undefined || id === onlySubject;
  return {
    mounted: after.filter((id) => considered(id) && !before.includes(id)),
    unmounted: before.filter((id) => considered(id) && !after.includes(id)),
  };
}
