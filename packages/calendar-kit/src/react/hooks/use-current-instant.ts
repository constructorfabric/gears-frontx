import { useEffect, useState } from "react";

import type { UtcInstant } from "../../core/model";
import { utcInstant } from "../../core/validation";

const DEFAULT_INTERVAL_MS = 30_000;
const MILLISECONDS_PER_MINUTE = 60_000;

export interface UseCurrentInstantOptions {
  readonly now?: UtcInstant;
  readonly cadence: "interval" | "minute-aligned";
  readonly intervalMs?: number;
}

export interface UseCurrentInstantResult {
  readonly currentInstant: UtcInstant;
}

const readCurrentInstant = (): UtcInstant => utcInstant(new Date());

export const useCurrentInstant = ({
  now,
  cadence,
  intervalMs = DEFAULT_INTERVAL_MS,
}: UseCurrentInstantOptions): UseCurrentInstantResult => {
  const isControlled = now !== undefined;

  const [uncontrolledInstant, setUncontrolledInstant] = useState<UtcInstant>(
    () => now ?? readCurrentInstant()
  );

  const [wasControlled, setWasControlled] = useState(isControlled);

  let resolvedUncontrolledInstant = uncontrolledInstant;

  if (wasControlled && !isControlled) {
    resolvedUncontrolledInstant = readCurrentInstant();

    if (resolvedUncontrolledInstant !== uncontrolledInstant) {
      setUncontrolledInstant(resolvedUncontrolledInstant);
    }
  }

  if (wasControlled !== isControlled) {
    setWasControlled(isControlled);
  }

  useEffect(() => {
    let intervalId: number | undefined;

    if (!isControlled && cadence === "interval") {
      intervalId = window.setInterval(() => {
        setUncontrolledInstant(readCurrentInstant());
      }, intervalMs);
    }

    return () => {
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
  }, [cadence, intervalMs, isControlled]);

  useEffect(() => {
    let timeoutId: number | undefined;

    if (!isControlled && cadence === "minute-aligned") {
      const scheduleNextTick = (): void => {
        const elapsed = Date.now() % MILLISECONDS_PER_MINUTE;
        timeoutId = window.setTimeout(() => {
          setUncontrolledInstant(readCurrentInstant());
          scheduleNextTick();
        }, MILLISECONDS_PER_MINUTE - elapsed);
      };

      scheduleNextTick();
    }

    return () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [cadence, isControlled]);

  return {
    currentInstant: now ?? resolvedUncontrolledInstant,
  };
};
