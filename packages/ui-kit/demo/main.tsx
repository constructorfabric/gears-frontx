import {
  Component,
  lazy,
  StrictMode,
  Suspense,
  useEffect,
  useState,
  type ComponentType,
  type CSSProperties,
  type ErrorInfo,
  type LazyExoticComponent,
  type ReactNode,
} from 'react';
import { createRoot } from 'react-dom/client';

import '@gears-frontx/ui-kit/theme.css';
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
  Separator,
  Skeleton,
  Toaster,
} from '@gears-frontx/ui-kit';

import { LayoutElevationPage } from './pages/layout-elevation-page';
import { SemanticColorsPage } from './pages/semantic-colors-page';
import { TypographyPage } from './pages/typography-page';
import { Row } from './shared';

/**
 * The former single Tokens page, split into one page per foundations board
 * in the Figma mockup (background/surface/... swatches, type specimens,
 * layout+elevation). No Primitive Palette page: theme.css defines no
 * primitive color ramps (semantic tokens only), so there is nothing to
 * port for that board — see the demo README / task report for the gap.
 * No separate Light/Dark pages either: the header's theme toggle already
 * covers both for every page below.
 */
const PAGES: { slug: string; label: string; Component: ComponentType }[] = [
  { slug: 'semantic-colors', label: 'Semantic Colors', Component: SemanticColorsPage },
  { slug: 'typography', label: 'Typography', Component: TypographyPage },
  { slug: 'layout-elevation', label: 'Layout & Elevation', Component: LayoutElevationPage },
];

/**
 * One example module per component, discovered by filename rather than
 * hand-listed here — the whole point (see task brief): other agents add
 * `examples/<slug>.tsx` files for components as they land, and the menu
 * picks them up on the next save with no shell edit.
 *
 * Deliberately NOT `eager: true`: this glob previously imported every
 * example module up front, so one file that imports a component missing
 * from the barrel (a real incident — a component ported into src/ but not
 * yet re-exported from index.ts) threw during module evaluation and took
 * the entire app down to a white screen before React ever got to render
 * anything, menu included. A lazy loader per slug defers that import to
 * the moment its screen is actually opened, and ExampleErrorBoundary below
 * catches it there — broken or not-yet-wired components stay contained to
 * their own screen.
 */
type ExampleModule = { default: ComponentType };
const exampleLoaders = import.meta.glob<ExampleModule>('./examples/*.tsx');

interface ComponentEntry {
  /** Filename stem — also the hash route token, e.g. "dropdown-menu". */
  slug: string;
  /** Title-cased for display, with any "-backup" suffix stripped (the
   *  Badge marker communicates that instead — see BACKUP_SUFFIX below). */
  label: string;
  backup: boolean;
  Component: LazyExoticComponent<ComponentType>;
}

const BACKUP_SUFFIX = '-backup';

/** Strips a "-backup" suffix so a backup screen's docs link points at its
 *  base component's upstream page (there is no separate shadcn page for
 *  the backup variant). */
function baseSlug(slug: string): string {
  return slug.endsWith(BACKUP_SUFFIX) ? slug.slice(0, -BACKUP_SUFFIX.length) : slug;
}

/** Every component slug in this demo maps 1:1 onto a shadcn/ui docs page
 *  under /docs/components/base/ — verified directly against the live site
 *  rather than assumed, including the two slugs that looked like they
 *  might not have one ("direction", "date-picker"/"data-table" all
 *  resolve to real pages, not shadcn's soft-404). */
function shadcnDocsUrl(slug: string): string {
  return `https://ui.shadcn.com/docs/components/base/${baseSlug(slug)}`;
}

function toTitleCase(slug: string): string {
  return slug
    .split('-')
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(' ');
}

const COMPONENTS: ComponentEntry[] = Object.entries(exampleLoaders)
  .map(([path, load]) => {
    const slug = path.replace(/^\.\/examples\//, '').replace(/\.tsx$/, '');
    const backup = slug.endsWith(BACKUP_SUFFIX);
    return { slug, label: toTitleCase(baseSlug(slug)), backup, Component: lazy(load) };
  })
  .sort((a, b) => a.slug.localeCompare(b.slug));

/**
 * Contains a crash to the screen that caused it. `key`'d by slug at the
 * call site so navigating away and back remounts a fresh boundary instead
 * of replaying a stale error from a previous screen. The message renders
 * inside the same kit Card the working screens use (CardHeader stays
 * visible above it) — plain text on `--destructive`, not a one-off alert
 * box, since no alert/callout component is in the barrel yet either.
 */
class ExampleErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: unknown): { error: Error } {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    // The Card message is the user-facing half; the full stack still goes
    // to the console for whoever's debugging the broken example.
    console.error('[ui-kit demo] example screen crashed:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <p style={{ margin: 0, color: 'var(--destructive)' }}>
          This example crashed: {this.state.error.message}
        </p>
      );
    }
    return this.props.children;
  }
}

type Route = { kind: 'page'; slug: string } | { kind: 'component'; slug: string };

function defaultRoute(): Route {
  // Land on the first component alphabetically, same as shadcn's docs
  // landing on its first entry — the token pages stay one click away in
  // the menu.
  return COMPONENTS.length > 0
    ? { kind: 'component', slug: COMPONENTS[0]!.slug }
    : { kind: 'page', slug: PAGES[0]!.slug };
}

function parseHash(hash: string): Route {
  const token = hash.replace(/^#\/?/, '');
  // Legacy deep link to the pre-split single Tokens page — route it to the
  // first of the four pages rather than 404ing an old bookmark.
  if (token === 'tokens') return { kind: 'page', slug: PAGES[0]!.slug };
  const page = PAGES.find((entry) => entry.slug === token);
  if (page) return { kind: 'page', slug: page.slug };
  const found = COMPONENTS.find((entry) => entry.slug === token);
  return found ? { kind: 'component', slug: found.slug } : defaultRoute();
}

function canonicalHash(route: Route): string {
  return `#/${route.slug}`;
}

/**
 * Two-way binding to location.hash, so back/forward and deep links work.
 *
 * Normalization (an empty hash on first load, or an unrecognized one from
 * a hand-edited URL, or a stale link to a component another agent hasn't
 * added an example for yet) uses history.replaceState, not a hash
 * assignment: assigning to `location.hash` always pushes a new history
 * entry, even when the "navigation" is really this hook correcting the URL
 * to match state it already decided on. Doing that on load pushed an entry
 * nobody asked for, so Back needed two presses to actually leave the page
 * instead of one. Hash assignment is reserved for `navigate` below, the
 * one path a user actually chose to go somewhere.
 */
function useHashRoute(): [Route, (route: Route) => void] {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const follow = () => {
      const next = parseHash(window.location.hash);
      if (window.location.hash !== canonicalHash(next)) {
        window.history.replaceState(null, '', canonicalHash(next));
      }
      setRoute(next);
    };
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, []);
  useEffect(() => {
    if (window.location.hash !== canonicalHash(route)) {
      window.history.replaceState(null, '', canonicalHash(route));
    }
  }, [route]);
  const navigate = (next: Route) => {
    setRoute(next);
    window.location.hash = canonicalHash(next).slice(1);
  };
  return [route, navigate];
}

function NavButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      size="sm"
      variant={active ? 'secondary' : 'ghost'}
      aria-current={active ? 'page' : undefined}
      onClick={onClick}
      style={{ justifyContent: 'flex-start', width: '100%' }}
    >
      {children}
    </Button>
  );
}

// 'auto' (system preference) is the implicit default and deliberately
// never written to storage — only an explicit light/dark choice persists,
// so a device whose OS scheme changes later still tracks it until the
// viewer opts out. The synchronous read in index.html's inline script
// applies the same stored value to <html data-theme> before this module
// even loads, so the first paint already matches; this constant just
// keeps the key in one place between the two reads.
const THEME_STORAGE_KEY = 'ui-kit-demo-theme';

function readStoredTheme(): string {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'auto';
  } catch {
    // Storage can throw (private browsing, disabled cookies/storage) —
    // fall back to the session-only 'auto' default rather than crash.
    return 'auto';
  }
}

function App() {
  const [theme, setTheme] = useState(readStoredTheme);
  const [route, navigate] = useHashRoute();
  useEffect(() => {
    if (theme === 'auto') {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = theme;
    }
    try {
      if (theme === 'auto') {
        window.localStorage.removeItem(THEME_STORAGE_KEY);
      } else {
        window.localStorage.setItem(THEME_STORAGE_KEY, theme);
      }
    } catch {
      // Same storage caveat as readStoredTheme — the toggle still works
      // for the session, it just won't survive a reload.
    }
  }, [theme]);

  const active = route.kind === 'component' ? COMPONENTS.find((entry) => entry.slug === route.slug) : undefined;
  const activePage = route.kind === 'page' ? PAGES.find((entry) => entry.slug === route.slug) : undefined;

  return (
    <main
      style={{
        maxWidth: 1120,
        margin: '0 auto',
        padding: 'var(--space-8) var(--space-6)',
        display: 'grid',
        gap: 'var(--space-6)',
        alignContent: 'start',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 'var(--space-4)',
          flexWrap: 'wrap',
        }}
      >
        {/* Display off the ramp — see shared.tsx's Section heading. */}
        <h1
          style={{
            margin: 0,
            fontSize: 'var(--text-display-size)',
            lineHeight: 'var(--text-display-line-height)',
            fontWeight: 'var(--text-display-weight)' as CSSProperties['fontWeight'],
            letterSpacing: 'var(--text-display-tracking)',
          }}
        >
          FrontX UiKit
        </h1>
        <Row>
          {['auto', 'light', 'dark'].map((mode) => (
            <Button
              key={mode}
              size="sm"
              variant={theme === mode ? 'default' : 'outline'}
              onClick={() => setTheme(mode)}
            >
              {mode}
            </Button>
          ))}
        </Row>
      </header>

      {/* Left: the component menu, a simple layout grid using theme.css
          tokens for the gap only; every visible piece inside is a kit
          component (Button, Separator, Badge, Card). Right: the selected
          screen, framed in the kit's own Card — the same framing a
          consumer would reach for around any content block. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '220px minmax(0, 1fr)',
          gap: 'var(--space-6)',
          alignItems: 'start',
        }}
      >
        <Card>
          <CardContent style={{ display: 'grid', gap: 'var(--space-1)' }}>
            {PAGES.map((entry) => (
              <NavButton
                key={entry.slug}
                active={route.kind === 'page' && route.slug === entry.slug}
                onClick={() => navigate({ kind: 'page', slug: entry.slug })}
              >
                {entry.label}
              </NavButton>
            ))}
            <Separator style={{ margin: 'var(--space-2) 0' }} />
            {COMPONENTS.length === 0 ? (
              <p style={{ margin: 0, color: 'var(--muted-foreground)', fontSize: 'var(--text-meta-size)' }}>
                No components yet.
              </p>
            ) : (
              COMPONENTS.map((entry) => (
                <NavButton
                  key={entry.slug}
                  active={route.kind === 'component' && route.slug === entry.slug}
                  onClick={() => navigate({ kind: 'component', slug: entry.slug })}
                >
                  <Row style={{ justifyContent: 'space-between', width: '100%', flexWrap: 'nowrap' }}>
                    <span>{entry.label}</span>
                    {entry.backup && <Badge variant="outline">backup</Badge>}
                  </Row>
                </NavButton>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              {route.kind === 'page' ? (activePage?.label ?? route.slug) : (active?.label ?? route.slug)}
              {active?.backup && <Badge variant="outline">backup</Badge>}
            </CardTitle>
            {/* Components only, never the Foundations pages: an unobtrusive
                pointer at the upstream shadcn/ui page this screen ports.
                CardAction places it top-right next to the title (the same
                slot shadcn's own docs use for header-level links); the
                link itself is a plain <a>, not a kit Button, styled off
                the same --link-foreground/--text-meta-size tokens the
                kit's own Button variant="link" uses (button.module.css). */}
            {route.kind === 'component' && active && (
              <CardAction>
                <a
                  href={shadcnDocsUrl(active.slug)}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    color: 'var(--link-foreground)',
                    fontSize: 'var(--text-meta-size)',
                    textDecoration: 'none',
                  }}
                >
                  shadcn docs ↗
                </a>
              </CardAction>
            )}
          </CardHeader>
          <CardContent style={{ display: 'grid', gap: 'var(--space-4)' }}>
            {route.kind === 'page' ? (
              activePage ? <activePage.Component /> : null
            ) : active ? (
              <ExampleErrorBoundary key={active.slug}>
                <Suspense fallback={<Skeleton style={{ width: '100%', height: 120 }} />}>
                  <active.Component />
                </Suspense>
              </ExampleErrorBoundary>
            ) : (
              // No examples/<slug>.tsx yet for this route — graceful
              // placeholder rather than a crash, since other agents add
              // these files concurrently and a stale link can outrun them.
              <p style={{ margin: 0, color: 'var(--muted-foreground)' }}>
                No example found for “{route.slug}” yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Toaster />
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
