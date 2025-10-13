import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { REAL_OPS } from '../compile-to-appsscript';
import { runSingleFixture } from '../appsScriptDryRunHarness';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, 'apps-script-fixtures');

describe('Apps Script Notion REAL_OPS', () => {
  it('builds action.notion:create_page', () => {
    const config = {
      parent: { type: 'database_id' },
      properties: {
        Name: {
          title: [
            {
              text: { content: '{{pageTitle}}' }
            }
          ]
        },
        Status: {
          select: { name: 'In Progress' }
        }
      },
      children: [
        {
          type: 'paragraph',
          paragraph: {
            text: [
              {
                type: 'text',
                text: { content: 'Automation generated content.' }
              }
            ]
          }
        }
      ],
      icon: { type: 'emoji', emoji: '⚡' },
      cover: { type: 'external', external: { url: 'https://example.com/cover.png' } }
    };

    expect(REAL_OPS['action.notion:create_page'](config)).toMatchSnapshot();
  });
});

describe('Apps Script Notion integration', () => {
  it('creates a page via the Notion REST API', async () => {
    const result = await runSingleFixture('notion-create-page', fixturesDir);

    expect(result.success).toBe(true);
    expect(result.context.notionPageId).toBe('page-123');
    expect(result.context.notionPageUrl).toBe('https://www.notion.so/Test-Page');
    expect(result.context.notionCreatePageResponse).toMatchObject({
      status: 200,
      requestId: 'req-notion-1'
    });
    expect(result.httpCalls).toHaveLength(1);
    expect(result.httpCalls[0].url).toBe('https://api.notion.com/v1/pages');
  });
});
