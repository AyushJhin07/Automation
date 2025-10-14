function googleSheetsEnhancedHelpersBlock(): string {
  return `
if (typeof googleSheetsEnhancedParseSpreadsheetId !== 'function') {
  function googleSheetsEnhancedParseSpreadsheetId(value) {
    if (!value) {
      return '';
    }
    if (typeof value === 'string') {
      var trimmed = value.trim();
      if (!trimmed) {
        return '';
      }
      var directMatch = trimmed.match(/^[a-zA-Z0-9-_]{10,}$/);
      if (directMatch) {
        return trimmed;
      }
      var urlMatch = trimmed.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      if (urlMatch && urlMatch[1]) {
        return urlMatch[1];
      }
    }
    return '';
  }
}

function buildGoogleSheetsEnhancedAction(operation: string, config: any): string {
  const configLiteral = JSON.stringify(prepareValueForCode(config ?? {}));

  if (operation === 'test_connection') {
    return `
function step_action_google_sheets_enhanced_test_connection(ctx) {
  ctx = ctx || {};
  const config = ${configLiteral};
  const interpolationContext = ctx || {};
  const spreadsheetId = googleSheetsEnhancedResolveSpreadsheetId(config, interpolationContext);
  const accessToken = googleSheetsEnhancedGetAccessToken([
    'https://www.googleapis.com/auth/spreadsheets.readonly',
    'https://www.googleapis.com/auth/drive.metadata.readonly'
  ]);
  const fields = 'spreadsheetId,spreadsheetUrl,properties(title,timeZone),sheets(properties(sheetId,title,index,gridProperties(rowCount,columnCount)))';

  try {
    const response = googleSheetsEnhancedFetchSpreadsheet(spreadsheetId, accessToken, fields, false, []);
    const body = response || {};
    const result = {
      success: true,
      spreadsheetId: spreadsheetId,
      properties: body.properties || {},
      sheets: body.sheets || [],
      spreadsheetUrl: body.spreadsheetUrl || null
    };
    ctx.googleSheetsEnhancedTestConnection = result;
    ctx.googleSheetsEnhancedLastResult = result;
    ctx.spreadsheetId = ctx.spreadsheetId || spreadsheetId;
    logInfo('google_sheets_enhanced_test_connection_success', {
      spreadsheetId: spreadsheetId,
      sheetCount: Array.isArray(body.sheets) ? body.sheets.length : 0
    });
    return ctx;
  } catch (error) {
    const status = error && typeof error.status === 'number' ? error.status : null;
    const message = error && error.message ? error.message : String(error);
    logError('google_sheets_enhanced_test_connection_failed', {
      spreadsheetId: spreadsheetId,
      status: status,
      message: message
    });
    throw error;
  }
}
${googleSheetsEnhancedHelpersBlock()}`;
  }

  if (operation === 'append_row') {
    return `
function step_action_google_sheets_enhanced_append_row(ctx) {
  ctx = ctx || {};
  const config = ${configLiteral};
  const interpolationContext = ctx || {};
  const spreadsheetId = googleSheetsEnhancedResolveSpreadsheetId(config, interpolationContext);
  const targetRange = googleSheetsEnhancedResolveRange(config, interpolationContext);
  const sheetName = googleSheetsEnhancedResolveSheetName(config, interpolationContext);
  const values = googleSheetsEnhancedResolveValues(config.values, interpolationContext, { fallbackKey: 'values' });
  if (!Array.isArray(values) || values.length === 0 || !Array.isArray(values[0]) || values[0].length === 0) {
    throw new Error('Google Sheets Enhanced append_row requires a non-empty values array');
  }
  const valueInputOption = (googleSheetsEnhancedResolveString(config.valueInputOption, interpolationContext) || 'USER_ENTERED').toUpperCase();
  const insertOption = (googleSheetsEnhancedResolveString(config.insertDataOption, interpolationContext) || 'INSERT_ROWS').toUpperCase();
  const includeValues = config.includeValuesInResponse !== false;
  const accessToken = googleSheetsEnhancedGetAccessToken(['https://www.googleapis.com/auth/spreadsheets']);
  let url = 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(spreadsheetId) + '/values/' + encodeURIComponent(targetRange) + ':append';
  const params = [
    'valueInputOption=' + encodeURIComponent(valueInputOption),
    'insertDataOption=' + encodeURIComponent(insertOption)
  ];
  if (includeValues) {
    params.push('includeValuesInResponse=true');
  }
  if (params.length) {
    url += '?' + params.join('&');
  }

  try {
    const response = googleSheetsEnhancedApiRequest('POST', url, accessToken, { values: values }, { attempts: 4 });
    const body = response.body || {};
    const updates = body.updates || {};
    const summary = {
      success: true,
      spreadsheetId: spreadsheetId,
      updatedRange: updates.updatedRange || (updates.updatedData && updates.updatedData.range) || null,
      updatedRows: typeof updates.updatedRows === 'number' ? updates.updatedRows : Number(updates.updatedRows || 0),
      updatedColumns: typeof updates.updatedColumns === 'number' ? updates.updatedColumns : Number(updates.updatedColumns || 0),
      values: updates.updatedData && updates.updatedData.values ? updates.updatedData.values : values
    };
    let appendedRowNumber = null;
    if (summary.updatedRange) {
      const rowMatch = String(summary.updatedRange).match(/!.*?(\d+)/);
      if (rowMatch && rowMatch[1]) {
        appendedRowNumber = Number(rowMatch[1]);
      }
    }
    if (appendedRowNumber !== null && !isNaN(appendedRowNumber)) {
      summary.rowNumber = appendedRowNumber;
      ctx.rowNumber = appendedRowNumber;
      ctx.row = appendedRowNumber;
    }
    ctx.googleSheetsEnhancedAppendRow = summary;
    ctx.googleSheetsEnhancedLastResult = summary;
    ctx.spreadsheetId = ctx.spreadsheetId || spreadsheetId;
    ctx.sheetName = ctx.sheetName || sheetName;
    logInfo('google_sheets_enhanced_append_row_success', {
      spreadsheetId: spreadsheetId,
      range: targetRange,
      updatedRange: summary.updatedRange,
      updatedRows: summary.updatedRows
    });
    return ctx;
  } catch (error) {
    const status = error && typeof error.status === 'number' ? error.status : null;
    const message = error && error.message ? error.message : String(error);
    logError('google_sheets_enhanced_append_row_failed', {
      spreadsheetId: spreadsheetId,
      range: targetRange,
      status: status,
      message: message
    });
    throw error;
  }
}
${googleSheetsEnhancedHelpersBlock()}`;
  }

  if (operation === 'update_cell') {
    return `
function step_action_google_sheets_enhanced_update_cell(ctx) {
  ctx = ctx || {};
  const config = ${configLiteral};
  const interpolationContext = ctx || {};
  const spreadsheetId = googleSheetsEnhancedResolveSpreadsheetId(config, interpolationContext);
  const range = googleSheetsEnhancedResolveRange(config, interpolationContext);
  const configuredValue = typeof config.value !== 'undefined' ? [[config.value]] : null;
  const value = googleSheetsEnhancedResolveValues(configuredValue, interpolationContext, { fallbackKey: 'value' });
  const valueInputOption = (googleSheetsEnhancedResolveString(config.valueInputOption, interpolationContext) || 'USER_ENTERED').toUpperCase();
  if (!Array.isArray(value) || value.length === 0 || !Array.isArray(value[0])) {
    throw new Error('Google Sheets Enhanced update_cell requires a value');
  }
  const accessToken = googleSheetsEnhancedGetAccessToken(['https://www.googleapis.com/auth/spreadsheets']);
  const url = 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(spreadsheetId) + '/values/' + encodeURIComponent(range) + '?valueInputOption=' + encodeURIComponent(valueInputOption);

  try {
    const response = googleSheetsEnhancedApiRequest('PUT', url, accessToken, { values: value }, { attempts: 4 });
    const updates = response.body || {};
    const summary = {
      success: true,
      spreadsheetId: spreadsheetId,
      updatedRange: updates.updatedRange || range,
      updatedRows: typeof updates.updatedRows === 'number' ? updates.updatedRows : Number(updates.updatedRows || 0),
      updatedColumns: typeof updates.updatedColumns === 'number' ? updates.updatedColumns : Number(updates.updatedColumns || 0),
      values: value
    };
    ctx.googleSheetsEnhancedUpdateCell = summary;
    ctx.googleSheetsEnhancedLastResult = summary;
    ctx.spreadsheetId = ctx.spreadsheetId || spreadsheetId;
    logInfo('google_sheets_enhanced_update_cell_success', {
      spreadsheetId: spreadsheetId,
      range: range,
      updatedRows: summary.updatedRows,
      updatedColumns: summary.updatedColumns
    });
    return ctx;
  } catch (error) {
    const status = error && typeof error.status === 'number' ? error.status : null;
    const message = error && error.message ? error.message : String(error);
    logError('google_sheets_enhanced_update_cell_failed', {
      spreadsheetId: spreadsheetId,
      range: range,
      status: status,
      message: message
    });
    throw error;
  }
}
${googleSheetsEnhancedHelpersBlock()}`;
  }

  if (operation === 'update_range') {
    return `
function step_action_google_sheets_enhanced_update_range(ctx) {
  ctx = ctx || {};
  const config = ${configLiteral};
  const interpolationContext = ctx || {};
  const spreadsheetId = googleSheetsEnhancedResolveSpreadsheetId(config, interpolationContext);
  const range = googleSheetsEnhancedResolveRange(config, interpolationContext);
  const values = googleSheetsEnhancedResolveValues(config.values, interpolationContext, { fallbackKey: 'values' });
  if (!Array.isArray(values) || values.length === 0 || !Array.isArray(values[0])) {
    throw new Error('Google Sheets Enhanced update_range requires a 2D values array');
  }
  const valueInputOption = (googleSheetsEnhancedResolveString(config.valueInputOption, interpolationContext) || 'USER_ENTERED').toUpperCase();
  const accessToken = googleSheetsEnhancedGetAccessToken(['https://www.googleapis.com/auth/spreadsheets']);
  const url = 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(spreadsheetId) + '/values/' + encodeURIComponent(range) + '?valueInputOption=' + encodeURIComponent(valueInputOption);

  try {
    const response = googleSheetsEnhancedApiRequest('PUT', url, accessToken, { values: values }, { attempts: 4 });
    const updates = response.body || {};
    const summary = {
      success: true,
      spreadsheetId: spreadsheetId,
      updatedRange: updates.updatedRange || range,
      updatedRows: typeof updates.updatedRows === 'number' ? updates.updatedRows : Number(updates.updatedRows || 0),
      updatedColumns: typeof updates.updatedColumns === 'number' ? updates.updatedColumns : Number(updates.updatedColumns || 0),
      values: values
    };
    ctx.googleSheetsEnhancedUpdateRange = summary;
    ctx.googleSheetsEnhancedLastResult = summary;
    ctx.spreadsheetId = ctx.spreadsheetId || spreadsheetId;
    logInfo('google_sheets_enhanced_update_range_success', {
      spreadsheetId: spreadsheetId,
      range: range,
      updatedRows: summary.updatedRows,
      updatedColumns: summary.updatedColumns
    });
    return ctx;
  } catch (error) {
    const status = error && typeof error.status === 'number' ? error.status : null;
    const message = error && error.message ? error.message : String(error);
    logError('google_sheets_enhanced_update_range_failed', {
      spreadsheetId: spreadsheetId,
      range: range,
      status: status,
      message: message
    });
    throw error;
  }
}
${googleSheetsEnhancedHelpersBlock()}`;
  }

  if (operation === 'get_values') {
    return `
function step_action_google_sheets_enhanced_get_values(ctx) {
  ctx = ctx || {};
  const config = ${configLiteral};
  const interpolationContext = ctx || {};
  const spreadsheetId = googleSheetsEnhancedResolveSpreadsheetId(config, interpolationContext);
  const range = googleSheetsEnhancedResolveRange(config, interpolationContext);
  const valueRenderOption = (googleSheetsEnhancedResolveString(config.valueRenderOption, interpolationContext) || 'FORMATTED_VALUE').toUpperCase();
  const dateTimeRenderOption = (googleSheetsEnhancedResolveString(config.dateTimeRenderOption, interpolationContext) || 'FORMATTED_STRING').toUpperCase();
  const accessToken = googleSheetsEnhancedGetAccessToken(['https://www.googleapis.com/auth/spreadsheets.readonly']);
  const url = 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(spreadsheetId) + '/values/' + encodeURIComponent(range) + '?majorDimension=ROWS&valueRenderOption=' + encodeURIComponent(valueRenderOption) + '&dateTimeRenderOption=' + encodeURIComponent(dateTimeRenderOption);

  try {
    const response = googleSheetsEnhancedApiRequest('GET', url, accessToken, null, { attempts: 4 });
    const body = response.body || {};
    const values = Array.isArray(body.values) ? body.values : [];
    const summary = {
      success: true,
      spreadsheetId: spreadsheetId,
      range: body.range || range,
      majorDimension: body.majorDimension || 'ROWS',
      values: values
    };
    ctx.googleSheetsEnhancedGetValues = summary;
    ctx.googleSheetsEnhancedLastResult = summary;
    ctx.spreadsheetId = ctx.spreadsheetId || spreadsheetId;
    logInfo('google_sheets_enhanced_get_values_success', {
      spreadsheetId: spreadsheetId,
      range: range,
      rowCount: values.length
    });
    return ctx;
  } catch (error) {
    const status = error && typeof error.status === 'number' ? error.status : null;
    const message = error && error.message ? error.message : String(error);
    logError('google_sheets_enhanced_get_values_failed', {
      spreadsheetId: spreadsheetId,
      range: range,
      status: status,
      message: message
    });
    throw error;
  }
}
${googleSheetsEnhancedHelpersBlock()}`;
  }

  if (operation === 'clear_range') {
    return `
function step_action_google_sheets_enhanced_clear_range(ctx) {
  ctx = ctx || {};
  const config = ${configLiteral};
  const interpolationContext = ctx || {};
  const spreadsheetId = googleSheetsEnhancedResolveSpreadsheetId(config, interpolationContext);
  const range = googleSheetsEnhancedResolveRange(config, interpolationContext);
  const accessToken = googleSheetsEnhancedGetAccessToken(['https://www.googleapis.com/auth/spreadsheets']);
  const url = 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(spreadsheetId) + '/values/' + encodeURIComponent(range) + ':clear';

  try {
    const response = googleSheetsEnhancedApiRequest('POST', url, accessToken, {}, { attempts: 4 });
    const body = response.body || {};
    const summary = {
      success: true,
      spreadsheetId: spreadsheetId,
      clearedRange: body.clearedRange || range
    };
    ctx.googleSheetsEnhancedClearRange = summary;
    ctx.googleSheetsEnhancedLastResult = summary;
    ctx.spreadsheetId = ctx.spreadsheetId || spreadsheetId;
    logInfo('google_sheets_enhanced_clear_range_success', {
      spreadsheetId: spreadsheetId,
      range: range
    });
    return ctx;
  } catch (error) {
    const status = error && typeof error.status === 'number' ? error.status : null;
    const message = error && error.message ? error.message : String(error);
    logError('google_sheets_enhanced_clear_range_failed', {
      spreadsheetId: spreadsheetId,
      range: range,
      status: status,
      message: message
    });
    throw error;
  }
}
${googleSheetsEnhancedHelpersBlock()}`;
  }

  if (operation === 'create_sheet') {
    return `
function step_action_google_sheets_enhanced_create_sheet(ctx) {
  ctx = ctx || {};
  const config = ${configLiteral};
  const interpolationContext = ctx || {};
  const spreadsheetId = googleSheetsEnhancedResolveSpreadsheetId(config, interpolationContext);
  const title = googleSheetsEnhancedResolveString(config.title, interpolationContext) || 'New Sheet';
  const indexRaw = googleSheetsEnhancedResolveString(config.index, interpolationContext);
  const index = indexRaw ? Number(indexRaw) : null;
  const grid = config.gridProperties && typeof config.gridProperties === 'object' ? config.gridProperties : {};
  const accessToken = googleSheetsEnhancedGetAccessToken(['https://www.googleapis.com/auth/spreadsheets']);
  const request = {
    addSheet: {
      properties: {
        title: title
      }
    }
  };
  if (index !== null && !isNaN(index)) {
    request.addSheet.properties.index = Number(index);
  }
  if (grid && typeof grid === 'object' && (grid.rowCount || grid.columnCount)) {
    request.addSheet.properties.gridProperties = {};
    if (grid.rowCount !== undefined) {
      request.addSheet.properties.gridProperties.rowCount = Number(grid.rowCount);
    }
    if (grid.columnCount !== undefined) {
      request.addSheet.properties.gridProperties.columnCount = Number(grid.columnCount);
    }
  }

  try {
    const response = googleSheetsEnhancedBatchUpdate(spreadsheetId, accessToken, [request]);
    const body = response.body || {};
    const replies = Array.isArray(body.replies) ? body.replies : [];
    const created = replies[0] && replies[0].addSheet && replies[0].addSheet.properties ? replies[0].addSheet.properties : {};
    const summary = {
      success: true,
      spreadsheetId: spreadsheetId,
      sheetId: created.sheetId || null,
      title: created.title || title,
      index: created.index !== undefined ? created.index : index
    };
    ctx.googleSheetsEnhancedCreateSheet = summary;
    ctx.googleSheetsEnhancedLastResult = summary;
    ctx.spreadsheetId = ctx.spreadsheetId || spreadsheetId;
    logInfo('google_sheets_enhanced_create_sheet_success', {
      spreadsheetId: spreadsheetId,
      sheetId: summary.sheetId,
      title: summary.title
    });
    return ctx;
  } catch (error) {
    const status = error && typeof error.status === 'number' ? error.status : null;
    const message = error && error.message ? error.message : String(error);
    logError('google_sheets_enhanced_create_sheet_failed', {
      spreadsheetId: spreadsheetId,
      title: title,
      status: status,
      message: message
    });
    throw error;
  }
}
${googleSheetsEnhancedHelpersBlock()}`;
  }

  if (operation === 'delete_sheet') {
    return `
function step_action_google_sheets_enhanced_delete_sheet(ctx) {
  ctx = ctx || {};
  const config = ${configLiteral};
  const interpolationContext = ctx || {};
  const spreadsheetId = googleSheetsEnhancedResolveSpreadsheetId(config, interpolationContext);
  const sheetIdRaw = googleSheetsEnhancedResolveString(config.sheetId, interpolationContext);
  const sheetId = Number(sheetIdRaw || 0);
  if (!sheetId || isNaN(sheetId)) {
    throw new Error('Google Sheets Enhanced delete_sheet requires a numeric sheetId');
  }
  const accessToken = googleSheetsEnhancedGetAccessToken(['https://www.googleapis.com/auth/spreadsheets']);
  const request = {
    deleteSheet: {
      sheetId: sheetId
    }
  };

  try {
    googleSheetsEnhancedBatchUpdate(spreadsheetId, accessToken, [request]);
    const summary = {
      success: true,
      spreadsheetId: spreadsheetId,
      sheetId: sheetId
    };
    ctx.googleSheetsEnhancedDeleteSheet = summary;
    ctx.googleSheetsEnhancedLastResult = summary;
    ctx.spreadsheetId = ctx.spreadsheetId || spreadsheetId;
    logInfo('google_sheets_enhanced_delete_sheet_success', {
      spreadsheetId: spreadsheetId,
      sheetId: sheetId
    });
    return ctx;
  } catch (error) {
    const status = error && typeof error.status === 'number' ? error.status : null;
    const message = error && error.message ? error.message : String(error);
    logError('google_sheets_enhanced_delete_sheet_failed', {
      spreadsheetId: spreadsheetId,
      sheetId: sheetId,
      status: status,
      message: message
    });
    throw error;
  }
}
${googleSheetsEnhancedHelpersBlock()}`;
  }

  if (operation === 'duplicate_sheet') {
    return `
function step_action_google_sheets_enhanced_duplicate_sheet(ctx) {
  ctx = ctx || {};
  const config = ${configLiteral};
  const interpolationContext = ctx || {};
  const spreadsheetId = googleSheetsEnhancedResolveSpreadsheetId(config, interpolationContext);
  const sourceSheetIdRaw = googleSheetsEnhancedResolveString(config.sourceSheetId, interpolationContext);
  const sourceSheetId = Number(sourceSheetIdRaw || 0);
  if (!sourceSheetId || isNaN(sourceSheetId)) {
    throw new Error('Google Sheets Enhanced duplicate_sheet requires a numeric sourceSheetId');
  }
  const newSheetName = googleSheetsEnhancedResolveString(config.newSheetName, interpolationContext) || '';
  const accessToken = googleSheetsEnhancedGetAccessToken(['https://www.googleapis.com/auth/spreadsheets']);
  const request = {
    duplicateSheet: {
      sourceSheetId: sourceSheetId
    }
  };
  if (newSheetName) {
    request.duplicateSheet.newSheetName = newSheetName;
  }
  if (config.insertSheetIndex !== undefined) {
    const indexValue = googleSheetsEnhancedResolveString(config.insertSheetIndex, interpolationContext);
    if (indexValue) {
      request.duplicateSheet.insertSheetIndex = Number(indexValue);
    }
  }

  try {
    const response = googleSheetsEnhancedBatchUpdate(spreadsheetId, accessToken, [request]);
    const replies = response.body && Array.isArray(response.body.replies) ? response.body.replies : [];
    const properties = replies[0] && replies[0].duplicateSheet && replies[0].duplicateSheet.properties ? replies[0].duplicateSheet.properties : {};
    const summary = {
      success: true,
      spreadsheetId: spreadsheetId,
      sheetId: properties.sheetId || null,
      title: properties.title || newSheetName || null
    };
    ctx.googleSheetsEnhancedDuplicateSheet = summary;
    ctx.googleSheetsEnhancedLastResult = summary;
    ctx.spreadsheetId = ctx.spreadsheetId || spreadsheetId;
    logInfo('google_sheets_enhanced_duplicate_sheet_success', {
      spreadsheetId: spreadsheetId,
      sourceSheetId: sourceSheetId,
      newSheetId: summary.sheetId
    });
    return ctx;
  } catch (error) {
    const status = error && typeof error.status === 'number' ? error.status : null;
    const message = error && error.message ? error.message : String(error);
    logError('google_sheets_enhanced_duplicate_sheet_failed', {
      spreadsheetId: spreadsheetId,
      sourceSheetId: sourceSheetId,
      status: status,
      message: message
    });
    throw error;
  }
}
${googleSheetsEnhancedHelpersBlock()}`;
  }

  if (operation === 'format_cells') {
    return `
function step_action_google_sheets_enhanced_format_cells(ctx) {
  ctx = ctx || {};
  const config = ${configLiteral};
  const interpolationContext = ctx || {};
  const spreadsheetId = googleSheetsEnhancedResolveSpreadsheetId(config, interpolationContext);
  const range = googleSheetsEnhancedResolveRange(config, interpolationContext);
  if (!range) {
    throw new Error('Google Sheets Enhanced format_cells requires a range');
  }
  const accessToken = googleSheetsEnhancedGetAccessToken(['https://www.googleapis.com/auth/spreadsheets']);
  const sheetName = googleSheetsEnhancedResolveSheetName(config, interpolationContext);
  const metadata = googleSheetsEnhancedFetchSpreadsheet(
    spreadsheetId,
    accessToken,
    'sheets(properties(sheetId,title,index,gridProperties))',
    false,
    []
  );
  const sheet = googleSheetsEnhancedSelectSheet(metadata.sheets, sheetName);
  if (!sheet || !sheet.properties || sheet.properties.sheetId === undefined) {
    throw new Error('Google Sheets Enhanced format_cells could not resolve sheet: ' + sheetName);
  }
  const format = config.format && typeof config.format === 'object' ? config.format : {};
  const gridRange = googleSheetsEnhancedBuildGridRange(sheet.properties.sheetId, sheetName, range, sheet.properties);

  function collectFields(prefix, value, bucket) {
    if (!value || typeof value !== 'object') {
      return;
    }
    for (var key in value) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      var path = prefix ? prefix + '.' + key : key;
      if (value[key] && typeof value[key] === 'object' && !Array.isArray(value[key])) {
        collectFields(path, value[key], bucket);
      } else {
        bucket.push(path);
      }
    }
  }

  var fields = [];
  collectFields('userEnteredFormat', format, fields);
  if (fields.length === 0) {
    throw new Error('Google Sheets Enhanced format_cells requires format properties');
  }

  const request = {
    repeatCell: {
      range: gridRange,
      cell: {
        userEnteredFormat: format
      },
      fields: fields.join(',')
    }
  };

  try {
    googleSheetsEnhancedBatchUpdate(spreadsheetId, accessToken, [request]);
    const summary = {
      success: true,
      spreadsheetId: spreadsheetId,
      updatedRange: range,
      format: format
    };
    ctx.googleSheetsEnhancedFormatCells = summary;
    ctx.googleSheetsEnhancedLastResult = summary;
    ctx.spreadsheetId = ctx.spreadsheetId || spreadsheetId;
    logInfo('google_sheets_enhanced_format_cells_success', {
      spreadsheetId: spreadsheetId,
      range: range,
      fields: fields.length
    });
    return ctx;
  } catch (error) {
    const status = error && typeof error.status === 'number' ? error.status : null;
    const message = error && error.message ? error.message : String(error);
    logError('google_sheets_enhanced_format_cells_failed', {
      spreadsheetId: spreadsheetId,
      range: range,
      status: status,
      message: message
    });
    throw error;
  }
}
${googleSheetsEnhancedHelpersBlock()}`;
  }

  if (operation === 'find_replace') {
    return `
function step_action_google_sheets_enhanced_find_replace(ctx) {
  ctx = ctx || {};
  const config = ${configLiteral};
  const interpolationContext = ctx || {};
  const spreadsheetId = googleSheetsEnhancedResolveSpreadsheetId(config, interpolationContext);
  const findValue = googleSheetsEnhancedResolveString(config.find, interpolationContext);
  const replacement = googleSheetsEnhancedResolveString(config.replacement, interpolationContext);
  if (!findValue) {
    throw new Error('Google Sheets Enhanced find_replace requires a find value');
  }
  const accessToken = googleSheetsEnhancedGetAccessToken(['https://www.googleapis.com/auth/spreadsheets']);
  const request = {
    findReplace: {
      find: findValue,
      replacement: replacement || '',
      allSheets: config.allSheets !== false,
      includeFormulas: true,
      matchCase: config.matchCase === true,
      matchEntireCell: config.matchEntireCell === true
    }
  };
  if (config.sheetId !== undefined && config.sheetId !== null && config.sheetId !== '') {
    const sheetIdValue = Number(googleSheetsEnhancedResolveString(config.sheetId, interpolationContext));
    if (!isNaN(sheetIdValue)) {
      request.findReplace.sheetId = sheetIdValue;
    }
  }

  try {
    const response = googleSheetsEnhancedBatchUpdate(spreadsheetId, accessToken, [request]);
    const replies = response.body && Array.isArray(response.body.replies) ? response.body.replies : [];
    const result = replies[0] && replies[0].findReplace ? replies[0].findReplace : {};
    const summary = {
      success: true,
      spreadsheetId: spreadsheetId,
      occurrencesChanged: typeof result.occurrencesChanged === 'number' ? result.occurrencesChanged : Number(result.occurrencesChanged || 0)
    };
    ctx.googleSheetsEnhancedFindReplace = summary;
    ctx.googleSheetsEnhancedLastResult = summary;
    ctx.spreadsheetId = ctx.spreadsheetId || spreadsheetId;
    logInfo('google_sheets_enhanced_find_replace_success', {
      spreadsheetId: spreadsheetId,
      occurrencesChanged: summary.occurrencesChanged
    });
    return ctx;
  } catch (error) {
    const status = error && typeof error.status === 'number' ? error.status : null;
    const message = error && error.message ? error.message : String(error);
    logError('google_sheets_enhanced_find_replace_failed', {
      spreadsheetId: spreadsheetId,
      status: status,
      message: message
    });
    throw error;
  }
}
${googleSheetsEnhancedHelpersBlock()}`;
  }

  if (operation === 'sort_range') {
    return `
function step_action_google_sheets_enhanced_sort_range(ctx) {
  ctx = ctx || {};
  const config = ${configLiteral};
  const interpolationContext = ctx || {};
  const spreadsheetId = googleSheetsEnhancedResolveSpreadsheetId(config, interpolationContext);
  const range = googleSheetsEnhancedResolveRange(config, interpolationContext);
  if (!range) {
    throw new Error('Google Sheets Enhanced sort_range requires a range');
  }
  const sheetName = googleSheetsEnhancedResolveSheetName(config, interpolationContext);
  const accessToken = googleSheetsEnhancedGetAccessToken(['https://www.googleapis.com/auth/spreadsheets']);
  const metadata = googleSheetsEnhancedFetchSpreadsheet(
    spreadsheetId,
    accessToken,
    'sheets(properties(sheetId,title,index,gridProperties))',
    false,
    []
  );
  const sheet = googleSheetsEnhancedSelectSheet(metadata.sheets, sheetName);
  if (!sheet || !sheet.properties || sheet.properties.sheetId === undefined) {
    throw new Error('Google Sheets Enhanced sort_range could not resolve sheet: ' + sheetName);
  }
  const gridRange = googleSheetsEnhancedBuildGridRange(sheet.properties.sheetId, sheetName, range, sheet.properties);
  const sortSpecs = Array.isArray(config.sortSpecs) ? config.sortSpecs : [];
  if (!sortSpecs.length) {
    throw new Error('Google Sheets Enhanced sort_range requires sortSpecs');
  }
  const normalizedSpecs = [];
  for (var i = 0; i < sortSpecs.length; i++) {
    var spec = sortSpecs[i] || {};
    var dimensionIndex = Number(spec.dimensionIndex);
    if (isNaN(dimensionIndex)) {
      continue;
    }
    var sortOrder = (spec.sortOrder || 'ASCENDING').toUpperCase();
    normalizedSpecs.push({ dimensionIndex: dimensionIndex, sortOrder: sortOrder });
  }
  if (!normalizedSpecs.length) {
    throw new Error('Google Sheets Enhanced sort_range requires valid sortSpecs');
  }
  const request = {
    sortRange: {
      range: gridRange,
      sortSpecs: normalizedSpecs
    }
  };

  try {
    googleSheetsEnhancedBatchUpdate(spreadsheetId, accessToken, [request]);
    const summary = {
      success: true,
      spreadsheetId: spreadsheetId,
      sortedRange: range,
      sortSpecs: normalizedSpecs
    };
    ctx.googleSheetsEnhancedSortRange = summary;
    ctx.googleSheetsEnhancedLastResult = summary;
    ctx.spreadsheetId = ctx.spreadsheetId || spreadsheetId;
    logInfo('google_sheets_enhanced_sort_range_success', {
      spreadsheetId: spreadsheetId,
      range: range,
      sortSpecCount: normalizedSpecs.length
    });
    return ctx;
  } catch (error) {
    const status = error && typeof error.status === 'number' ? error.status : null;
    const message = error && error.message ? error.message : String(error);
    logError('google_sheets_enhanced_sort_range_failed', {
      spreadsheetId: spreadsheetId,
      range: range,
      status: status,
      message: message
    });
    throw error;
  }
}
${googleSheetsEnhancedHelpersBlock()}`;
  }

  throw new Error('Unsupported Google Sheets Enhanced action: ' + operation);
}

function buildGoogleSheetsEnhancedTrigger(operation: 'row_added' | 'cell_updated', config: any): string {
  const configLiteral = JSON.stringify(prepareValueForCode(config ?? {}));

  if (operation === 'row_added') {
    return `
function trigger_trigger_google_sheets_enhanced_row_added(ctx) {
  return buildPollingWrapper('trigger.google-sheets-enhanced:row_added', function (runtime) {
    const config = ${configLiteral};
    const state = runtime.state && typeof runtime.state === 'object' ? runtime.state : (runtime.state = {});
    const interpolationContext = state.lastPayload && typeof state.lastPayload === 'object' ? state.lastPayload : {};
    const spreadsheetId = googleSheetsEnhancedResolveSpreadsheetId(config, interpolationContext);
    const sheetName = googleSheetsEnhancedResolveSheetName(config, interpolationContext);
    const accessToken = googleSheetsEnhancedGetAccessToken(['https://www.googleapis.com/auth/spreadsheets.readonly']);
    const fields = 'spreadsheetId,spreadsheetUrl,sheets(properties(sheetId,title,index,gridProperties(rowCount,columnCount)),data(rowData(values(formattedValue,effectiveValue))))';
    const response = googleSheetsEnhancedFetchSpreadsheet(spreadsheetId, accessToken, fields, true, [sheetName]);
    const spreadsheetUrl = response.spreadsheetUrl || null;
    const sheet = googleSheetsEnhancedSelectSheet(response.sheets, sheetName);
    if (!sheet || !sheet.properties || sheet.properties.sheetId === undefined) {
      throw new Error('Google Sheets Enhanced row_added trigger could not resolve sheet: ' + sheetName);
    }
    const rows = googleSheetsEnhancedExtractRowValues(sheet);
    const cursor = state.cursor && typeof state.cursor === 'object' ? state.cursor : {};
    let lastRowIndex = 0;
    if (cursor && cursor.spreadsheetId === spreadsheetId && cursor.sheetId === sheet.properties.sheetId) {
      lastRowIndex = Number(cursor.lastRowIndex || 0);
    }
    const events = [];
    for (let idx = lastRowIndex; idx < rows.length; idx++) {
      const values = rows[idx] || [];
      const nonEmpty = values.some(function (value) { return value !== null && value !== undefined && String(value).trim() !== ''; });
      if (!nonEmpty) {
        continue;
      }
      const rowNumber = idx + 1;
      const addedAt = new Date().toISOString();
      const valuesByColumn = {};
      for (let col = 0; col < values.length; col++) {
        valuesByColumn[googleSheetsEnhancedColumnLetter(col)] = values[col];
      }
      events.push({
        spreadsheetId: spreadsheetId,
        spreadsheetUrl: spreadsheetUrl,
        sheetId: sheet.properties.sheetId,
        sheetTitle: sheet.properties.title,
        rowId: sheet.properties.sheetId + '!' + rowNumber,
        rowIndex: rowNumber,
        values: values,
        valuesByColumn: valuesByColumn,
        addedAt: addedAt,
        _meta: {
          raw: {
            spreadsheetId: spreadsheetId,
            sheetId: sheet.properties.sheetId,
            row: {
              range: sheet.properties.title + '!' + rowNumber + ':' + rowNumber,
              values: [values]
            }
          }
        }
      });
    }

    if (!events.length) {
      runtime.summary({ spreadsheetId: spreadsheetId, sheetId: sheet.properties.sheetId, eventsDispatched: 0 });
      return { eventsAttempted: 0, eventsDispatched: 0, eventsFailed: 0, cursor: cursor };
    }

    const batch = runtime.dispatchBatch(events, function (entry) { return entry; });
    const newCursor = {
      spreadsheetId: spreadsheetId,
      sheetId: sheet.properties.sheetId,
      lastRowIndex: rows.length,
      updatedAt: new Date().toISOString()
    };
    state.cursor = newCursor;
    state.lastPayload = events[events.length - 1];

    runtime.summary({
      spreadsheetId: spreadsheetId,
      sheetId: sheet.properties.sheetId,
      rowsAttempted: batch.attempted,
      rowsDispatched: batch.succeeded,
      rowsFailed: batch.failed,
      cursor: newCursor
    });

    return {
      eventsAttempted: batch.attempted,
      eventsDispatched: batch.succeeded,
      eventsFailed: batch.failed,
      cursor: newCursor
    };
  });
}
${googleSheetsEnhancedHelpersBlock()}`;
  }

  if (operation === 'cell_updated') {
    return `
function trigger_trigger_google_sheets_enhanced_cell_updated(ctx) {
  return buildPollingWrapper('trigger.google-sheets-enhanced:cell_updated', function (runtime) {
    const config = ${configLiteral};
    const state = runtime.state && typeof runtime.state === 'object' ? runtime.state : (runtime.state = {});
    const interpolationContext = state.lastPayload && typeof state.lastPayload === 'object' ? state.lastPayload : {};
    const spreadsheetId = googleSheetsEnhancedResolveSpreadsheetId(config, interpolationContext);
    const sheetName = googleSheetsEnhancedResolveSheetName(config, interpolationContext);
    const accessToken = googleSheetsEnhancedGetAccessToken(['https://www.googleapis.com/auth/spreadsheets.readonly']);
    const fields = 'spreadsheetId,spreadsheetUrl,sheets(properties(sheetId,title,index,gridProperties(rowCount,columnCount)),data(rowData(values(formattedValue,effectiveValue))))';
    const response = googleSheetsEnhancedFetchSpreadsheet(spreadsheetId, accessToken, fields, true, [sheetName]);
    const sheet = googleSheetsEnhancedSelectSheet(response.sheets, sheetName);
    if (!sheet || !sheet.properties || sheet.properties.sheetId === undefined) {
      throw new Error('Google Sheets Enhanced cell_updated trigger could not resolve sheet: ' + sheetName);
    }
    const rows = googleSheetsEnhancedExtractRowValues(sheet);
    const sheetKey = spreadsheetId + ':' + sheet.properties.sheetId;
    const cellsState = state.cells && typeof state.cells === 'object' ? state.cells : (state.cells = {});
    const previous = cellsState[sheetKey] && typeof cellsState[sheetKey] === 'object' ? cellsState[sheetKey] : {};
    const nextSnapshot = {};
    const events = [];
    const timestamp = new Date().toISOString();
    const limit = 50;

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const rowValues = rows[rowIndex] || [];
      const rowNumber = rowIndex + 1;
      for (let colIndex = 0; colIndex < rowValues.length; colIndex++) {
        const cellKey = googleSheetsEnhancedColumnLetter(colIndex) + rowNumber;
        const newValue = rowValues[colIndex];
        const normalizedNew = newValue === undefined ? null : newValue;
        if (normalizedNew !== null && normalizedNew !== '') {
          nextSnapshot[cellKey] = normalizedNew;
        }
        const hadValue = Object.prototype.hasOwnProperty.call(previous, cellKey);
        const oldValue = hadValue ? previous[cellKey] : null;
        if (!hadValue && (normalizedNew === null || normalizedNew === '')) {
          continue;
        }
        if (hadValue && googleSheetsEnhancedValuesEqual(oldValue, normalizedNew)) {
          continue;
        }
        const range = sheet.properties.title + '!' + cellKey;
        events.push({
          spreadsheetId: spreadsheetId,
          sheetId: sheet.properties.sheetId,
          sheetTitle: sheet.properties.title,
          range: range,
          changeId: sheet.properties.sheetId + '!' + cellKey + '@' + timestamp,
          oldValue: oldValue === undefined ? null : oldValue,
          newValue: normalizedNew,
          updatedAt: timestamp,
          _meta: {
            raw: {
              spreadsheetId: spreadsheetId,
              sheetId: sheet.properties.sheetId,
              range: range,
              oldValue: oldValue === undefined ? null : oldValue,
              newValue: normalizedNew
            }
          }
        });
        if (events.length >= limit) {
          break;
        }
      }
      if (events.length >= limit) {
        break;
      }
    }

    if (events.length < limit) {
      for (var key in previous) {
        if (!Object.prototype.hasOwnProperty.call(previous, key)) continue;
        if (Object.prototype.hasOwnProperty.call(nextSnapshot, key)) continue;
        const range = sheet.properties.title + '!' + key;
        events.push({
          spreadsheetId: spreadsheetId,
          sheetId: sheet.properties.sheetId,
          sheetTitle: sheet.properties.title,
          range: range,
          changeId: sheet.properties.sheetId + '!' + key + '@' + timestamp,
          oldValue: previous[key],
          newValue: null,
          updatedAt: timestamp,
          _meta: {
            raw: {
              spreadsheetId: spreadsheetId,
              sheetId: sheet.properties.sheetId,
              range: range,
              oldValue: previous[key],
              newValue: null
            }
          }
        });
        if (events.length >= limit) {
          break;
        }
      }
    }

    if (!events.length) {
      runtime.summary({ spreadsheetId: spreadsheetId, sheetId: sheet.properties.sheetId, eventsDispatched: 0 });
      cellsState[sheetKey] = nextSnapshot;
      return { eventsAttempted: 0, eventsDispatched: 0, eventsFailed: 0, cursor: state.cursor || {} };
    }

    const batch = runtime.dispatchBatch(events, function (entry) { return entry; });
    cellsState[sheetKey] = nextSnapshot;
    state.cursor = {
      spreadsheetId: spreadsheetId,
      sheetId: sheet.properties.sheetId,
      updatedAt: timestamp
    };
    state.lastPayload = events[events.length - 1];

    runtime.summary({
      spreadsheetId: spreadsheetId,
      sheetId: sheet.properties.sheetId,
      eventsAttempted: batch.attempted,
      eventsDispatched: batch.succeeded,
      eventsFailed: batch.failed,
      cursor: state.cursor
    });

    return {
      eventsAttempted: batch.attempted,
      eventsDispatched: batch.succeeded,
      eventsFailed: batch.failed,
      cursor: state.cursor
    };
  });
}
${googleSheetsEnhancedHelpersBlock()}`;
  }

  throw new Error('Unsupported Google Sheets Enhanced trigger: ' + operation);
}

if (typeof googleSheetsEnhancedGetAccessToken !== 'function') {
  function googleSheetsEnhancedGetAccessToken(scopeList) {
    var scopes = Array.isArray(scopeList) && scopeList.length ? scopeList : ['https://www.googleapis.com/auth/spreadsheets'];
    try {
      return requireOAuthToken('google-sheets-enhanced', { scopes: scopes });
    } catch (oauthError) {
      var properties = PropertiesService.getScriptProperties();
      var rawServiceAccount = properties.getProperty('GOOGLE_SHEETS_SERVICE_ACCOUNT');
      if (!rawServiceAccount) {
        throw oauthError;
      }
      var delegatedUser = properties.getProperty('GOOGLE_SHEETS_DELEGATED_EMAIL');

      function base64UrlEncode(value) {
        if (Object.prototype.toString.call(value) === '[object Array]') {
          return Utilities.base64EncodeWebSafe(value).replace(/=+$/, '');
        }
        return Utilities.base64EncodeWebSafe(value, Utilities.Charset.UTF_8).replace(/=+$/, '');
      }

      try {
        var parsed = typeof rawServiceAccount === 'string' ? JSON.parse(rawServiceAccount) : rawServiceAccount;
        if (!parsed || typeof parsed !== 'object') {
          throw new Error('Service account payload must be valid JSON.');
        }
        var clientEmail = parsed.client_email;
        var privateKey = parsed.private_key;
        if (!clientEmail || !privateKey) {
          throw new Error('Service account JSON must include client_email and private_key.');
        }

        var now = Math.floor(Date.now() / 1000);
        var headerSegment = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
        var claimPayload = {
          iss: clientEmail,
          scope: scopes.join(' '),
          aud: 'https://oauth2.googleapis.com/token',
          exp: now + 3600,
          iat: now
        };
        if (delegatedUser) {
          claimPayload.sub = delegatedUser;
        }
        var claimSegment = base64UrlEncode(JSON.stringify(claimPayload));
        var signingInput = headerSegment + '.' + claimSegment;
        var signatureBytes = Utilities.computeRsaSha256Signature(signingInput, privateKey);
        var signatureSegment = base64UrlEncode(signatureBytes);
        var assertion = signingInput + '.' + signatureSegment;

        var tokenResponse = rateLimitAware(function () {
          return fetchJson({
            url: 'https://oauth2.googleapis.com/token',
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Accept': 'application/json'
            },
            payload: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + encodeURIComponent(assertion),
            contentType: 'application/x-www-form-urlencoded'
          });
        }, { attempts: 3, initialDelayMs: 500, jitter: 0.25 });

        var token = tokenResponse.body && tokenResponse.body.access_token;
        if (!token) {
          throw new Error('Service account token exchange did not return an access_token.');
        }
        return token;
      } catch (serviceError) {
        var serviceMessage = serviceError && serviceError.message ? serviceError.message : String(serviceError);
        throw new Error('Google Sheets Enhanced service account authentication failed: ' + serviceMessage);
      }
    }
  }
}

if (typeof googleSheetsEnhancedResolveString !== 'function') {
  function googleSheetsEnhancedResolveString(value, ctx) {
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'string') {
      return interpolate(value, ctx || {}).trim();
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return '';
  }
}

if (typeof googleSheetsEnhancedResolveSpreadsheetId !== 'function') {
  function googleSheetsEnhancedResolveSpreadsheetId(config, ctx) {
    var context = ctx || {};
    var candidate = '';
    if (config && typeof config.spreadsheetId === 'string' && config.spreadsheetId.trim()) {
      candidate = googleSheetsEnhancedResolveString(config.spreadsheetId, context);
    }
    if (!candidate && config && typeof config.spreadsheetUrl === 'string') {
      candidate = googleSheetsEnhancedParseSpreadsheetId(googleSheetsEnhancedResolveString(config.spreadsheetUrl, context));
    }
    if (!candidate && context.spreadsheetId) {
      candidate = googleSheetsEnhancedParseSpreadsheetId(String(context.spreadsheetId));
    }
    if (!candidate && context.spreadsheetUrl) {
      candidate = googleSheetsEnhancedParseSpreadsheetId(String(context.spreadsheetUrl));
    }
    if (!candidate && context.spreadsheet && typeof context.spreadsheet.id === 'string') {
      candidate = googleSheetsEnhancedParseSpreadsheetId(String(context.spreadsheet.id));
    }
    if (!candidate) {
      var properties = PropertiesService.getScriptProperties();
      var fallback = properties.getProperty('GOOGLE_SHEETS_DEFAULT_SPREADSHEET_ID');
      if (fallback) {
        candidate = googleSheetsEnhancedParseSpreadsheetId(fallback);
      }
    }
    if (!candidate) {
      throw new Error('Google Sheets Enhanced operation requires a spreadsheetId. Provide it in the node configuration or set GOOGLE_SHEETS_DEFAULT_SPREADSHEET_ID in Script Properties.');
    }
    return candidate;
  }
}

if (typeof googleSheetsEnhancedResolveSheetName !== 'function') {
  function googleSheetsEnhancedResolveSheetName(config, ctx) {
    var context = ctx || {};
    var candidate = '';
    if (config && typeof config.sheetName === 'string' && config.sheetName.trim()) {
      candidate = googleSheetsEnhancedResolveString(config.sheetName, context);
    }
    if (!candidate && config && typeof config.sheet === 'string' && config.sheet.trim()) {
      var resolvedSheet = googleSheetsEnhancedResolveString(config.sheet, context);
      if (resolvedSheet.indexOf('!') >= 0) {
        candidate = resolvedSheet.split('!')[0];
      } else {
        candidate = resolvedSheet;
      }
    }
    if (!candidate && context.sheetName) {
      candidate = String(context.sheetName).trim();
    }
    if (!candidate && context.sheet) {
      candidate = String(context.sheet).split('!')[0].trim();
    }
    if (!candidate) {
      candidate = 'Sheet1';
    }
    return candidate;
  }
}

if (typeof googleSheetsEnhancedResolveRange !== 'function') {
  function googleSheetsEnhancedResolveRange(config, ctx) {
    var context = ctx || {};
    var resolved = '';
    if (config && typeof config.range === 'string' && config.range.trim()) {
      resolved = googleSheetsEnhancedResolveString(config.range, context);
    }
    if (!resolved && config && typeof config.sheet === 'string' && config.sheet.indexOf('!') >= 0) {
      resolved = googleSheetsEnhancedResolveString(config.sheet, context);
    }
    if (!resolved && context.range) {
      resolved = String(context.range).trim();
    }
    var sheetName = googleSheetsEnhancedResolveSheetName(config, context);
    if (!resolved) {
      return sheetName;
    }
    if (resolved.indexOf('!') >= 0) {
      return resolved;
    }
    return sheetName + '!' + resolved;
  }
}

if (typeof googleSheetsEnhancedResolveValues !== 'function') {
  function googleSheetsEnhancedResolveValues(source, ctx, options) {
    var context = ctx || {};
    var raw = source;
    if ((raw === undefined || raw === null) && options && options.fallback !== undefined) {
      raw = options.fallback;
    }
    if ((raw === undefined || raw === null) && options && options.fallbackKey && context[options.fallbackKey] !== undefined) {
      raw = context[options.fallbackKey];
    }
    if (raw === undefined || raw === null) {
      return [];
    }
    if (!Array.isArray(raw)) {
      raw = [raw];
    }
    var rows = raw.length > 0 && Array.isArray(raw[0]) ? raw : [raw];
    var resolved = [];
    for (var rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      var row = rows[rowIndex];
      if (!Array.isArray(row)) {
        row = [row];
      }
      var resolvedRow = [];
      for (var colIndex = 0; colIndex < row.length; colIndex++) {
        var value = row[colIndex];
        if (value && typeof value === 'object' && value.mode === 'static' && Object.prototype.hasOwnProperty.call(value, 'value')) {
          resolvedRow.push(value.value);
        } else if (typeof value === 'string') {
          resolvedRow.push(interpolate(value, context));
        } else {
          resolvedRow.push(value);
        }
      }
      resolved.push(resolvedRow);
    }
    return resolved;
  }
}

if (typeof googleSheetsEnhancedColumnToIndex !== 'function') {
  function googleSheetsEnhancedColumnToIndex(letters) {
    if (!letters) {
      return 0;
    }
    var value = 0;
    var upper = String(letters).toUpperCase();
    for (var i = 0; i < upper.length; i++) {
      var code = upper.charCodeAt(i);
      if (code < 65 || code > 90) {
        return value;
      }
      value = value * 26 + (code - 64);
    }
    return Math.max(0, value - 1);
  }
}

if (typeof googleSheetsEnhancedColumnLetter !== 'function') {
  function googleSheetsEnhancedColumnLetter(index) {
    var n = Number(index);
    if (isNaN(n) || n < 0) {
      return 'A';
    }
    var letters = '';
    var current = Math.floor(n);
    while (current >= 0) {
      letters = String.fromCharCode((current % 26) + 65) + letters;
      current = Math.floor(current / 26) - 1;
    }
    return letters || 'A';
  }
}

if (typeof googleSheetsEnhancedParseA1Range !== 'function') {
  function googleSheetsEnhancedParseA1Range(a1Notation, sheetProperties) {
    var grid = sheetProperties && sheetProperties.gridProperties ? sheetProperties.gridProperties : {};
    var totalRows = typeof grid.rowCount === 'number' ? grid.rowCount : null;
    var totalCols = typeof grid.columnCount === 'number' ? grid.columnCount : null;
    var notation = (a1Notation || '').trim();
    if (!notation) {
      return {
        startRowIndex: 0,
        endRowIndex: totalRows !== null ? totalRows : null,
        startColumnIndex: 0,
        endColumnIndex: totalCols !== null ? totalCols : null
      };
    }
    var match = notation.match(/^([A-Za-z]*)(\d+)?(?::([A-Za-z]*)(\d+)?)?$/);
    if (!match) {
      throw new Error('Unsupported A1 range: ' + notation);
    }
    var startColumn = match[1];
    var startRow = match[2];
    var endColumn = match[3];
    var endRow = match[4];
    var startColumnIndex = startColumn ? googleSheetsEnhancedColumnToIndex(startColumn) : 0;
    var startRowIndex = startRow ? Math.max(0, Number(startRow) - 1) : 0;
    var endColumnIndex = null;
    if (endColumn) {
      endColumnIndex = googleSheetsEnhancedColumnToIndex(endColumn) + 1;
    } else if (startColumn) {
      endColumnIndex = startColumnIndex + 1;
    } else if (totalCols !== null) {
      endColumnIndex = totalCols;
    }
    var endRowIndex = null;
    if (endRow) {
      endRowIndex = Math.max(0, Number(endRow));
    } else if (startRow) {
      endRowIndex = Math.max(0, Number(startRow));
    } else if (totalRows !== null) {
      endRowIndex = totalRows;
    }
    return {
      startRowIndex: startRowIndex,
      endRowIndex: endRowIndex,
      startColumnIndex: startColumnIndex,
      endColumnIndex: endColumnIndex
    };
  }
}

if (typeof googleSheetsEnhancedBuildGridRange !== 'function') {
  function googleSheetsEnhancedBuildGridRange(sheetId, sheetName, range, sheetProperties) {
    var a1 = range && range.indexOf('!') >= 0 ? range.split('!')[1] : range;
    var parsed = googleSheetsEnhancedParseA1Range(a1, sheetProperties);
    var gridRange = { sheetId: sheetId };
    if (parsed.startRowIndex !== null && parsed.startRowIndex !== undefined) {
      gridRange.startRowIndex = parsed.startRowIndex;
    }
    if (parsed.endRowIndex !== null && parsed.endRowIndex !== undefined) {
      gridRange.endRowIndex = parsed.endRowIndex;
    }
    if (parsed.startColumnIndex !== null && parsed.startColumnIndex !== undefined) {
      gridRange.startColumnIndex = parsed.startColumnIndex;
    }
    if (parsed.endColumnIndex !== null && parsed.endColumnIndex !== undefined) {
      gridRange.endColumnIndex = parsed.endColumnIndex;
    }
    return gridRange;
  }
}

if (typeof googleSheetsEnhancedApiRequest !== 'function') {
  function googleSheetsEnhancedApiRequest(method, url, accessToken, payload, options) {
    var attempts = (options && options.attempts) || 4;
    var requestOptions = {
      url: url,
      method: method,
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Accept': 'application/json'
      }
    };
    if (payload !== undefined && payload !== null) {
      requestOptions.payload = typeof payload === 'string' ? payload : JSON.stringify(payload);
      requestOptions.contentType = 'application/json';
    }
    return rateLimitAware(function () {
      return fetchJson({
        url: requestOptions.url,
        method: requestOptions.method,
        headers: requestOptions.headers,
        payload: requestOptions.payload,
        contentType: requestOptions.contentType
      });
    }, { attempts: attempts, initialDelayMs: 500, jitter: 0.25 });
  }
}

if (typeof googleSheetsEnhancedBatchUpdate !== 'function') {
  function googleSheetsEnhancedBatchUpdate(spreadsheetId, accessToken, requests) {
    return googleSheetsEnhancedApiRequest(
      'POST',
      'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(spreadsheetId) + ':batchUpdate',
      accessToken,
      { requests: requests },
      { attempts: 4 }
    );
  }
}

if (typeof googleSheetsEnhancedFetchSpreadsheet !== 'function') {
  function googleSheetsEnhancedFetchSpreadsheet(spreadsheetId, accessToken, fields, includeGridData, ranges) {
    var url = 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(spreadsheetId);
    var params = [];
    if (includeGridData) {
      params.push('includeGridData=true');
    }
    if (fields) {
      params.push('fields=' + encodeURIComponent(fields));
    }
    if (ranges && ranges.length) {
      for (var i = 0; i < ranges.length; i++) {
        if (ranges[i]) {
          params.push('ranges=' + encodeURIComponent(ranges[i]));
        }
      }
    }
    if (params.length) {
      url += '?' + params.join('&');
    }
    var response = googleSheetsEnhancedApiRequest('GET', url, accessToken, null, { attempts: 4 });
    return response.body || {};
  }
}

if (typeof googleSheetsEnhancedSelectSheet !== 'function') {
  function googleSheetsEnhancedSelectSheet(sheets, sheetName) {
    if (!Array.isArray(sheets) || sheets.length === 0) {
      return null;
    }
    if (sheetName) {
      for (var i = 0; i < sheets.length; i++) {
        var sheet = sheets[i];
        if (sheet && sheet.properties && sheet.properties.title === sheetName) {
          return sheet;
        }
      }
    }
    return sheets[0];
  }
}

if (typeof googleSheetsEnhancedExtractRowValues !== 'function') {
  function googleSheetsEnhancedExtractRowValues(sheet) {
    var data = sheet && sheet.data && sheet.data[0] && sheet.data[0].rowData ? sheet.data[0].rowData : [];
    var rows = [];
    for (var r = 0; r < data.length; r++) {
      var rowEntry = data[r];
      if (!rowEntry || !rowEntry.values) {
        rows.push([]);
        continue;
      }
      var rowValues = [];
      for (var c = 0; c < rowEntry.values.length; c++) {
        var cell = rowEntry.values[c];
        if (cell && typeof cell.formattedValue !== 'undefined') {
          rowValues.push(cell.formattedValue);
        } else if (cell && cell.effectiveValue !== undefined) {
          var effective = cell.effectiveValue;
          if (effective && typeof effective === 'object') {
            if (effective.stringValue !== undefined) {
              rowValues.push(effective.stringValue);
            } else if (effective.numberValue !== undefined) {
              rowValues.push(effective.numberValue);
            } else if (effective.boolValue !== undefined) {
              rowValues.push(effective.boolValue);
            } else {
              rowValues.push(null);
            }
          } else {
            rowValues.push(effective);
          }
        } else {
          rowValues.push(null);
        }
      }
      rows.push(rowValues);
    }
    return rows;
  }
}

if (typeof googleSheetsEnhancedValuesEqual !== 'function') {
  function googleSheetsEnhancedValuesEqual(a, b) {
    if (a === b) {
      return true;
    }
    if (a === null || a === undefined) {
      return b === null || b === undefined || b === '';
    }
    if (b === null || b === undefined) {
      return a === '';
    }
    return String(a) === String(b);
  }
}
`;
}

  'action.google-sheets-enhanced:test_connection': (c) => buildGoogleSheetsEnhancedAction('test_connection', c),
  'action.google-sheets-enhanced:append_row': (c) => buildGoogleSheetsEnhancedAction('append_row', c),
  'action.google-sheets-enhanced:update_cell': (c) => buildGoogleSheetsEnhancedAction('update_cell', c),
  'action.google-sheets-enhanced:update_range': (c) => buildGoogleSheetsEnhancedAction('update_range', c),
  'action.google-sheets-enhanced:get_values': (c) => buildGoogleSheetsEnhancedAction('get_values', c),
  'action.google-sheets-enhanced:clear_range': (c) => buildGoogleSheetsEnhancedAction('clear_range', c),
  'action.google-sheets-enhanced:create_sheet': (c) => buildGoogleSheetsEnhancedAction('create_sheet', c),
  'action.google-sheets-enhanced:delete_sheet': (c) => buildGoogleSheetsEnhancedAction('delete_sheet', c),
  'action.google-sheets-enhanced:duplicate_sheet': (c) => buildGoogleSheetsEnhancedAction('duplicate_sheet', c),
  'action.google-sheets-enhanced:format_cells': (c) => buildGoogleSheetsEnhancedAction('format_cells', c),
  'action.google-sheets-enhanced:find_replace': (c) => buildGoogleSheetsEnhancedAction('find_replace', c),
  'action.google-sheets-enhanced:sort_range': (c) => buildGoogleSheetsEnhancedAction('sort_range', c),
  'trigger.google-sheets-enhanced:row_added': (c) => buildGoogleSheetsEnhancedTrigger('row_added', c),
  'trigger.google-sheets-enhanced:cell_updated': (c) => buildGoogleSheetsEnhancedTrigger('cell_updated', c),
