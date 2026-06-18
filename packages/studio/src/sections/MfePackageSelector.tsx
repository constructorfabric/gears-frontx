// @cpt-flow:cpt-hai3-flow-studio-devtools-gts-package:p1
// @cpt-dod:cpt-hai3-dod-studio-devtools-control-panel:p1
import React from 'react';
import {
  useHAI3,
  useRegisteredPackages,
  useActivePackage,
  eventBus,
  FRONTX_ACTION_MOUNT_EXT,
  FRONTX_SCREEN_DOMAIN,
  type ScreenExtension,
  type Extension,
} from '@gears-frontx/react';
import { ButtonVariant } from '../uikit/types';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../uikit/base/dropdown-menu';
import { DropdownButton } from '../uikit/composite/DropdownButton';
import { useStudioContext } from '../StudioProvider';
import { useTranslation } from '@gears-frontx/react';
import { StudioEvents } from '../events/studioEvents';

/**
 * Type guard to check if an extension is a ScreenExtension.
 * ScreenExtension has a 'presentation' field with an object value.
 */
function isScreenExtension(ext: Extension): ext is ScreenExtension {
  return 'presentation' in ext && typeof (ext as ScreenExtension).presentation === 'object';
}

/**
 * MfePackageSelector Component
 * Displays a dropdown of registered GTS packages and allows switching between them.
 */
export interface MfePackageSelectorProps {
  className?: string;
}

// @cpt-begin:cpt-hai3-flow-studio-devtools-gts-package:p1:inst-1
export const MfePackageSelector: React.FC<MfePackageSelectorProps> = ({
  className = '',
}) => {
  const app = useHAI3();
  const registry = app.screensetsRegistry;
  const { portalContainer } = useStudioContext();
  const { t } = useTranslation();
  const packages = useRegisteredPackages();
  const activePackage = useActivePackage();

  // Early return guard: screensetsRegistry is optional on HAI3App
  if (!registry) {
    return null;
  }

  const handlePackageChange = async (selectedPackageId: string) => {
    // Get all extensions for the selected package
    const extensions = registry.getExtensionsForPackage(selectedPackageId);

    // Filter for screen-domain extensions
    const screenExtensions = extensions.filter(
      (ext: Extension) => ext.domain === FRONTX_SCREEN_DOMAIN && isScreenExtension(ext)
    ) as ScreenExtension[];

    if (screenExtensions.length === 0) {
      console.warn(`No screen extensions found for package: ${selectedPackageId}`);
      return;
    }

    // Sort by presentation.order
    screenExtensions.sort((a, b) => (a.presentation.order ?? 0) - (b.presentation.order ?? 0));

    // Mount the first screen extension
    const firstExtension = screenExtensions[0];
    await registry.executeActionsChain({
      action: {
        type: FRONTX_ACTION_MOUNT_EXT,
        target: FRONTX_SCREEN_DOMAIN,
        payload: { extensionId: firstExtension.id },
      },
    });
    eventBus.emit(StudioEvents.ActivePackageChanged, { activePackageId: selectedPackageId });
  };

  return (
    <div className={`flex items-center justify-between ${className}`}>
      <label className="text-sm text-muted-foreground whitespace-nowrap">
        {t('studio:controls.gts_package')}
      </label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <DropdownButton
            variant={ButtonVariant.Outline}
            disabled={packages.length <= 1}
          >
            {activePackage || 'No package'}
          </DropdownButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" container={portalContainer} className="z-[99999] pointer-events-auto">
          {packages.map((pkg) => (
            <DropdownMenuItem
              key={pkg}
              onClick={() => handlePackageChange(pkg)}
            >
              {pkg}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

MfePackageSelector.displayName = 'MfePackageSelector';
// @cpt-end:cpt-hai3-flow-studio-devtools-gts-package:p1:inst-1
