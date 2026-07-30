import type { TelemetryConfigNormalized } from '../utils/types';

export type TelemetryLoggerService = {
  logMessage: (...args: unknown[]) => void;
  logError: (...args: unknown[]) => void;
};

export function createLogger(config: TelemetryConfigNormalized): TelemetryLoggerService {
  return {
    logMessage,
    logError,
  };

  function logError(...args: unknown[]) {
    if (config.verbose) {
      console.error(...args);
    }
  }

  function logMessage(...args: unknown[]) {
    if (config.verbose) {
      console.log(...args);
    }
  }
}
