# Settings Admin Layer Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Settings-only administrator screen composition out of root `settings.gs` and `030_auth` into an extensible `070_settings` application layer without changing public Settings behavior or Auth/IAM ownership of UserDB data.

**Architecture:** `030_auth` remains the owner of authentication, authorization, UserDB reads, and runtime permission checks. `070_settings` becomes a read-only administrator application layer for the current Home, Users, Roles, and Permissions screens. Settings may call Auth/IAM read functions, but it must not own UserDB DAOs or write UserDB directly.

**Tech Stack:** Google Apps Script JavaScript, Google Sheets-backed UserDB, Node.js `vm` regression tests, Node.js architecture verification scripts.

## Global Constraints

- Preserve `loadSettingsHomeData`, `loadSettingsUsersData`, `loadSettingsRolesData`, and `loadSettingsPermissionsData` names and return shapes.
- Preserve the current administrator check through `api_getCurrentUser()` and current `FORBIDDEN` response behavior.
- Preserve current Settings HTML/JavaScript and the existing `saveUserChanges`, `saveRoleChanges`, and `savePermissionChanges` TODOs.
- Preserve UserDB schema and table ownership: `users`, `roles`, `permissions`, `userRoles`, and `rolePermissions` remain Auth/IAM-owned.
- Preserve runtime Auth functions including `requireLoginContext_`, `requirePermission_`, `resolveRequiredPermissionScreenId_`, and `throwPermissionError_`.
- `permissionScreenId_` remains in Auth because runtime permission resolution depends on it.
- Move `actionToPermissionKey_` with the Settings permission view composition because it is used only to build the administrator permission matrix/tree.
- Do not add mutation services, validators, or DAOs until a real write use case exists.
- Settings Query Services must not acquire write locks, write Sheet rows, or call Drive mutation APIs.
- Do not introduce classes, dependency injection, repositories, ORMs, query builders, or arrow functions.
- Do not change Event or Accounting behavior as part of this refactor.

---

## Target File Structure

```text
src/000_server/070_settings/
├─ 070_common/
│  ├─ settings_access.gs
│  └─ settings_shell_query_service.gs
├─ 071_users/
│  ├─ settings_users_api.gs
│  └─ settings_users_query_service.gs
├─ 072_roles/
│  ├─ settings_roles_api.gs
│  └─ settings_roles_query_service.gs
└─ 073_permissions/
   ├─ settings_permissions_api.gs
   └─ settings_permissions_query_service.gs
```

Files removed after all functions are migrated:

```text
src/000_server/settings.gs
```

Auth files remain in place and lose only Settings-specific composition functions:

```text
src/000_server/030_auth/users.gs
src/000_server/030_auth/roles.gs
src/000_server/030_auth/permissions.gs
```

## Function Ownership After Refactor

```text
070_settings/070_common/settings_access.gs
  getAdminSettingsCurrent_

070_settings/070_common/settings_shell_query_service.gs
  buildSettingsBaseData_
  loadSettingsHomeData

070_settings/071_users/settings_users_api.gs
  loadSettingsUsersData

070_settings/071_users/settings_users_query_service.gs
  listUsersForSettings_

070_settings/072_roles/settings_roles_api.gs
  loadSettingsRolesData

070_settings/072_roles/settings_roles_query_service.gs
  listRolesForSettings_

070_settings/073_permissions/settings_permissions_api.gs
  loadSettingsPermissionsData

070_settings/073_permissions/settings_permissions_query_service.gs
  actionToPermissionKey_
  buildPermissionTreeFromDb_
  buildPermissionsByRoleFromDb_

030_auth/permissions.gs
  permissionScreenId_
  requirePermission_
  resolveRequiredPermissionScreenId_
  throwPermissionError_
```

---

### Task 1: Add Settings behavior characterization tests

**Files:**
- Create: `scripts/test-settings.js`
- Read only: `src/000_server/settings.gs`
- Read only: `src/000_server/030_auth/users.gs`
- Read only: `src/000_server/030_auth/roles.gs`
- Read only: `src/000_server/030_auth/permissions.gs`

**Interfaces:**
- Consumes: current global Settings functions and Auth helper behavior.
- Produces: a regression suite that must pass before and after file movement.

- [ ] **Step 1: Create a VM-based test harness that loads the current Settings/Auth files**

Use a context that provides only the globals needed by the tested functions. The test file should expose a helper similar to:

```js
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
    SETTINGS_PERMISSION_COLUMNS: [
      { key: 'menu', label: '메뉴' },
      { key: 'view', label: '조회' },
      { key: 'edit', label: '수정' },
      { key: 'approve', label: '승인' },
      { key: 'export', label: '출력' }
    ],
    APP_TITLE: '학생회 통합 업무관리',
    DB_CONFIG: {
      userSpreadsheetId: 'user-db-id',
      rootFolderId: 'root-folder-id'
    }
  });
}
```

- [ ] **Step 2: Add administrator access tests**

Test the current pass-through and forbidden behavior of `getAdminSettingsCurrent_()`:

```js
function testAdminSettingsAccess_() {
  var context = createContext_();
  context.failResponse_ = function (code, message) {
    return { ok: false, code: code, message: message };
  };
  load_(context, 'src/000_server/settings.gs');

  context.api_getCurrentUser = function () {
    return { ok: true, isAdmin: true, user: { email: 'admin@example.com' } };
  };
  assert.strictEqual(context.getAdminSettingsCurrent_().isAdmin, true);

  context.api_getCurrentUser = function () {
    return { ok: true, isAdmin: false, user: { email: 'user@example.com' } };
  };
  assert.deepStrictEqual(plain_(context.getAdminSettingsCurrent_()), {
    ok: false,
    code: 'FORBIDDEN',
    message: '설정 화면은 시스템 관리자만 이용할 수 있습니다.'
  });
}
```

- [ ] **Step 3: Add Settings Home response-shape test**

Stub `getAdminSettingsCurrent_()` and `okResponse_()` and assert the existing values are preserved:

```js
function testSettingsHomeData_() {
  var context = createContext_();
  context.getAdminSettingsCurrent_ = function () {
    return { ok: true, isAdmin: true, user: { email: 'admin@example.com', name: '관리자' } };
  };
  context.okResponse_ = function (payload) {
    return Object.assign({ ok: true }, payload);
  };
  load_(context, 'src/000_server/settings.gs');

  var result = context.loadSettingsHomeData();
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.app.name, '학생회 통합 업무관리');
  assert.strictEqual(result.app.version, 'v0.7');
  assert.strictEqual(result.app.term, '2026학년도');
  assert.strictEqual(result.database.spreadsheetId, 'user-db-id');
  assert.strictEqual(result.database.folderId, 'root-folder-id');
  assert.strictEqual(result.session.email, 'admin@example.com');
}
```

- [ ] **Step 4: Add Users Settings composition test**

Load `users.gs` after stubbing UserDB field lookup, user rows, roles, and active user-role mappings. Verify role IDs, role summaries, status, and the intentionally empty `department` field remain unchanged.

Expected assertion shape:

```js
assert.deepStrictEqual(plain_(context.listUsersForSettings_()), [{
  id: 'student@example.com',
  name: '김학생',
  email: 'student@example.com',
  studentId: '6001',
  phone: '010-1111-2222',
  department: '',
  roleIds: ['ROLE_ADMIN'],
  roles: [{ id: 'ROLE_ADMIN', name: '관리자' }],
  status: 'active',
  updatedAt: '2026-08-17T12:00:00',
  updatedBy: 'admin@example.com'
}]);
```

- [ ] **Step 5: Add Roles Settings composition test**

Stub two roles and active/inactive user-role assignments and assert `assignedCount` counts active assignments only.

```js
assert.deepStrictEqual(plain_(context.listRolesForSettings_()).map(function (role) {
  return { id: role.id, assignedCount: role.assignedCount };
}), [
  { id: 'ROLE_ADMIN', assignedCount: 2 },
  { id: 'ROLE_STAFF', assignedCount: 1 }
]);
```

- [ ] **Step 6: Add Permissions Settings tree/matrix tests**

Stub active permissions such as `행사 조회`, `행사 수정`, and inactive permission rows. Assert:

```js
var tree = context.buildPermissionTreeFromDb_();
assert.strictEqual(tree.length, 1);
assert.strictEqual(tree[0].id, 'area_행사');
assert.strictEqual(tree[0].children[0].id, 'perm_EVENT_VIEW');
assert.strictEqual(tree[0].children[0].applicable.view, true);

var matrix = context.buildPermissionsByRoleFromDb_();
assert.strictEqual(matrix.ROLE_ADMIN.perm_EVENT_VIEW.view, true);
assert.strictEqual(matrix.ROLE_ADMIN.perm_EVENT_EDIT.edit, true);
```

Also assert `actionToPermissionKey_()` preserves the current mapping:

```js
assert.strictEqual(context.actionToPermissionKey_('조회'), 'view');
assert.strictEqual(context.actionToPermissionKey_('등록'), 'edit');
assert.strictEqual(context.actionToPermissionKey_('승인'), 'approve');
assert.strictEqual(context.actionToPermissionKey_('다운로드'), 'export');
assert.strictEqual(context.actionToPermissionKey_('메뉴 접근'), 'menu');
```

- [ ] **Step 7: Run the new characterization suite**

Run:

```bash
node scripts/test-settings.js
```

Expected:

```text
Settings behavior regression tests passed.
```

- [ ] **Step 8: Commit the regression test**

```bash
git add scripts/test-settings.js
git commit -m "test: add settings regression coverage"
```

---

### Task 2: Add Settings architecture verification and establish RED

**Files:**
- Create: `scripts/verify-settings-architecture.js`
- Read only: `src/000_server/settings.gs`
- Read only: `src/000_server/030_auth/*.gs`

**Interfaces:**
- Consumes: target structure and function ownership defined in this plan.
- Produces: a verifier that fails against the legacy root-file structure and passes only after the Settings split is complete.

- [ ] **Step 1: Implement file-presence and function-ownership checks**

The verifier must require these files:

```js
var requiredFiles = [
  '070_common/settings_access.gs',
  '070_common/settings_shell_query_service.gs',
  '071_users/settings_users_api.gs',
  '071_users/settings_users_query_service.gs',
  '072_roles/settings_roles_api.gs',
  '072_roles/settings_roles_query_service.gs',
  '073_permissions/settings_permissions_api.gs',
  '073_permissions/settings_permissions_query_service.gs'
];
```

It must forbid the legacy root file:

```js
if (fs.existsSync(path.join(SERVER_ROOT, 'settings.gs'))) {
  failures.push('Legacy Settings file still exists: src/000_server/settings.gs');
}
```

Expected ownership:

```js
var ownership = {
  getAdminSettingsCurrent_: '070_common/settings_access.gs',
  buildSettingsBaseData_: '070_common/settings_shell_query_service.gs',
  loadSettingsHomeData: '070_common/settings_shell_query_service.gs',
  loadSettingsUsersData: '071_users/settings_users_api.gs',
  listUsersForSettings_: '071_users/settings_users_query_service.gs',
  loadSettingsRolesData: '072_roles/settings_roles_api.gs',
  listRolesForSettings_: '072_roles/settings_roles_query_service.gs',
  loadSettingsPermissionsData: '073_permissions/settings_permissions_api.gs',
  actionToPermissionKey_: '073_permissions/settings_permissions_query_service.gs',
  buildPermissionTreeFromDb_: '073_permissions/settings_permissions_query_service.gs',
  buildPermissionsByRoleFromDb_: '073_permissions/settings_permissions_query_service.gs'
};
```

The verifier must separately assert these Auth functions remain under `030_auth`:

```js
var authOwnership = {
  permissionScreenId_: '030_auth/permissions.gs',
  requirePermission_: '030_auth/permissions.gs',
  resolveRequiredPermissionScreenId_: '030_auth/permissions.gs',
  throwPermissionError_: '030_auth/permissions.gs',
  requireLoginContext_: '030_auth/auth_context.gs'
};
```

- [ ] **Step 2: Add Settings read-only boundary checks**

For every file ending in `_query_service.gs`, fail if it contains any of:

```js
/withOperationWriteLock_|appendOperationTableRow_|updateOperationTableRow_|sheetInsert_|sheetUpdateById_|DriveApp\.create|createFile\s*\(/
```

For all `070_settings` files, fail if they directly call UserDB Sheet primitives:

```js
/readTableRows_|openUserSpreadsheet_|append.*Row_|update.*Row_/
```

This preserves the boundary `Settings -> Auth/IAM read functions -> UserDB`.

- [ ] **Step 3: Add duplicate-function detection**

Collect all functions from both `070_settings` and `030_auth` and fail when a function is defined more than once.

- [ ] **Step 4: Run verifier and confirm RED**

Run:

```bash
node scripts/verify-settings-architecture.js
```

Expected failure reasons must include at least:

```text
Missing Settings architecture file: 070_common/settings_access.gs
Legacy Settings file still exists: src/000_server/settings.gs
Function ownership mismatch: listUsersForSettings_
```

- [ ] **Step 5: Commit the failing architecture specification**

```bash
git add scripts/verify-settings-architecture.js
git commit -m "test: define settings architecture boundary"
```

---

### Task 3: Split Settings access and shell composition

**Files:**
- Create: `src/000_server/070_settings/070_common/settings_access.gs`
- Create: `src/000_server/070_settings/070_common/settings_shell_query_service.gs`
- Modify: `src/000_server/settings.gs`
- Test: `scripts/test-settings.js`
- Test: `scripts/verify-settings-architecture.js`

**Interfaces:**
- Consumes: `api_getCurrentUser()`, `failResponse_()`, `okResponse_()`, `APP_TITLE`, `DB_CONFIG`.
- Produces: `getAdminSettingsCurrent_()`, `buildSettingsBaseData_()`, `loadSettingsHomeData()` with unchanged behavior.

- [ ] **Step 1: Move `getAdminSettingsCurrent_()` unchanged into `settings_access.gs`**

```js
function getAdminSettingsCurrent_() {
  var current = api_getCurrentUser();
  if (!current.ok) return current;
  if (!current.isAdmin) {
    return failResponse_('FORBIDDEN', '설정 화면은 시스템 관리자만 이용할 수 있습니다.');
  }
  return current;
}
```

- [ ] **Step 2: Move shell functions unchanged into `settings_shell_query_service.gs`**

Move both:

```text
buildSettingsBaseData_
loadSettingsHomeData
```

Preserve exactly:

```js
app: {
  name: APP_TITLE,
  version: 'v0.7',
  term: '2026학년도',
  baseDate: '',
  syncStatus: 'Google Sheets DB 연결됨'
}
```

and the existing `database`, `session`, and `currentUser` shapes.

- [ ] **Step 3: Remove only those three definitions from root `settings.gs`**

Do not alter the Users/Roles/Permissions public functions yet.

- [ ] **Step 4: Update `scripts/test-settings.js` loader paths**

The test harness must load:

```js
load_(context, 'src/000_server/070_settings/070_common/settings_access.gs');
load_(context, 'src/000_server/070_settings/070_common/settings_shell_query_service.gs');
```

instead of relying on the moved definitions from root `settings.gs`.

- [ ] **Step 5: Run behavior tests**

```bash
node scripts/test-settings.js
```

Expected:

```text
Settings behavior regression tests passed.
```

The architecture verifier is still expected to fail because other target files are not yet present.

- [ ] **Step 6: Commit**

```bash
git add src/000_server/070_settings/070_common src/000_server/settings.gs scripts/test-settings.js
git commit -m "refactor: split settings access and shell"
```

---

### Task 4: Split Users Settings API and Query Service

**Files:**
- Create: `src/000_server/070_settings/071_users/settings_users_api.gs`
- Create: `src/000_server/070_settings/071_users/settings_users_query_service.gs`
- Modify: `src/000_server/settings.gs`
- Modify: `src/000_server/030_auth/users.gs`
- Test: `scripts/test-settings.js`

**Interfaces:**
- Consumes: `getAdminSettingsCurrent_()`, `buildSettingsBaseData_()`, Auth/IAM `listUserRows_()`, `getRolesById_()`, `getActiveRoleIdsByEmail_()`, `toUserDto_()`, `summarizeRoleForUser_()`.
- Produces: unchanged `loadSettingsUsersData()` and `listUsersForSettings_()`.

- [ ] **Step 1: Move `listUsersForSettings_()` unchanged into Users Query Service**

Do not move `listUserRows_()`, `findUserRowByEmail_()`, or `toUserDto_()` out of Auth in this task.

- [ ] **Step 2: Move `loadSettingsUsersData()` into Users API**

Keep the body behavior-equivalent:

```js
function loadSettingsUsersData() {
  var current = getAdminSettingsCurrent_();
  if (!current.ok) return current;

  return okResponse_(Object.assign(buildSettingsBaseData_(current), {
    users: listUsersForSettings_(),
    roles: listRolesForSettings_()
  }));
}
```

- [ ] **Step 3: Remove the moved definitions from their legacy files**

Remove `loadSettingsUsersData()` from root `settings.gs` and `listUsersForSettings_()` from `030_auth/users.gs` only.

- [ ] **Step 4: Point the regression suite at the new Users Query file**

Load:

```js
load_(context, 'src/000_server/070_settings/071_users/settings_users_query_service.gs');
```

for the Users composition test.

- [ ] **Step 5: Run tests**

```bash
node scripts/test-settings.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/000_server/070_settings/071_users src/000_server/030_auth/users.gs src/000_server/settings.gs scripts/test-settings.js
git commit -m "refactor: split settings users feature"
```

---

### Task 5: Split Roles Settings API and Query Service

**Files:**
- Create: `src/000_server/070_settings/072_roles/settings_roles_api.gs`
- Create: `src/000_server/070_settings/072_roles/settings_roles_query_service.gs`
- Modify: `src/000_server/settings.gs`
- Modify: `src/000_server/030_auth/roles.gs`
- Test: `scripts/test-settings.js`

**Interfaces:**
- Consumes: `getAdminSettingsCurrent_()`, `buildSettingsBaseData_()`, Auth/IAM `listUserRoleRows_()`, `getRolesById_()`, UserDB field helpers and active-status normalization.
- Produces: unchanged `loadSettingsRolesData()` and `listRolesForSettings_()`.

- [ ] **Step 1: Move `listRolesForSettings_()` unchanged into Roles Query Service**

Keep these Auth functions in `030_auth/roles.gs`:

```text
listRoleRows_
listUserRoleRows_
getRolesById_
getActiveRoleIdsByEmail_
toRoleDto_
summarizeRoleForUser_
```

- [ ] **Step 2: Move `loadSettingsRolesData()` into Roles API**

```js
function loadSettingsRolesData() {
  var current = getAdminSettingsCurrent_();
  if (!current.ok) return current;

  return okResponse_(Object.assign(buildSettingsBaseData_(current), {
    roles: listRolesForSettings_()
  }));
}
```

- [ ] **Step 3: Remove legacy definitions from root Settings and Auth Roles**

Remove only `loadSettingsRolesData()` and `listRolesForSettings_()`.

- [ ] **Step 4: Update test loader and run regression suite**

```bash
node scripts/test-settings.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/000_server/070_settings/072_roles src/000_server/030_auth/roles.gs src/000_server/settings.gs scripts/test-settings.js
git commit -m "refactor: split settings roles feature"
```

---

### Task 6: Split Permissions Settings API and Query Service

**Files:**
- Create: `src/000_server/070_settings/073_permissions/settings_permissions_api.gs`
- Create: `src/000_server/070_settings/073_permissions/settings_permissions_query_service.gs`
- Modify: `src/000_server/settings.gs`
- Modify: `src/000_server/030_auth/permissions.gs`
- Test: `scripts/test-settings.js`

**Interfaces:**
- Consumes: Auth/IAM `listPermissionRows_()`, `getPermissionsById_()`, `getPermissionIdsByRoleId_()`, `toPermissionDto_()`, and `permissionScreenId_()`.
- Produces: unchanged `loadSettingsPermissionsData()`, `actionToPermissionKey_()`, `buildPermissionTreeFromDb_()`, and `buildPermissionsByRoleFromDb_()`.

- [ ] **Step 1: Move Settings-only permission composition into Query Service**

Move these definitions from `030_auth/permissions.gs` without changing behavior:

```text
actionToPermissionKey_
buildPermissionTreeFromDb_
buildPermissionsByRoleFromDb_
```

Keep `permissionScreenId_()` in Auth because `resolveRequiredPermissionScreenId_()` calls it at runtime.

- [ ] **Step 2: Move `loadSettingsPermissionsData()` into Permissions API**

Preserve:

```js
function loadSettingsPermissionsData() {
  var current = getAdminSettingsCurrent_();
  if (!current.ok) return current;

  return okResponse_(Object.assign(buildSettingsBaseData_(current), {
    roles: listRolesForSettings_(),
    permissionTree: buildPermissionTreeFromDb_(),
    permissionsByRole: buildPermissionsByRoleFromDb_(),
    columns: SETTINGS_PERMISSION_COLUMNS
  }));
}
```

- [ ] **Step 3: Remove the moved definitions from legacy files**

Do not change the bodies or ownership of:

```text
permissionScreenId_
requirePermission_
resolveRequiredPermissionScreenId_
throwPermissionError_
```

- [ ] **Step 4: Update regression test loader paths**

Load:

```js
load_(context, 'src/000_server/070_settings/073_permissions/settings_permissions_query_service.gs');
```

and keep a stub or Auth-loaded `permissionScreenId_()` available to the Query Service tests.

- [ ] **Step 5: Run behavior regression**

```bash
node scripts/test-settings.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/000_server/070_settings/073_permissions src/000_server/030_auth/permissions.gs src/000_server/settings.gs scripts/test-settings.js
git commit -m "refactor: split settings permissions feature"
```

---

### Task 7: Remove legacy Settings root file and turn architecture verifier GREEN

**Files:**
- Delete: `src/000_server/settings.gs`
- Modify if needed: `scripts/verify-settings-architecture.js`
- Test: `scripts/test-settings.js`
- Test: `scripts/verify-settings-architecture.js`

**Interfaces:**
- Consumes: all new `070_settings` files from Tasks 3-6.
- Produces: no duplicate Settings definitions and no root legacy Settings file.

- [ ] **Step 1: Confirm root `settings.gs` contains no remaining functions**

Before deleting it, inspect the file and verify every original function is now owned by a target file. Do not delete the file if any non-migrated behavior remains.

- [ ] **Step 2: Delete `src/000_server/settings.gs`**

- [ ] **Step 3: Run Settings architecture verification**

```bash
node scripts/verify-settings-architecture.js
```

Expected:

```text
Settings architecture verification passed.
```

- [ ] **Step 4: Run Settings behavior regression**

```bash
node scripts/test-settings.js
```

Expected:

```text
Settings behavior regression tests passed.
```

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-settings-architecture.js scripts/test-settings.js src/000_server/070_settings src/000_server/030_auth/users.gs src/000_server/030_auth/roles.gs src/000_server/030_auth/permissions.gs
git rm src/000_server/settings.gs
git commit -m "refactor: finalize settings admin layer"
```

---

### Task 8: Verify global server contracts and cross-domain regression

**Files:**
- Read/verify: `scripts/verify-server-architecture.js`
- Read/verify: `scripts/test-core.js`
- Read/verify: `scripts/verify-event-architecture.js`
- Read/verify: `scripts/test-event.js`
- Read/verify: `scripts/verify-accounting-architecture.js`
- Read/verify: `scripts/test-accounting.js`
- Read/verify: `scripts/verify-settings-architecture.js`
- Read/verify: `scripts/test-settings.js`

**Interfaces:**
- Consumes: all server globals after the refactor.
- Produces: evidence that Settings movement did not break server-level required globals, routes, Core, Event, or Accounting.

- [ ] **Step 1: Run the full verification set**

```bash
node scripts/test-core.js
node scripts/verify-server-architecture.js
node scripts/verify-event-architecture.js
node scripts/test-event.js
node scripts/verify-accounting-architecture.js
node scripts/test-accounting.js
node scripts/verify-settings-architecture.js
node scripts/test-settings.js
```

Expected final outputs include:

```text
Core behavior tests passed.
Server architecture verification passed.
Event architecture verification passed.
Event behavior regression tests passed.
Accounting architecture verification passed.
Accounting behavior regression tests passed.
Settings architecture verification passed.
Settings behavior regression tests passed.
```

- [ ] **Step 2: Confirm the server verifier still finds all four public Settings functions**

`REQUIRED_PUBLIC_FUNCTIONS` in `scripts/verify-server-architecture.js` must continue to include and discover:

```text
loadSettingsHomeData
loadSettingsUsersData
loadSettingsRolesData
loadSettingsPermissionsData
```

No server-verifier code change is required merely because the functions moved into nested `.gs` files; its recursive source scan already covers nested directories.

- [ ] **Step 3: Confirm Settings frontend routes and API call names are unchanged**

Do not edit these routes/templates:

```text
settings             -> 300_settings/300_home/Settings_Home
settings_users       -> 300_settings/310_users/Settings_Users
settings_roles       -> 300_settings/320_roles/Settings_Roles
settings_permissions -> 300_settings/330_permissions/Settings_Permissions
```

Do not rename client calls to:

```text
loadSettingsHomeData
loadSettingsUsersData
loadSettingsRolesData
loadSettingsPermissionsData
```

- [ ] **Step 4: Inspect the final diff for scope creep**

Expected production changes are limited to:

```text
src/000_server/settings.gs                        (removed)
src/000_server/030_auth/users.gs                 (Settings query removed)
src/000_server/030_auth/roles.gs                 (Settings query removed)
src/000_server/030_auth/permissions.gs           (Settings view composition removed)
src/000_server/070_settings/**                    (added)
```

plus Settings tests/verifier and documentation. There should be no functional edits to Event, Accounting, client HTML, or UserDB schema.

- [ ] **Step 5: Commit any verification-only adjustments if necessary**

Only if a verifier/test needed a path update:

```bash
git add scripts docs/superpowers
git commit -m "test: verify settings admin refactor"
```

If no files changed after verification, do not create an empty commit.

---

## Self-Review Results

- **Spec coverage:** The plan covers administrator access, Home shell composition, Users, Roles, Permissions, UserDB ownership, Auth runtime ownership, future Settings extensibility, behavior preservation, and architecture verification.
- **No placeholder implementation:** Current client-side save TODOs remain intentionally unchanged because the approved spec explicitly excludes implementing mutation behavior. The plan itself contains no unresolved implementation decisions.
- **Ownership consistency:** `permissionScreenId_` remains Auth-owned; `actionToPermissionKey_` is Settings-owned. Settings never receives a UserDB DAO.
- **Dependency direction:** All current reads flow `Settings -> Auth/IAM -> UserDB`; no task introduces `Auth -> Settings` dependencies.
