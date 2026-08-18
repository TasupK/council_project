var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');
var files = [
  'src/000_server/050_event/050_common/event_access.gs',
  'src/000_server/060_accounting/060_common/accounting_access.gs',
  'src/000_server/080_student_fee/080_common/student_fee_access.gs'
].map(function (file) { return path.join(ROOT, file); });
files.forEach(function (file) { assert.ok(fs.existsSync(file), path.basename(file) + ' must exist'); });

var permissions = {
  EV: { id: 'EV', area: '행사복지관리', action: '조회', name: '행사 조회', status: 'active' },
  EE: { id: 'EE', area: '행사복지관리', action: '수정', name: '행사 수정', status: 'active' },
  AA: { id: 'AA', area: '회계관리', action: '승인', name: '회계 승인', status: 'active' },
  SE: { id: 'SE', area: '학생회비관리', action: '수정', name: '학생회비 수정', status: 'active' }
};

var context = vm.createContext({
  console: console,
  Error: Error,
  String: String,
  Object: Object,
  Array: Array,
  getPermissionsById_: function () { return permissions; },
  permissionScreenId_: function (permission) { return 'perm_' + permission.id; },
  actionToPermissionKey_: function (action) {
    if (String(action).indexOf('조회') >= 0) return 'view';
    if (String(action).indexOf('수정') >= 0 || String(action).indexOf('등록') >= 0) return 'edit';
    if (String(action).indexOf('승인') >= 0) return 'approve';
    if (String(action).indexOf('다운로드') >= 0 || String(action).indexOf('출력') >= 0) return 'export';
    return 'view';
  },
  throwPermissionError_: function (message) { var error = new Error(message); error.code = 'FORBIDDEN'; throw error; }
});
files.forEach(function (file) { vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file }); });

assert.deepStrictEqual(JSON.parse(JSON.stringify(context.resolveEventAccess_({ domain: 'event', action: 'view' }))), { screenId: 'perm_EV', action: 'view' });
assert.deepStrictEqual(JSON.parse(JSON.stringify(context.resolveEventAccess_({ domain: 'event', action: 'edit' }))), { screenId: 'perm_EE', action: 'edit' });
assert.deepStrictEqual(JSON.parse(JSON.stringify(context.resolveAccountingAccess_({ domain: 'accounting', action: 'approve' }))), { screenId: 'perm_AA', action: 'approve' });
assert.deepStrictEqual(JSON.parse(JSON.stringify(context.resolveStudentFeeAccess_({ domain: 'student_fee', action: 'edit' }))), { screenId: 'perm_SE', action: 'edit' });

assert.throws(function () {
  context.resolveEventAccess_({ domain: 'event', action: 'export' });
}, function (error) { return error.code === 'FORBIDDEN' || error.code === 'ACCESS_CONFIG_ERROR'; });

assert.throws(function () {
  context.resolveEventAccess_({ domain: 'event', action: 'view', screenId: 'perm_AA' });
}, function (error) { return error.code === 'FORBIDDEN' || error.code === 'ACCESS_CONFIG_ERROR'; });

console.log('Domain access resolver contract passed.');
