import { MfeError } from './MfeError';

export class UnsupportedLifecycleStageError extends MfeError {
  constructor(
    message: string,
    public readonly stageId: string,
    public readonly entityId: string,
    public readonly supportedStages: string[]
  ) {
    super(message, 'UNSUPPORTED_LIFECYCLE_STAGE');
    this.name = 'UnsupportedLifecycleStageError';
  }
}
