const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const src = (...parts) => path.join(ROOT, 'src', ...parts);
const backend = src('backend');

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

assert.ok(fs.existsSync(src('frontend')), 'src/frontend must exist in final architecture');
[
  '000_server', '100_common', '200_login', '250_main', '270_mypage',
  '300_settings', '400_accounting', '500_student_fee', '600_event'
].forEach((name) => assert.ok(!fs.existsSync(src(name)), 'legacy source root must be removed: ' + name));

listFiles(path.join(backend, 'domains')).filter((file) => file.includes(path.sep + 'business_rules' + path.sep)).forEach((file) => {
  const source = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(source, /\b(?:SpreadsheetApp|DriveApp|FormApp|Session|google\.script\.run)\b/, 'business rules must be infrastructure-free: ' + path.relative(ROOT, file));
});

listFiles(path.join(ROOT, 'src/frontend')).forEach((file) => {
  if (!/\.(?:html|js)$/.test(file)) return;
  const relative = path.relative(ROOT, file).replace(/\\/g, '/');
  const source = fs.readFileSync(file, 'utf8');
  if (source.includes('google.script.run')) assert.strictEqual(relative, 'src/frontend/shared/api/rpc/app_api_runner_js.html', 'only shared RPC transport may call google.script.run: ' + relative);
});

listFiles(path.join(backend, 'domains')).forEach((file) => {
  const relative = path.relative(path.join(backend, 'domains'), file).replace(/\\/g, '/');
  const owner = relative.split('/')[0];
  const source = fs.readFileSync(file, 'utf8');
  const crossRepository = new RegExp('(?:src/backend/domains/)?(?!' + owner + '/)([a-z_]+)/repositories/');
  assert.doesNotMatch(source, crossRepository, 'domain must not reference another domain repository: ' + path.relative(ROOT, file));
});

console.log('Project architecture migration guard: PASS (strict)');
