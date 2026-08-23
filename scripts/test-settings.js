var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');
function load_(context, relativePath) {
  var source = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
  vm.runInContext(source, context, { filename: relativePath });
}
function plain_(value) { return JSON.parse(JSON.stringify(value)); }
function createContext_() {
  return vm.createContext({
    console: console, Object: Object, Array: Array, String: String, Number: Number, Boolean: Boolean, JSON: JSON, Error: Error,
    SETTINGS_PERMISSION_COLUMNS: [
      { key: 'menu', label: '메뉴' }, { key: 'view', label: '조회' }, { key: 'edit', label: '수정' },
      { key: 'approve', label: '승인' }, { key: 'export', label: '출력' }
    ],
    APP_TITLE: '학생회 통합 업무관리',
    DB_CONFIG: { userSpreadsheetId: 'user-db-id', rootFolderId: 'root-folder-id' }
  });
}
function installValueStubs_(context) {
  context.normalizeEmail_ = function (value) { return String(value || '').trim().toLowerCase(); };
  context.normalizeTextValue_ = function (value) { return value === null || typeof value === 'undefined' ? '' : String(value).trim(); };
  context.isActiveStatus_ = function (value) { return value === true || value === '활성' || value === 'active'; };
  context.isTruthyValue_ = function (value) { return value === true || value === 'TRUE' || value === 'true' || value === 1; };
  context.formatDateValue_ = function (value) { return String(value || ''); };
}
function installApiContract_(context) {
  load_(context, 'src/000_server/010_core/api_request.gs');
  load_(context, 'src/000_server/010_core/response.gs');
  context.requireLoginContext_ = function () { return {}; };
  context.requirePermission_ = function () {};
  context.resolveApiAccess_ = function () {};
  load_(context, 'src/000_server/010_core/api_handler.gs');
}

function testAdminSettingsAccess_() {
  var context = createContext_();
  context.failResponse_ = function (code, message) { return { ok: false, code: code, message: message }; };
  context.requireAuthenticatedUserData_ = function () { return { isAdmin: true, user: { email: 'admin@example.com' }, domainAccess: { settings: true } }; };
  load_(context, 'src/000_server/070_settings/070_common/settings_access.gs');
  assert.strictEqual(context.getAdminSettingsCurrent_().isAdmin, true);
  context.requireAuthenticatedUserData_ = function () { return { isAdmin: false, user: { email: 'user@example.com' }, domainAccess: { settings: true } }; };
  assert.deepStrictEqual(plain_(context.getAdminSettingsCurrent_()), { ok: false, code: 'FORBIDDEN', message: '설정 화면은 시스템 관리자만 이용할 수 있습니다.' });
}

function testSettingsHomeData_() {
  var context = createContext_();
  installApiContract_(context);
  context.failResponse_ = function (code, message) { return { ok: false, code: code, message: message }; };
  context.requireAuthenticatedUserData_ = function () {
    return { isAdmin: true, user: { email: 'admin@example.com', name: '관리자' }, domainAccess: { settings: true } };
  };
  load_(context, 'src/000_server/070_settings/070_common/settings_access.gs');
  load_(context, 'src/000_server/070_settings/070_common/settings_shell_query_service.gs');
  var result = context.api_getSettingsHome();
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.data.app.version, 'v0.7');
  assert.strictEqual(result.data.app.term, '2026학년도');
  assert.strictEqual(result.data.database.spreadsheetId, 'user-db-id');
  assert.strictEqual(result.data.session.email, 'admin@example.com');
}

function testUsersSettingsComposition_() {
  var context = createContext_();
  installValueStubs_(context);
  context.getUserDbFields_ = function () { return { email: 'Google이메일', name: '성명', studentId: '학번', phone: '연락처', status: '계정상태', updatedAt: '최종수정일시', updatedBy: '등록자이메일' }; };
  load_(context, 'src/000_server/040_iam/041_users/users_query_service.gs');
  load_(context, 'src/000_server/070_settings/071_users/settings_users_query_service.gs');
  context.listUserRows_ = function () { return [{ 'Google이메일': 'Student@Example.com ', '성명': '김학생', '학번': '6001', '연락처': '010-1111-2222', '계정상태': '활성', '최종수정일시': '2026-08-17T12:00:00', '등록자이메일': 'admin@example.com' }]; };
  context.buildRolesById_ = function () { return { ROLE_ADMIN: { id: 'ROLE_ADMIN', name: '관리자' } }; };
  context.buildActiveRoleIdsByEmail_ = function () { return { 'student@example.com': ['ROLE_ADMIN'] }; };
  context.buildRoleSummaryForUser_ = function (role) { return { id: role.id, name: role.name }; };
  assert.deepStrictEqual(plain_(context.getSettingsUsersData_()), [{
    id: 'student@example.com', name: '김학생', email: 'student@example.com', studentId: '6001', phone: '010-1111-2222', department: '',
    roleIds: ['ROLE_ADMIN'], roles: [{ id: 'ROLE_ADMIN', name: '관리자' }], status: 'active', updatedAt: '2026-08-17T12:00:00', updatedBy: 'admin@example.com'
  }]);
}

function testRolesSettingsComposition_() {
  var context = createContext_();
  installValueStubs_(context);
  context.getUserDbFields_ = function () { return { roleId: '역할ID', assignedStatus: '배정상태' }; };
  load_(context, 'src/000_server/070_settings/072_roles/settings_roles_query_service.gs');
  context.buildRolesById_ = function () { return { ROLE_ADMIN: { id: 'ROLE_ADMIN', assignedCount: 0 }, ROLE_STAFF: { id: 'ROLE_STAFF', assignedCount: 0 } }; };
  context.listUserRoleRows_ = function () { return [
    { '역할ID': 'ROLE_ADMIN', '배정상태': '활성' }, { '역할ID': 'ROLE_ADMIN', '배정상태': '활성' },
    { '역할ID': 'ROLE_ADMIN', '배정상태': '비활성' }, { '역할ID': 'ROLE_STAFF', '배정상태': '활성' }
  ]; };
  assert.deepStrictEqual(plain_(context.getSettingsRolesData_()).map(function (role) { return { id: role.id, assignedCount: role.assignedCount }; }), [
    { id: 'ROLE_ADMIN', assignedCount: 2 }, { id: 'ROLE_STAFF', assignedCount: 1 }
  ]);
}

function testPermissionsIamAndSettingsComposition_() {
  var context = createContext_();
  installValueStubs_(context);
  context.getUserDbFields_ = function () { return { id: '권한ID', area: '업무영역', action: '행위', name: '권한명', description: '권한설명', active: '활성여부' }; };
  load_(context, 'src/000_server/040_iam/043_permissions/permissions_query_service.gs');
  var rows = [
    { '권한ID': 'EVENT_VIEW', '업무영역': '행사', '행위': '조회', '권한명': '행사 조회', '권한설명': '', '활성여부': true },
    { '권한ID': 'EVENT_EDIT', '업무영역': '행사', '행위': '수정', '권한명': '행사 수정', '권한설명': '', '활성여부': true }
  ];
  context.listPermissionRows_ = function () { return rows; };
  context.buildPermissionsById_ = function () { return { EVENT_VIEW: context.mapPermissionDto_(rows[0]), EVENT_EDIT: context.mapPermissionDto_(rows[1]) }; };
  context.buildPermissionIdsByRoleId_ = function () { return { ROLE_ADMIN: ['EVENT_VIEW', 'EVENT_EDIT'] }; };
  assert.strictEqual(context.buildPermissionTreeFromDb_()[0].id, 'area_행사');
  assert.strictEqual(context.buildPermissionsByRoleFromDb_().ROLE_ADMIN.perm_EVENT_EDIT.edit, true);

  context.okResponse_ = function (payload) { return Object.assign({ ok: true }, payload); };
  context.buildSettingsBaseView_ = function (current) { return { currentUser: current.user, shell: true }; };
  context.getSettingsRolesData_ = function () { return [{ id: 'ROLE_ADMIN', name: '관리자' }]; };
  load_(context, 'src/000_server/070_settings/073_permissions/settings_permissions_query_service.gs');
  var serviceResult = context.getSettingsPermissionsData_({ user: { email: 'admin@example.com' } });
  assert.strictEqual(serviceResult.ok, true);
  assert.strictEqual(serviceResult.permissionTree[0].id, 'area_행사');
  assert.strictEqual(serviceResult.permissionsByRole.ROLE_ADMIN.perm_EVENT_VIEW.view, true);
}

testAdminSettingsAccess_();
testSettingsHomeData_();
testUsersSettingsComposition_();
testRolesSettingsComposition_();
testPermissionsIamAndSettingsComposition_();
console.log('Settings behavior regression tests passed.');
