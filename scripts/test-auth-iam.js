var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');

function load_(context, relativePath) {
  var source = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
  vm.runInContext(source, context, { filename: relativePath });
}

function plain_(value) {
  return JSON.parse(JSON.stringify(value));
}

function createContext_() {
  return vm.createContext({
    console: console,
    Object: Object,
    Array: Array,
    String: String,
    Number: Number,
    Boolean: Boolean,
    JSON: JSON,
    Error: Error,
    ADMIN_ROLE_ID: 'role_admin',
    SETTINGS_PERMISSION_COLUMNS: [
      { key: 'menu', label: '메뉴 접근', hint: '(자동)' },
      { key: 'view', label: '조회' },
      { key: 'edit', label: '등록 및 수정' },
      { key: 'approve', label: '승인 및 보관' },
      { key: 'export', label: '다운로드' }
    ]
  });
}

function installValueStubs_(context) {
  context.normalizeEmail_ = function (value) { return String(value || '').trim().toLowerCase(); };
  context.normalizeTextValue_ = function (value) { return value === null || typeof value === 'undefined' ? '' : String(value).trim(); };
  context.isActiveStatus_ = function (value) { return value === true || value === '활성' || value === 'active'; };
  context.isTruthyValue_ = function (value) { return value === true || value === 'TRUE' || value === 'true' || value === 1; };
  context.formatDateValue_ = function (value) { return String(value || ''); };
  context.okResponse_ = function (payload) { return Object.assign({ ok: true }, payload || {}); };
  context.wrapApiSuccess_ = function (payload) { return { ok: true, data: payload == null ? null : payload }; };
  context.failResponse_ = function (code, message, data) { return Object.assign({ ok: false, code: code, message: message }, data || {}); };
}

function testAdminRoleInterpretation_() {
  var context = createContext_();
  installValueStubs_(context);
  load_(context, 'src/000_server/040_iam/042_roles/roles_query_service.gs');
  assert.strictEqual(context.isAdminRoleSet_(['role_admin'], { role_admin: { name: '시스템', protected: false } }), true);
  assert.strictEqual(context.isAdminRoleSet_(['role_staff'], { role_staff: { name: '일반 사용자', protected: false } }), false);
  assert.strictEqual(context.isAdminRoleSet_(['role_manager'], { role_manager: { name: '행사 관리자', protected: false } }), true);
  assert.strictEqual(context.isAdminRoleSet_(['role_system'], { role_system: { name: '시스템 역할', protected: true } }), true);
}

function installPermissionRows_(context) {
  var rows = [
    { '권한ID': 'EVENT_VIEW', '업무영역': '행사', '행위': '조회', '권한명': '행사 조회', '권한설명': '', '활성여부': true },
    { '권한ID': 'EVENT_EDIT', '업무영역': '행사', '행위': '수정', '권한명': '행사 수정', '권한설명': '', '활성여부': true }
  ];
  context.getUserDbFields_ = function (table) {
    if (table === 'permissions') return { id: '권한ID', area: '업무영역', action: '행위', name: '권한명', description: '권한설명', active: '활성여부' };
    return { roleId: '역할ID', permissionId: '권한ID' };
  };
  context.listPermissionRows_ = function () { return rows; };
  context.listRolePermissionRows_ = function () {
    return [
      { '역할ID': 'ROLE_ADMIN', '권한ID': 'EVENT_VIEW' },
      { '역할ID': 'ROLE_ADMIN', '권한ID': 'EVENT_EDIT' }
    ];
  };
}

function testPermissionModel_() {
  var context = createContext_();
  installValueStubs_(context);
  installPermissionRows_(context);
  load_(context, 'src/000_server/040_iam/043_permissions/permissions_query_service.gs');

  var byRole = context.buildPermissionsByRoleFromDb_();
  assert.strictEqual(byRole.ROLE_ADMIN.perm_EVENT_VIEW.view, true);
  assert.strictEqual(byRole.ROLE_ADMIN.perm_EVENT_EDIT.edit, true);

  var userPermissions = context.buildUserPermissionsFromDb_(['ROLE_ADMIN']);
  assert.strictEqual(userPermissions.byScreen.perm_EVENT_VIEW.view, true);
  assert.strictEqual(userPermissions.byScreen.perm_EVENT_EDIT.edit, true);
  assert.strictEqual(userPermissions.menus[0].id, 'area_행사');
  assert.strictEqual(context.mapActionToPermissionKey_('조회'), 'view');
  assert.strictEqual(context.mapActionToPermissionKey_('수정'), 'edit');
  assert.strictEqual(context.mapActionToPermissionKey_('승인'), 'approve');
  assert.strictEqual(context.mapActionToPermissionKey_('출력'), 'export');
  assert.strictEqual(context.mapActionToPermissionKey_('메뉴 접근'), 'menu');
}

function testRequirePermission_() {
  var context = createContext_();
  installValueStubs_(context);
  load_(context, 'src/000_server/040_iam/043_permissions/permissions_query_service.gs');
  load_(context, 'src/000_server/040_iam/043_permissions/permissions_access_service.gs');
  assert.strictEqual(context.requirePermission_({ ok: true, isAdmin: true }, { id: 'EVENT_EDIT', action: 'edit' }), true);
  assert.strictEqual(context.requirePermission_({ ok: true, isAdmin: false, permissions: { byScreen: { perm_EVENT_VIEW: { view: true } } } }, { id: 'EVENT_VIEW', action: 'view' }), true);
  assert.throws(function () {
    context.requirePermission_({ ok: true, isAdmin: false, permissions: { byScreen: {} } }, { id: 'EVENT_VIEW', action: 'view' });
  }, function (error) { return error.code === 'FORBIDDEN'; });
}

function createLoginContextHarness_() {
  var context = createContext_();
  installValueStubs_(context);
  context.getUserDbFields_ = function () { return { email: 'email', status: 'status' }; };
  load_(context, 'src/000_server/030_auth/auth_context.gs');
  return context;
}

function testBuildSessionUserContext_() {
  var context = createLoginContextHarness_();
  context.buildRolesById_ = function () { return { role_staff: { id: 'role_staff', name: '일반 사용자', protected: false } }; };
  context.buildActiveRoleIdsByEmail_ = function () { return { 'student@example.com': ['role_staff'] }; };
  context.validateLoginUserDbIntegrity_ = function () { return { valid: true, issues: [] }; };
  context.mapUserDto_ = function (row, roleIds, roles) { return { id: row.email, email: row.email, status: 'active', roleIds: roleIds, roles: roles }; };
  context.buildRoleSummaryForUser_ = function (role) { return { id: role.id, name: role.name }; };
  context.buildUserPermissionsFromDb_ = function () { return { byScreen: {}, menus: [] }; };
  context.isAdminRoleSet_ = function () { return false; };

  context.findUserRowByEmail_ = function () { return null; };
  assert.strictEqual(context.buildSessionUserContextFromDb_('student@example.com').code, 'NOT_REGISTERED');
  context.findUserRowByEmail_ = function () { return { email: 'student@example.com', status: 'inactive' }; };
  assert.strictEqual(context.buildSessionUserContextFromDb_('student@example.com').code, 'INACTIVE');
  context.findUserRowByEmail_ = function () { return { email: 'student@example.com', status: 'active' }; };
  context.buildActiveRoleIdsByEmail_ = function () { return { 'student@example.com': [] }; };
  assert.strictEqual(context.buildSessionUserContextFromDb_('student@example.com').code, 'NO_ROLE');
  context.buildActiveRoleIdsByEmail_ = function () { return { 'student@example.com': ['role_staff'] }; };
  context.validateLoginUserDbIntegrity_ = function () { return { valid: false, issues: ['broken'] }; };
  assert.strictEqual(context.buildSessionUserContextFromDb_('student@example.com').code, 'LOGIN_DB_INTEGRITY_ERROR');
  context.validateLoginUserDbIntegrity_ = function () { return { valid: true, issues: [] }; };
  var result = context.buildSessionUserContextFromDb_('student@example.com');
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(Object.keys(plain_(result)).sort(), ['dbMode', 'email', 'isAdmin', 'ok', 'permissions', 'preview', 'roles', 'user'].sort());
}

function testSessionContextCache_() {
  var context = createLoginContextHarness_();
  var buildCalls = 0;
  var cacheCalls = 0;
  context.readActiveUserEmailFromSession_ = function () { return 'student@example.com'; };
  context.readCachedLoginContext_ = function () { return { ok: true, email: 'student@example.com', cached: true }; };
  context.buildSessionUserContextFromDb_ = function () { buildCalls += 1; return { ok: true, email: 'student@example.com' }; };
  assert.strictEqual(context.getSessionUserContext_().cached, true);
  assert.strictEqual(buildCalls, 0);

  var reads = 0;
  context.readCachedLoginContext_ = function () { reads += 1; return null; };
  context.writeLoginContextCache_ = function () { cacheCalls += 1; };
  context.LockService = { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () {} }; } };
  assert.strictEqual(context.getSessionUserContext_().ok, true);
  assert.strictEqual(buildCalls, 1);
  assert.strictEqual(cacheCalls, 1);
  assert.strictEqual(reads, 2);
}

function testRequireLoginAndAuthApis_() {
  var context = createContext_();
  installValueStubs_(context);
  load_(context, 'src/000_server/030_auth/auth_context.gs');
  load_(context, 'src/000_server/030_auth/auth_api.gs');

  context.getSessionUserContext_ = function () { return { ok: true, email: 'admin@example.com' }; };
  assert.strictEqual(context.requireLoginContext_().email, 'admin@example.com');
  context.getSessionUserContext_ = function () { return { ok: false, code: 'NO_SESSION', message: '로그인이 필요합니다.' }; };
  assert.throws(function () { context.requireLoginContext_(); }, function (error) { return error.code === 'NO_SESSION'; });

  var full = {
    ok: true,
    email: 'admin@example.com',
    user: { id: 'admin@example.com', name: '관리자', department: '', status: 'active', roleIds: ['role_admin'] },
    roles: [{ id: 'role_admin', name: '시스템 관리자' }],
    permissions: { byScreen: { perm_EVENT_VIEW: { view: true } }, menus: [{ id: 'area_행사' }] },
    isAdmin: true,
    dbMode: 'connected'
  };
  context.getSessionUserContext_ = function () { return full; };
  assert.strictEqual(context.api_checkLogin().email, 'admin@example.com');
  assert.strictEqual(context.api_getCurrentUser().data.user.title, '시스템 관리자');
  assert.strictEqual(context.api_getMyPermissions().data.permissions.byScreen.perm_EVENT_VIEW.view, true);
}

testAdminRoleInterpretation_();
testPermissionModel_();
testRequirePermission_();
testBuildSessionUserContext_();
testSessionContextCache_();
testRequireLoginAndAuthApis_();
console.log('Auth/IAM behavior regression tests passed.');