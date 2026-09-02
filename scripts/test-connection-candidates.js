var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');

function load_(context, relativePath) {
  var source = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
  vm.runInContext(source, context, { filename: relativePath });
}

function createSheet_(headers, rows) {
  var values = [headers].concat(rows || []);
  return {
    getDataRange: function () {
      return { getValues: function () { return values; } };
    }
  };
}

function createSpreadsheet_(sheets) {
  return {
    getSheetByName: function (name) { return sheets[name] || null; }
  };
}

function createContext_() {
  var context = vm.createContext({
    console: console,
    Object: Object,
    Array: Array,
    String: String,
    Number: Number,
    Boolean: Boolean,
    JSON: JSON,
    Error: Error
  });
  context.normalizeTextValue_ = function (value) {
    return value === null || typeof value === 'undefined' ? '' : String(value).trim();
  };
  context.readTableRows_ = function (spreadsheet, sheetName) {
    var values = spreadsheet.getSheetByName(sheetName).getDataRange().getValues();
    var headers = values[0] || [];
    return values.slice(1).map(function (valuesRow, index) {
      var row = { _rowNumber: index + 2 };
      headers.forEach(function (header, columnIndex) {
        row[header] = valuesRow[columnIndex];
      });
      return row;
    });
  };
  return context;
}

function testUserDbCandidateUsesExplicitSpreadsheet_() {
  var context = createContext_();
  context.getUserDbSchema_ = function () {
    return {
      users: {
        name: '사용자', sheetName: '사용자',
        fields: { email: 'Google이메일', name: '성명' },
        primaryKey: ['email'], foreignKeys: []
      },
      roles: {
        name: '역할', sheetName: '역할',
        fields: { id: '역할ID' },
        primaryKey: ['id'], foreignKeys: []
      }
    };
  };
  context.openUserSpreadsheet_ = function () {
    throw new Error('active UserDB must not open during candidate validation');
  };
  load_(context, 'src/backend/core/db/schema/user_db_integrity.gs');
  load_(context, 'src/backend/core/db/schema/connection_candidate_validation.gs');

  var candidate = createSpreadsheet_({
    '사용자': createSheet_(['Google이메일', '성명'], [['admin@example.com', '관리자']]),
    '역할': createSheet_(['역할ID'], [['role_admin']])
  });
  var result = context.validateUserDbSpreadsheetIntegrity_(candidate);

  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.issueCount, 0);
  assert.strictEqual(result.tables.users.length, 1);
  assert.strictEqual(result.tables.users[0].Google이메일, 'admin@example.com');
}

function testUserDbCandidateReportsMissingSheetsBeforeRowIntegrity_() {
  var context = createContext_();
  context.getUserDbSchema_ = function () {
    return {
      users: {
        name: '사용자', sheetName: '사용자', fields: { email: 'Google이메일' },
        primaryKey: ['email'], foreignKeys: []
      }
    };
  };
  load_(context, 'src/backend/core/db/schema/user_db_integrity.gs');
  load_(context, 'src/backend/core/db/schema/connection_candidate_validation.gs');

  var result = context.validateUserDbSpreadsheetIntegrity_(createSpreadsheet_({}));
  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.issues[0].code, 'SHEET_NOT_FOUND');
  assert.strictEqual(result.issues[0].table, '사용자');
}

function testOperationCandidateUsesExplicitUserSnapshot_() {
  var context = createContext_();
  context.getUserDbSchema_ = function () {
    return {
      users: {
        name: '사용자', fields: { email: 'Google이메일' }
      }
    };
  };
  context.getOperationDbSchema_ = function () {
    return {
      businessAuditLogs: {
        name: '업무감사로그', sheetName: '업무감사로그',
        fields: { id: '로그ID', actorEmail: '처리자이메일' },
        primaryKey: ['id'], foreignKeys: []
      },
      semesters: {
        name: '학기기준', sheetName: '학기기준',
        fields: { id: '학기ID', type: '학기구분' },
        allowedTypes: ['1학기', '2학기'], primaryKey: ['id'], foreignKeys: []
      }
    };
  };
  context.openOperationSpreadsheet_ = function () {
    throw new Error('active operation DB must not open during candidate validation');
  };
  context.readUserDbIntegrityTableRows_ = function () {
    throw new Error('active UserDB must not open during candidate validation');
  };
  load_(context, 'src/backend/core/db/schema/user_db_integrity.gs');
  load_(context, 'src/backend/core/db/schema/operation_db_integrity.gs');
  load_(context, 'src/backend/core/db/schema/connection_candidate_validation.gs');

  var candidate = createSpreadsheet_({
    '업무감사로그': createSheet_(['로그ID', '처리자이메일'], [['log-1', 'admin@example.com']]),
    '학기기준': createSheet_(['학기ID', '학기구분'], [['2026-1', '1학기']])
  });
  var result = context.validateOperationDbSpreadsheetIntegrity_(candidate, {
    users: [{ Google이메일: 'admin@example.com' }]
  });

  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.issueCount, 0);
}

function testRootFolderWriteProbeIsCleanedUp_() {
  var context = createContext_();
  load_(context, 'src/backend/core/storage/root_folder_validation.gs');
  var trashed = false;
  var folder = {
    getName: function () { return '운영 폴더'; },
    isTrashed: function () { return false; },
    createFile: function (name, content) {
      assert.strictEqual(name, '.connection-write-probe');
      assert.strictEqual(content, 'connection validation');
      return {
        setTrashed: function (value) { trashed = value; }
      };
    }
  };

  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(context.validateRootFolderCandidate_(folder))),
    { valid: true, name: '운영 폴더' }
  );
  assert.strictEqual(trashed, true);
}

testUserDbCandidateUsesExplicitSpreadsheet_();
testUserDbCandidateReportsMissingSheetsBeforeRowIntegrity_();
testOperationCandidateUsesExplicitUserSnapshot_();
testRootFolderWriteProbeIsCleanedUp_();
console.log('Connection candidate validation contract: PASS');
