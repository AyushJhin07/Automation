export { GoogleSheetsAppendRowContract } from '../../shared/catalog/google_sheets.append_row';

// Central CONTRACTS registry (extend as you add more contracts)
import { GoogleSheetsAppendRowContract as SheetsAppend } from '../../shared/catalog/google_sheets.append_row';

export const CONTRACTS: Record<string, any> = {
  'sheets.append_row': SheetsAppend
};


