// 1. 사용자 DB 스프레드시트 열기
function openUserSpreadsheet_() {
  return SpreadsheetApp.openById(DB_CONFIG.userSpreadsheetId);
}

// 2. 운영 DB 스프레드시트 열기
function openOperationSpreadsheet_() {
  return SpreadsheetApp.openById(DB_CONFIG.operationSpreadsheetId);
}

// 3. 시트 데이터를 헤더 기반 객체 배열로 변환
function readTableRows_(spreadsheet, sheetName) {
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) return [];

  var values = sheet.getDataRange().getValues();
  if (!values || values.length < 2) return [];

  var headers = values[0].map(function (header) {
    return String(header || '').trim();
  });

  return values.slice(1).map(function (row, rowIndex) {
    var item = { _rowNumber: rowIndex + 2 };
    headers.forEach(function (header, columnIndex) {
      if (header) item[header] = row[columnIndex];
    });
    return item;
  }).filter(function (item) {
    return Object.keys(item).some(function (key) {
      return key !== '_rowNumber' && item[key] !== '' && item[key] !== false && item[key] != null;
    });
  });
}

// 4. 운영 DB 시트와 헤더 검증
function requireOperationTableSheet_(tableKey) {
  var table = getOperationDbTableSchema_(tableKey);
  var sheet = openOperationSpreadsheet_().getSheetByName(table.sheetName);
  var expectedHeaders = Object.keys(table.fields).map(function (fieldKey) {
    return table.fields[fieldKey];
  });
  if (!sheet) throw new Error(table.sheetName + ' 시트를 운영 DB에서 찾을 수 없습니다.');
  var actualHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  if (actualHeaders.join('|') !== expectedHeaders.join('|')) {
    throw new Error(table.sheetName + ' 시트의 헤더가 운영 DB 스키마와 다릅니다.');
  }
  return sheet;
}

// 5. 운영 DB 행을 스키마 필드키 객체로 조회
function readOperationTableRows_(tableKey) {
  var table = getOperationDbTableSchema_(tableKey);
  return readTableRows_(openOperationSpreadsheet_(), table.sheetName).map(function (row) {
    var item = { _rowNumber: row._rowNumber };
    Object.keys(table.fields).forEach(function (fieldKey) {
      item[fieldKey] = row[table.fields[fieldKey]];
    });
    return item;
  });
}

// 6. 운영 DB 행을 클라이언트 전달 가능한 값으로 조회
function readOperationTableClientRows_(tableKey) {
  return readOperationTableRows_(tableKey).map(function (row) {
    var item = {};
    Object.keys(row).forEach(function (fieldKey) {
      item[fieldKey] = toClientCellValue_(row[fieldKey]);
    });
    return item;
  });
}

// 7. 운영 DB PK 기준 행 조회
function findOperationTableRowById_(tableKey, id) {
  var table = getOperationDbTableSchema_(tableKey);
  var idField = table.primaryKey[0];
  return readOperationTableClientRows_(tableKey).filter(function (item) {
    return String(item[idField]) === String(id);
  })[0] || null;
}

// 8. 내부 행 번호 제거
function withoutInternalRowNumber_(item) {
  if (!item) return null;
  var result = {};
  Object.keys(item).forEach(function (key) {
    if (key !== '_rowNumber') result[key] = item[key];
  });
  return result;
}

// 9. 운영 DB 행 추가
function appendOperationTableRow_(tableKey, item) {
  var table = getOperationDbTableSchema_(tableKey);
  var sheet = requireOperationTableSheet_(tableKey);
  var row = Object.keys(table.fields).map(function (fieldKey) {
    return Object.prototype.hasOwnProperty.call(item, fieldKey) ? item[fieldKey] : '';
  });
  sheet.appendRow(row);
  SpreadsheetApp.flush();
  return item;
}

// 10. 운영 DB PK 기준 행 수정
function updateOperationTableRow_(tableKey, id, changes) {
  var table = getOperationDbTableSchema_(tableKey);
  var idField = table.primaryKey[0];
  var sheet = requireOperationTableSheet_(tableKey);
  var values = sheet.getDataRange().getValues();
  var headers = values[0] || [];
  var idColumn = headers.indexOf(table.fields[idField]);

  for (var rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    if (String(values[rowIndex][idColumn]) !== String(id)) continue;
    Object.keys(changes).forEach(function (fieldKey) {
      var column = headers.indexOf(table.fields[fieldKey]);
      if (column > -1) sheet.getRange(rowIndex + 1, column + 1).setValue(changes[fieldKey]);
    });
    return true;
  }
  throw new Error(table.name + ' 행을 찾을 수 없습니다: ' + id);
}

// 11. 운영 DB 행번호 기준 수정
function updateOperationTableRowByNumber_(tableKey, rowNumber, changes) {
  var table = getOperationDbTableSchema_(tableKey);
  var sheet = requireOperationTableSheet_(tableKey);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  Object.keys(changes).forEach(function (fieldKey) {
    var column = headers.indexOf(table.fields[fieldKey]);
    if (column > -1) sheet.getRange(rowNumber, column + 1).setValue(changes[fieldKey]);
  });
  return true;
}

// 12. 운영 DB 쓰기 잠금 실행
function withOperationWriteLock_(callback) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

// 13. 이메일 비교용 값 정리
function normalizeEmail_(value) {
  return String(value || '').trim().toLowerCase();
}

// 14. 일반 텍스트 값 정리
function normalizeTextValue_(value) {
  return String(value || '').trim();
}

// 15. 참/거짓 입력값 판정
function isTruthyValue_(value) {
  if (value === true) return true;
  if (value === false || value == null) return false;

  var text = String(value).trim().toLowerCase();
  return ['true', 'y', 'yes', '1', '활성', '사용', '예'].indexOf(text) !== -1;
}

// 16. 활성 상태값 판정
function isActiveStatus_(value) {
  var text = String(value || '').trim().toLowerCase();
  if (!text) return true;
  return ['활성', '사용', 'y', 'yes', 'true', '1'].indexOf(text) !== -1;
}

// 17. 날짜 값을 화면 표시용 문자열로 변환
function formatDateValue_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone() || 'Asia/Seoul', 'yyyy-MM-dd');
  }
  return String(value);
}

// 18. 일시 값을 화면 표시용 문자열로 변환
function formatDateTimeValue_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone() || 'Asia/Seoul', "yyyy-MM-dd'T'HH:mm:ssXXX");
  }
  return String(value);
}

// 19. 클라이언트 전달용 셀 값 변환
function toClientCellValue_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return formatDateTimeValue_(value);
  }
  return value == null ? '' : value;
}

// 20. 현재 일시 생성
function getCurrentIsoDateTime_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Seoul', "yyyy-MM-dd'T'HH:mm:ssXXX");
}
