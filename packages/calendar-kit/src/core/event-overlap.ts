import type { UtcInstant } from "./model";
import { compareUtcInstants } from "./temporal";

export interface UtcRangePair {
  readonly start: UtcInstant;
  readonly end: UtcInstant;
}

export const rangesOverlap = (
  left: UtcRangePair,
  right: UtcRangePair
): boolean =>
  compareUtcInstants(left.start, right.end) < 0 &&
  compareUtcInstants(left.end, right.start) > 0;
