/**
 * FrontX Application Component (no UIKit, no Studio)
 *
 * Layout + MfeScreenContainer only.
 * Used for projects created with --uikit none --no-studio.
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
