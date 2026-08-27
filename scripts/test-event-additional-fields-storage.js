var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');
var schemaPath = path.join(ROOT, 'src/backend/core/db/schema/operation_db_schema.gs');
var crudPath = path.join(ROOT, 'src/backend/core/db/sheet_crud.gs');

function testEventSchema_() {
  var tableNames = new Proxy({}, { get: function (_, key) { return String(key); } });
  var context = vm.createContext({ OPERATION_TABLES: tableNames });
  vm.runInContext(fs.readFileSync(schemaPath, 'utf8'), context, { filename: schemaPath });
  var events = context.getOperationDbSchema_().events;
  assert.strictEqual(events.fields.department, '담당부서');
  assert.strictEqual(events.fields.location, '장소');
  assert.strictEqual(events.fields.note, '기타사항');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(events.optionalFields)), ['department', 'location', 'note']);
}

function testOptionalHeaderAndPhysicalColumnWrite_() {
  var headers = ['행사ID', '행사명'];
  var appendedRow = null;
  var waitCount = 0;
  var releaseCount = 0;
  var lock = {
    hasLock: function () { return false; },
    waitLock: function () { waitCount += 1; },
    releaseLock: function () { releaseCount += 1; }
  };
  var sheet = {
    getLastColumn: function () { return headers.length; },
    getLastRow: function () { return 1; },
    getRange: function (row, column, rowCount, columnCount) {
      return {
        getDisplayValues: function () { return [headers.slice(column - 1, column - 1 + columnCount)]; },
        setValues: function (values) {
          if (row === 1) headers = headers.concat(values[0]);
          else appendedRow = values[0].slice();
        }
      };
    }
  };
  var table = {
    name: '행사',
    fields: { id: '행사ID', name: '행사명', department: '담당부서', location: '장소', note: '기타사항' },
    optionalFields: ['department', 'location', 'note'],
    primaryKey: ['id']
  };
  var context = vm.createContext({
    Object: Object,
    String: String,
    Array: Array,
    SpreadsheetApp: { flush: function () {} },
    LockService: { getScriptLock: function () { return lock; } }
  });
  vm.runInContext(fs.readFileSync(crudPath, 'utf8'), context, { filename: crudPath });
  context.getSheetCrudTableSchema_ = function () { return table; };
  context.requireSheetCrudTableSheet_ = function () { return sheet; };
  context.insertSheetCrudItem_('operation', 'events', {
    id: 'EVT-2026-MT-001',
    name: '새내기 MT',
    department: '학생복지국',
    location: '학생회관',
    note: '우천 시 장소 변경'
  });

  assert.deepStrictEqual(headers, ['행사ID', '행사명', '담당부서', '장소', '기타사항']);
  assert.deepStrictEqual(appendedRow, ['EVT-2026-MT-001', '새내기 MT', '학생복지국', '학생회관', '우천 시 장소 변경']);
  assert.strictEqual(waitCount, 1);
  assert.strictEqual(releaseCount, 1);
}

function testNestedWriteLockReuse_() {
  var waitCount = 0;
  var releaseCount = 0;
  var context = vm.createContext({
    LockService: {
      getScriptLock: function () {
        return {
          hasLock: function () { return true; },
          waitLock: function () { waitCount += 1; },
          releaseLock: function () { releaseCount += 1; }
        };
      }
    }
  });
  vm.runInContext(fs.readFileSync(crudPath, 'utf8'), context, { filename: crudPath });
  assert.strictEqual(context.withSheetCrudWriteLock_(function () { return 'saved'; }), 'saved');
  assert.strictEqual(waitCount, 0);
  assert.strictEqual(releaseCount, 0);
}

testEventSchema_();
testOptionalHeaderAndPhysicalColumnWrite_();
testNestedWriteLockReuse_();
console.log('Event additional field storage contract passed.');
