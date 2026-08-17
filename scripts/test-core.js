var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');

function load_(context, relativePath) {
  var file = path.join(ROOT, relativePath);
  var source = fs.readFileSync(file, 'utf8');
  vm.runInContext(source, context, { filename: file });
}

function createSheet_(values) {
  return {
    values: values,
    getLastRow: function () { return this.values.length; },
    getLastColumn: function () { return this.values[0].length; },
    getDataRange: function () {
      var sheet = this;
      return { getValues: function () { return sheet.values.map(function (row) { return row.slice(); }); } };
    },
    getRange: function (row, column, rowCount, columnCount) {
      var sheet = this;
      return {
        getValues: function () {
          return sheet.values.slice(row - 1, row - 1 + rowCount).map(function (item) {
            return item.slice(column - 1, column - 1 + columnCount);
          });
        },
        setValues: function (rows) {
          rows.forEach(function (item, rowOffset) {
            while (sheet.values.length < row - 1 + rowCount) sheet.values.push([]);
            item.forEach(function (value, columnOffset) {
              sheet.values[row - 1 + rowOffset][column - 1 + columnOffset] = value;
            });
          });
        }
      };
    }
  };
}

function createContext_() {
  var lock = { waitLock: function () {}, releaseLock: function () {} };
  return vm.createContext({
    console: console,
    LockService: { getScriptLock: function () { return lock; } },
    SpreadsheetApp: { flush: function () {} }
  });
}

function testApiLifecycle_() {
  var calls = [];
  var context = createContext_();
  context.requireLoginContext_ = function () { calls.push('login'); return { ok: true }; };
  context.requirePermission_ = function () { calls.push('permission'); };
  load_(context, 'src/000_server/010_core/api_handler.gs');

  var result = context.apiHandler_({
    operation: 'test',
    input: ' raw ',
    requireLogin: true,
    permission: { id: 'settings_view', action: 'view' },
    parse: function (value) { calls.push('parse'); return value.trim(); },
    service: function (request) { calls.push('service'); return request; }
  });

  assert.strictEqual(result, 'raw');
  assert.deepStrictEqual(calls, ['login', 'permission', 'parse', 'service']);
}

function testSheetCrud_() {
  var sheet = createSheet_([
    ['행사ID', '행사명'],
    ['event_1', '첫 행사']
  ]);
  var spreadsheet = { getSheetByName: function () { return sheet; } };
  var context = createContext_();
  context.openOperationSpreadsheet_ = function () { return spreadsheet; };
  context.openUserSpreadsheet_ = function () { return spreadsheet; };
  context.getOperationDbTableSchema_ = function () {
    return { name: '행사', sheetName: '행사', fields: { id: '행사ID', name: '행사명' }, primaryKey: ['id'] };
  };
  context.getUserDbTableSchema_ = context.getOperationDbTableSchema_;
  load_(context, 'src/000_server/010_core/sheet_crud.gs');

  assert.strictEqual(context.sheetFindById_('operation', 'events', 'event_1').name, '첫 행사');
  context.sheetInsert_('operation', 'events', { id: 'event_2', name: '둘째 행사' });
  assert.deepStrictEqual(sheet.values[2], ['event_2', '둘째 행사']);
  context.sheetUpdateById_('operation', 'events', 'event_2', { name: '수정 행사' });
  assert.deepStrictEqual(sheet.values[2], ['event_2', '수정 행사']);
}

testApiLifecycle_();
testSheetCrud_();
console.log('Core behavior tests passed.');
