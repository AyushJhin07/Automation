export const GoogleSheetsAppendRowContract = {
  type: 'sheets.append_row',
  app: 'google_sheets',
  requiredFields: [
    { key: 'spreadsheetId', type: 'string', example: '1abc...', help: 'Spreadsheet ID' },
    { key: 'sheet', type: 'string', example: 'Sheet1', help: 'Sheet name or range' },
    { key: 'values', type: 'array', example: ['A','B','C'], help: 'Row values as array' }
  ],
  outputs: ['rowIndex']
} as const;


