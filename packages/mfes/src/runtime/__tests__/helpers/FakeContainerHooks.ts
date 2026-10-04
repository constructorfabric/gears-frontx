import type { ContainerHooks } from '../../MountStrategy';

export class FakeContainerHooks implements ContainerHooks {
  readonly created: string[] = [];
  readonly destroyed: string[] = [];

  create(extensionId: string): Element {
    this.created.push(extensionId);
    return document.createElement('div');
  }

  destroy(extensionId: string): void {
    this.destroyed.push(extensionId);
  }
}
