// Google Form / 응답 Spreadsheet를 읽어 mapper가 소비할 source 객체로 변환한다.

function extractGoogleResourceId_(value) {
  var text = String(value == null ? '' : value).trim();
  if (!text) return '';
  var match = text.match(/\/d\/([A-Za-z0-9_-]+)/);
  if (match) return match[1];
  match = text.match(/[?&]id=([A-Za-z0-9_-]+)/);
  if (match) return match[1];
  return text.replace(/^https?:\/\//, '').indexOf('/') === -1 ? text : '';
}

function resolveEventFormResponseSource_(googleFormId, responseSheetId) {
  var formId = extractGoogleResourceId_(googleFormId);
  var spreadsheetId = extractGoogleResourceId_(responseSheetId);
  if (!spreadsheetId && formId) {
    try {
      spreadsheetId = extractGoogleResourceId_(FormApp.openById(formId).getDestinationId());
    } catch (error) {
      throwEventError_('PROCESS_FAILED', 'Google Form의 응답 Spreadsheet를 확인할 수 없습니다. 폼 응답 저장 위치와 접근 권한을 확인해주세요.');
    }
  }
  if (!spreadsheetId) {
    throwEventError_('VALIDATION_FAILED', 'Google Form ID 또는 응답 Spreadsheet ID가 필요합니다.');
  }

  var spreadsheet;
  try {
    spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  } catch (error) {
    throwEventError_('PROCESS_FAILED', 'Google Form 응답 Spreadsheet를 열 수 없습니다. ID와 실행 계정의 접근 권한을 확인해주세요.');
  }
  var sheet = selectEventFormResponseSheet_(spreadsheet);
  var lastRow = sheet.getLastRow();
  var lastColumn = sheet.getLastColumn();
  var values = lastColumn ? sheet.getRange(1, 1, Math.max(1, lastRow), lastColumn).getDisplayValues() : [];
  var headers = values.length ? values[0] : [];
  return {
    googleFormId: formId,
    responseSheetId: spreadsheetId,
    sheetId: sheet.getSheetId(),
    sheetName: sheet.getName(),
    headers: headers,
    rows: values.length > 1 ? values.slice(1) : []
  };
}

function selectEventFormResponseSheet_(spreadsheet) {
  var sheets = spreadsheet.getSheets();
  var best = null;
  sheets.forEach(function (sheet) {
    var lastColumn = sheet.getLastColumn();
    if (!lastColumn) return;
    var headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
    var mapping = buildEventFormHeaderMap_(headers);
    var score = Object.keys(mapping.byField).length;
    var required = typeof mapping.byField.studentId !== 'undefined' && typeof mapping.byField.name !== 'undefined';
    if (!best || (required && !best.required) || (required === best.required && score > best.score)) {
      best = { sheet: sheet, score: score, required: required };
    }
  });
  if (!best || !best.required) {
    throwEventError_('VALIDATION_FAILED', '응답 시트에서 필수 문항인 학번과 성명(또는 이름) 열을 찾을 수 없습니다.');
  }
  return best.sheet;
}
