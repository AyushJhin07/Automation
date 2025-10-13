import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { REAL_OPS } from '../compile-to-appsscript';
import { runSingleFixture } from '../appsScriptDryRunHarness';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, 'apps-script-fixtures');

const GOOGLE_SLIDES_OPERATIONS = [
  'action.google-slides:test_connection',
  'action.google-slides:create_presentation',
  'action.google-slides:get_presentation',
  'action.google-slides:batch_update',
  'action.google-slides:create_slide',
  'action.google-slides:delete_object',
  'action.google-slides:insert_text',
  'action.google-slides:replace_all_text',
  'action.google-slides:create_shape',
  'action.google-slides:create_image'
] as const;

describe('Apps Script Google Slides REAL_OPS', () => {
  for (const operation of GOOGLE_SLIDES_OPERATIONS) {
    it(`builds ${operation}`, () => {
      const builder = REAL_OPS[operation];
      expect(builder).toBeDefined();
      expect(builder({})).toMatchSnapshot();
    });
  }
});

describe('Apps Script Google Slides integration', () => {
  it('creates a slide via Slides batchUpdate', async () => {
    const result = await runSingleFixture('google-slides-create-slide', fixturesDir);

    expect(result.success).toBe(true);
    expect(result.context.googleSlidesPresentationId).toBe('pres-123');
    expect(result.context.googleSlidesSlideId).toBe('slide-002');
    expect(result.context.googleSlidesBatchUpdate).toEqual(
      expect.objectContaining({
        presentationId: 'pres-123'
      })
    );
    expect(result.context.googleSlidesReplies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          createSlide: expect.objectContaining({ objectId: 'slide-002' })
        })
      ])
    );

    const successLog = result.logs.find(entry => entry.message.includes('google_slides_create_slide_success'));
    expect(successLog).toBeDefined();

    expect(result.httpCalls).toHaveLength(1);
    expect(result.httpCalls[0]).toMatchObject({
      url: 'https://slides.googleapis.com/v1/presentations/pres-123:batchUpdate',
      method: 'POST'
    });
    expect(result.httpCalls[0].payload).toEqual(
      expect.objectContaining({
        requests: [
          expect.objectContaining({
            createSlide: expect.objectContaining({
              objectId: 'slide-002',
              slideLayoutReference: expect.objectContaining({ predefinedLayout: 'TITLE_AND_BODY' })
            })
          })
        ]
      })
    );
  });
});
