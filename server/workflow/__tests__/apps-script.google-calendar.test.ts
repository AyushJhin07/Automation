import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { REAL_OPS } from '../compile-to-appsscript';
import { runSingleFixture } from '../appsScriptDryRunHarness';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, 'apps-script-fixtures');

const GOOGLE_CALENDAR_OPERATIONS = [
  'action.google-calendar:create_event',
  'action.google-calendar:update_event',
  'action.google-calendar:get_event',
  'action.google-calendar:list_events',
  'action.google-calendar:delete_event',
  'trigger.google-calendar:event_created',
  'trigger.google-calendar:event_updated',
  'trigger.google-calendar:event_starting_soon'
] as const;

describe('Apps Script Google Calendar REAL_OPS', () => {
  for (const operation of GOOGLE_CALENDAR_OPERATIONS) {
    it(`builds ${operation}`, () => {
      expect(REAL_OPS[operation]({})).toMatchSnapshot();
    });
  }
});

describe('Apps Script Google Calendar integration', () => {
  it('creates an event via the Google Calendar REST API', async () => {
    const result = await runSingleFixture('google-calendar-create-event', fixturesDir);

    expect(result.success).toBe(true);
    expect(result.context.googleCalendarEventId).toBe('evt-123');
    expect(result.context.googleCalendarCalendarId).toBe('primary');
    expect(result.context.googleCalendarEvent).toEqual(
      expect.objectContaining({
        id: 'evt-123',
        summary: 'Tier 0 Deployment Sync',
        start: expect.any(Object),
        end: expect.any(Object)
      })
    );

    const logEntry = result.logs.find(entry => entry.message.includes('google_calendar_create_event_success'));
    expect(logEntry).toBeDefined();

    expect(result.httpCalls).toHaveLength(1);
    expect(result.httpCalls[0]).toMatchObject({
      url: 'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      method: 'POST'
    });
  });
});
