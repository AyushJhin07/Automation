import { describe, expect, it } from 'vitest';

import { REAL_OPS } from '../compile-to-appsscript';

describe('Apps Script Zoom Enhanced REAL_OPS', () => {
  it('builds action.zoom-enhanced:create_meeting', () => {
    const builder = REAL_OPS['action.zoom-enhanced:create_meeting'];
    expect(builder).toBeDefined();

    const script = builder({
      userId: '{{zoomUserId}}',
      topic: 'Quarterly Business Review',
      start_time: '{{meeting_start}}',
      duration: 45,
      timezone: 'America/Los_Angeles',
      agenda: 'Discuss QBR metrics and next steps.',
      settings: {
        host_video: true,
        participant_video: true,
        waiting_room: true,
        join_before_host: false,
        global_dial_in_countries: ['US', 'CA'],
        alternative_hosts: '{{alternate_hosts}}'
      }
    });

    expect(script).toMatchSnapshot();
  });

  it('builds action.zoom-enhanced:update_meeting', () => {
    const builder = REAL_OPS['action.zoom-enhanced:update_meeting'];
    expect(builder).toBeDefined();

    const script = builder({
      meetingId: '{{meeting_id}}',
      occurrence_id: '{{occurrence_id}}',
      topic: 'Updated QBR Session',
      start_time: '{{rescheduled_start}}',
      duration: 60,
      timezone: 'UTC',
      settings: {
        mute_upon_entry: true,
        waiting_room: false,
        approval_type: 1
      }
    });

    expect(script).toMatchSnapshot();
  });

  it('builds action.zoom-enhanced:delete_meeting', () => {
    const builder = REAL_OPS['action.zoom-enhanced:delete_meeting'];
    expect(builder).toBeDefined();

    const script = builder({
      meetingId: '{{meeting_id}}',
      occurrence_id: '{{occurrence_id}}',
      schedule_for_reminder: false,
      cancel_meeting_reminder: true
    });

    expect(script).toMatchSnapshot();
  });

  it('builds action.zoom-enhanced:create_webinar', () => {
    const builder = REAL_OPS['action.zoom-enhanced:create_webinar'];
    expect(builder).toBeDefined();

    const script = builder({
      userId: '{{zoomUserId}}',
      topic: 'Product Launch Webinar',
      start_time: '{{webinar_start}}',
      duration: 90,
      timezone: 'America/New_York',
      agenda: 'Deep dive into new feature launch',
      settings: {
        approval_type: 0,
        auto_recording: 'cloud',
        panelists_video: true,
        practice_session: true,
        contact_email: 'events@example.com',
        contact_name: 'Launch Coordinator'
      }
    });

    expect(script).toMatchSnapshot();
  });
});
