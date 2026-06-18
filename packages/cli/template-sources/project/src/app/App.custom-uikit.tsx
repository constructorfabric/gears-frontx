/**
 * HAI3 Application Component (custom UI kit, with Studio)
 *
 * Syncs HAI3 theme changes to the library's imperative theme API.
 * Placeholders in this template are replaced by the project generator
 * with bridge-specific code for the configured UI library.
 */

import { useEffect } from 'react';
import { useTheme } from '@gears-frontx/react';
import { Layout } from '@/app/layout';
import { StudioOverlay } from '@gears-frontx/studio';
import { MfeScreenContainer } from '@/app/mfe/MfeScreenContainer';
__LIBRARY_SYNC_IMPORT__

function App() {
  const { currentTheme } = useTheme();

  useEffect(() => {
    const cleanup = initializeThemeSystem();
    return cleanup;
  }, []);

  useEffect(() => {
__LIBRARY_SYNC_EFFECT__
  }, [currentTheme]);

  return (
    <>
      <Layout>
        <MfeScreenContainer />
      </Layout>
      <StudioOverlay />
    </>
  );
}

export default App;
