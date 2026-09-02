function validateUserDbSpreadsheetIntegrity_(spreadsheet) {
  var schema = getUserDbSchema_();
  var result = readUserDbIntegrityTablesFromSpreadsheet_(spreadsheet, schema);
  var issues = result.issues.slice();
  issues = issues.concat(validateUserDbHeaders_(schema, result.headers));
  issues = issues.concat(validateUserDbPrimaryKeys_(schema, result.tables));
  issues = issues.concat(validateUserDbForeignKeys_(schema, result.tables));
  return {
    valid: issues.length === 0,
    issueCount: issues.length,
    issues: issues,
    tables: result.tables
  };
}

function openCandidateSpreadsheet_(id, resourceType) {
  try {
    return SpreadsheetApp.openById(String(id || '').trim());
  } catch (error) {
    console.error('Failed to open candidate spreadsheet.', resourceType, error);
    throwConnectionValidationError_(
      'RESOURCE_ACCESS_DENIED',
      '해당 Spreadsheet에 접근할 권한이 없습니다.',
      { resource: resourceType }
    );
  }
}

function openCandidateFolder_(id) {
  try {
    return DriveApp.getFolderById(String(id || '').trim());
  } catch (error) {
    console.error('Failed to open candidate folder.', error);
    throwConnectionValidationError_(
      'RESOURCE_ACCESS_DENIED',
      '해당 Drive 폴더에 접근할 권한이 없습니다.',
      { resource: 'rootFolder' }
    );
  }
}

function throwConnectionValidationError_(code, message, details) {
  var error = new Error(message);
  error.code = code;
  error.details = details || {};
  throw error;
}
