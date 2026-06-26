// @cpt-flow:cpt-frontx-flow-studio-devtools-panel-toggle:p1
// @cpt-dod:cpt-frontx-dod-studio-devtools-keyboard:p1
import { useEffect } from 'react';

/**
 * Hook to register a keyboard shortcut (Shift+`)
 * Uses physical key location for reliable cross-browser/keyboard detection
 */
// @cpt-begin:cpt-frontx-flow-studio-devtools-panel-toggle:p1:inst-1
// @cpt-begin:cpt-frontx-dod-studio-devtools-keyboard:p1:inst-1
export const useKeyboardShortcut = (handler: () => void) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Use e.code for physical key location (works across all keyboard layouts)
      // Backquote key with Shift modifier
      if (e.shiftKey && e.code === 'Backquote') {
        e.preventDefault(); // Prevent any potential conflicts
        handler();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handler]);
};
// @cpt-end:cpt-frontx-flow-studio-devtools-panel-toggle:p1:inst-1
// @cpt-end:cpt-frontx-dod-studio-devtools-keyboard:p1:inst-1
