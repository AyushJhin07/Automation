function googleSheetsEnhancedHelpersBlock(): string {
  return `
if (typeof googleSheetsEnhancedGetAccessToken !== 'function') {
  function googleSheetsEnhancedGetAccessToken(scopeList) {
    var scopes = Array.isArray(scopeList) && scopeList.length ? scopeList : ['https://www.googleapis.com/auth/spreadsheets'];
    try {
      return requireOAuthToken('google-sheets', { scopes: scopes });
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
        var message = serviceError && serviceError.message ? serviceError.message : String(serviceError);
        throw new Error('Google Sheets service account authentication failed: ' + message);
      }
    }
  }
}

type GoogleSheetsEnhancedActionId =
  | 'test_connection'
  | 'append_row'
  | 'clear_range'
  | 'create_sheet'
  | 'delete_sheet'
  | 'duplicate_sheet'
  | 'find_replace'
  | 'format_cells'
  | 'get_values'
  | 'sort_range'
  | 'update_cell'
  | 'update_range';

function buildGoogleSheetsEnhancedAction(operation: GoogleSheetsEnhancedActionId, config: any): string {
  const configLiteral = JSON.stringify(prepareValueForCode(config ?? {}));

  if (operation === 'test_connection') {
    return `
function step_action_google_sheets_enhanced_test_connection(ctx) {
  ctx = ctx || {};
  var config = ${configLiteral};
  var resolved = googleSheetsEnhancedResolveValue(config || {}, ctx) || {};
  var spreadsheetId = googleSheetsEnhancedResolveSpreadsheetId(resolved, ctx);
  if (!spreadsheetId) {
    throw new Error('google-sheets-enhanced test_connection requires a spreadsheetId');
  }

  var accessToken = googleSheetsEnhancedGetAccessToken(['https://www.googleapis.com/auth/spreadsheets.readonly']);
  var metadata = googleSheetsEnhancedFetchSpreadsheet(spreadsheetId, accessToken) || {};
  var sheets = [];
  if (Array.isArray(metadata.sheets)) {
    for (var i = 0; i < metadata.sheets.length; i++) {
      var entry = metadata.sheets[i];
      if (entry && entry.properties) {
        sheets.push(entry.properties);
      }
    }
  }

  var result = {
    success: true,
    spreadsheetId: metadata.spreadsheetId || spreadsheetId,
    properties: metadata.properties || {},
    sheets: sheets
  };

  ctx.googleSheetsEnhancedConnection = result;
  ctx.googleSheetsConnection = result;
  logInfo('google_sheets_enhanced_test_connection_success', {
    spreadsheetId: result.spreadsheetId,
    sheetCount: sheets.length
  });
  return ctx;
}
${googleSheetsEnhancedHelpersBlock()}`;
  }

  if (operation === 'append_row') {
    const valueInputOption = String((config?.valueInputOption ?? 'USER_ENTERED')).toUpperCase();
    const insertOption = String((config?.insertDataOption ?? 'INSERT_ROWS')).toUpperCase();
    const includeResponse = config?.includeValuesInResponse === false ? 'false' : 'true';
    return `
function step_action_google_sheets_enhanced_append_row(ctx) {
  ctx = ctx || {};
  var config = ${configLiteral};
  var resolved = googleSheetsEnhancedResolveValue(config || {}, ctx) || {};

  var spreadsheetId = googleSheetsEnhancedResolveSpreadsheetId(resolved, ctx);
  if (!spreadsheetId) {
    throw new Error('google-sheets-enhanced append_row requires a spreadsheetId');
  }

  var sheetName = googleSheetsEnhancedResolveSheetName(resolved, ctx) || '';
  var rangeTemplate = typeof resolved.range === 'string' ? resolved.range : '';
  var range = googleSheetsEnhancedNormalizeRange(rangeTemplate, sheetName || resolved.sheet || resolved.sheetName || '');
  if (!range) {
    range = sheetName || resolved.sheet || resolved.sheetName || '';
  }
  if (!range) {
    range = 'Sheet1';
  }

  var values = googleSheetsEnhancedCoerceRowValues(resolved.values, ctx);
  if (!values || values.length === 0) {
    values = googleSheetsEnhancedCoerceRowValues(null, ctx);
  }
  if (!values || values.length === 0) {
    throw new Error('google-sheets-enhanced append_row requires at least one value');
  }

  var accessToken = googleSheetsEnhancedGetAccessToken(['https://www.googleapis.com/auth/spreadsheets']);
  var response = googleSheetsEnhancedAppendRow(spreadsheetId, range, values, {
    valueInputOption: '${valueInputOption}',
    insertDataOption: '${insertOption}',
    includeValuesInResponse: ${includeResponse}
  }, accessToken);

  var updates = response && response.updates ? response.updates : {};
  var updatedRange = updates.updatedRange || null;
  var updatedRows = updates.updatedRows || 0;
  var updatedColumns = updates.updatedColumns || 0;
  var returnedValues = (updates.updatedData && updates.updatedData.values && updates.updatedData.values[0]) || values;
  var sheetTitle = sheetName || (range.indexOf('!') >= 0 ? range.split('!')[0] : range);
  var rowNumber = null;
  if (updatedRange) {
    var parts = String(updatedRange).split('!');
    var tail = parts.length === 2 ? parts[1] : parts[0];
    var rowMatch = tail.match(/(\d+)(?::(\d+))?$/);
    if (rowMatch) {
      rowNumber = Number(rowMatch[2] || rowMatch[1] || 0);
    }
  }

  var summary = {
    success: true,
    spreadsheetId: spreadsheetId,
    sheetName: sheetTitle,
    range: range,
    updatedRange: updatedRange,
    updatedRows: updatedRows,
    updatedColumns: updatedColumns,
    values: returnedValues,
    rowNumber: rowNumber
  };

  ctx.googleSheetsEnhancedLastAppend = summary;
  ctx.googleSheetsLastAppend = summary;
  ctx.rowValues = returnedValues;
  ctx.googleSheetsRowValues = returnedValues;
  if (rowNumber !== null) {
    ctx.rowNumber = rowNumber;
    ctx.row = rowNumber;
    ctx.googleSheetsRowNumber = rowNumber;
  }

  logInfo('google_sheets_enhanced_append_row_success', {
    spreadsheetId: spreadsheetId,
    sheetName: sheetTitle,
    updatedRange: updatedRange,
    updatedRows: updatedRows
  });
  return ctx;
}
${googleSheetsEnhancedHelpersBlock()}`;
  }

  if (operation === 'get_values') {
    const defaultValueRender = String((config?.valueRenderOption ?? 'FORMATTED_VALUE')).toUpperCase();
    const defaultDateRender = String((config?.dateTimeRenderOption ?? 'FORMATTED_STRING')).toUpperCase();
    return `
function step_action_google_sheets_enhanced_get_values(ctx) {
  ctx = ctx || {};
  var config = ${configLiteral};
  var resolved = googleSheetsEnhancedResolveValue(config || {}, ctx) || {};

  var spreadsheetId = googleSheetsEnhancedResolveSpreadsheetId(resolved, ctx);
  if (!spreadsheetId) {
    throw new Error('google-sheets-enhanced get_values requires a spreadsheetId');
  }

  var sheetName = googleSheetsEnhancedResolveSheetName(resolved, ctx);
  var rangeTemplate = typeof resolved.range === 'string' ? resolved.range : '';
  var range = googleSheetsEnhancedNormalizeRange(rangeTemplate, sheetName);
  if (!range) {
    throw new Error('google-sheets-enhanced get_values requires a range');
  }

  var valueRenderOption = String((resolved.valueRenderOption || '${defaultValueRender}')).toUpperCase();
  var dateTimeRenderOption = String((resolved.dateTimeRenderOption || '${defaultDateRender}')).toUpperCase();

  var accessToken = googleSheetsEnhancedGetAccessToken(['https://www.googleapis.com/auth/spreadsheets.readonly']);
  var response = googleSheetsEnhancedValuesRequest(spreadsheetId, range, {
    method: 'GET',
    accessToken: accessToken,
    query: {
      majorDimension: 'ROWS',
      valueRenderOption: valueRenderOption,
      dateTimeRenderOption: dateTimeRenderOption
    }
  });
  var body = response && response.body ? response.body : response;
  var values = Array.isArray(body && body.values) ? body.values : [];

  var result = {
    spreadsheetId: spreadsheetId,
    range: body && body.range ? body.range : range,
    majorDimension: body && body.majorDimension ? body.majorDimension : 'ROWS',
    values: values,
    valueRenderOption: valueRenderOption,
    dateTimeRenderOption: dateTimeRenderOption
  };

  ctx.googleSheetsEnhancedLastRead = result;
  ctx.googleSheetsLastRead = result;
  ctx.rowValues = values && values.length > 0 ? values[0] : [];
  ctx.googleSheetsRowValues = ctx.rowValues;

  logInfo('google_sheets_enhanced_get_values_success', {
    spreadsheetId: spreadsheetId,
    range: result.range,
    rows: values.length
  });
  return ctx;
}
${googleSheetsEnhancedHelpersBlock()}`;
  }

  if (operation === 'update_cell') {
    const valueInputOption = String((config?.valueInputOption ?? 'USER_ENTERED')).toUpperCase();
    return `
function step_action_google_sheets_enhanced_update_cell(ctx) {
  ctx = ctx || {};
  var config = ${configLiteral};
  var resolved = googleSheetsEnhancedResolveValue(config || {}, ctx) || {};

  var spreadsheetId = googleSheetsEnhancedResolveSpreadsheetId(resolved, ctx);
  if (!spreadsheetId) {
    throw new Error('google-sheets-enhanced update_cell requires a spreadsheetId');
  }

  var sheetName = googleSheetsEnhancedResolveSheetName(resolved, ctx);
  var range = googleSheetsEnhancedNormalizeRange(resolved.range || '', sheetName);
  if (!range) {
    throw new Error('google-sheets-enhanced update_cell requires a range');
  }

  var value = resolved.value;
  if (value === undefined || value === null) {
    value = ctx.value !== undefined ? ctx.value : '';
  }

  var accessToken = googleSheetsEnhancedGetAccessToken(['https://www.googleapis.com/auth/spreadsheets']);
  var payload = googleSheetsEnhancedUpdateValues(spreadsheetId, range, [[value]], {
    valueInputOption: '${valueInputOption}'
  }, accessToken);

  var summary = {
    success: true,
    spreadsheetId: spreadsheetId,
    updatedRange: payload && payload.updatedRange ? payload.updatedRange : range,
    updatedCells: payload && payload.updatedCells ? payload.updatedCells : 1,
    values: [[value]]
  };

  ctx.googleSheetsEnhancedLastUpdate = summary;
  logInfo('google_sheets_enhanced_update_cell_success', {
    spreadsheetId: spreadsheetId,
    range: summary.updatedRange
  });
  return ctx;
}
${googleSheetsEnhancedHelpersBlock()}`;
  }

  if (operation === 'update_range') {
    const valueInputOption = String((config?.valueInputOption ?? 'USER_ENTERED')).toUpperCase();
    return `
function step_action_google_sheets_enhanced_update_range(ctx) {
  ctx = ctx || {};
  var config = ${configLiteral};
  var resolved = googleSheetsEnhancedResolveValue(config || {}, ctx) || {};

  var spreadsheetId = googleSheetsEnhancedResolveSpreadsheetId(resolved, ctx);
  if (!spreadsheetId) {
    throw new Error('google-sheets-enhanced update_range requires a spreadsheetId');
  }

  var sheetName = googleSheetsEnhancedResolveSheetName(resolved, ctx);
  var range = googleSheetsEnhancedNormalizeRange(resolved.range || '', sheetName);
  if (!range) {
    throw new Error('google-sheets-enhanced update_range requires a range');
  }

  var values = googleSheetsEnhancedCoerce2DValues(resolved.values, ctx);
  if (!values || values.length === 0) {
    throw new Error('google-sheets-enhanced update_range requires a non-empty values array');
  }

  var accessToken = googleSheetsEnhancedGetAccessToken(['https://www.googleapis.com/auth/spreadsheets']);
  var payload = googleSheetsEnhancedUpdateValues(spreadsheetId, range, values, {
    valueInputOption: '${valueInputOption}'
  }, accessToken);

  var summary = {
    success: true,
    spreadsheetId: spreadsheetId,
    updatedRange: payload && payload.updatedRange ? payload.updatedRange : range,
    updatedRows: payload && payload.updatedRows ? payload.updatedRows : values.length,
    updatedColumns: payload && payload.updatedColumns ? payload.updatedColumns : (values[0] ? values[0].length : 0),
    values: values
  };

  ctx.googleSheetsEnhancedLastUpdate = summary;
  logInfo('google_sheets_enhanced_update_range_success', {
    spreadsheetId: spreadsheetId,
    range: summary.updatedRange,
    rows: summary.updatedRows
  });
  return ctx;
}
${googleSheetsEnhancedHelpersBlock()}`;
  }

  if (operation === 'clear_range') {
    return `
function step_action_google_sheets_enhanced_clear_range(ctx) {
  ctx = ctx || {};
  var config = ${configLiteral};
  var resolved = googleSheetsEnhancedResolveValue(config || {}, ctx) || {};

  var spreadsheetId = googleSheetsEnhancedResolveSpreadsheetId(resolved, ctx);
  if (!spreadsheetId) {
    throw new Error('google-sheets-enhanced clear_range requires a spreadsheetId');
  }

  var sheetName = googleSheetsEnhancedResolveSheetName(resolved, ctx);
  var range = googleSheetsEnhancedNormalizeRange(resolved.range || '', sheetName);
  if (!range) {
    throw new Error('google-sheets-enhanced clear_range requires a range');
  }

  var accessToken = googleSheetsEnhancedGetAccessToken(['https://www.googleapis.com/auth/spreadsheets']);
  var payload = googleSheetsEnhancedClearRange(spreadsheetId, range, accessToken);

  var summary = {
    success: true,
    spreadsheetId: spreadsheetId,
    clearedRange: payload && payload.clearedRange ? payload.clearedRange : range
  };

  ctx.googleSheetsEnhancedLastClear = summary;
  logInfo('google_sheets_enhanced_clear_range_success', {
    spreadsheetId: spreadsheetId,
    range: summary.clearedRange
  });
  return ctx;
}
${googleSheetsEnhancedHelpersBlock()}`;
  }

  if (operation === 'create_sheet') {
    return `
function step_action_google_sheets_enhanced_create_sheet(ctx) {
  ctx = ctx || {};
  var config = ${configLiteral};
  var resolved = googleSheetsEnhancedResolveValue(config || {}, ctx) || {};

  var spreadsheetId = googleSheetsEnhancedResolveSpreadsheetId(resolved, ctx);
  if (!spreadsheetId) {
    throw new Error('google-sheets-enhanced create_sheet requires a spreadsheetId');
  }

  var title = googleSheetsEnhancedResolveString(resolved.title || resolved.sheetName || resolved.sheet, ctx);
  if (!title) {
    throw new Error('google-sheets-enhanced create_sheet requires a title');
  }

  var properties = {
    title: title
  };
  if (typeof resolved.index === 'number') {
    properties.index = resolved.index;
  }
  if (resolved.gridProperties && typeof resolved.gridProperties === 'object') {
    properties.gridProperties = resolved.gridProperties;
  }

  var accessToken = googleSheetsEnhancedGetAccessToken(['https://www.googleapis.com/auth/spreadsheets']);
  var payload = googleSheetsEnhancedBatchUpdate(spreadsheetId, [{
    addSheet: {
      properties: properties
    }
  }], accessToken);

  var replies = payload && payload.replies ? payload.replies : [];
  var created = replies && replies[0] && replies[0].addSheet ? replies[0].addSheet.properties : null;

  var summary = {
    success: true,
    spreadsheetId: spreadsheetId,
    sheetId: created && created.sheetId !== undefined ? created.sheetId : null,
    title: created && created.title ? created.title : title,
    index: created && created.index !== undefined ? created.index : (resolved.index !== undefined ? resolved.index : null)
  };

  ctx.googleSheetsEnhancedLastMutation = summary;
  logInfo('google_sheets_enhanced_create_sheet_success', {
    spreadsheetId: spreadsheetId,
    sheetId: summary.sheetId,
    title: summary.title
  });
  return ctx;
}
${googleSheetsEnhancedHelpersBlock()}`;
  }

  if (operation === 'delete_sheet') {
    return `
function step_action_google_sheets_enhanced_delete_sheet(ctx) {
  ctx = ctx || {};
  var config = ${configLiteral};
  var resolved = googleSheetsEnhancedResolveValue(config || {}, ctx) || {};

  var spreadsheetId = googleSheetsEnhancedResolveSpreadsheetId(resolved, ctx);
  if (!spreadsheetId) {
    throw new Error('google-sheets-enhanced delete_sheet requires a spreadsheetId');
  }

  var sheetId = resolved.sheetId;
  if (sheetId === undefined || sheetId === null) {
    var sheetName = googleSheetsEnhancedResolveSheetName(resolved, ctx);
    if (!sheetName) {
      throw new Error('google-sheets-enhanced delete_sheet requires a sheetId or sheetName');
    }
    var accessMetadata = googleSheetsEnhancedFetchSpreadsheet(spreadsheetId, googleSheetsEnhancedGetAccessToken(['https://www.googleapis.com/auth/spreadsheets.readonly']));
    var matched = null;
    if (accessMetadata && Array.isArray(accessMetadata.sheets)) {
      for (var i = 0; i < accessMetadata.sheets.length; i++) {
        var entry = accessMetadata.sheets[i];
        if (entry && entry.properties && entry.properties.title && entry.properties.title.toLowerCase() === sheetName.toLowerCase()) {
          matched = entry.properties.sheetId;
          break;
        }
      }
    }
    if (matched === null || matched === undefined) {
      throw new Error('Unable to resolve sheetId for delete_sheet');
    }
    sheetId = matched;
  }

  var accessToken = googleSheetsEnhancedGetAccessToken(['https://www.googleapis.com/auth/spreadsheets']);
  googleSheetsEnhancedBatchUpdate(spreadsheetId, [{ deleteSheet: { sheetId: sheetId } }], accessToken);

  var summary = {
    success: true,
    spreadsheetId: spreadsheetId,
    sheetId: sheetId
  };

  ctx.googleSheetsEnhancedLastMutation = summary;
  logInfo('google_sheets_enhanced_delete_sheet_success', {
    spreadsheetId: spreadsheetId,
    sheetId: sheetId
  });
  return ctx;
}
${googleSheetsEnhancedHelpersBlock()}`;
  }

  if (operation === 'duplicate_sheet') {
    return `
function step_action_google_sheets_enhanced_duplicate_sheet(ctx) {
  ctx = ctx || {};
  var config = ${configLiteral};
  var resolved = googleSheetsEnhancedResolveValue(config || {}, ctx) || {};

  var spreadsheetId = googleSheetsEnhancedResolveSpreadsheetId(resolved, ctx);
  if (!spreadsheetId) {
    throw new Error('google-sheets-enhanced duplicate_sheet requires a spreadsheetId');
  }

  var sourceSheetId = resolved.sourceSheetId;
  if (sourceSheetId === undefined || sourceSheetId === null) {
    var sourceName = googleSheetsEnhancedResolveSheetName(resolved, ctx);
    if (!sourceName) {
      throw new Error('google-sheets-enhanced duplicate_sheet requires sourceSheetId or sheetName');
    }
    var metadata = googleSheetsEnhancedFetchSpreadsheet(spreadsheetId, googleSheetsEnhancedGetAccessToken(['https://www.googleapis.com/auth/spreadsheets.readonly']));
    var found = null;
    if (metadata && Array.isArray(metadata.sheets)) {
      for (var i = 0; i < metadata.sheets.length; i++) {
        var entry = metadata.sheets[i];
        if (entry && entry.properties && entry.properties.title && entry.properties.title.toLowerCase() === sourceName.toLowerCase()) {
          found = entry.properties.sheetId;
          break;
        }
      }
    }
    if (found === null || found === undefined) {
      throw new Error('Unable to resolve sourceSheetId for duplicate_sheet');
    }
    sourceSheetId = found;
  }

  var duplicateRequest = {
    sourceSheetId: sourceSheetId
  };
  if (typeof resolved.insertSheetIndex === 'number') {
    duplicateRequest.insertSheetIndex = resolved.insertSheetIndex;
  }
  if (resolved.newSheetName) {
    duplicateRequest.newSheetName = googleSheetsEnhancedResolveString(resolved.newSheetName, ctx);
  }
  if (resolved.newSheetId !== undefined) {
    duplicateRequest.newSheetId = resolved.newSheetId;
  }

  var accessToken = googleSheetsEnhancedGetAccessToken(['https://www.googleapis.com/auth/spreadsheets']);
  var payload = googleSheetsEnhancedBatchUpdate(spreadsheetId, [{ duplicateSheet: duplicateRequest }], accessToken);
  var replies = payload && payload.replies ? payload.replies : [];
  var duplicated = replies && replies[0] && replies[0].duplicateSheet ? replies[0].duplicateSheet.properties : null;

  var summary = {
    success: true,
    spreadsheetId: spreadsheetId,
    sheetId: duplicated && duplicated.sheetId !== undefined ? duplicated.sheetId : null,
    title: duplicated && duplicated.title ? duplicated.title : (duplicateRequest.newSheetName || null)
  };

  ctx.googleSheetsEnhancedLastMutation = summary;
  logInfo('google_sheets_enhanced_duplicate_sheet_success', {
    spreadsheetId: spreadsheetId,
    sheetId: summary.sheetId,
    title: summary.title
  });
  return ctx;
}
${googleSheetsEnhancedHelpersBlock()}`;
  }

  if (operation === 'find_replace') {
    return `
function step_action_google_sheets_enhanced_find_replace(ctx) {
  ctx = ctx || {};
  var config = ${configLiteral};
  var resolved = googleSheetsEnhancedResolveValue(config || {}, ctx) || {};

  var spreadsheetId = googleSheetsEnhancedResolveSpreadsheetId(resolved, ctx);
  if (!spreadsheetId) {
    throw new Error('google-sheets-enhanced find_replace requires a spreadsheetId');
  }

  var findText = resolved.find || resolved.findText;
  if (!findText) {
    throw new Error('google-sheets-enhanced find_replace requires find text');
  }
  var replacement = resolved.replacement || resolved.replaceText || '';
  var sheetId = resolved.sheetId;
  if ((sheetId === undefined || sheetId === null) && resolved.sheetName) {
    var metadata = googleSheetsEnhancedFetchSpreadsheet(spreadsheetId, googleSheetsEnhancedGetAccessToken(['https://www.googleapis.com/auth/spreadsheets.readonly']));
    if (metadata && Array.isArray(metadata.sheets)) {
      for (var i = 0; i < metadata.sheets.length; i++) {
        var entry = metadata.sheets[i];
        if (entry && entry.properties && entry.properties.title && entry.properties.title.toLowerCase() === String(resolved.sheetName).toLowerCase()) {
          sheetId = entry.properties.sheetId;
          break;
        }
      }
    }
  }

  var request = {
    find: String(findText),
    replacement: String(replacement),
    allSheets: resolved.allSheets === false ? false : true,
    matchCase: resolved.matchCase === true,
    matchEntireCell: resolved.matchEntireCell === true
  };
  if (sheetId !== undefined && sheetId !== null) {
    request.sheetId = sheetId;
  }

  var accessToken = googleSheetsEnhancedGetAccessToken(['https://www.googleapis.com/auth/spreadsheets']);
  var payload = googleSheetsEnhancedBatchUpdate(spreadsheetId, [{ findReplace: request }], accessToken);
  var replies = payload && payload.replies ? payload.replies : [];
  var result = replies && replies[0] && replies[0].findReplace ? replies[0].findReplace : {};

  var summary = {
    success: true,
    spreadsheetId: spreadsheetId,
    occurrencesChanged: result.occurrencesChanged || 0,
    values: []
  };

  ctx.googleSheetsEnhancedLastMutation = summary;
  logInfo('google_sheets_enhanced_find_replace_success', {
    spreadsheetId: spreadsheetId,
    occurrencesChanged: summary.occurrencesChanged
  });
  return ctx;
}
${googleSheetsEnhancedHelpersBlock()}`;
  }

  if (operation === 'format_cells') {
    return `
function step_action_google_sheets_enhanced_format_cells(ctx) {
  ctx = ctx || {};
  var config = ${configLiteral};
  var resolved = googleSheetsEnhancedResolveValue(config || {}, ctx) || {};

  var spreadsheetId = googleSheetsEnhancedResolveSpreadsheetId(resolved, ctx);
  if (!spreadsheetId) {
    throw new Error('google-sheets-enhanced format_cells requires a spreadsheetId');
  }

  var sheetName = googleSheetsEnhancedResolveSheetName(resolved, ctx);
  var range = googleSheetsEnhancedNormalizeRange(resolved.range || '', sheetName);
  if (!range) {
    throw new Error('google-sheets-enhanced format_cells requires a range');
  }

  var format = resolved.format || {};
  var metadata = googleSheetsEnhancedFetchSpreadsheet(spreadsheetId, googleSheetsEnhancedGetAccessToken(['https://www.googleapis.com/auth/spreadsheets.readonly']));
  var sheetProps = null;
  if (metadata && Array.isArray(metadata.sheets)) {
    for (var i = 0; i < metadata.sheets.length; i++) {
      var entry = metadata.sheets[i];
      if (!entry || !entry.properties) continue;
      if (!sheetName || entry.properties.title === sheetName || range.indexOf(entry.properties.title + '!') === 0) {
        sheetProps = entry.properties;
        break;
      }
    }
  }
  if (!sheetProps) {
    throw new Error('Unable to resolve sheet for format_cells');
  }
  var rangeInfo = googleSheetsEnhancedParseRange(range);
  if (!rangeInfo.sheetName) {
    rangeInfo.sheetName = sheetProps.title;
  }
  var gridRange = googleSheetsEnhancedRangeToGrid(rangeInfo, sheetProps.sheetId);

  var accessToken = googleSheetsEnhancedGetAccessToken(['https://www.googleapis.com/auth/spreadsheets']);
  googleSheetsEnhancedBatchUpdate(spreadsheetId, [{
    repeatCell: {
      range: gridRange,
      cell: { userEnteredFormat: format },
      fields: 'userEnteredFormat'
    }
  }], accessToken);

  var summary = {
    success: true,
    spreadsheetId: spreadsheetId,
    updatedRange: range,
    format: format
  };

  ctx.googleSheetsEnhancedLastMutation = summary;
  logInfo('google_sheets_enhanced_format_cells_success', {
    spreadsheetId: spreadsheetId,
    range: range
  });
  return ctx;
}
${googleSheetsEnhancedHelpersBlock()}`;
  }

  if (operation === 'sort_range') {
    return `
function step_action_google_sheets_enhanced_sort_range(ctx) {
  ctx = ctx || {};
  var config = ${configLiteral};
  var resolved = googleSheetsEnhancedResolveValue(config || {}, ctx) || {};

  var spreadsheetId = googleSheetsEnhancedResolveSpreadsheetId(resolved, ctx);
  if (!spreadsheetId) {
    throw new Error('google-sheets-enhanced sort_range requires a spreadsheetId');
  }

  var sheetName = googleSheetsEnhancedResolveSheetName(resolved, ctx);
  var range = googleSheetsEnhancedNormalizeRange(resolved.range || '', sheetName);
  if (!range) {
    throw new Error('google-sheets-enhanced sort_range requires a range');
  }

  var sortSpecs = Array.isArray(resolved.sortSpecs) ? resolved.sortSpecs : [];
  if (sortSpecs.length === 0) {
    throw new Error('google-sheets-enhanced sort_range requires sort specifications');
  }

  var metadata = googleSheetsEnhancedFetchSpreadsheet(spreadsheetId, googleSheetsEnhancedGetAccessToken(['https://www.googleapis.com/auth/spreadsheets.readonly']));
  var sheetProps = null;
  if (metadata && Array.isArray(metadata.sheets)) {
    for (var i = 0; i < metadata.sheets.length; i++) {
      var entry = metadata.sheets[i];
      if (entry && entry.properties && (range.indexOf(entry.properties.title + '!') === 0 || (!sheetName && !sheetProps))) {
        sheetProps = entry.properties;
        if (range.indexOf(entry.properties.title + '!') === 0) {
          break;
        }
      }
    }
  }
  if (!sheetProps) {
    throw new Error('Unable to resolve sheet for sort_range');
  }

  var rangeInfo = googleSheetsEnhancedParseRange(range);
  if (!rangeInfo.sheetName) {
    rangeInfo.sheetName = sheetProps.title;
  }
  var gridRange = googleSheetsEnhancedRangeToGrid(rangeInfo, sheetProps.sheetId);

  var accessToken = googleSheetsEnhancedGetAccessToken(['https://www.googleapis.com/auth/spreadsheets']);
  googleSheetsEnhancedBatchUpdate(spreadsheetId, [{
    sortRange: {
      range: gridRange,
      sortSpecs: sortSpecs.map(function (spec) {
        return {
          dimensionIndex: typeof spec.dimensionIndex === 'number' ? spec.dimensionIndex : 0,
          sortOrder: (spec.sortOrder || 'ASCENDING').toUpperCase()
        };
      })
    }
  }], accessToken);

  var summary = {
    success: true,
    spreadsheetId: spreadsheetId,
    sortedRange: range,
    sortSpecs: sortSpecs
  };

  ctx.googleSheetsEnhancedLastMutation = summary;
  logInfo('google_sheets_enhanced_sort_range_success', {
    spreadsheetId: spreadsheetId,
    range: range,
    specs: sortSpecs.length
  });
  return ctx;
}
${googleSheetsEnhancedHelpersBlock()}`;
  }

  throw new Error(`Unsupported google-sheets-enhanced action: ${operation}`);
}

type GoogleSheetsEnhancedTriggerId = 'row_added' | 'cell_updated';

function buildGoogleSheetsEnhancedTrigger(operation: GoogleSheetsEnhancedTriggerId, config: any): string {
  const configLiteral = JSON.stringify(prepareValueForCode(config ?? {}));

  if (operation === 'row_added') {
    return `
function trigger_google_sheets_enhanced_row_added() {
  return buildPollingWrapper('trigger.google-sheets-enhanced:row_added', function (runtime) {
    var config = ${configLiteral};
    var resolved = googleSheetsEnhancedResolveValue(config || {}, runtime.state || {});
    var spreadsheetId = googleSheetsEnhancedResolveSpreadsheetId(resolved, runtime.state || {});
    if (!spreadsheetId) {
      throw new Error('google-sheets-enhanced row_added trigger requires a spreadsheetId');
    }

    var sheetName = googleSheetsEnhancedResolveSheetName(resolved, runtime.state || {});
    var accessToken = googleSheetsEnhancedGetAccessToken(['https://www.googleapis.com/auth/spreadsheets.readonly']);
    var metadata = googleSheetsEnhancedFetchSpreadsheet(spreadsheetId, accessToken);
    var sheetProps = null;
    if (metadata && Array.isArray(metadata.sheets)) {
      for (var i = 0; i < metadata.sheets.length; i++) {
        var entry = metadata.sheets[i];
        if (!entry || !entry.properties) continue;
        if (sheetName) {
          if (entry.properties.title && entry.properties.title.toLowerCase() === sheetName.toLowerCase()) {
            sheetProps = entry.properties;
            break;
          }
        } else {
          sheetProps = entry.properties;
          break;
        }
      }
    }
    if (!sheetProps) {
      throw new Error('Unable to resolve sheet for row_added trigger');
    }

    var range = sheetProps.title;
    var response = googleSheetsEnhancedValuesRequest(spreadsheetId, range, {
      method: 'GET',
      accessToken: accessToken,
      query: {
        majorDimension: 'ROWS',
        valueRenderOption: 'FORMATTED_VALUE'
      }
    });
    var body = response && response.body ? response.body : response;
    var rows = Array.isArray(body && body.values) ? body.values : [];

    var lastRowIndex = runtime.state && typeof runtime.state.lastRowIndex === 'number' ? runtime.state.lastRowIndex : null;
    if (lastRowIndex === null) {
      runtime.state.lastRowIndex = rows.length;
      runtime.summary({ skipped: true, reason: 'initial_sync', rows: rows.length });
      return { skipped: true, reason: 'initial_sync', rows: rows.length };
    }

    if (rows.length <= lastRowIndex) {
      runtime.summary({ rowsAttempted: 0, rowsDispatched: 0, rowsFailed: 0, spreadsheetId: spreadsheetId, sheetId: sheetProps.sheetId });
      return { rowsAttempted: 0, rowsDispatched: 0, rowsFailed: 0 };
    }

    var newRows = rows.slice(lastRowIndex);
    var startRowNumber = lastRowIndex + 1;
    var events = [];
    for (var i = 0; i < newRows.length; i++) {
      var rowNumber = startRowNumber + i;
      var values = Array.isArray(newRows[i]) ? newRows[i] : [];
      var valuesByColumn = {};
      for (var c = 0; c < values.length; c++) {
        var columnLetter = googleSheetsEnhancedIndexToColumn(c);
        valuesByColumn[columnLetter] = values[c];
      }
      var rangeA1 = sheetProps.title + '!' + rowNumber + ':' + rowNumber;
      var timestamp = new Date().toISOString();
      events.push({
        spreadsheetId: spreadsheetId,
        spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/' + spreadsheetId + '/edit#gid=' + sheetProps.sheetId,
        sheetId: sheetProps.sheetId,
        sheetTitle: sheetProps.title,
        rowId: sheetProps.sheetId + '!' + rowNumber,
        rowIndex: rowNumber,
        range: rangeA1,
        values: values,
        valuesByColumn: valuesByColumn,
        addedAt: timestamp,
        _meta: { raw: { spreadsheetId: spreadsheetId, sheetId: sheetProps.sheetId, range: rangeA1, values: values } }
      });
    }

    if (events.length === 0) {
      runtime.summary({ rowsAttempted: 0, rowsDispatched: 0, rowsFailed: 0, spreadsheetId: spreadsheetId, sheetId: sheetProps.sheetId });
      runtime.state.lastRowIndex = rows.length;
      return { rowsAttempted: 0, rowsDispatched: 0, rowsFailed: 0 };
    }

    var batch = runtime.dispatchBatch(events, function (entry) {
      return entry;
    });

    runtime.state.lastRowIndex = rows.length;
    runtime.summary({
      rowsAttempted: batch.attempted,
      rowsDispatched: batch.succeeded,
      rowsFailed: batch.failed,
      spreadsheetId: spreadsheetId,
      sheetId: sheetProps.sheetId,
      sheetTitle: sheetProps.title
    });
    return {
      rowsAttempted: batch.attempted,
      rowsDispatched: batch.succeeded,
      rowsFailed: batch.failed,
      lastRowIndex: rows.length
    };
  });
}
${googleSheetsEnhancedHelpersBlock()}`;
  }

  if (operation === 'cell_updated') {
    return `
function trigger_google_sheets_enhanced_cell_updated() {
  return buildPollingWrapper('trigger.google-sheets-enhanced:cell_updated', function (runtime) {
    var config = ${configLiteral};
    var resolved = googleSheetsEnhancedResolveValue(config || {}, runtime.state || {});
    var spreadsheetId = googleSheetsEnhancedResolveSpreadsheetId(resolved, runtime.state || {});
    if (!spreadsheetId) {
      throw new Error('google-sheets-enhanced cell_updated trigger requires a spreadsheetId');
    }

    var rangeTemplate = typeof resolved.range === 'string' ? resolved.range : '';
    var sheetName = googleSheetsEnhancedResolveSheetName(resolved, runtime.state || {});
    var range = googleSheetsEnhancedNormalizeRange(rangeTemplate, sheetName);

    var accessToken = googleSheetsEnhancedGetAccessToken(['https://www.googleapis.com/auth/spreadsheets.readonly']);
    var metadata = googleSheetsEnhancedFetchSpreadsheet(spreadsheetId, accessToken);
    var sheetProps = null;
    if (metadata && Array.isArray(metadata.sheets)) {
      for (var i = 0; i < metadata.sheets.length; i++) {
        var entry = metadata.sheets[i];
        if (!entry || !entry.properties) continue;
        if (range && range.indexOf(entry.properties.title + '!') === 0) {
          sheetProps = entry.properties;
          break;
        }
        if (!range && sheetName) {
          if (entry.properties.title && entry.properties.title.toLowerCase() === sheetName.toLowerCase()) {
            sheetProps = entry.properties;
            break;
          }
        } else if (!range && !sheetName && !sheetProps) {
          sheetProps = entry.properties;
        }
      }
    }
    if (!sheetProps) {
      throw new Error('Unable to resolve sheet for cell_updated trigger');
    }

    if (!range) {
      range = sheetProps.title;
    }

    var response = googleSheetsEnhancedValuesRequest(spreadsheetId, range, {
      method: 'GET',
      accessToken: accessToken,
      query: {
        majorDimension: 'ROWS',
        valueRenderOption: 'FORMATTED_VALUE'
      }
    });
    var body = response && response.body ? response.body : response;
    var values = Array.isArray(body && body.values) ? body.values : [];
    var rangeInfo = googleSheetsEnhancedParseRange(range);
    if (!rangeInfo.sheetName) {
      rangeInfo.sheetName = sheetProps.title;
    }
    var flattened = googleSheetsEnhancedFlattenValues(rangeInfo, values);

    if (!runtime.state || typeof runtime.state !== 'object') {
      runtime.state = {};
    }
    if (!runtime.state.cells || typeof runtime.state.cells !== 'object') {
      runtime.state.cells = {};
    }

    if (!runtime.state.initialized) {
      runtime.state.cells = {};
      for (var i = 0; i < flattened.length; i++) {
        var entry = flattened[i];
        runtime.state.cells[sheetProps.sheetId + '!' + entry.cell] = googleSheetsEnhancedSerializeValue(entry.value);
      }
      runtime.state.initialized = true;
      runtime.state.lastSnapshotAt = new Date().toISOString();
      runtime.summary({ skipped: true, reason: 'initial_sync', cells: flattened.length });
      return { skipped: true, reason: 'initial_sync', cells: flattened.length };
    }

    var changes = [];
    var currentMap = {};
    for (var i = 0; i < flattened.length; i++) {
      var entry = flattened[i];
      var key = sheetProps.sheetId + '!' + entry.cell;
      var serialized = googleSheetsEnhancedSerializeValue(entry.value);
      currentMap[key] = serialized;
      var previous = runtime.state.cells[key];
      if (previous === undefined) {
        previous = '';
      }
      if (serialized !== previous) {
        var timestamp = new Date().toISOString();
        changes.push({
          spreadsheetId: spreadsheetId,
          sheetId: sheetProps.sheetId,
          sheetTitle: sheetProps.title,
          range: sheetProps.title + '!' + entry.cell,
          changeId: sheetProps.sheetId + '!' + entry.cell + '@' + timestamp,
          oldValue: previous === '' ? null : previous,
          newValue: entry.value === undefined ? null : entry.value,
          updatedBy: null,
          updatedAt: timestamp,
          _meta: { raw: { spreadsheetId: spreadsheetId, sheetId: sheetProps.sheetId, range: sheetProps.title + '!' + entry.cell, oldValue: previous === '' ? null : previous, newValue: entry.value } }
        });
      }
    }

    runtime.state.cells = currentMap;
    runtime.state.lastSnapshotAt = new Date().toISOString();

    if (changes.length === 0) {
      runtime.summary({ eventsAttempted: 0, eventsDispatched: 0, eventsFailed: 0, spreadsheetId: spreadsheetId, sheetId: sheetProps.sheetId });
      return { eventsAttempted: 0, eventsDispatched: 0, eventsFailed: 0 };
    }

    var batch = runtime.dispatchBatch(changes, function (entry) {
      return entry;
    });

    runtime.summary({
      eventsAttempted: batch.attempted,
      eventsDispatched: batch.succeeded,
      eventsFailed: batch.failed,
      spreadsheetId: spreadsheetId,
      sheetId: sheetProps.sheetId,
      sheetTitle: sheetProps.title
    });
    return {
      eventsAttempted: batch.attempted,
      eventsDispatched: batch.succeeded,
      eventsFailed: batch.failed
    };
  });
}
${googleSheetsEnhancedHelpersBlock()}`;
  }

  throw new Error(`Unsupported google-sheets-enhanced trigger: ${operation}`);
}

if (typeof googleSheetsEnhancedResolveValue !== 'function') {
  function googleSheetsEnhancedResolveValue(template, ctx) {
    if (template === null || template === undefined) {
      return template;
    }
    if (Array.isArray(template)) {
      var resolvedArray = [];
      for (var i = 0; i < template.length; i++) {
        resolvedArray.push(googleSheetsEnhancedResolveValue(template[i], ctx));
      }
      return resolvedArray;
    }
    if (typeof template === 'object') {
      var resolvedObject = {};
      for (var key in template) {
        if (!Object.prototype.hasOwnProperty.call(template, key)) continue;
        resolvedObject[key] = googleSheetsEnhancedResolveValue(template[key], ctx);
      }
      return resolvedObject;
    }
    if (typeof template === 'string') {
      return interpolate(template, ctx || {});
    }
    return template;
  }
}

if (typeof googleSheetsEnhancedResolveString !== 'function') {
  function googleSheetsEnhancedResolveString(template, ctx) {
    if (typeof template !== 'string') {
      return template;
    }
    var resolved = interpolate(template, ctx || {});
    if (typeof resolved === 'string') {
      return resolved.trim();
    }
    return resolved;
  }
}

if (typeof googleSheetsEnhancedResolveSpreadsheetId !== 'function') {
  function googleSheetsEnhancedResolveSpreadsheetId(config, ctx) {
    var candidate = null;
    if (typeof config === 'string') {
      candidate = config;
    } else if (config && typeof config === 'object') {
      if (typeof config.spreadsheetId === 'string') {
        candidate = config.spreadsheetId;
      } else if (typeof config.spreadsheet === 'string') {
        candidate = config.spreadsheet;
      } else if (typeof config.spreadsheetUrl === 'string') {
        candidate = config.spreadsheetUrl;
      }
    }
    if (!candidate && ctx && typeof ctx.spreadsheetId === 'string') {
      candidate = ctx.spreadsheetId;
    }
    if (!candidate) {
      return '';
    }
    var resolved = googleSheetsEnhancedResolveString(candidate, ctx);
    if (!resolved) {
      return '';
    }
    var match = resolved.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
      return match[1];
    }
    return resolved;
  }
}

if (typeof googleSheetsEnhancedResolveSheetName !== 'function') {
  function googleSheetsEnhancedResolveSheetName(config, ctx) {
    var template = null;
    if (config && typeof config === 'object') {
      if (typeof config.sheetName === 'string') {
        template = config.sheetName;
      } else if (typeof config.sheet === 'string') {
        template = config.sheet;
      } else if (typeof config.title === 'string') {
        template = config.title;
      }
    } else if (typeof config === 'string') {
      template = config;
    }
    if (!template && ctx && typeof ctx.sheetName === 'string') {
      template = ctx.sheetName;
    }
    if (!template && ctx && typeof ctx.sheet === 'string') {
      template = ctx.sheet;
    }
    if (!template) {
      return '';
    }
    return googleSheetsEnhancedResolveString(template, ctx);
  }
}

if (typeof googleSheetsEnhancedNormalizeRange !== 'function') {
  function googleSheetsEnhancedNormalizeRange(range, sheetName) {
    var normalized = (range || '').trim();
    if (!normalized && sheetName) {
      return sheetName;
    }
    if (!normalized) {
      return '';
    }
    if (normalized.indexOf('!') === -1 && sheetName) {
      return sheetName + '!' + normalized;
    }
    return normalized;
  }
}

if (typeof googleSheetsEnhancedCoerceRowValues !== 'function') {
  function googleSheetsEnhancedCoerceRowValues(values, ctx) {
    if (!values && ctx) {
      if (ctx.values && Array.isArray(ctx.values)) {
        values = ctx.values;
      } else if (ctx.payload && Array.isArray(ctx.payload.values)) {
        values = ctx.payload.values;
      } else if (ctx.request && ctx.request.body && Array.isArray(ctx.request.body.values)) {
        values = ctx.request.body.values;
      }
    }
    if (Array.isArray(values)) {
      var resolved = [];
      for (var i = 0; i < values.length; i++) {
        var entry = values[i];
        if (entry && typeof entry === 'object' && entry.mode === 'static' && Object.prototype.hasOwnProperty.call(entry, 'value')) {
          resolved.push(entry.value);
        } else if (typeof entry === 'string') {
          resolved.push(interpolate(entry, ctx || {}));
        } else {
          resolved.push(entry);
        }
      }
      return resolved;
    }
    if (values && typeof values === 'object') {
      var result = [];
      for (var key in values) {
        if (!Object.prototype.hasOwnProperty.call(values, key)) continue;
        result.push(values[key]);
      }
      return result;
    }
    return [];
  }
}

if (typeof googleSheetsEnhancedCoerce2DValues !== 'function') {
  function googleSheetsEnhancedCoerce2DValues(values, ctx) {
    var rows = [];
    if (Array.isArray(values)) {
      for (var i = 0; i < values.length; i++) {
        var row = googleSheetsEnhancedCoerceRowValues(values[i], ctx);
        rows.push(Array.isArray(row) ? row : [row]);
      }
    }
    return rows;
  }
}

if (typeof googleSheetsEnhancedBuildUrl !== 'function') {
  function googleSheetsEnhancedBuildUrl(spreadsheetId, endpoint, query) {
    var base = 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(spreadsheetId);
    var path = endpoint || '';
    if (path && path.charAt(0) !== '/') {
      path = '/' + path;
    }
    var url = base + path;
    var parts = [];
    if (query && typeof query === 'object') {
      for (var key in query) {
        if (!Object.prototype.hasOwnProperty.call(query, key)) continue;
        var value = query[key];
        if (value === undefined || value === null || value === '') continue;
        if (Array.isArray(value)) {
          for (var i = 0; i < value.length; i++) {
            var entry = value[i];
            if (entry === undefined || entry === null || entry === '') continue;
            parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(entry));
          }
        } else {
          parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
        }
      }
    }
    if (parts.length > 0) {
      url += (url.indexOf('?') >= 0 ? '&' : '?') + parts.join('&');
    }
    return url;
  }
}

if (typeof googleSheetsEnhancedValuesRequest !== 'function') {
  function googleSheetsEnhancedValuesRequest(spreadsheetId, range, options) {
    options = options || {};
    var method = options.method || 'GET';
    var query = options.query || {};
    var accessToken = options.accessToken;
    var headers = Object.assign({
      'Accept': 'application/json'
    }, options.headers || {});
    if (accessToken) {
      headers['Authorization'] = 'Bearer ' + accessToken;
    }
    var endpoint = '/values/' + encodeURIComponent(range);
    if (method === 'POST' && options.append) {
      endpoint += ':append';
    } else if (method === 'POST' && options.clear) {
      endpoint += ':clear';
    }
    var url = googleSheetsEnhancedBuildUrl(spreadsheetId, endpoint, query);
    var payload = options.payload;
    var contentType = options.contentType;
    if (payload && typeof payload !== 'string') {
      payload = JSON.stringify(payload);
      contentType = contentType || 'application/json';
    }
    return rateLimitAware(function () {
      return fetchJson({
        url: url,
        method: method,
        headers: headers,
        payload: payload,
        contentType: contentType
      });
    }, { attempts: 4, initialDelayMs: 500, jitter: 0.2 });
  }
}

if (typeof googleSheetsEnhancedAppendRow !== 'function') {
  function googleSheetsEnhancedAppendRow(spreadsheetId, range, values, options, accessToken) {
    var query = {
      valueInputOption: (options && options.valueInputOption) || 'USER_ENTERED',
      insertDataOption: (options && options.insertDataOption) || 'INSERT_ROWS',
      includeValuesInResponse: options && options.includeValuesInResponse === false ? false : true
    };
    var response = googleSheetsEnhancedValuesRequest(spreadsheetId, range, {
      method: 'POST',
      append: true,
      query: query,
      accessToken: accessToken,
      payload: { values: [values] }
    });
    return response && response.body ? response.body : response;
  }
}

if (typeof googleSheetsEnhancedUpdateValues !== 'function') {
  function googleSheetsEnhancedUpdateValues(spreadsheetId, range, values, options, accessToken) {
    var query = {
      valueInputOption: (options && options.valueInputOption) || 'USER_ENTERED'
    };
    var response = googleSheetsEnhancedValuesRequest(spreadsheetId, range, {
      method: 'PUT',
      query: query,
      accessToken: accessToken,
      payload: { values: values }
    });
    return response && response.body ? response.body : response;
  }
}

if (typeof googleSheetsEnhancedClearRange !== 'function') {
  function googleSheetsEnhancedClearRange(spreadsheetId, range, accessToken) {
    var response = googleSheetsEnhancedValuesRequest(spreadsheetId, range, {
      method: 'POST',
      clear: true,
      accessToken: accessToken,
      payload: {}
    });
    return response && response.body ? response.body : response;
  }
}

if (typeof googleSheetsEnhancedBatchUpdate !== 'function') {
  function googleSheetsEnhancedBatchUpdate(spreadsheetId, requests, accessToken) {
    var url = googleSheetsEnhancedBuildUrl(spreadsheetId, ':batchUpdate', null);
    var headers = {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };
    if (accessToken) {
      headers['Authorization'] = 'Bearer ' + accessToken;
    }
    var response = rateLimitAware(function () {
      return fetchJson({
        url: url,
        method: 'POST',
        headers: headers,
        payload: JSON.stringify({ requests: requests || [] }),
        contentType: 'application/json'
      });
    }, { attempts: 4, initialDelayMs: 500, jitter: 0.2 });
    return response && response.body ? response.body : response;
  }
}

if (typeof googleSheetsEnhancedFetchSpreadsheet !== 'function') {
  function googleSheetsEnhancedFetchSpreadsheet(spreadsheetId, accessToken) {
    var url = googleSheetsEnhancedBuildUrl(spreadsheetId, '', { includeGridData: false });
    var headers = {
      'Accept': 'application/json'
    };
    if (accessToken) {
      headers['Authorization'] = 'Bearer ' + accessToken;
    }
    var response = rateLimitAware(function () {
      return fetchJson({
        url: url,
        method: 'GET',
        headers: headers
      });
    }, { attempts: 4, initialDelayMs: 500, jitter: 0.2 });
    return response && response.body ? response.body : response;
  }
}

if (typeof googleSheetsEnhancedLookupSheet !== 'function') {
  function googleSheetsEnhancedLookupSheet(spreadsheetId, identifier, accessToken) {
    var metadata = googleSheetsEnhancedFetchSpreadsheet(spreadsheetId, accessToken);
    var sheets = metadata && metadata.sheets ? metadata.sheets : [];
    if (!Array.isArray(sheets)) {
      return null;
    }
    for (var i = 0; i < sheets.length; i++) {
      var entry = sheets[i];
      if (!entry || !entry.properties) continue;
      var props = entry.properties;
      if (identifier === undefined || identifier === null || identifier === '') {
        return props;
      }
      if (typeof identifier === 'number' && props.sheetId === identifier) {
        return props;
      }
      if (typeof identifier === 'string') {
        var trimmed = identifier.trim();
        if (trimmed && props.title && props.title.toLowerCase() === trimmed.toLowerCase()) {
          return props;
        }
      }
    }
    return sheets.length > 0 ? sheets[0].properties : null;
  }
}

if (typeof googleSheetsEnhancedParseRange !== 'function') {
  function googleSheetsEnhancedParseRange(range) {
    var result = { sheetName: '', startRow: null, endRow: null, startColumn: null, endColumn: null };
    if (!range) {
      return result;
    }
    var text = range.trim();
    var parts = text.split('!');
    if (parts.length === 2) {
      result.sheetName = parts[0];
      text = parts[1];
    } else {
      result.sheetName = parts[0];
      text = parts.length === 1 ? parts[0] : parts.slice(1).join('!');
    }
    if (!text) {
      return result;
    }
    var match = text.match(/([A-Z]+)?(\d+)?(?::([A-Z]+)?(\d+)?)?/i);
    if (!match) {
      return result;
    }
    if (match[1]) {
      result.startColumn = match[1].toUpperCase();
    }
    if (match[2]) {
      result.startRow = Number(match[2]);
    }
    if (match[3]) {
      result.endColumn = match[3].toUpperCase();
    }
    if (match[4]) {
      result.endRow = Number(match[4]);
    }
    return result;
  }
}

if (typeof googleSheetsEnhancedColumnToIndex !== 'function') {
  function googleSheetsEnhancedColumnToIndex(column) {
    if (!column) {
      return 0;
    }
    var letters = column.toUpperCase();
    var index = 0;
    for (var i = 0; i < letters.length; i++) {
      index = index * 26 + (letters.charCodeAt(i) - 64);
    }
    return Math.max(index - 1, 0);
  }
}

if (typeof googleSheetsEnhancedIndexToColumn !== 'function') {
  function googleSheetsEnhancedIndexToColumn(index) {
    var result = '';
    var current = index;
    while (current >= 0) {
      result = String.fromCharCode((current % 26) + 65) + result;
      current = Math.floor(current / 26) - 1;
      if (current < 0) {
        break;
      }
    }
    return result || 'A';
  }
}

if (typeof googleSheetsEnhancedRangeToGrid !== 'function') {
  function googleSheetsEnhancedRangeToGrid(rangeInfo, sheetId) {
    var grid = { sheetId: sheetId };
    if (rangeInfo.startRow !== null) {
      grid.startRowIndex = Math.max(rangeInfo.startRow - 1, 0);
    }
    if (rangeInfo.endRow !== null) {
      grid.endRowIndex = Math.max(rangeInfo.endRow, grid.startRowIndex || 0);
    }
    if (rangeInfo.startColumn) {
      grid.startColumnIndex = googleSheetsEnhancedColumnToIndex(rangeInfo.startColumn);
    }
    if (rangeInfo.endColumn) {
      grid.endColumnIndex = googleSheetsEnhancedColumnToIndex(rangeInfo.endColumn) + 1;
    }
    return grid;
  }
}

if (typeof googleSheetsEnhancedFlattenValues !== 'function') {
  function googleSheetsEnhancedFlattenValues(rangeInfo, values) {
    var rows = Array.isArray(values) ? values : [];
    var startRow = rangeInfo.startRow || 1;
    var startColumnIndex = rangeInfo.startColumn ? googleSheetsEnhancedColumnToIndex(rangeInfo.startColumn) : 0;
    var flattened = [];
    for (var r = 0; r < rows.length; r++) {
      var rowValues = Array.isArray(rows[r]) ? rows[r] : [];
      var rowNumber = startRow + r;
      for (var c = 0; c < rowValues.length; c++) {
        var columnLetter = googleSheetsEnhancedIndexToColumn(startColumnIndex + c);
        flattened.push({ cell: columnLetter + rowNumber, value: rowValues[c] });
      }
    }
    return flattened;
  }
}

if (typeof googleSheetsEnhancedSerializeValue !== 'function') {
  function googleSheetsEnhancedSerializeValue(value) {
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch (error) {
        return String(value);
      }
    }
    return String(value);
  }
}
`;
}

  'action.google-sheets-enhanced:test_connection': (c) => buildGoogleSheetsEnhancedAction('test_connection', c),
  'action.google-sheets-enhanced:append_row': (c) => buildGoogleSheetsEnhancedAction('append_row', c),
  'action.google-sheets-enhanced:get_values': (c) => buildGoogleSheetsEnhancedAction('get_values', c),
  'action.google-sheets-enhanced:update_cell': (c) => buildGoogleSheetsEnhancedAction('update_cell', c),
  'action.google-sheets-enhanced:update_range': (c) => buildGoogleSheetsEnhancedAction('update_range', c),
  'action.google-sheets-enhanced:clear_range': (c) => buildGoogleSheetsEnhancedAction('clear_range', c),
  'action.google-sheets-enhanced:create_sheet': (c) => buildGoogleSheetsEnhancedAction('create_sheet', c),
  'action.google-sheets-enhanced:delete_sheet': (c) => buildGoogleSheetsEnhancedAction('delete_sheet', c),
  'action.google-sheets-enhanced:duplicate_sheet': (c) => buildGoogleSheetsEnhancedAction('duplicate_sheet', c),
  'action.google-sheets-enhanced:find_replace': (c) => buildGoogleSheetsEnhancedAction('find_replace', c),
  'action.google-sheets-enhanced:format_cells': (c) => buildGoogleSheetsEnhancedAction('format_cells', c),
  'action.google-sheets-enhanced:sort_range': (c) => buildGoogleSheetsEnhancedAction('sort_range', c),
  'trigger.google-sheets-enhanced:row_added': (c) => buildGoogleSheetsEnhancedTrigger('row_added', c),
  'trigger.google-sheets-enhanced:cell_updated': (c) => buildGoogleSheetsEnhancedTrigger('cell_updated', c),
