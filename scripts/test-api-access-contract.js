var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');
var accessPath = path.join(ROOT, 'src/000_server/010_core/api_access.gs');
var handlerPath = path.join(ROOT, 'src/000_server/010_core/api_handler.gs');

assert.ok(fs.existsSync(accessPath), 'api_access.gs must exist');

var calls = [];
var context = vm.createContext({
  console: { error: function () {} },
  Error: Error,
  String: String,
  Object: Object,
  Array: Array,
  requireLoginContext_: function () { calls.push('login'); return { ok: true, isAdmin: false }; },
  requirePermission_: function (ctx, permission) { calls.push('permission:' + permission.screenId + ':' + permission.action); return true; },
  resolveEventAccess_: function (access) { calls.push('resolve:event'); return { screenId: access.screenId || 'event_screen', action: access.action }; },
  resolveAccountingAccess_: function (access) { return { screenId: 'accounting_screen', action: access.action }; },
  resolveStudentFeeAccess_: function (access) { return { screenId: 'student_fee_screen', action: access.action }; }
});

vm.runInContext(fs.readFileSync(accessPath, 'utf8'), context, { filename: accessPath });
vm.runInContext(fs.readFileSync(handlerPath, 'utf8'), context, { filename: handlerPath });

var result = context.apiHandler_({
  operation: 'demo',
  requireLogin: true,
  access: { domain: 'event', action: 'edit' },
  input: { raw: true },
  parse: function () { calls.push('parse'); return { parsed: true }; },
  service: function (request) { calls.push('service'); return request; }
});
assert.deepStrictEqual(JSON.parse(JSON.stringify(result)), { parsed: true });
assert.deepStrictEqual(calls, ['login', 'resolve:event', 'permission:event_screen:edit', 'parse', 'service']);

calls.length = 0;
context.apiHandler_({
  operation: 'legacy',
  requireLogin: true,
  permission: { screenId: 'legacy_screen', action: 'view' },
  service: function () { return true; }
});
assert.ok(calls.indexOf('permission:legacy_screen:view') >= 0, 'legacy permission must remain supported');

assert.throws(function () {
  context.apiHandler_({
    operation: 'invalid-dual',
    requireLogin: true,
    access: { domain: 'event', action: 'view' },
    permission: { screenId: 'legacy', action: 'view' },
    service: function () { return true; }
  });
}, /access.*permission|permission.*access/i);

assert.throws(function () {
  context.resolveApiAccess_({ ok: true }, { domain: 'event', action: 'deleteEverything' });
}, /지원하지 않는 API 권한 action|unsupported/i);

assert.throws(function () {
  context.resolveApiAccess_({ ok: true }, { domain: 'unknown', action: 'view' });
}, /지원하지 않는 API 권한 domain|unsupported/i);

console.log('Common API access contract passed.');
