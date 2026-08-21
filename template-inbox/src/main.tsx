import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// The kit's semantic tokens, imported exactly once and before anything else:
// they paint the page as well as the components, and every rule this app writes
// is expressed in them. Component CSS travels with each component the bundler
// pulls in, so there is nothing else to import.
import '@gears-frontx/ui-kit/theme.css';
import './styles/app.css';
import { registerApiServices } from './api/registry';
import { App } from './app/App';
import { applyStoredTheme } from './app/theme';

// Both before the first render, and in this order: a service the first query
// asks for must already exist, and a theme correction after the first paint
// would be a visible flash.
registerApiServices();
applyStoredTheme();

const container = document.getElementById('root');
if (container === null) {
  throw new Error('index.html is missing its #root element.');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
);
