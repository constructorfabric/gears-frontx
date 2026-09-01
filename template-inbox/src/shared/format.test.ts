import { describe, expect, it } from 'vitest';
import { messageDayKey, messageDayLabel, messageTimeOfDay } from './format';

describe('messageDayKey', () => {
  it('reads the calendar-date prefix off a transcript timestamp', () => {
    expect(messageDayKey('Aug 21, 2026 - 8:21 AM')).toBe('Aug 21, 2026');
  });

  it('gives two messages on the same day the same key, and a different day a different one', () => {
    const morning = messageDayKey('Aug 21, 2026 - 8:21 AM');
    const evening = messageDayKey('Aug 21, 2026 - 10:01 AM');
    const nextDay = messageDayKey('Aug 22, 2026 - 8:21 AM');
    expect(morning).toBe(evening);
    expect(morning).not.toBe(nextDay);
  });
});

describe('messageDayLabel', () => {
  it('drops the year and time, matching the reference divider format', () => {
    expect(messageDayLabel('Aug 21, 2026 - 8:21 AM')).toBe('Aug 21');
  });
});

describe('messageTimeOfDay', () => {
  it('keeps only the time-of-day half of a transcript timestamp', () => {
    expect(messageTimeOfDay('Aug 21, 2026 - 8:21 AM')).toBe('8:21 AM');
  });

  it('returns the input unchanged if it has no " - " separator', () => {
    expect(messageTimeOfDay('8:21 AM')).toBe('8:21 AM');
  });
});
