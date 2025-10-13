import { describe, expect, it } from 'vitest';

import { REAL_OPS } from '../compile-to-appsscript';

const DROPBOX_OPERATIONS = [
  'action.dropbox:copy_file',
  'action.dropbox:create_folder',
  'action.dropbox:create_shared_link',
  'action.dropbox:delete_file',
  'action.dropbox:download_file',
  'action.dropbox:get_metadata',
  'action.dropbox:list_folder',
  'action.dropbox:move_file',
  'action.dropbox:search',
  'action.dropbox:test_connection',
  'action.dropbox:upload_file',
  'trigger.dropbox:file_deleted',
  'trigger.dropbox:file_uploaded',
] as const;

describe('Apps Script Dropbox REAL_OPS', () => {
  for (const operation of DROPBOX_OPERATIONS) {
    it(`builds ${operation}`, () => {
      expect(REAL_OPS[operation]({})).toMatchSnapshot();
    });
  }
});
