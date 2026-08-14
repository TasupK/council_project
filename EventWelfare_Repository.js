/**
 * 행사복지 시트 저장소.
 * 전용 설정의 Spreadsheet ID를 우선 사용하고,
 * 미설정 시 Script Property와 Active Spreadsheet 순으로 fallback한다.
 */
function ewGetSpreadsheet_() {
  var config = ewConfig_();
  var configuredSpreadsheetId = String(config.spreadsheetId || '').trim();

  if (configuredSpreadsheetId) {
    return SpreadsheetApp.openById(configuredSpreadsheetId);
  }

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
    var sheet = ewFindConfiguredSheet_(spreadsheet, table);
    if (!sheet && index === 0 && defaultSheet && defaultSheet.getLastRow() === 0) {
      sheet = defaultSheet.setName(table.sheetName);
    }
    if (!sheet) sheet = spreadsheet.insertSheet(table.sheetName);
    var physicalHeaders = ewGetPhysicalHeaders_(table);
    sheet.getRange(1, 1, 1, physicalHeaders.length).setValues([physicalHeaders]);
    sheet.setFrozenRows(1);
  });
}

function ewFindConfiguredSheet_(spreadsheet, table) {
  if (typeof table.sheetId !== 'undefined' && table.sheetId !== null) {
    var targetSheetId = Number(table.sheetId);
    var sheets = spreadsheet.getSheets();
    for (var index = 0; index < sheets.length; index += 1) {
      if (sheets[index].getSheetId() === targetSheetId) {
        return sheets[index];
      }
    }
  }
  return spreadsheet.getSheetByName(table.sheetName);
}

function ewGetTableConfig_(tableKey) {
  var table = ewConfig_().tables[tableKey];
  if (!table) {
    ewThrow_('PROCESS_FAILED', '알 수 없는 행사복지 테이블입니다: ' + tableKey);
  }
  return table;
}

function ewGetPhysicalHeaders_(table) {
  return table.physicalHeaders && table.physicalHeaders.length
    ? table.physicalHeaders.slice()
    : table.headers.map(function (header) {
      return table.fieldMap && table.fieldMap[header] ? table.fieldMap[header] : header;
    });
}

function ewGetPhysicalHeader_(table, logicalHeader) {
  return table.fieldMap && table.fieldMap[logicalHeader]
    ? table.fieldMap[logicalHeader]
    : logicalHeader;
}

function ewGetHeaderState_(sheet, table) {
  var existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn())
    .getDisplayValues()[0]
    .map(function (header) { return String(header || '').trim(); });
  var expectedHeaders = ewGetPhysicalHeaders_(table);
  var missingHeaders = expectedHeaders.filter(function (header) {
    return existingHeaders.indexOf(header) < 0;
  });
  if (missingHeaders.length) {
    ewThrow_(
      'PROCESS_FAILED',
      table.sheetName + ' 시트에 필수 헤더가 없습니다: ' + missingHeaders.join(', ')
    );
  }
  var indexByHeader = {};
  existingHeaders.forEach(function (header, index) {
    indexByHeader[header] = index;
  });
  return {
    headers: existingHeaders,
    indexByHeader: indexByHeader
  };
}

function ewGetOrCreateSheet_(tableKey) {
  var spreadsheet = ewGetSpreadsheet_();
  var table = ewGetTableConfig_(tableKey);
  var sheet = ewFindConfiguredSheet_(spreadsheet, table);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(table.sheetName);
    var physicalHeaders = ewGetPhysicalHeaders_(table);
    sheet.getRange(1, 1, 1, physicalHeaders.length).setValues([physicalHeaders]);
    sheet.setFrozenRows(1);
    return sheet;
  }

  if (sheet.getLastColumn() === 0 || sheet.getLastRow() === 0) {
    var emptySheetHeaders = ewGetPhysicalHeaders_(table);
    sheet.getRange(1, 1, 1, emptySheetHeaders.length).setValues([emptySheetHeaders]);
    sheet.setFrozenRows(1);
    return sheet;
  }

  ewGetHeaderState_(sheet, table);
  return sheet;
}

function ewReadTable_(tableKey) {
  var table = ewGetTableConfig_(tableKey);
  var sheet = ewGetOrCreateSheet_(tableKey);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }

  var headerState = ewGetHeaderState_(sheet, table);
  var values = sheet.getRange(2, 1, lastRow - 1, headerState.headers.length).getValues();
  return values.map(function (row, index) {
    var item = { __rowNumber: index + 2 };
    table.headers.forEach(function (header) {
      var physicalHeader = ewGetPhysicalHeader_(table, header);
      var columnIndex = headerState.indexByHeader[physicalHeader];
      item[header] = typeof columnIndex === 'number'
        ? ewPlainCellValue_(row[columnIndex])
        : '';
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
  var headerState = ewGetHeaderState_(sheet, table);
  var idHeader = ewGetPhysicalHeader_(table, table.idField);
  var idColumnIndex = headerState.indexByHeader[idHeader];
  var lastRow = Math.max(1, sheet.getLastRow());
  var targetRow = lastRow + 1;
  if (lastRow >= 2) {
    var idValues = sheet.getRange(2, idColumnIndex + 1, lastRow - 1, 1)
      .getDisplayValues();
    for (var rowIndex = 0; rowIndex < idValues.length; rowIndex += 1) {
      if (String(idValues[rowIndex][0] || '').trim() === '') {
        targetRow = rowIndex + 2;
        break;
      }
    }
  }
  var row = targetRow <= lastRow
    ? sheet.getRange(targetRow, 1, 1, headerState.headers.length).getValues()[0]
    : headerState.headers.map(function () { return ''; });
  table.headers.forEach(function (header) {
    if (!Object.prototype.hasOwnProperty.call(item, header)) return;
    var physicalHeader = ewGetPhysicalHeader_(table, header);
    var columnIndex = headerState.indexByHeader[physicalHeader];
    if (typeof columnIndex === 'number') row[columnIndex] = item[header];
  });
  sheet.getRange(targetRow, 1, 1, headerState.headers.length).setValues([row]);
  return ewFindById_(tableKey, item[table.idField]);
}

/**
 * 여러 행을 추가할 때 헤더와 기존 행을 한 번만 읽는다.
 * DB에 미리 만들어 둔 빈 템플릿 행을 앞에서부터 재사용하고, 화면에서 다루지 않는 기본값은 보존한다.
 */
function ewAppendItems_(tableKey, items) {
  if (!Array.isArray(items) || !items.length) return [];
  var table = ewGetTableConfig_(tableKey);
  var sheet = ewGetOrCreateSheet_(tableKey);
  var headerState = ewGetHeaderState_(sheet, table);
  var idHeader = ewGetPhysicalHeader_(table, table.idField);
  var idColumnIndex = headerState.indexByHeader[idHeader];
  var lastRow = Math.max(1, sheet.getLastRow());
  var existingRows = lastRow >= 2
    ? sheet.getRange(2, 1, lastRow - 1, headerState.headers.length).getValues()
    : [];
  var blankRows = [];
  existingRows.forEach(function (row, index) {
    if (String(row[idColumnIndex] || '').trim() === '') blankRows.push(index + 2);
  });
  var appendRow = lastRow + 1;

  items.forEach(function (item) {
    var targetRow = blankRows.length ? blankRows.shift() : appendRow++;
    var row = targetRow <= lastRow
      ? existingRows[targetRow - 2].slice()
      : headerState.headers.map(function () { return ''; });
    table.headers.forEach(function (header) {
      if (!Object.prototype.hasOwnProperty.call(item, header)) return;
      var physicalHeader = ewGetPhysicalHeader_(table, header);
      var columnIndex = headerState.indexByHeader[physicalHeader];
      if (typeof columnIndex === 'number') row[columnIndex] = item[header];
    });
    sheet.getRange(targetRow, 1, 1, headerState.headers.length).setValues([row]);
  });
  return items.map(ewWithoutRowNumber_);
}

function ewUpdateItem_(tableKey, id, patch) {
  var table = ewGetTableConfig_(tableKey);
  var sheet = ewGetOrCreateSheet_(tableKey);
  var current = ewFindById_(tableKey, id);
  if (!current) {
    ewThrow_('NOT_FOUND', '대상 정보를 찾을 수 없습니다.');
  }

  var headerState = ewGetHeaderState_(sheet, table);
  var row = sheet.getRange(current.__rowNumber, 1, 1, headerState.headers.length)
    .getValues()[0];
  Object.keys(patch).forEach(function (header) {
    if (table.headers.indexOf(header) < 0) return;
    var physicalHeader = ewGetPhysicalHeader_(table, header);
    var columnIndex = headerState.indexByHeader[physicalHeader];
    if (typeof columnIndex === 'number') row[columnIndex] = patch[header];
  });
  sheet.getRange(current.__rowNumber, 1, 1, headerState.headers.length)
    .setValues([row]);
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
