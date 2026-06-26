/**
 * FrontX Application Component (no Studio)
 *
 * Same as App.tsx but without StudioOverlay.
 * Used for projects created with --no-studio.
 */

import { Layout } from '@/app/layout';
import { MfeScreenContainer } from '@/app/mfe/MfeScreenContainer';

function App() {
  return (
    <Layout>
      <MfeScreenContainer />
    </Layout>
  );
}

export default App;
