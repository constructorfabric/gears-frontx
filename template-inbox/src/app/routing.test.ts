import { describe, expect, it } from 'vitest';
import { contactRoute, parseRoute } from './routing';

describe('parseRoute', () => {
  it('opens on chat for the addresses a first visit can arrive with', () => {
    // An empty fragment is what a bare origin gives; the trailing-slash and
    // unknown forms are what a hand-edited or stale link gives, `#/inbox`
    // is what a link written before the section was renamed to Chat gives,
    // and `#/chat` is the route itself.
    for (const hash of ['', '#', '#/', '#/chat', '#/inbox', '#/nowhere']) {
      expect(parseRoute(hash)).toEqual({ name: 'inbox' });
    }
  });

  it('separates the directory from one person', () => {
    expect(parseRoute('#/contacts')).toEqual({ name: 'contacts' });
    expect(parseRoute('#/contacts/r-26')).toEqual({ name: 'contact', contactId: 'r-26' });
  });

  it('round-trips an id through the encoding the link is written with', () => {
    // Ids are opaque to this app - whatever the backend calls a contact has to
    // survive the trip into a URL and back out of it.
    const contactId = 'r/26 +x';
    expect(parseRoute(contactRoute(contactId))).toEqual({ name: 'contact', contactId });
  });
});
