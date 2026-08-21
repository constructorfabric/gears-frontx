/**
 * The app's UI strings.
 *
 * One catalogue, `en`, shipped as JSON so it stays a file a translator can be
 * handed rather than strings scattered through JSX. A support-inbox vocabulary
 * in every language a project needs is that project's content, not something a
 * template should invent - adding `src/i18n/<lang>.json` and choosing between
 * them is the seam left open here.
 *
 * A missing key returns the key itself and says so once in the console: a
 * screen with a visible `reply_placeholder` in it is a bug that reports itself,
 * where a blank string would just look like a design choice.
 */

import en from '../i18n/en.json';

const catalogue: Record<string, string> = en;

export type Translate = (key: string) => string;

export const t: Translate = (key) => {
  const translation = catalogue[key];
  if (translation === undefined) {
    console.warn(`[inbox] Missing translation key: ${key}`);
    return key;
  }
  return translation;
};
