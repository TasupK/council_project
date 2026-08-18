var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');

function load_(context, relativePath) {
  var source = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
  vm.runInContext(source, context, { filename: relativePath });
}

function createContext_() {
  return vm.createContext({
    console: console,
    Object: Object,
    Array: Array,
    String: String,
    Boolean: Boolean,
    JSON: JSON,
    SETTINGS_PERMISSION_COLUMNS: [
      { key: 'menu' }, { key: 'view' }, { key: 'edit' }, { key: 'approve' }, { key: 'export' }
    ]
  });
}

function installPermissionFixtures_(context) {
  context.normalizeTextValue_ = function (value) { return value == null ? '' : String(value).trim(); };
  context.isTruthyValue_ = function (value) { return value === true || value === 'true' || value === 'TRUE' || value === 1; };
  context.getUserDbFields_ = function (table) {
    if (table === 'permissions') {
      return { id: '권한ID', area: '업무영역', action: '행위', name: '권한명', description: '권한설명', active: '활성여부' };
    }
    return { roleId: '역할ID', permissionId: '권한ID' };
  };
  context.listPermissionRows_ = function () {
    return [
      { '권한ID': 'EVENT_VIEW', '업무영역': '행사', '행위': '조회', '권한명': '행사 조회', '권한설명': '행사 목록을 조회합니다.', '활성여부': true },
      { '권한ID': 'EVENT_EDIT', '업무영역': '행사', '행위': '수정', '권한명': '행사 수정', '권한설명': '행사를 수정합니다.', '활성여부': true },
      { '권한ID': 'LEDGER_VIEW', '업무영역': '회계', '행위': '조회', '권한명': '원장 조회', '권한설명': '원장을 조회합니다.', '활성여부': true }
    ];
  };
  context.listRolePermissionRows_ = function () {
    return [
      { '역할ID': 'ROLE_EVENT', '권한ID': 'EVENT_VIEW' },
      { '역할ID': 'ROLE_EVENT', '권한ID': 'EVENT_EDIT' }
    ];
  };
}

function testEffectivePermissionDetails_() {
  var context = createContext_();
  installPermissionFixtures_(context);
  load_(context, 'src/000_server/040_iam/043_permissions/permissions_query_service.gs');

  var effective = context.buildUserPermissionsFromDb_(['ROLE_EVENT']);
  var details = context.buildEffectivePermissionDetails_(effective);

  assert.strictEqual(details.length, 2);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(details[0])), {
    id: 'EVENT_VIEW',
    screenId: 'perm_EVENT_VIEW',
    area: '행사',
    action: '조회',
    name: '행사 조회',
    description: '행사 목록을 조회합니다.',
    grants: { menu: true, view: true, edit: false, approve: false, export: false }
  });
  assert.strictEqual(details.some(function (item) { return item.id === 'LEDGER_VIEW'; }), false);
}

function testAuthApiAddsPermissionDetails_() {
  var context = createContext_();
  context.okResponse_ = function (payload) { return Object.assign({ ok: true }, payload || {}); };
  context.buildEffectivePermissionDetails_ = function () {
    return [{ id: 'EVENT_VIEW', screenId: 'perm_EVENT_VIEW', area: '행사', action: '조회', name: '행사 조회', description: '', grants: { menu: true, view: true, edit: false, approve: false, export: false } }];
  };
  context.getSessionUserContext_ = function () {
    return {
      ok: true,
      user: { roles: [{ id: 'ROLE_EVENT', name: '행사 담당' }] },
      roles: [{ id: 'ROLE_EVENT', name: '행사 담당' }],
      permissions: { byScreen: { perm_EVENT_VIEW: { menu: true, view: true, edit: false, approve: false, export: false } }, menus: [{ id: 'area_행사', name: '행사' }] }
    };
  };
  load_(context, 'src/000_server/030_auth/auth_api.gs');

  var result = context.api_getMyPermissions();
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.permissionDetails[0].id, 'EVENT_VIEW');
  assert.ok(result.permissions.byScreen.perm_EVENT_VIEW);
}

testEffectivePermissionDetails_();
testAuthApiAddsPermissionDetails_();
console.log('MyPage Auth/IAM contract tests passed.');
