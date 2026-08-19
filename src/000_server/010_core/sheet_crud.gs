// 1. DB 종류와 테이블키로 시트 전체 행 조회
function listSheetCrudItems_(database, tableKey) {
  var table = getSheetCrudTableSchema_(database, tableKey);
  var sheet = requireSheetCrudTableSheet_(database, tableKey);
  var values = sheet.getDataRange().getValues();
  if (!values || values.length < 2) return [];
  return mapSheetCrudRowsToItems_(table, values);
}

// 2. DB 종류와 PK로 단일 행 조회
function findSheetCrudItemById_(database, tableKey, id) {
  var table = getSheetCrudTableSchema_(database, tableKey);
  var idField = table.primaryKey[0];
  var rows = listSheetCrudItems_(database, tableKey);
  for (var i = 0; i < rows.length; i += 1) {
    if (String(rows[i][idField]) === String(id)) return rows[i];
  }
  return null;
}

// 3. DB 종류와 테이블키로 행 추가
function insertSheetCrudItem_(database, tableKey, item) {
  return withSheetCrudWriteLock_(function () {
    var table = getSheetCrudTableSchema_(database, tableKey);
    var sheet = requireSheetCrudTableSheet_(database, tableKey);
    var fields = Object.keys(table.fields);
    var row = fields.map(function (fieldKey) {
      return Object.prototype.hasOwnProperty.call(item, fieldKey) ? item[fieldKey] : '';
    });
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);
    SpreadsheetApp.flush();
    return item;
  });
}

// 4. DB 종류와 PK로 행 수정
function updateSheetCrudItemById_(database, tableKey, id, changes) {
  return withSheetCrudWriteLock_(function () {
    var table = getSheetCrudTableSchema_(database, tableKey);
    var sheet = requireSheetCrudTableSheet_(database, tableKey);
    var values = sheet.getDataRange().getValues();
    var headers = values[0] || [];
    var idField = table.primaryKey[0];
    var idColumn = headers.indexOf(table.fields[idField]);
    var rowIndex;

    for (rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
      if (String(values[rowIndex][idColumn]) !== String(id)) continue;
      applySheetCrudChangesToRow_(table, headers, values[rowIndex], changes);
      sheet.getRange(rowIndex + 1, 1, 1, headers.length).setValues([values[rowIndex]]);
      SpreadsheetApp.flush();
      return true;
    }

    throw new Error(table.name + ' 행을 찾을 수 없습니다: ' + id);
  });
}

// 5. 공통 CRUD 테이블 스키마 조회
function getSheetCrudTableSchema_(database, tableKey) {
  if (database === 'user') return getUserDbTableSchema_(tableKey);
  if (database === 'operation') return getOperationDbTableSchema_(tableKey);
  throw new Error('알 수 없는 DB 종류입니다: ' + database);
}

// 6. 공통 CRUD 스프레드시트 조회
function openSheetCrudSpreadsheet_(database) {
  if (database === 'user') return openUserSpreadsheet_();
  if (database === 'operation') return openOperationSpreadsheet_();
  throw new Error('알 수 없는 DB 종류입니다: ' + database);
}

// 7. 시트와 헤더 검증
function requireSheetCrudTableSheet_(database, tableKey) {
  var table = getSheetCrudTableSchema_(database, tableKey);
  var sheet = openSheetCrudSpreadsheet_(database).getSheetByName(table.sheetName);
  var expectedHeaders = Object.keys(table.fields).map(function (fieldKey) {
    return table.fields[fieldKey];
  });
  var actualHeaders;

  if (!sheet) throw new Error(table.sheetName + ' 시트를 찾을 수 없습니다.');

  actualHeaders = readSheetCrudHeaderValues_(sheet);
  expectedHeaders.forEach(function (header) {
    if (actualHeaders.indexOf(header) === -1) {
      throw new Error(table.sheetName + ' 시트에 필요한 헤더가 없습니다: ' + header);
    }
  });
  return sheet;
}

// 8. 시트 헤더값 조회
function readSheetCrudHeaderValues_(sheet) {
  var range = sheet.getRange(1, 1, 1, sheet.getLastColumn());
  var values = range.getDisplayValues ? range.getDisplayValues() : range.getValues();
  return (values[0] || []).map(function (value) {
    return String(value || '').trim();
  });
}

// 9. 시트 행을 스키마 필드키 객체로 변환
function mapSheetCrudRowsToItems_(table, values) {
  var headers = values[0].map(function (header) {
    return String(header || '').trim();
  });
  var fields = Object.keys(table.fields);

  return values.slice(1).map(function (row, rowIndex) {
    var item = { _rowNumber: rowIndex + 2 };
    fields.forEach(function (fieldKey) {
      var columnIndex = headers.indexOf(table.fields[fieldKey]);
      item[fieldKey] = columnIndex > -1 ? row[columnIndex] : '';
    });
    return item;
  }).filter(function (item) {
    return Object.keys(item).some(function (key) {
      return key !== '_rowNumber' && item[key] !== '' && item[key] !== false && item[key] != null;
    });
  });
}

// 10. 수정값을 메모리 행에 반영
function applySheetCrudChangesToRow_(table, headers, row, changes) {
  Object.keys(changes || {}).forEach(function (fieldKey) {
    var column = headers.indexOf(table.fields[fieldKey]);
    if (column > -1) row[column] = changes[fieldKey];
  });
}

// 11. 공통 쓰기 잠금 실행
function withSheetCrudWriteLock_(callback) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}
