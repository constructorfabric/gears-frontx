import type { ActionPayload } from '../../MountStrategy';

export function makePayload(subject: string): ActionPayload {
  return { subject };
}
