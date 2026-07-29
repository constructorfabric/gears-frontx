/**
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from 'vitest';
import { createI18nRegistry, I18nRegistryImpl } from './I18nRegistry';
import { Language, TextDirection } from './types';

describe(I18nRegistryImpl, () => {
  it('translates with interpolation, fallback language, and RTL document attributes', async () => {
    expect.assertions(3);

    const registry = createI18nRegistry({
      defaultLanguage: Language.English,
      fallbackLanguage: Language.English,
    });

    registry.register('common', Language.English, {
      greeting: 'Hello {name}',
    });

    await registry.setLanguage(Language.Arabic);

    expect(registry.t('common:greeting', { name: 'Ada' })).toBe('Hello Ada');
    expect(document.documentElement.getAttribute('lang')).toBe(Language.Arabic);
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
  });

  it('loads shared namespaces eagerly but keeps screen and screenset namespaces lazy', async () => {
    expect.assertions(6);

    const registry = createI18nRegistry({
      defaultLanguage: Language.English,
      fallbackLanguage: Language.English,
    });
    const commonLoader = vi.fn(async () => ({
      title: 'Shared title',
    }));
    const screensetLoader = vi.fn(async () => ({
      title: 'Screenset title',
    }));
    const screenLoader = vi.fn(async () => ({
      title: 'Screen title',
    }));

    registry.registerLoader('common', commonLoader);
    registry.registerLoader('screenset.demo', screensetLoader);
    registry.registerLoader('screen.demo.home', screenLoader);

    await registry.setLanguage(Language.English);

    expect(commonLoader).toHaveBeenCalledWith(Language.English);
    expect(screensetLoader).not.toHaveBeenCalled();
    expect(screenLoader).not.toHaveBeenCalled();
    expect(registry.t('common:title')).toBe('Shared title');

    await registry.loadScreensetTranslations('demo');

    expect(screensetLoader).toHaveBeenCalledWith(Language.English);
    expect(registry.t('screenset.demo:title')).toBe('Screenset title');
  });

  it('provides loader helpers for explicit maps and directory-style imports', async () => {
    expect.assertions(3);

    const englishModule = { default: { title: 'Hello' } };
    const arabicModule = { default: { title: 'marhaba' } };
    const explicitLoader = I18nRegistryImpl.createLoader({
      [Language.English]: async () => englishModule,
      [Language.Spanish]: async () => ({ default: { title: 'Hola' } }),
      [Language.French]: async () => ({ default: { title: 'Bonjour' } }),
      [Language.German]: async () => ({ default: { title: 'Hallo' } }),
      [Language.Italian]: async () => ({ default: { title: 'Ciao' } }),
      [Language.Portuguese]: async () => ({ default: { title: 'Ola' } }),
      [Language.Dutch]: async () => ({ default: { title: 'Hallo' } }),
      [Language.Russian]: async () => ({ default: { title: 'Privet' } }),
      [Language.Polish]: async () => ({ default: { title: 'Czesc' } }),
      [Language.Ukrainian]: async () => ({ default: { title: 'Pryvit' } }),
      [Language.Czech]: async () => ({ default: { title: 'Ahoj' } }),
      [Language.Arabic]: async () => arabicModule,
      [Language.Hebrew]: async () => ({ default: { title: 'Shalom' } }),
      [Language.Persian]: async () => ({ default: { title: 'Salaam' } }),
      [Language.Urdu]: async () => ({ default: { title: 'Assalam' } }),
      [Language.Turkish]: async () => ({ default: { title: 'Merhaba' } }),
      [Language.ChineseSimplified]: async () => ({ default: { title: 'Ni Hao' } }),
      [Language.ChineseTraditional]: async () => ({ default: { title: 'Nei Hou' } }),
      [Language.Japanese]: async () => ({ default: { title: 'Konnichiwa' } }),
      [Language.Korean]: async () => ({ default: { title: 'Annyeong' } }),
      [Language.Vietnamese]: async () => ({ default: { title: 'Xin chao' } }),
      [Language.Thai]: async () => ({ default: { title: 'Sawasdee' } }),
      [Language.Indonesian]: async () => ({ default: { title: 'Halo' } }),
      [Language.Hindi]: async () => ({ default: { title: 'Namaste' } }),
      [Language.Bengali]: async () => ({ default: { title: 'Nomoskar' } }),
      [Language.Swedish]: async () => ({ default: { title: 'Hej' } }),
      [Language.Danish]: async () => ({ default: { title: 'Hej' } }),
      [Language.Norwegian]: async () => ({ default: { title: 'Hei' } }),
      [Language.Finnish]: async () => ({ default: { title: 'Hei' } }),
      [Language.Greek]: async () => ({ default: { title: 'Yassas' } }),
      [Language.Romanian]: async () => ({ default: { title: 'Salut' } }),
      [Language.Hungarian]: async () => ({ default: { title: 'Szia' } }),
      [Language.Malay]: async () => ({ default: { title: 'Hai' } }),
      [Language.Tagalog]: async () => ({ default: { title: 'Kamusta' } }),
      [Language.Tamil]: async () => ({ default: { title: 'Vanakkam' } }),
      [Language.Swahili]: async () => ({ default: { title: 'Hujambo' } }),
    });
    const importFromDirectory = vi.fn(async (filename: string) => {
      if (filename === 'ar.json') {
        return arabicModule;
      }
      return englishModule;
    });
    const directoryLoader = I18nRegistryImpl.createLoaderFromDirectory(importFromDirectory);

    await expect(explicitLoader(Language.English)).resolves.toEqual(englishModule.default);
    await expect(directoryLoader(Language.Arabic)).resolves.toEqual(arabicModule.default);
    expect(importFromDirectory).toHaveBeenCalledWith('ar.json');
  });

  it('notifies subscribers and increments version when translations change', () => {
    const registry = createI18nRegistry({
      defaultLanguage: Language.English,
      fallbackLanguage: Language.English,
    });
    const subscriber = vi.fn();
    const unsubscribe = registry.subscribe(subscriber);

    expect(registry.getVersion()).toBe(0);

    registry.register('common', Language.English, {
      title: 'Hello',
    });

    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(registry.getVersion()).toBe(1);
    unsubscribe();

    registry.register('common', Language.Spanish, {
      title: 'Hola',
    });

    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(registry.getVersion()).toBe(2);
  });

  it('returns original keys when translations are missing', () => {
    const registry = createI18nRegistry({
      defaultLanguage: Language.English,
      fallbackLanguage: Language.English,
    });

    registry.register('common', Language.English, {
      nested: {
        title: 'Hello',
      },
    });

    expect(registry.t('common:missing')).toBe('common:missing');
    expect(registry.t('common:nested')).toBe('common:nested');
    expect(registry.t('missing')).toBe('missing');
  });

  it('exposes namespace registration and language metadata through the public API', () => {
    const registry = createI18nRegistry({
      defaultLanguage: Language.English,
      fallbackLanguage: Language.English,
    });

    registry.register('common', Language.English, {
      title: 'Hello',
    });
    registry.registerLoader('screenset.demo', vi.fn(async () => ({ title: 'Demo' })));

    expect(registry.hasNamespace('common')).toBe(true);
    expect(registry.hasNamespace('screenset.demo')).toBe(true);
    expect(registry.getNamespaces()).toEqual(expect.arrayContaining(['common', 'screenset.demo']));
    expect(registry.getLanguageMetadata()).toBeUndefined();
    expect(registry.getLanguageMetadata(Language.Arabic)).toMatchObject({
      code: Language.Arabic,
      direction: TextDirection.RightToLeft,
    });

    const supportedLanguages = registry.getSupportedLanguages();
    supportedLanguages.pop();

    expect(registry.getSupportedLanguages().length).toBeGreaterThan(supportedLanguages.length);
  });

  it('loads empty dictionaries from loaders without resolving missing keys', async () => {
    expect.assertions(4);

    const registry = createI18nRegistry({
      defaultLanguage: Language.English,
      fallbackLanguage: Language.English,
    });
    const emptyLoader = vi.fn(async () => ({}));

    registry.registerLoader('common', emptyLoader);

    await registry.setLanguage(Language.English);

    expect(emptyLoader).toHaveBeenCalledWith(Language.English);
    expect(registry.hasNamespace('common')).toBe(true);
    expect(registry.getNamespaces()).toContain('common');
    expect(registry.t('common:title')).toBe('common:title');
  });
});
