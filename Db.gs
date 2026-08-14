/**
 * Db.gs
 * Google Sheets를 DB처럼 사용하기 위한 범용 CRUD 레이어.
 * SCHEMA(Schema.gs)에 정의된 테이블마다 시트를 자동 생성/헤더 정리하고,
 * 객체 배열 <-> 시트 행 변환, ID 채번, 검색/등록/수정을 담당합니다.
 */

/**
 * 연결할 스프레드시트를 반환합니다.
 * - 시트에서 "확장 프로그램 > Apps Script"로 연 컨테이너 바인딩 스크립트라면 getActiveSpreadsheet()가 바로 동작합니다.
 * - script.google.com에서 새로 만든 독립 스크립트(컨테이너 바인딩이 아님)라면 getActiveSpreadsheet()가 null이라
 *   "Cannot read properties of null (reading 'getSheetByName')" 오류가 납니다.
 *   이 경우 프로젝트 설정 > 스크립트 속성에 SPREADSHEET_ID 키로 대상 스프레드시트 ID를 등록하면 됩니다.
 *   (시트 URL의 /d/ 와 /edit 사이 문자열이 ID입니다)
 */
function getSS_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) return ss;

  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) {
    throw new Error(
      '연결된 스프레드시트를 찾을 수 없습니다. 이 스크립트가 시트에 바인딩되어 있지 않습니다. ' +
      '프로젝트 설정(톱니바퀴) > 스크립트 속성에서 SPREADSHEET_ID 키로 대상 스프레드시트 ID를 등록해주세요.'
    );
  }
  return SpreadsheetApp.openById(id);
}

/** 스키마에 정의된 모든 테이블 시트를 확인하고 없으면 생성합니다. */
function ensureAllSheets() {
  Object.keys(SCHEMA).forEach(function (tableId) {
    ensureSheet_(tableId);
  });
}

function ensureSheet_(tableId) {
  var table = SCHEMA[tableId];
  if (!table) throw new Error('알 수 없는 테이블ID: ' + tableId);
  var ss = getSS_();
  var sheet = ss.getSheetByName(table.sheetName);
  var headers = table.fields.map(function (f) { return f.name; });

  if (!sheet) {
    sheet = ss.insertSheet(table.sheetName);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#f2f2f2');
    return sheet;
  }

  // 헤더가 비어있으면 채워줌 (기존 빈 시트 대응). 이미 헤더가 있으면 그대로 둡니다(실제 운영 시트 보존).
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var firstRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var isEmpty = firstRow.join('') === '';
  if (isEmpty) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#f2f2f2');
  }
  return sheet;
}

function getSheet_(tableId) {
  return ensureSheet_(tableId);
}

function getHeaders_(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) return [];
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0];
}

/** 시트 전체를 객체 배열로 변환합니다. (1행은 헤더) 빈 값만 있는 행(학번 등 PK 공백)은 건너뜁니다. */
function readAll_(tableId) {
  var table = SCHEMA[tableId];
  var sheet = getSheet_(tableId);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var headers = getHeaders_(sheet);
  var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var rows = [];
  for (var r = 0; r < values.length; r++) {
    var obj = {};
    var hasValue = false;
    for (var c = 0; c < headers.length; c++) {
      obj[headers[c]] = values[r][c];
      if (values[r][c] !== '' && values[r][c] !== null) hasValue = true;
    }
    if (!hasValue) continue; // 완전히 빈 행(운영 시트에 미리 만들어둔 서식용 빈 줄) 건너뛰기
    obj.__row = r + 2; // 실제 시트 행 번호(수정/삭제용)
    rows.push(obj);
  }
  return rows;
}

/** PK 값으로 단건 조회 */
function findById_(tableId, id) {
  var table = SCHEMA[tableId];
  var rows = readAll_(tableId);
  return rows.filter(function (row) {
    return String(row[table.pk]) === String(id);
  })[0] || null;
}

/** 조건 함수(predicate)로 여러 건 조회 */
function findWhere_(tableId, predicateFn) {
  var rows = readAll_(tableId);
  return predicateFn ? rows.filter(predicateFn) : rows;
}

/** 신규 ID 채번: <pkPrefix>-000001 형태 (pkAuto 테이블 전용) */
function nextId_(tableId) {
  var table = SCHEMA[tableId];
  var prefix = table.pkPrefix || tableId;
  var rows = readAll_(tableId);
  var maxSeq = 0;
  rows.forEach(function (row) {
    var val = String(row[table.pk] || '');
    var m = val.match(/(\d+)$/);
    if (m) {
      var n = parseInt(m[1], 10);
      if (n > maxSeq) maxSeq = n;
    }
  });
  var seq = maxSeq + 1;
  return prefix + '-' + ('000000' + seq).slice(-6);
}

/** 신규 행 등록. pkAuto 테이블은 obj에 PK가 없으면 자동 채번하고,
 *  pkAuto:false 테이블(예: 회비납부자.학번)은 obj에 PK가 반드시 있어야 합니다. */
function insertRow_(tableId, obj) {
  var table = SCHEMA[tableId];
  var sheet = getSheet_(tableId);
  var now = new Date();

  var record = {};
  table.fields.forEach(function (f) {
    var v = obj[f.name];
    if (v === undefined || v === null || v === '') {
      if (f.pk) {
        if (table.pkAuto === false) {
          throw new Error('[' + table.label + '] ' + f.name + ' 값은 직접 지정해야 합니다.');
        }
        v = nextId_(tableId);
      } else if (f.type === 'DateTime' && (f.name.indexOf('신청일시') !== -1 || f.name.indexOf('발생일시') !== -1 || f.name === '등록일시' || f.name === '수정일시')) {
        v = now;
      } else if (f.default !== undefined) {
        v = f.default;
      } else {
        v = '';
      }
    }
    record[f.name] = v;
  });

  var headers = getHeaders_(sheet);
  var rowValues = headers.map(function (h) { return record[h]; });
  sheet.appendRow(rowValues);
  return record;
}

/** PK 기준 부분 수정(patch). 존재하지 않으면 null 반환 */
function updateRow_(tableId, id, patch) {
  var table = SCHEMA[tableId];
  var sheet = getSheet_(tableId);
  var existing = findById_(tableId, id);
  if (!existing) return null;

  var headers = getHeaders_(sheet);
  var merged = {};
  headers.forEach(function (h) { merged[h] = existing[h]; });
  Object.keys(patch).forEach(function (k) {
    if (headers.indexOf(k) !== -1) merged[k] = patch[k];
  });

  var rowValues = headers.map(function (h) { return merged[h]; });
  sheet.getRange(existing.__row, 1, 1, headers.length).setValues([rowValues]);
  return merged;
}

/** 여러 건 일괄 상태 변경 (승인/반려 등 공통 처리) */
function bulkUpdateStatus_(tableId, ids, patchFn) {
  var results = [];
  ids.forEach(function (id) {
    var before = findById_(tableId, id);
    if (!before) {
      results.push({ id: id, success: false, message: '대상을 찾을 수 없습니다.' });
      return;
    }
    var patch = patchFn(before);
    var after = updateRow_(tableId, id, patch);
    results.push({ id: id, success: true, before: before, after: after });
  });
  return results;
}

/** 업무감사로그(COM_03_BUSINESS_AUDIT) 기록 - 전 도메인 공용 감사 로그 */
function writeAudit_(targetType, targetId, action, beforeValue, afterValue, reason) {
  var email = Session.getActiveUser().getEmail() || 'system';
  insertRow_('COM_AUDIT', {
    발생일시: new Date(),
    처리자이메일: email,
    행위구분: action,
    대상구분: targetType,
    대상ID: String(targetId),
    변경전값: beforeValue === undefined ? '' : String(beforeValue),
    변경후값: afterValue === undefined ? '' : String(afterValue),
    처리사유: reason || ''
  });
}

/** _설정 시트에서 값 하나를 읽습니다. 없으면 fallback 반환. */
function getSetting_(key, fallback) {
  var row = findById_('COM_SETTINGS', key);
  if (!row || row.설정값 === '' || row.설정값 === null || row.설정값 === undefined) return fallback;
  return row.설정값;
}

/**
 * 학기당금액은 _설정 시트가 아니라 실제 운영 시트의 "회비금액기준" 탭
 * (금액기준ID, 적용시작일, 적용종료일, 학기당금액, 활성여부)에 관리되고 있습니다.
 * 활성여부가 체크된 행의 학기당금액을 사용하고, 그 탭이 없거나 활성 행이 없으면
 * _설정 시트(있다면) → DEFAULT_SEMESTER_FEE 순서로 대체합니다.
 */
function getSemesterFee_() {
  try {
    var sheet = getSS_().getSheetByName('회비금액기준');
    if (sheet) {
      var lastRow = sheet.getLastRow();
      if (lastRow >= 2) {
        var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        var col활성 = headers.indexOf('활성여부');
        var col금액 = headers.indexOf('학기당금액');
        if (col활성 !== -1 && col금액 !== -1) {
          var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
          for (var i = 0; i < values.length; i++) {
            if (values[i][col활성] === true && values[i][col금액] !== '') {
              return Number(values[i][col금액]) || DEFAULT_SEMESTER_FEE;
            }
          }
        }
      }
    }
  } catch (e) {
    // 회비금액기준 탭이 없는 환경(예: 테스트용 빈 시트)이면 아래 fallback으로 진행합니다.
  }
  var v = getSetting_('학기당금액', DEFAULT_SEMESTER_FEE);
  return Number(v) || DEFAULT_SEMESTER_FEE;
}
