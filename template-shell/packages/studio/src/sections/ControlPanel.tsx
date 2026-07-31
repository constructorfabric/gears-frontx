// @cpt-dod:cpt-frontx-dod-studio-devtools-control-panel:p1
import React from 'react';
import { useTranslation } from '@gears-frontx/react';
import { ThemeSelector } from './ThemeSelector';
import { LanguageSelector } from './LanguageSelector';
import { ApiModeToggle } from './ApiModeToggle';

// @cpt-begin:cpt-frontx-dod-studio-devtools-control-panel:p1:inst-1
export const ControlPanel: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {t('studio:controls.heading')}
        </h3>

        <div className="space-y-3">
          <ApiModeToggle />
          <ThemeSelector />
          <LanguageSelector />
        </div>
      </div>
    </div>
  );
};

 ControlPanel.displayName = 'ControlPanel';
// @cpt-end:cpt-frontx-dod-studio-devtools-control-panel:p1:inst-1
