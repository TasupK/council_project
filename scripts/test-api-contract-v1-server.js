const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const logs = [];
const sandbox = {
  console: {
    error: function () { logs.push(Array.prototype.slice.call(arguments)); },
    log: function () {}
  },
  JSON: JSON,
  Error: Error,
  Object: Object,
  String: String
};
vm.createContext(sandbox);

['src/000_server/010_core/api_request.gs', 'src/000_server/010_core/response.gs', 'src/000_server/010_core/api_handler.gs']
  .forEach(function (relativePath) {
    const file = path.join(root, relativePath);
    if (fs.existsSync(file)) vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: relativePath });
  });

sandbox.requireLoginContext_ = function () { return { email: 'tester@example.com' }; };
sandbox.resolveApiAccess_ = function () {};
sandbox.requirePermission_ = function () {};

function decodeTransportedError(error) {
  const prefix = '__APP_ERROR__:';
  assert.ok(error && typeof error.message === 'string' && error.message.indexOf(prefix) === 0);
  return JSON.parse(error.message.slice(prefix.length));
}

assert.deepStrictEqual(JSON.parse(JSON.stringify(sandbox.unwrapApiRequest_({ request: { id: 'A' } }))), { id: 'A' });
assert.deepStrictEqual(JSON.parse(JSON.stringify(sandbox.unwrapApiRequest_({ id: 'A' }))), { id: 'A' });
assert.deepStrictEqual(JSON.parse(JSON.stringify(sandbox.unwrapApiRequest_(null))), {});

assert.deepStrictEqual(JSON.parse(JSON.stringify(sandbox.wrapApiSuccess_({ id: 'A' }))), {
  ok: true,
  data: { id: 'A' }
});

let result = sandbox.apiHandler_({
  operation: 'fixture',
  input: { request: { id: 'A' } },
  service: function (request) { return { received: request }; }
});
assert.deepStrictEqual(JSON.parse(JSON.stringify(result)), {
  ok: true,
  data: { received: { id: 'A' } }
});

const typed = new Error('행사를 찾을 수 없습니다.');
typed.code = 'NOT_FOUND';
typed.details = { id: 'A' };
assert.throws(function () {
  sandbox.apiHandler_({
    operation: 'typed',
    input: { request: {} },
    service: function () { throw typed; }
  });
}, function (error) {
  const payload = decodeTransportedError(error);
  return payload.code === 'NOT_FOUND' && payload.message === '행사를 찾을 수 없습니다.' && payload.details.id === 'A';
});

assert.throws(function () {
  sandbox.apiHandler_({
    operation: 'unexpected',
    input: { request: {} },
    service: function () { throw new Error('Spreadsheet 1ABC internal failure'); }
  });
}, function (error) {
  const payload = decodeTransportedError(error);
  return payload.code === 'INTERNAL_ERROR' && payload.message === '서버 처리 중 오류가 발생했습니다.' && JSON.stringify(payload).indexOf('1ABC') < 0;
});
assert.ok(logs.length >= 2, 'server boundary should log original exceptions');

console.log('API Contract v1 server boundary: PASS');
