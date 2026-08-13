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

// 4. 이메일 비교용 값 정리
function normalizeEmail_(value) {
  return String(value || '').trim().toLowerCase();
}

// 5. 일반 텍스트 값 정리
function normalizeTextValue_(value) {
  return String(value || '').trim();
}

// 6. 참/거짓 입력값 판정
function isTruthyValue_(value) {
  if (value === true) return true;
  if (value === false || value == null) return false;

  var text = String(value).trim().toLowerCase();
  return ['true', 'y', 'yes', '1', '활성', '사용', '예'].indexOf(text) !== -1;
}

// 7. 활성 상태값 판정
function isActiveStatus_(value) {
  var text = String(value || '').trim().toLowerCase();
  if (!text) return true;
  return ['활성', '사용', 'y', 'yes', 'true', '1'].indexOf(text) !== -1;
}

// 8. 날짜 값을 화면 표시용 문자열로 변환
function formatDateValue_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone() || 'Asia/Seoul', 'yyyy-MM-dd');
  }
  return String(value);
}
