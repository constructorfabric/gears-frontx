import { ExtensionMounter } from '../../ExtensionMounter';

export class FakeMounter extends ExtensionMounter {
  readonly mountCalls: Array<{ extensionId: string; container: Element }> = [];
  readonly unmountCalls: string[] = [];

  attach(_root: Element): void {}
  async detach(): Promise<void> {}

  async mount(extensionId: string, container: Element): Promise<void> {
    this.mountCalls.push({ extensionId, container });
  }

  async unmount(extensionId: string): Promise<void> {
    this.unmountCalls.push(extensionId);
  }
}
