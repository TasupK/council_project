/**
 * 행사복지 시트 저장소.
 * Script Property EVENT_WELFARE_SPREADSHEET_ID를 우선 사용하고,
 * 컨테이너 바운드 스크립트인 경우 Active Spreadsheet를 사용한다.
 */
function ewGetSpreadsheet_() {
  var config = ewConfig_();
  var spreadsheetId = PropertiesService.getScriptProperties()
    .getProperty(config.spreadsheetPropertyKey);

  if (spreadsheetId) {
    return SpreadsheetApp.openById(spreadsheetId);
  }

  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) {
    return active;
  }

  // 사용자가 승인한 최초 실행 bootstrap이다. 생성 후에는 Script Property의 ID만 사용한다.
  var created = SpreadsheetApp.create('Council Project 행사복지 DB');
  PropertiesService.getScriptProperties()
    .setProperty(config.spreadsheetPropertyKey, created.getId());
  ewInitializeEventWelfareSheets_(created);
  return created;
}

function ewInitializeEventWelfareSheets_(spreadsheet) {
  var tables = ewConfig_().tables;
  var tableKeys = Object.keys(tables);
  var defaultSheet = spreadsheet.getSheets()[0];
  tableKeys.forEach(function (tableKey, index) {
    var table = tables[tableKey];
    var sheet = spreadsheet.getSheetByName(table.sheetName);
    if (!sheet && index === 0 && defaultSheet && defaultSheet.getLastRow() === 0) {
      sheet = defaultSheet.setName(table.sheetName);
    }
    if (!sheet) sheet = spreadsheet.insertSheet(table.sheetName);
    sheet.getRange(1, 1, 1, table.headers.length).setValues([table.headers]);
    sheet.setFrozenRows(1);
  });
}

function ewGetTableConfig_(tableKey) {
  var table = ewConfig_().tables[tableKey];
  if (!table) {
    ewThrow_('PROCESS_FAILED', '알 수 없는 행사복지 테이블입니다: ' + tableKey);
  }
  return table;
}

function ewGetOrCreateSheet_(tableKey) {
  var spreadsheet = ewGetSpreadsheet_();
  var table = ewGetTableConfig_(tableKey);
  var sheet = spreadsheet.getSheetByName(table.sheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(table.sheetName);
    sheet.getRange(1, 1, 1, table.headers.length).setValues([table.headers]);
    sheet.setFrozenRows(1);
    return sheet;
  }

  if (sheet.getLastColumn() === 0 || sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, table.headers.length).setValues([table.headers]);
    sheet.setFrozenRows(1);
    return sheet;
  }

  var lastColumn = sheet.getLastColumn();
  var existingHeaders = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];

  // 최신 DB 설계 순서로 신규 3개 필드가 먼저 추가된 경우, 승인된 미납부자 참가비 열을 13번째에 삽입한다.
  var nonMemberFeeIndex = table.headers.indexOf('non_member_fee_amount');
  var designHeadersWithoutNonMember = tableKey === 'event'
    ? table.headers.filter(function (header) { return header !== 'non_member_fee_amount'; })
    : [];
  if (
    tableKey === 'event' &&
    nonMemberFeeIndex >= 0 &&
    existingHeaders.join('|') === designHeadersWithoutNonMember.join('|')
  ) {
    sheet.insertColumnAfter(nonMemberFeeIndex);
    sheet.getRange(1, nonMemberFeeIndex + 1, 1, 1)
      .setValues([['non_member_fee_amount']]);
    existingHeaders = table.headers.slice();
  }

  // 기존 헤더가 최신 헤더의 접두사일 때만 누락된 마지막 열을 추가한다.
  var expectedPrefix = tableKey === 'event'
    ? table.headers.slice(0, existingHeaders.length)
    : [];
  if (
    tableKey === 'event' &&
    existingHeaders.length < table.headers.length &&
    existingHeaders.join('|') === expectedPrefix.join('|')
  ) {
    var missingHeaders = table.headers.slice(existingHeaders.length);
    sheet.getRange(1, existingHeaders.length + 1, 1, missingHeaders.length)
      .setValues([missingHeaders]);
    existingHeaders = table.headers.slice();
  }

  if (existingHeaders.join('|') !== table.headers.join('|')) {
    ewThrow_(
      'PROCESS_FAILED',
      table.sheetName + ' 시트의 헤더가 DB 설계와 다릅니다. 자동으로 덮어쓰지 않았습니다.'
    );
  }
  return sheet;
}

function ewReadTable_(tableKey) {
  var table = ewGetTableConfig_(tableKey);
  var sheet = ewGetOrCreateSheet_(tableKey);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }

  var values = sheet.getRange(2, 1, lastRow - 1, table.headers.length).getValues();
  return values.map(function (row, index) {
    var item = { __rowNumber: index + 2 };
    table.headers.forEach(function (header, columnIndex) {
      item[header] = ewPlainCellValue_(row[columnIndex]);
    });
    return item;
  }).filter(function (item) {
    return String(item[table.idField] || '').trim() !== '';
  });
}

function ewFindById_(tableKey, id) {
  var table = ewGetTableConfig_(tableKey);
  var textId = String(id || '').trim();
  return ewReadTable_(tableKey).find(function (item) {
    return String(item[table.idField]) === textId;
  }) || null;
}

function ewAppendItem_(tableKey, item) {
  var table = ewGetTableConfig_(tableKey);
  var sheet = ewGetOrCreateSheet_(tableKey);
  var row = table.headers.map(function (header) {
    return Object.prototype.hasOwnProperty.call(item, header) ? item[header] : '';
  });
  sheet.appendRow(row);
  return ewFindById_(tableKey, item[table.idField]);
}

function ewUpdateItem_(tableKey, id, patch) {
  var table = ewGetTableConfig_(tableKey);
  var sheet = ewGetOrCreateSheet_(tableKey);
  var current = ewFindById_(tableKey, id);
  if (!current) {
    ewThrow_('NOT_FOUND', '대상 정보를 찾을 수 없습니다.');
  }

  var merged = {};
  table.headers.forEach(function (header) {
    merged[header] = Object.prototype.hasOwnProperty.call(patch, header)
      ? patch[header]
      : current[header];
  });
  sheet.getRange(current.__rowNumber, 1, 1, table.headers.length)
    .setValues([table.headers.map(function (header) { return merged[header]; })]);
  return ewFindById_(tableKey, id);
}

function ewWithWriteLock_(callback) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function ewPlainCellValue_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone() || 'Asia/Seoul',
      'yyyy-MM-dd'
    );
  }
  return value === null || typeof value === 'undefined' ? '' : value;
}

function ewWithoutRowNumber_(item) {
  if (!item) return null;
  var result = {};
  Object.keys(item).forEach(function (key) {
    if (key !== '__rowNumber') result[key] = item[key];
  });
  return result;
}
