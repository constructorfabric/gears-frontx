// @cpt-flow:cpt-frontx-flow-studio-devtools-conditional-load:p1
// @cpt-dod:cpt-frontx-dod-studio-devtools-conditional-loading:p1
import React, { useEffect } from 'react';
import { StudioProvider, useStudioContext } from './StudioProvider';
import { StudioPanel } from './StudioPanel';
import { useKeyboardShortcut } from './hooks/useKeyboardShortcut';
import { CollapsedButton } from './CollapsedButton';
import { injectStudioStyles } from './styles/studioStyles';

// @cpt-begin:cpt-frontx-flow-studio-devtools-conditional-load:p1:inst-1
// @cpt-begin:cpt-frontx-dod-studio-devtools-conditional-loading:p1:inst-1
const StudioContent: React.FC = () => {
  const { collapsed, toggleCollapsed } = useStudioContext();

  // Register keyboard shortcut (Shift + `) - toggles between collapsed button and expanded panel
  useKeyboardShortcut(toggleCollapsed);

  if (collapsed) {
    return <CollapsedButton toggleCollapsed={toggleCollapsed} />;
  }

  return <StudioPanel />;
};

// No props - services register their own mocks
export const StudioOverlay: React.FC = () => {
  useEffect(() => {
    return injectStudioStyles();
  }, []);

  return (
    <StudioProvider>
      <StudioContent />
    </StudioProvider>
  );
};

StudioOverlay.displayName = 'StudioOverlay';
// @cpt-end:cpt-frontx-flow-studio-devtools-conditional-load:p1:inst-1
// @cpt-end:cpt-frontx-dod-studio-devtools-conditional-loading:p1:inst-1
