import { describe, expect, it } from 'vitest';

import { REAL_OPS } from '../compile-to-appsscript';

const BOX_OPERATIONS = [
  'action.box:create_folder',
  'action.box:create_shared_link',
  'action.box:download_file',
  'action.box:get_file_info',
  'action.box:list_folder_items',
  'action.box:search',
  'action.box:test_connection',
  'action.box:upload_file',
  'trigger.box:file_deleted',
  'trigger.box:file_uploaded',
] as const;

describe('Apps Script Box REAL_OPS', () => {
  for (const operation of BOX_OPERATIONS) {
    it(`builds ${operation}`, () => {
      expect(REAL_OPS[operation]({})).toMatchSnapshot();
    });
  }
});
