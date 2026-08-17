# Auth / IAM Boundary Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the current Login implementation into `030_auth`, extract User / Role / Permission / Authorization ownership into `040_iam`, and preserve every existing login, permission, Settings, Event, and Accounting public contract.

**Architecture:** `030_auth` becomes the Authentication boundary that owns Google Session identity, login context, login cache, login facade APIs, and `requireLoginContext_()`. `040_iam` owns the UserDB identity/access model (`users`, `roles`, `permissions`, `userRoles`, `rolePermissions`), administrator-role interpretation, permission-model calculation, and `requirePermission_()`. Settings remains an administrator application layer that consumes Auth/IAM but never owns UserDB tables.

**Tech Stack:** Google Apps Script JavaScript, Google Sheets-backed UserDB, Apps Script Session/CacheService/LockService, Node.js `vm` regression tests, Node.js architecture verification scripts.

## Global Constraints

- Preserve the public functions `api_checkLogin`, `api_getCurrentUser`, and `api_getMyPermissions` without changing response shapes.
- Preserve `requireLoginContext_` and `requirePermission_` names and runtime behavior.
- Preserve Google Session-based identity lookup.
- Preserve login-context cache key behavior, TTL, and `LockService` concurrency behavior.
- Preserve `NOT_REGISTERED`, `INACTIVE`, `NO_ROLE`, and `LOGIN_DB_INTEGRITY_ERROR` outcomes.
- Preserve the administrator-role rules based on `ADMIN_ROLE_ID`, protected roles, and role names containing `관리자`.
- Preserve permission action mapping, permission-tree shape, role-permission matrix shape, and login-context shape.
- Preserve `api_getMyPermissions()` under Auth as a current-user facade; IAM must not depend on Auth.
- Preserve `SETTINGS_PERMISSION_COLUMNS`, `ADMIN_ROLE_ID`, `LOGIN_CONTEXT_CACHE_PREFIX`, and `LOGIN_CONTEXT_CACHE_SECONDS` in `010_core/config.gs`; this refactor does not rename or relocate those constants.
- Preserve `020_schema/user_db_schema.gs` and `020_schema/user_db_integrity.gs` ownership and behavior.
- Preserve Settings public APIs and frontend call names.
- `040_iam` may depend on Core/Schema primitives; `040_iam -> 030_auth` and `040_iam -> 070_settings` are forbidden.
- `030_auth -> 070_settings` is forbidden.
- IAM Sheet DAOs may read only their owned logical table.
- Query Services and Access Services must not perform Sheet writes or Drive mutations.
- Do not introduce classes, dependency injection, repositories, ORMs, query builders, or arrow functions.
- Do not add IAM mutation services until an actual write use case is implemented.
- Do not change Event, Accounting, Settings frontend, UserDB schema, or business behavior as part of this structural refactor.

---

## Target File Structure

```text
src/000_server/
├─ 030_auth/
│  ├─ auth_api.gs
│  ├─ auth_context.gs
│  ├─ auth_session.gs
│  └─ auth_cache.gs
│
├─ 040_iam/
│  ├─ 041_users/
│  │  ├─ users_query_service.gs
│  │  └─ users_sheet_dao.gs
│  │
│  ├─ 042_roles/
│  │  ├─ roles_query_service.gs
│  │  ├─ roles_sheet_dao.gs
│  │  └─ user_roles_sheet_dao.gs
│  │
│  └─ 043_permissions/
│     ├─ permissions_query_service.gs
│     ├─ permissions_access_service.gs
│     ├─ permissions_sheet_dao.gs
│     └─ role_permissions_sheet_dao.gs
│
├─ 050_event/
├─ 060_accounting/
└─ 070_settings/
```

Legacy files removed after migration:

```text
src/000_server/030_auth/users.gs
src/000_server/030_auth/roles.gs
src/000_server/030_auth/permissions.gs
src/000_server/040_login/login_api.gs
src/000_server/040_login/login_cache.gs
src/000_server/040_login/login_context.gs
src/000_server/040_login/login_session.gs
```

`src/000_server/030_auth/auth_context.gs` remains but becomes the combined Authentication-context file.

## Final Function Ownership

```text
030_auth/auth_api.gs
  api_checkLogin
  api_getCurrentUser
  api_getMyPermissions

030_auth/auth_session.gs
  getActiveUserEmailFromSession_

030_auth/auth_cache.gs
  getCachedLoginContext_
  cacheLoginContext_
  invalidateLoginContextCache_
  buildLoginContextCacheKey_

030_auth/auth_context.gs
  getSessionUserContext_
  buildSessionUserContextFromDb_
  requireLoginContext_

040_iam/041_users/users_sheet_dao.gs
  listUserRows_

040_iam/041_users/users_query_service.gs
  findUserRowByEmail_
  toUserDto_

040_iam/042_roles/roles_sheet_dao.gs
  listRoleRows_

040_iam/042_roles/user_roles_sheet_dao.gs
  listUserRoleRows_

040_iam/042_roles/roles_query_service.gs
  getRolesById_
  getActiveRoleIdsByEmail_
  toRoleDto_
  summarizeRoleForUser_
  isAdminRoleSet_

040_iam/043_permissions/permissions_sheet_dao.gs
  listPermissionRows_

040_iam/043_permissions/role_permissions_sheet_dao.gs
  listRolePermissionRows_

040_iam/043_permissions/permissions_query_service.gs
  toPermissionDto_
  getPermissionsById_
  getPermissionIdsByRoleId_
  actionToPermissionKey_
  permissionScreenId_
  buildPermissionTreeFromDb_
  buildPermissionsByRoleFromDb_
  buildUserPermissionsFromDb_
  buildMenusFromPermissions_

040_iam/043_permissions/permissions_access_service.gs
  requirePermission_
  resolveRequiredPermissionScreenId_
  throwPermissionError_
```

---

### Task 1: Add Auth/IAM behavior characterization tests

**Files:**
- Create: `scripts/test-auth-iam.js`
- Read only: `src/000_server/030_auth/*.gs`
- Read only: `src/000_server/040_login/*.gs`
- Read only: `src/000_server/010_core/config.gs`

**Interfaces:**
- Consumes: the current pre-refactor global Auth/Login/IAM functions.
- Produces: a regression suite that must pass before and after file movement.

- [ ] **Step 1: Create a VM test harness**

Use `assert`, `fs`, `path`, and `vm`. Provide a loader that executes `.gs` files in one shared context:

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
```

The context must include these stable constants:

```js
ADMIN_ROLE_ID: 'role_admin',
SETTINGS_PERMISSION_COLUMNS: [
  { key: 'menu', label: '메뉴 접근', hint: '(자동)' },
  { key: 'view', label: '조회' },
  { key: 'edit', label: '등록 및 수정' },
  { key: 'approve', label: '승인 및 보관' },
  { key: 'export', label: '다운로드' }
],
LOGIN_CONTEXT_CACHE_PREFIX: 'LOGIN_CONTEXT_V1_',
LOGIN_CONTEXT_CACHE_SECONDS: 600
```

- [ ] **Step 2: Characterize administrator-role interpretation**

Load current `030_auth/roles.gs` and `040_login/login_context.gs`, then assert:

```js
assert.strictEqual(context.isAdminRoleSet_(['role_admin'], {
  role_admin: { id: 'role_admin', name: '시스템 관리자', protected: true }
}), true);

assert.strictEqual(context.isAdminRoleSet_(['role_staff'], {
  role_staff: { id: 'role_staff', name: '일반 사용자', protected: false }
}), false);
```

Also cover a non-`ADMIN_ROLE_ID` role whose name contains `관리자` and a protected role.

- [ ] **Step 3: Characterize permission model calculation**

Load current `030_auth/permissions.gs` and `040_login/login_context.gs`. Stub permission rows and role-permission rows and assert:

```js
var byRole = context.buildPermissionsByRoleFromDb_();
assert.strictEqual(byRole.ROLE_ADMIN.perm_EVENT_VIEW.view, true);
assert.strictEqual(byRole.ROLE_ADMIN.perm_EVENT_EDIT.edit, true);

var userPermissions = context.buildUserPermissionsFromDb_(['ROLE_ADMIN']);
assert.strictEqual(userPermissions.byScreen.perm_EVENT_VIEW.view, true);
assert.ok(Array.isArray(userPermissions.menus));
```

Also preserve mappings:

```js
assert.strictEqual(context.actionToPermissionKey_('조회'), 'view');
assert.strictEqual(context.actionToPermissionKey_('수정'), 'edit');
assert.strictEqual(context.actionToPermissionKey_('승인'), 'approve');
assert.strictEqual(context.actionToPermissionKey_('출력'), 'export');
assert.strictEqual(context.actionToPermissionKey_('메뉴 접근'), 'menu');
```

- [ ] **Step 4: Characterize `requirePermission_()`**

Assert all three behavior classes:

```js
assert.strictEqual(context.requirePermission_({ ok: true, isAdmin: true }, { id: 'EVENT_EDIT', action: 'edit' }), true);

assert.strictEqual(context.requirePermission_({
  ok: true,
  isAdmin: false,
  permissions: { byScreen: { perm_EVENT_VIEW: { view: true } } }
}, { id: 'EVENT_VIEW', action: 'view' }), true);

assert.throws(function () {
  context.requirePermission_({
    ok: true,
    isAdmin: false,
    permissions: { byScreen: {} }
  }, { id: 'EVENT_VIEW', action: 'view' });
}, function (error) {
  return error.code === 'FORBIDDEN';
});
```

- [ ] **Step 5: Characterize login-context construction**

Stub `findUserRowByEmail_`, `getRolesById_`, `getActiveRoleIdsByEmail_`, `checkLoginUserDbIntegrity_`, `toUserDto_`, `summarizeRoleForUser_`, and `buildUserPermissionsFromDb_`.

Assert these outcomes from `buildSessionUserContextFromDb_()`:

```text
NOT_REGISTERED
INACTIVE
NO_ROLE
LOGIN_DB_INTEGRITY_ERROR
success
```

For the success case assert the existing context shape:

```js
assert.deepStrictEqual(Object.keys(result).sort(), [
  'dbMode', 'email', 'isAdmin', 'ok', 'permissions', 'preview', 'roles', 'user'
].sort());
```

- [ ] **Step 6: Characterize cache-hit behavior in `getSessionUserContext_()`**

Stub `getActiveUserEmailFromSession_()` and `getCachedLoginContext_()` so a cached context exists. Assert that `buildSessionUserContextFromDb_()` is not called.

Then stub a cache miss with a `LockService` object whose `tryLock()` returns `true`; assert the built context is cached and returned.

- [ ] **Step 7: Characterize `requireLoginContext_()` and Auth facade APIs**

Load current `030_auth/auth_context.gs` and `040_login/login_api.gs`.

Assert:

```js
context.getSessionUserContext_ = function () { return { ok: true, email: 'admin@example.com' }; };
assert.strictEqual(context.requireLoginContext_().email, 'admin@example.com');
```

and failure:

```js
context.getSessionUserContext_ = function () { return { ok: false, code: 'NO_SESSION', message: '로그인이 필요합니다.' }; };
assert.throws(function () { context.requireLoginContext_(); }, function (error) {
  return error.code === 'NO_SESSION';
});
```

For `api_checkLogin`, `api_getCurrentUser`, and `api_getMyPermissions`, stub context data and assert current response shapes remain unchanged.

- [ ] **Step 8: Run the characterization suite**

Run:

```bash
node scripts/test-auth-iam.js
```

Expected:

```text
Auth/IAM behavior regression tests passed.
```

- [ ] **Step 9: Commit**

```bash
git add scripts/test-auth-iam.js
git commit -m "test: add auth iam regression coverage"
```

---

### Task 2: Add Auth/IAM architecture verification and establish RED

**Files:**
- Create: `scripts/verify-auth-iam-architecture.js`
- Read only: `src/000_server/030_auth/**`
- Read only: `src/000_server/040_login/**`
- Read only: `src/000_server/070_settings/**`

**Interfaces:**
- Consumes: the target structure and function ownership defined above.
- Produces: an executable architecture specification that fails against the legacy `040_login` + mixed `030_auth` layout.

- [ ] **Step 1: Require the target files**

The verifier must require:

```js
var requiredAuthFiles = [
  'auth_api.gs',
  'auth_context.gs',
  'auth_session.gs',
  'auth_cache.gs'
];

var requiredIamFiles = [
  '041_users/users_query_service.gs',
  '041_users/users_sheet_dao.gs',
  '042_roles/roles_query_service.gs',
  '042_roles/roles_sheet_dao.gs',
  '042_roles/user_roles_sheet_dao.gs',
  '043_permissions/permissions_query_service.gs',
  '043_permissions/permissions_access_service.gs',
  '043_permissions/permissions_sheet_dao.gs',
  '043_permissions/role_permissions_sheet_dao.gs'
];
```

- [ ] **Step 2: Forbid legacy ownership**

Fail when any of these exist:

```text
src/000_server/030_auth/users.gs
src/000_server/030_auth/roles.gs
src/000_server/030_auth/permissions.gs
src/000_server/040_login/login_api.gs
src/000_server/040_login/login_cache.gs
src/000_server/040_login/login_context.gs
src/000_server/040_login/login_session.gs
```

Also fail if the `040_login` directory contains any `.gs` file.

- [ ] **Step 3: Verify exact function ownership**

Use a recursive function collector and require every function listed in the Final Function Ownership section to have exactly one definition in exactly the expected file.

Example:

```js
requireFunctionIn_(functions, 'api_checkLogin', '030_auth/auth_api.gs');
requireFunctionIn_(functions, 'listUserRows_', '040_iam/041_users/users_sheet_dao.gs');
requireFunctionIn_(functions, 'isAdminRoleSet_', '040_iam/042_roles/roles_query_service.gs');
requireFunctionIn_(functions, 'requirePermission_', '040_iam/043_permissions/permissions_access_service.gs');
```

- [ ] **Step 4: Verify dependency direction**

For every file under `040_iam`, fail on direct references to Auth-only functions:

```js
/\bgetSessionUserContext_\b|\brequireLoginContext_\b|\bapi_checkLogin\b|\bapi_getCurrentUser\b|\bapi_getMyPermissions\b/
```

For Auth and IAM files, fail on Settings application functions:

```js
/\bgetSettingsPermissionsData_\b|\blistUsersForSettings_\b|\blistRolesForSettings_\b/
```

`030_auth` may call IAM functions such as `findUserRowByEmail_()`, `getRolesById_()`, and `buildUserPermissionsFromDb_()`.

- [ ] **Step 5: Verify DAO table ownership**

Require each DAO to contain the expected schema key and reject other IAM table keys:

```text
users_sheet_dao.gs                  -> users only
roles_sheet_dao.gs                  -> roles only
user_roles_sheet_dao.gs             -> userRoles only
permissions_sheet_dao.gs            -> permissions only
role_permissions_sheet_dao.gs       -> rolePermissions only
```

The check may inspect `getUserDbTableSchema_('<table>')` string literals.

- [ ] **Step 6: Verify no writes in IAM read/access files**

Reject these patterns in all `040_iam` files:

```js
/sheetInsert_|sheetUpdateById_|append[A-Za-z_$]*Row_|update[A-Za-z_$]*Row_|DriveApp\.create|createFile\s*\(/
```

This phase is read-only.

- [ ] **Step 7: Verify no duplicate functions and no empty placeholders**

Fail if a function is defined more than once across Auth + IAM. Fail if any required `.gs` file is empty or whitespace-only.

- [ ] **Step 8: Run verifier and confirm RED**

Run:

```bash
node scripts/verify-auth-iam-architecture.js
```

Expected failures must include examples such as:

```text
Missing Auth architecture file: auth_api.gs
Missing IAM architecture file: 041_users/users_sheet_dao.gs
Legacy Login file still exists: src/000_server/040_login/login_api.gs
Function ownership mismatch: requirePermission_
```

- [ ] **Step 9: Commit the failing architecture specification**

```bash
git add scripts/verify-auth-iam-architecture.js
git commit -m "test: define auth iam architecture boundary"
```

---

### Task 3: Merge Login infrastructure into `030_auth`

**Files:**
- Create: `src/000_server/030_auth/auth_api.gs`
- Create: `src/000_server/030_auth/auth_session.gs`
- Create: `src/000_server/030_auth/auth_cache.gs`
- Modify: `src/000_server/030_auth/auth_context.gs`
- Delete after successful move: `src/000_server/040_login/login_api.gs`
- Delete after successful move: `src/000_server/040_login/login_cache.gs`
- Delete after successful move: `src/000_server/040_login/login_session.gs`
- Modify: `src/000_server/040_login/login_context.gs`
- Test: `scripts/test-auth-iam.js`

**Interfaces:**
- Consumes: current global IAM functions still temporarily living in legacy `030_auth/users.gs`, `roles.gs`, and `permissions.gs`.
- Produces: all Authentication functions in `030_auth`, while legacy IAM ownership remains untouched until later tasks.

- [ ] **Step 1: Move the public Login API file unchanged**

Create `030_auth/auth_api.gs` with the existing bodies of:

```text
api_checkLogin
api_getCurrentUser
api_getMyPermissions
```

Do not change public names or response shapes.

- [ ] **Step 2: Move Session and cache functions unchanged**

Create `auth_session.gs` with:

```text
getActiveUserEmailFromSession_
```

Create `auth_cache.gs` with:

```text
getCachedLoginContext_
cacheLoginContext_
invalidateLoginContextCache_
buildLoginContextCacheKey_
```

Preserve all Apps Script service calls and cache constants.

- [ ] **Step 3: Merge Authentication context functions**

Move these from legacy `040_login/login_context.gs` into existing `030_auth/auth_context.gs`:

```text
getSessionUserContext_
buildSessionUserContextFromDb_
```

Keep existing `requireLoginContext_()` in the same file.

Do **not** move these yet:

```text
isAdminRoleSet_
buildUserPermissionsFromDb_
buildMenusFromPermissions_
```

They remain temporarily in `040_login/login_context.gs` until IAM Roles/Permissions tasks move them.

- [ ] **Step 4: Delete fully migrated legacy Login files**

Delete:

```text
040_login/login_api.gs
040_login/login_cache.gs
040_login/login_session.gs
```

Keep `040_login/login_context.gs` temporarily because it still owns three IAM functions.

- [ ] **Step 5: Update the Auth/IAM regression loader paths**

Point Auth facade/session/cache/context tests to the new `030_auth` files while still loading legacy IAM files for functions not yet migrated.

- [ ] **Step 6: Run regression tests**

```bash
node scripts/test-auth-iam.js
node scripts/test-settings.js
```

Expected: both PASS.

The architecture verifier remains RED because IAM target files and the legacy login context still exist.

- [ ] **Step 7: Commit**

```bash
git add src/000_server/030_auth src/000_server/040_login scripts/test-auth-iam.js
git commit -m "refactor: merge login infrastructure into auth"
```

---

### Task 4: Extract IAM Users

**Files:**
- Create: `src/000_server/040_iam/041_users/users_sheet_dao.gs`
- Create: `src/000_server/040_iam/041_users/users_query_service.gs`
- Delete: `src/000_server/030_auth/users.gs`
- Modify: `scripts/test-auth-iam.js`
- Modify: `scripts/test-settings.js`

**Interfaces:**
- Consumes: Core/Schema functions `openUserSpreadsheet_()`, `readTableRows_()`, `getUserDbTableSchema_()`, `getUserDbFields_()`, and value normalizers.
- Produces: unchanged globals `listUserRows_()`, `findUserRowByEmail_()`, and `toUserDto_()` from IAM.

- [ ] **Step 1: Move `listUserRows_()` unchanged into the User DAO**

`users_sheet_dao.gs` must only access:

```js
getUserDbTableSchema_('users')
```

and preserve the current error fallback to `[]`.

- [ ] **Step 2: Move User query/DTO functions unchanged**

Move into `users_query_service.gs`:

```text
findUserRowByEmail_
toUserDto_
```

Do not add Sheet access to the Query Service.

- [ ] **Step 3: Delete legacy `030_auth/users.gs`**

Only after all three definitions exist under IAM.

- [ ] **Step 4: Update test loader paths**

Update both:

```text
scripts/test-auth-iam.js
scripts/test-settings.js
```

so Users tests load the new IAM files.

- [ ] **Step 5: Run regression**

```bash
node scripts/test-auth-iam.js
node scripts/test-settings.js
```

Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add src/000_server/040_iam/041_users src/000_server/030_auth/users.gs scripts/test-auth-iam.js scripts/test-settings.js
git commit -m "refactor: extract iam users"
```

---

### Task 5: Extract IAM Roles and administrator-role policy

**Files:**
- Create: `src/000_server/040_iam/042_roles/roles_sheet_dao.gs`
- Create: `src/000_server/040_iam/042_roles/user_roles_sheet_dao.gs`
- Create: `src/000_server/040_iam/042_roles/roles_query_service.gs`
- Delete: `src/000_server/030_auth/roles.gs`
- Modify: `src/000_server/040_login/login_context.gs`
- Modify: `scripts/test-auth-iam.js`
- Modify: `scripts/test-settings.js`

**Interfaces:**
- Consumes: UserDB `roles` and `userRoles` schemas and Core/Schema normalizers.
- Produces: unchanged Role globals plus IAM-owned `isAdminRoleSet_()`.

- [ ] **Step 1: Split the two physical Role DAOs**

`roles_sheet_dao.gs` owns only:

```text
listRoleRows_
```

and only `getUserDbTableSchema_('roles')`.

`user_roles_sheet_dao.gs` owns only:

```text
listUserRoleRows_
```

and only `getUserDbTableSchema_('userRoles')`.

- [ ] **Step 2: Move Role query functions unchanged**

Move into `roles_query_service.gs`:

```text
getRolesById_
getActiveRoleIdsByEmail_
toRoleDto_
summarizeRoleForUser_
```

- [ ] **Step 3: Move administrator-role interpretation from legacy Login context**

Move the exact `isAdminRoleSet_(roleIds, roleMap)` body into `roles_query_service.gs`.

The function must preserve:

```text
ADMIN_ROLE_ID match
role.protected === true
role.name contains '관리자'
```

- [ ] **Step 4: Remove `isAdminRoleSet_()` from legacy Login context and delete legacy Roles file**

Delete `030_auth/roles.gs` after all moved functions exist under IAM.

- [ ] **Step 5: Update Settings and Auth/IAM test loaders**

`settings_roles_query_service.gs` still calls the same globals; only test source paths change.

- [ ] **Step 6: Run regression**

```bash
node scripts/test-auth-iam.js
node scripts/test-settings.js
```

Expected: both PASS.

- [ ] **Step 7: Commit**

```bash
git add src/000_server/040_iam/042_roles src/000_server/030_auth/roles.gs src/000_server/040_login/login_context.gs scripts/test-auth-iam.js scripts/test-settings.js
git commit -m "refactor: extract iam roles"
```

---

### Task 6: Extract IAM Permissions and Authorization

**Files:**
- Create: `src/000_server/040_iam/043_permissions/permissions_sheet_dao.gs`
- Create: `src/000_server/040_iam/043_permissions/role_permissions_sheet_dao.gs`
- Create: `src/000_server/040_iam/043_permissions/permissions_query_service.gs`
- Create: `src/000_server/040_iam/043_permissions/permissions_access_service.gs`
- Delete: `src/000_server/030_auth/permissions.gs`
- Delete after final IAM function move: `src/000_server/040_login/login_context.gs`
- Modify: `scripts/test-auth-iam.js`
- Modify: `scripts/test-settings.js`
- Modify: `scripts/verify-settings-architecture.js`

**Interfaces:**
- Consumes: UserDB Permission/RolePermission tables and constants from `010_core/config.gs`.
- Produces: all Permission/IAM calculation globals and runtime Authorization service.

- [ ] **Step 1: Split Permission DAOs by physical table**

Move unchanged:

```text
permissions_sheet_dao.gs
  listPermissionRows_

role_permissions_sheet_dao.gs
  listRolePermissionRows_
```

Each DAO must read only its own schema key.

- [ ] **Step 2: Move existing Permission-model functions into Query Service**

Move unchanged from legacy `030_auth/permissions.gs`:

```text
toPermissionDto_
getPermissionsById_
getPermissionIdsByRoleId_
actionToPermissionKey_
permissionScreenId_
buildPermissionTreeFromDb_
buildPermissionsByRoleFromDb_
```

- [ ] **Step 3: Move user-permission and menu calculation from legacy Login context**

Move unchanged into `permissions_query_service.gs`:

```text
buildUserPermissionsFromDb_
buildMenusFromPermissions_
```

This completes removal of IAM logic from legacy `040_login/login_context.gs`.

- [ ] **Step 4: Extract Authorization service**

Move unchanged into `permissions_access_service.gs`:

```text
requirePermission_
resolveRequiredPermissionScreenId_
throwPermissionError_
```

No Auth calls may be added here; the service consumes the provided login context only.

- [ ] **Step 5: Delete fully migrated legacy files**

Delete:

```text
src/000_server/030_auth/permissions.gs
src/000_server/040_login/login_context.gs
```

After deletion, `040_login` must contain no `.gs` files.

- [ ] **Step 6: Update Settings test loader paths**

`test-settings.js` must load:

```text
040_iam/041_users/**
040_iam/042_roles/**
040_iam/043_permissions/**
```

where it previously loaded `030_auth/users.gs`, `roles.gs`, or `permissions.gs`.

- [ ] **Step 7: Update Settings architecture ownership rules**

In `verify-settings-architecture.js`, update Auth/IAM ownership expectations so these live under `040_iam`:

```text
actionToPermissionKey_
permissionScreenId_
buildPermissionTreeFromDb_
buildPermissionsByRoleFromDb_
requirePermission_
resolveRequiredPermissionScreenId_
throwPermissionError_
```

Keep `requireLoginContext_` under `030_auth/auth_context.gs`.

Update the dependency check to scan `040_iam` instead of assuming IAM logic lives under `030_auth`.

- [ ] **Step 8: Run Auth/IAM and Settings regression**

```bash
node scripts/test-auth-iam.js
node scripts/test-settings.js
node scripts/verify-settings-architecture.js
```

Expected:

```text
Auth/IAM behavior regression tests passed.
Settings behavior regression tests passed.
Settings architecture verification passed.
```

- [ ] **Step 9: Commit**

```bash
git add src/000_server/040_iam src/000_server/030_auth src/000_server/040_login scripts/test-auth-iam.js scripts/test-settings.js scripts/verify-settings-architecture.js
git commit -m "refactor: extract iam permissions and authorization"
```

---

### Task 7: Turn Auth/IAM architecture verifier GREEN

**Files:**
- Modify if needed: `scripts/verify-auth-iam-architecture.js`
- Read/verify: `src/000_server/030_auth/**`
- Read/verify: `src/000_server/040_iam/**`
- Read/verify: `src/000_server/040_login/**`

**Interfaces:**
- Consumes: final Auth/IAM structure from Tasks 3-6.
- Produces: executable evidence of file ownership and allowed dependency direction.

- [ ] **Step 1: Confirm no legacy `.gs` files remain**

The verifier must observe:

```text
030_auth/users.gs        absent
030_auth/roles.gs        absent
030_auth/permissions.gs  absent
040_login/*.gs           absent
```

- [ ] **Step 2: Run Auth/IAM architecture verification**

```bash
node scripts/verify-auth-iam-architecture.js
```

Expected:

```text
Auth/IAM architecture verification passed.
```

- [ ] **Step 3: Run Auth/IAM behavior regression again**

```bash
node scripts/test-auth-iam.js
```

Expected:

```text
Auth/IAM behavior regression tests passed.
```

- [ ] **Step 4: Inspect ownership manually**

Confirm `030_auth` contains only:

```text
auth_api.gs
auth_context.gs
auth_session.gs
auth_cache.gs
```

Confirm `040_iam` contains only the nine target IAM files and no empty scaffolding.

- [ ] **Step 5: Commit verifier-only fixes if any**

If the verifier required no adjustment, do not create an empty commit. Otherwise:

```bash
git add scripts/verify-auth-iam-architecture.js
git commit -m "test: finalize auth iam architecture verification"
```

---

### Task 8: Verify cross-domain contracts and prevent path-coupled regressions

**Files:**
- Read/verify: `scripts/test-core.js`
- Read/verify: `scripts/verify-server-architecture.js`
- Read/verify: `scripts/verify-event-architecture.js`
- Read/verify: `scripts/test-event.js`
- Read/verify: `scripts/verify-accounting-architecture.js`
- Read/verify: `scripts/test-accounting.js`
- Read/verify: `scripts/verify-settings-architecture.js`
- Read/verify: `scripts/test-settings.js`
- Read/verify: `scripts/verify-auth-iam-architecture.js`
- Read/verify: `scripts/test-auth-iam.js`

**Interfaces:**
- Consumes: all global server functions after Auth/IAM movement.
- Produces: evidence that the structural refactor preserved server, domain, and Settings contracts.

- [ ] **Step 1: Run the full verification set**

Run:

```bash
node scripts/test-core.js
node scripts/verify-server-architecture.js
node scripts/verify-auth-iam-architecture.js
node scripts/test-auth-iam.js
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
Auth/IAM architecture verification passed.
Auth/IAM behavior regression tests passed.
Event architecture verification passed.
Event behavior regression tests passed.
Accounting architecture verification passed.
Accounting behavior regression tests passed.
Settings architecture verification passed.
Settings behavior regression tests passed.
```

- [ ] **Step 2: Confirm server public-function discovery still succeeds**

`verify-server-architecture.js` must still find:

```text
api_checkLogin
api_getCurrentUser
api_getMyPermissions
requirePermission_
loadSettingsHomeData
loadSettingsUsersData
loadSettingsRolesData
loadSettingsPermissionsData
```

No public function is renamed because GAS globals remain unchanged.

- [ ] **Step 3: Confirm Settings dependency direction**

The final Settings flow must be:

```text
Settings -> Auth   for current administrator identity
Settings -> IAM    for User / Role / Permission reads
```

and never:

```text
IAM -> Settings
Auth -> Settings
```

- [ ] **Step 4: Inspect final diff for scope creep**

Expected production changes are limited to:

```text
src/000_server/030_auth/**
src/000_server/040_login/**  (legacy removal)
src/000_server/040_iam/**    (new)
```

plus test/verifier/documentation path adjustments needed because Settings reads IAM globals.

There must be no functional change to:

```text
050_event
060_accounting
070_settings production behavior
020_schema
010_core/config.gs
client HTML/JavaScript
```

- [ ] **Step 5: Commit verification-only changes only when necessary**

```bash
git add scripts docs/superpowers
 git commit -m "test: verify auth iam boundary refactor"
```

Do not create an empty commit.

---

## Self-Review Results

- **Spec coverage:** The plan covers Authentication consolidation, IAM Users/Roles/Permissions ownership, Authorization extraction, Settings dependency updates, UserDB ownership, public API preservation, login-context behavior, and architecture verification.
- **Scope:** This is one structural refactor with one coherent dependency boundary; no unrelated business feature or mutation workflow is included.
- **No placeholder implementation:** Every target file and function ownership is explicitly defined; no new empty Service, Validator, or Common scaffolding is planned.
- **Ownership consistency:** `api_getMyPermissions()` stays in Auth; `isAdminRoleSet_()` moves to IAM Roles; `buildUserPermissionsFromDb_()` and `buildMenusFromPermissions_()` move to IAM Permissions; `requirePermission_()` moves to IAM Authorization.
- **Dependency consistency:** Auth may depend on IAM; IAM may depend on Core/Schema; IAM may not depend on Auth or Settings; Settings may depend on Auth/IAM.
- **Behavior consistency:** Existing function names remain global, so Event/Accounting/Settings callers do not require production-code rewrites solely because files move.
