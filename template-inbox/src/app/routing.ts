/**
 * Where the app is, held in the URL fragment.
 *
 * Three routes: `#/inbox`, `#/contacts`, `#/contacts/{id}`. The fragment rather
 * than the path because a fragment needs no server rewrite - a seeded project
 * can serve the built `index.html` from any static host and every deep link
 * still resolves, including the one a "View contact" click writes.
 *
 * A router library would earn its weight at the point this app has nested
 * layouts or loaders to express. With three routes and no nesting it would be a
 * dependency to explain rather than a problem solved, so the parse below is the
 * whole thing and stays replaceable: swap this module and the two `navigate`
 * call sites, and nothing in the screens changes.
 */

import { useEffect, useState } from 'react';

export type Route =
  | { name: 'inbox' }
  | { name: 'contacts' }
  | { name: 'contact'; contactId: string };

export const INBOX_ROUTE = '#/inbox';
export const CONTACTS_ROUTE = '#/contacts';
export const contactRoute = (contactId: string): string =>
  `#/contacts/${encodeURIComponent(contactId)}`;

/** Anything unrecognised - including an empty fragment on first load - is the
 * inbox, which is the app's home. */
export const parseRoute = (hash: string): Route => {
  const segments = hash.replace(/^#\/?/, '').split('/').filter(Boolean);

  if (segments[0] === 'contacts') {
    const contactId = segments[1];
    return contactId === undefined
      ? { name: 'contacts' }
      : { name: 'contact', contactId: decodeURIComponent(contactId) };
  }

  return { name: 'inbox' };
};

export const navigate = (route: string): void => {
  window.location.hash = route;
};

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));

  useEffect(() => {
    const onHashChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    // A fragment can change between the lazy initializer and this listener
    // being attached, and `hashchange` never replays what it missed.
    onHashChange();
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return route;
}
