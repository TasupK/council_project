var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');
var requestPath = path.join(ROOT, 'src/000_server/010_core/api_request.gs');
var responsePath = path.join(ROOT, 'src/000_server/010_core/response.gs');
var accessPath = path.join(ROOT, 'src/000_server/010_core/api_access.gs');
var handlerPath = path.join(ROOT, 'src/000_server/010_core/api_handler.gs');

assert.ok(fs.existsSync(accessPath), 'api_access.gs must exist');
assert.ok(fs.existsSync(requestPath), 'api_request.gs must exist');

var calls = [];
var context = vm.createContext({
  console: { error: function () {} },
  Error: Error,
  String: String,
  Object: Object,
  Array: Array,
  JSON: JSON,
  requireLoginContext_: function () { calls.push('login'); return { ok: true, isAdmin: false }; },
  requirePermission_: function (ctx, permission) { calls.push('permission:' + permission.screenId + ':' + permission.action); return true; }
});

vm.runInContext(fs.readFileSync(requestPath, 'utf8'), context, { filename: requestPath });
vm.runInContext(fs.readFileSync(responsePath, 'utf8'), context, { filename: responsePath });
vm.runInContext(fs.readFileSync(accessPath, 'utf8'), context, { filename: accessPath });
vm.runInContext(fs.readFileSync(handlerPath, 'utf8'), context, { filename: handlerPath });

var result = context.apiHandler_({
  operation: 'demo',
  requireLogin: true,
  access: {
    domain: 'event',
    action: 'edit',
    resolve: function (access) {
      calls.push('resolve:event');
      return { screenId: access.screenId || 'event_screen', action: access.action };
    }
  },
  input: { request: { raw: true } },
  parse: function (request) { calls.push('parse'); return { parsed: request.raw }; },
  service: function (request) { calls.push('service'); return request; }
});
assert.deepStrictEqual(JSON.parse(JSON.stringify(result)), { ok: true, data: { parsed: true } });
assert.deepStrictEqual(calls, ['login', 'resolve:event', 'permission:event_screen:edit', 'parse', 'service']);

calls.length = 0;
result = context.apiHandler_({
  operation: 'legacy',
  requireLogin: true,
  permission: { screenId: 'legacy_screen', action: 'view' },
  service: function () { return true; }
});
assert.deepStrictEqual(JSON.parse(JSON.stringify(result)), { ok: true, data: true });
assert.ok(calls.indexOf('permission:legacy_screen:view') >= 0, 'legacy permission must remain supported');

assert.throws(function () {
  context.apiHandler_({
    operation: 'invalid-dual',
    requireLogin: true,
    access: { domain: 'event', action: 'view', resolve: function () { return { screenId: 'x', action: 'view' }; } },
    permission: { screenId: 'legacy', action: 'view' },
    service: function () { return true; }
  });
}, /INTERNAL_ERROR/);

assert.throws(function () {
  context.resolveApiAccess_({ ok: true }, {
    domain: 'event', action: 'deleteEverything',
    resolve: function () { return { screenId: 'x', action: 'deleteEverything' }; }
  });
}, /지원하지 않는 API 권한 action|unsupported/i);

assert.throws(function () {
  context.resolveApiAccess_({ ok: true }, { domain: 'event', action: 'view' });
}, /resolver/i);

calls.length = 0;
assert.strictEqual(context.resolveApiAccess_({ isAdmin: true }, {
  domain: 'event',
  action: 'edit',
  resolve: function () { throw new Error('admin resolver must not run'); }
}), true);
assert.deepStrictEqual(calls, [], 'administrator access must not depend on a permission catalog row');

console.log('Common API access contract passed.');
