/**
 * HAI3 Application Component (no UIKit, with Studio)
 *
 * Layout + MfeScreenContainer + StudioOverlay.
 * Used for projects created with --uikit none and studio enabled.
 * Layout is project-provided (minimal or custom).
 */

import { Layout } from '@/app/layout';
import { StudioOverlay } from '@gears-frontx/studio';
import { MfeScreenContainer } from '@/app/mfe/MfeScreenContainer';

function App() {
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
