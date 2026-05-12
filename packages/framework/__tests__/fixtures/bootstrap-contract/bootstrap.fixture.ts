import { MFE_MANIFESTS, type MfeManifestConfig } from './generated-mfe-manifests.fixture';

type Extension = Record<string, unknown>;
type ScreenExtension = Extension & {
  presentation?: {
    route?: string;
  };
};

type TestMfeRegistry = {
  registerDomain: (domain: unknown, factory: unknown) => void;
  updateSharedProperty: (key: string, value: string) => void;
  typeSystem: {
    register: (entry: Record<string, unknown>) => void;
    registerSchema: (schema: Record<string, unknown>) => void;
  };
  registerExtension: (extension: Record<string, unknown>) => Promise<void>;
};

type TestApp = {
  mfeRegistry?: TestMfeRegistry;
  themeRegistry?: { getCurrent: () => { id: string } | undefined };
  i18nRegistry?: { getLanguage: () => string | null };
};

function isScreenExtension(extension: Extension): extension is ScreenExtension {
  const presentation = extension.presentation;

  return typeof presentation === 'object' &&
    presentation !== null &&
    'route' in presentation &&
    typeof presentation.route === 'string';
}

export async function bootstrapMFE(
  app: TestApp,
  _screenContainerRef?: { current: HTMLDivElement | null },
): Promise<ScreenExtension[]> {
  const registry = app.mfeRegistry;
  if (!registry) {
    throw new Error('[MFE Bootstrap] mfeRegistry is not available on app instance');
  }

  // Domain registration (4 domains: screen, sidebar, popup, overlay)
  registry.registerDomain('screen-domain', {});
  registry.registerDomain('sidebar-domain', {});
  registry.registerDomain('popup-domain', {});
  registry.registerDomain('overlay-domain', {});

  registry.updateSharedProperty('theme', app.themeRegistry?.getCurrent()?.id ?? 'default');
  registry.updateSharedProperty('language', app.i18nRegistry?.getLanguage() ?? 'en');

  if (MFE_MANIFESTS.length === 0) {
    console.warn('[MFE Bootstrap] No MFE manifests found.');
    return [];
  }

  const screenExtensions: ScreenExtension[] = [];

  for (const config of MFE_MANIFESTS as MfeManifestConfig[]) {
    if (config.schemas) {
      for (const schema of config.schemas) {
        registry.typeSystem.registerSchema(schema);
      }
    }

    registry.typeSystem.register(config.manifest);

    for (const entry of config.entries) {
      registry.typeSystem.register({ ...entry, manifest: config.manifest });
    }

    for (const extension of config.extensions) {
      await registry.registerExtension(extension);
    }

    screenExtensions.push(...config.extensions.filter(isScreenExtension));
  }

  if (screenExtensions.length === 0) {
    console.warn('[MFE Bootstrap] No screen extensions available, skipping mount');
    return [];
  }

  return screenExtensions;
}
