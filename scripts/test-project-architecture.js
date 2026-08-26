const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const src = (...parts) => path.join(ROOT, 'src', ...parts);
const backend = src('backend');
const legacyBackend = src('000_server');
const strict = process.env.ARCHITECTURE_FINAL === '1';

assert.ok(fs.existsSync(src('appsscript.json')), 'manifest must remain at src/appsscript.json');
assert.ok(fs.existsSync(backend), 'src/backend must exist once backend migration starts');

[
  'app/routing/Code.js',
  'app/bootstrap/authorize_app.gs',
  'app/config/config.gs',
  'core/response/api_handler.gs',
  'core/response/api_request.gs',
  'core/response/response.gs',
  'core/auth/api_access.gs',
  'core/db/sheet_crud.gs',
  'core/db/sheets.gs',
  'core/db/schema/operation_db_schema.gs',
  'core/db/schema/user_db_schema.gs'
].forEach((relative) => {
  assert.ok(fs.existsSync(path.join(backend, relative)), 'missing migrated backend foundation: ' + relative);
});

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(target) : [target];
  });
}

listFiles(path.join(backend, 'core')).forEach((file) => {
  const source = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(source, /src\/backend\/domains\//, 'backend/core must not reference domain implementation paths: ' + path.relative(ROOT, file));
  assert.doesNotMatch(source, /\b(?:BaseRepository|BaseService)\b/, 'inheritance-style base abstractions are forbidden: ' + path.relative(ROOT, file));
});

if (strict) {
  assert.ok(fs.existsSync(src('frontend')), 'src/frontend must exist in final architecture');
  assert.ok(!fs.existsSync(legacyBackend), 'legacy src/000_server must be removed in final architecture');
}

console.log('Project architecture migration guard: PASS' + (strict ? ' (strict)' : ''));
