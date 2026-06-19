// @cpt-flow:cpt-hai3-flow-studio-devtools-theme-change:p1
// @cpt-dod:cpt-hai3-dod-studio-devtools-control-panel:p1
import React from 'react';
import { upperFirst } from 'lodash';
import { useTheme, useTranslation } from '@gears-frontx/react';
import { ButtonVariant } from '../uikit/types';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../uikit/base/dropdown-menu';
import { DropdownButton } from '../uikit/composite/DropdownButton';
import { useStudioContext } from '../StudioProvider';

/**
 * ThemeSelector Component
 * Uses useTheme hook for theme selection using DropdownMenu
 */

export interface ThemeSelectorProps {
  className?: string;
}

// @cpt-begin:cpt-hai3-flow-studio-devtools-theme-change:p1:inst-1
export const ThemeSelector: React.FC<ThemeSelectorProps> = ({
  className = '',
}) => {
  const { currentTheme, themes, setTheme } = useTheme();
  const { portalContainer } = useStudioContext();
  const { t } = useTranslation();

  const formatThemeName = (themeName: string): string => {
    return themeName
      .split('-')
      .map(word => upperFirst(word))
      .join(' ');
  };

  return (
    <div className={`flex items-center justify-between ${className}`}>
      <label className="text-sm text-muted-foreground whitespace-nowrap">
        {t('studio:controls.theme')}
      </label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <DropdownButton variant={ButtonVariant.Outline}>
            {formatThemeName(currentTheme || '')}
          </DropdownButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" container={portalContainer} className="z-[99999] pointer-events-auto">
          {themes.map((theme) => (
            <DropdownMenuItem
              key={theme.id}
              onClick={() => setTheme(theme.id)}
            >
              {formatThemeName(theme.name || theme.id)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

ThemeSelector.displayName = 'ThemeSelector';
// @cpt-end:cpt-hai3-flow-studio-devtools-theme-change:p1:inst-1
