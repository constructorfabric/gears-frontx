/**
 * Display formatting shared by both screens.
 *
 * Everything here is computed at render from the instants the dataset resolved
 * at load, never stored: a conversation that read "1h" when the tab opened
 * reads "2h" an hour later without a refetch, which is the behaviour the
 * reference product has.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const MONTH_MS = 30 * DAY_MS;
const YEAR_MS = 365 * DAY_MS;

const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

/** No year - the transcript's date dividers separate days within a visible
 * window, not years, matching the reference's "Jun 7" divider text. */
const dividerDateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

const plural = (count: number, unit: string): string =>
  `${count} ${unit}${count === 1 ? '' : 's'} ago`;

/** The conversation list's compact form: "26m", "1h", "4d". */
export const shortRelativeTime = (iso: string, now: number = Date.now()): string => {
  const elapsed = Math.max(0, now - Date.parse(iso));
  if (elapsed < HOUR_MS) return `${Math.max(1, Math.floor(elapsed / MINUTE_MS))}m`;
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)}h`;
  return `${Math.floor(elapsed / DAY_MS)}d`;
};

/** The contacts table and the activity timeline: "3 hours ago", "2 months ago". */
export const longRelativeTime = (iso: string, now: number = Date.now()): string => {
  const elapsed = Math.max(0, now - Date.parse(iso));
  if (elapsed < MINUTE_MS) return 'just now';
  if (elapsed < HOUR_MS) return plural(Math.floor(elapsed / MINUTE_MS), 'minute');
  if (elapsed < DAY_MS) return plural(Math.floor(elapsed / HOUR_MS), 'hour');
  if (elapsed < MONTH_MS) return plural(Math.floor(elapsed / DAY_MS), 'day');
  if (elapsed < YEAR_MS) return plural(Math.floor(elapsed / MONTH_MS), 'month');
  return plural(Math.floor(elapsed / YEAR_MS), 'year');
};

/** Calendar text for the dates a contact detail shows: "Jun 27, 2025". */
export const absoluteDate = (iso: string): string =>
  iso === '' ? MISSING_VALUE : dateFormat.format(new Date(iso));

/**
 * A transcript message's day-boundary key, read off the calendar-date
 * prefix of `Message.timestamp` ("Aug 21, 2026 - 8:21 AM" -> "Aug 21,
 * 2026"). `timestamp` is calendar text by design (see dataset.ts's header
 * comment on why it is not an ISO instant), so grouping consecutive
 * same-day messages reads that prefix directly rather than re-deriving a
 * separate instant from `ANCHOR_MS` that would have to be kept in step
 * with it by hand.
 */
export const messageDayKey = (timestamp: string): string => timestamp.split(' - ')[0];

/** A date divider's own label: "Aug 21" - the reference's "Jun 7" format,
 * dropping the year and time `messageDayKey` still carries. */
export const messageDayLabel = (timestamp: string): string => {
  const dayKey = messageDayKey(timestamp);
  const parsed = new Date(dayKey);
  return Number.isNaN(parsed.getTime()) ? dayKey : dividerDateFormat.format(parsed);
};

/** The in-bubble timestamp: just the time-of-day half of `Message.timestamp`
 * ("Aug 21, 2026 - 8:21 AM" -> "8:21 AM") - the divider above the message
 * group already carries the date half. */
export const messageTimeOfDay = (timestamp: string): string => {
  const parts = timestamp.split(' - ');
  return parts.length > 1 ? parts[1] : timestamp;
};

/** What the reference renders wherever a contact field has no value. */
export const MISSING_VALUE = '-';

export const orDash = (value: string): string => (value === '' ? MISSING_VALUE : value);

/**
 * The avatar fallback's letters. Derived rather than stored: a name is the only
 * input, so a second field would just be another thing to keep in step.
 */
export const initialsOf = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
};

/** The kit's identity-fill tones, shared by every avatar this app renders
 * (`PresenceAvatar`, `IdentityAvatar`). Picked from a hash of the name so the
 * same person keeps the same circle everywhere they appear - a list row, a
 * thread header, a details panel - without tracking any state of its own. */
const IDENTITY_TONES = ['accent', 'info', 'success', 'warning', 'danger', 'neutral'] as const;

export const identityToneOf = (name: string): (typeof IDENTITY_TONES)[number] => {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) % 100_000;
  }
  return IDENTITY_TONES[hash % IDENTITY_TONES.length];
};

/** The contacts table's own column, read off the address rather than stored. */
export const emailDomain = (email: string): string => {
  const at = email.lastIndexOf('@');
  return at === -1 ? MISSING_VALUE : email.slice(at + 1);
};

const TITLE_CASE: Record<string, string> = {
  none: 'No priority',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
  open: 'Open',
  snoozed: 'Snoozed',
  closed: 'Closed',
  pending: 'Pending',
  chat: 'Chat',
  email: 'Email',
  user: 'User',
  lead: 'Lead',
  online: 'Online',
  offline: 'Offline',
  away: 'Away',
  mail: 'Mail',
  task: 'Task',
  resolved: 'Resolved',
  escalated: 'Escalated',
};

/**
 * The label for a closed vocabulary value. A lookup rather than a capitalise
 * helper because two of the values do not capitalise into their label at all
 * ("none" reads "No priority"), and a missing key is a bug worth seeing.
 */
export const labelOf = (value: string): string => TITLE_CASE[value] ?? value;
