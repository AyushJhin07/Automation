import { beforeAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { REAL_OPS } from '../compile-to-appsscript';
import { runSingleFixture } from '../appsScriptDryRunHarness';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.join(__dirname, 'apps-script-fixtures');

describe('Apps Script Google Drive REAL_OPS', () => {
  it('builds action.google-drive:create_folder', () => {
    expect(REAL_OPS['action.google-drive:create_folder']({})).toMatchSnapshot();
  });
});

describe('Apps Script Google Drive integration', () => {
  let createFolderResult: Awaited<ReturnType<typeof runSingleFixture>>;

  beforeAll(async () => {
    createFolderResult = await runSingleFixture('google-drive-create-folder', fixturesDir);
  });

  it('creates a folder via Google Drive REST API', () => {
    const result = createFolderResult;

    expect(result.success).toBe(true);
    expect(result.context.driveFolderId).toBe('fld-123');
    expect(result.context.googleDriveFolderId).toBe('fld-123');
    expect(result.context.googleDriveFolder).toEqual(
      expect.objectContaining({
        id: 'fld-123',
        name: 'Tier Zero Artifacts',
        parents: ['parent-456']
      })
    );
    expect(result.context.googleDriveParentId).toBe('parent-456');
    expect(result.context.lastCreatedFolderId).toBe('fld-123');

    const successLog = result.logs.find(entry => entry.message.includes('google_drive_create_folder_success'));
    expect(successLog).toBeDefined();

    expect(result.httpCalls).toHaveLength(2);
    expect(result.httpCalls[0]).toMatchObject({
      url: 'https://www.googleapis.com/drive/v3/files/parent-456?fields=id,name,mimeType,trashed&supportsAllDrives=true',
      method: 'GET'
    });
    expect(result.httpCalls[1]).toMatchObject({
      url: 'https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id,name,mimeType,parents,webViewLink,webContentLink,createdTime,modifiedTime,owners',
      method: 'POST'
    });
  });

  it('matches Tier-0 create folder dry-run snapshot', () => {
    const snapshotPayload = {
      context: createFolderResult.context,
      httpCalls: createFolderResult.httpCalls.map(call => ({
        url: call.url,
        method: call.method,
        headers: call.headers,
      })),
    };

    expect(snapshotPayload).toMatchSnapshot();
  });
});
