// @cpt-flow:cpt-hai3-flow-studio-devtools-language-change:p1
// @cpt-dod:cpt-hai3-dod-studio-devtools-control-panel:p1
import { useTranslation, LanguageDisplayMode, TextDirection, SUPPORTED_LANGUAGES, getLanguageMetadata, type Language } from '@gears-frontx/react';
import { ButtonVariant } from '../uikit/types';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../uikit/base/dropdown-menu';
import { Button } from '../uikit/base/button';
import { useStudioContext } from '../StudioProvider';

/**
 * LanguageSelector constants
 */
const FALLBACK_SELECT_LANGUAGE_TEXT = 'Select language';
const RTL_INDICATOR_SUFFIX = ' (RTL)';

export interface LanguageSelectorProps {
  /**
   * Show language names in their native script or English
   * @default LanguageDisplayMode.Native
   */
  displayMode?: LanguageDisplayMode;
}

/**
 * Language Selector Component
 *
 * Allows users to switch between supported languages
 * Changes apply immediately without page reload
 * Automatically updates HTML dir attribute for RTL support
 */
// @cpt-begin:cpt-hai3-flow-studio-devtools-language-change:p1:inst-1
export function LanguageSelector({
  displayMode = LanguageDisplayMode.Native
}: LanguageSelectorProps = {}) {
  const { t, language, setLanguage } = useTranslation();
  const { portalContainer } = useStudioContext();

  const currentLanguage = language ? getLanguageMetadata(language) : null;

  return (
    <div className="flex items-center justify-between">
      <label className="text-sm text-muted-foreground whitespace-nowrap">
        {t('studio:controls.language')}
      </label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant={ButtonVariant.Outline}>
            {currentLanguage
              ? (displayMode === LanguageDisplayMode.Native ? currentLanguage.name : currentLanguage.englishName)
              : FALLBACK_SELECT_LANGUAGE_TEXT
            }
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" container={portalContainer} className="z-[99999] pointer-events-auto">
          {SUPPORTED_LANGUAGES.map((lang) => (
            <DropdownMenuItem
              key={lang.code}
              onClick={() => setLanguage(lang.code as Language)}
            >
              {displayMode === LanguageDisplayMode.Native ? lang.name : lang.englishName}
              {lang.direction === TextDirection.RightToLeft && RTL_INDICATOR_SUFFIX}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
// @cpt-end:cpt-hai3-flow-studio-devtools-language-change:p1:inst-1
