# Settings Admin Layer Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Settings-only administrator screen composition out of root `settings.gs` and `030_auth` into an extensible `070_settings` application layer without changing public Settings behavior or Auth/IAM ownership of UserDB data and runtime permission models.

**Architecture:** `030_auth` owns UserDB access-control data and IAM permission modeling. `040_login` consumes that IAM model to build login context. `070_settings` is a read-only administrator application layer that composes Home, Users, Roles, and Permissions responses and may read Auth/IAM functions, but Auth/Login must never depend on Settings application functions.

**Tech Stack:** Google Apps Script JavaScript, Google Sheets-backed UserDB, Node.js `vm` regression tests, Node.js architecture verification scripts.

## Global Constraints

- Preserve `loadSettingsHomeData`, `loadSettingsUsersData`, `loadSettingsRolesData`, and `loadSettingsPermissionsData` names and return shapes.
- Preserve the current administrator check through `api_getCurrentUser()` and current `FORBIDDEN` behavior.
- Preserve Settings client HTML/JavaScript and existing save TODOs.
- `users`, `roles`, `permissions`, `userRoles`, and `rolePermissions` remain Auth/IAM-owned.
- `actionToPermissionKey_`, `permissionScreenId_`, `buildPermissionTreeFromDb_`, and `buildPermissionsByRoleFromDb_` remain Auth/IAM-owned because Login uses the permission tree/matrix at runtime.
- Settings must not own UserDB DAOs or directly call UserDB Sheet primitives.
- Settings Query Services are read-only.
- Auth/Login must not call Settings-only functions such as `getSettingsPermissionsData_`, `listUsersForSettings_`, or `listRolesForSettings_`.
- Do not introduce classes, dependency injection, repositories, ORMs, query builders, or arrow functions.
- Do not change Event or Accounting behavior.

---

## Target Structure

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

Legacy file removed after migration:

```text
src/000_server/settings.gs
```

Final function ownership:

```text
070_settings/070_common/settings_access.gs
  getAdminSettingsCurrent_

070_settings/070_common/settings_shell_query_service.gs
  loadSettingsHomeData
  buildSettingsBaseData_

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
  getSettingsPermissionsData_

030_auth/permissions.gs
  actionToPermissionKey_
  permissionScreenId_
  buildPermissionTreeFromDb_
  buildPermissionsByRoleFromDb_
  requirePermission_
  resolveRequiredPermissionScreenId_
  throwPermissionError_
```

---

### Task 1: Characterize existing Settings behavior

**Files:**
- Create: `scripts/test-settings.js`

**Interfaces:**
- Consumes: Settings public functions plus current Auth/IAM read/model helpers.
- Produces: stable behavior coverage for the refactor.

- [ ] Test administrator pass-through, non-admin `FORBIDDEN`, and failed-login pass-through.
- [ ] Test Home app/database/session shape and hardcoded current values.
- [ ] Test user + role composition and empty `department` compatibility.
- [ ] Test role `assignedCount` from active user-role assignments.
- [ ] Test IAM permission action mapping, tree, and role matrix.
- [ ] Test Settings Permissions response composition and public API access-failure pass-through.
- [ ] Run `node scripts/test-settings.js` and require `Settings behavior regression tests passed.`

### Task 2: Define Settings architecture verification

**Files:**
- Create: `scripts/verify-settings-architecture.js`

**Interfaces:**
- Consumes: final file and function ownership.
- Produces: an executable architecture boundary.

- [ ] Require all eight `070_settings` target files.
- [ ] Forbid legacy `src/000_server/settings.gs`.
- [ ] Require Settings-only functions in their target feature files.
- [ ] Require IAM permission model functions in `030_auth/permissions.gs`.
- [ ] Detect duplicate functions across Settings/Auth.
- [ ] Forbid write/lock/Drive mutation in Settings Query Services.
- [ ] Forbid direct UserDB Sheet primitives anywhere under `070_settings`.
- [ ] Scan Auth/Login and forbid dependencies on `getSettingsPermissionsData_`, `listUsersForSettings_`, and `listRolesForSettings_`.

### Task 3: Split Settings Common

**Files:**
- Create: `src/000_server/070_settings/070_common/settings_access.gs`
- Create: `src/000_server/070_settings/070_common/settings_shell_query_service.gs`
- Modify then remove definitions from: `src/000_server/settings.gs`

- [ ] Move `getAdminSettingsCurrent_()` unchanged to `settings_access.gs`.
- [ ] Move `loadSettingsHomeData()` and `buildSettingsBaseData_()` unchanged to the shell Query Service.
- [ ] Run `node scripts/test-settings.js`.

### Task 4: Split Settings Users

**Files:**
- Create: `src/000_server/070_settings/071_users/settings_users_api.gs`
- Create: `src/000_server/070_settings/071_users/settings_users_query_service.gs`
- Modify: `src/000_server/030_auth/users.gs`

- [ ] Move `loadSettingsUsersData()` to Users API.
- [ ] Move only `listUsersForSettings_()` to Users Query Service.
- [ ] Keep `listUserRows_`, `findUserRowByEmail_`, and `toUserDto_` in Auth/IAM.
- [ ] Run Settings behavior tests.

### Task 5: Split Settings Roles

**Files:**
- Create: `src/000_server/070_settings/072_roles/settings_roles_api.gs`
- Create: `src/000_server/070_settings/072_roles/settings_roles_query_service.gs`
- Modify: `src/000_server/030_auth/roles.gs`

- [ ] Move `loadSettingsRolesData()` to Roles API.
- [ ] Move only `listRolesForSettings_()` to Roles Query Service.
- [ ] Keep raw role/user-role reads and login role DTO helpers in Auth/IAM.
- [ ] Run Settings behavior tests.

### Task 6: Split Settings Permissions without moving IAM runtime models

**Files:**
- Create: `src/000_server/070_settings/073_permissions/settings_permissions_api.gs`
- Create: `src/000_server/070_settings/073_permissions/settings_permissions_query_service.gs`
- Preserve IAM ownership in: `src/000_server/030_auth/permissions.gs`

**Interfaces:**
- `getSettingsPermissionsData_(current)` consumes `listRolesForSettings_()`, `buildPermissionTreeFromDb_()`, `buildPermissionsByRoleFromDb_()`, and `SETTINGS_PERMISSION_COLUMNS`.

- [ ] Keep `actionToPermissionKey_()` in Auth/IAM.
- [ ] Keep `permissionScreenId_()` in Auth/IAM.
- [ ] Keep `buildPermissionTreeFromDb_()` in Auth/IAM because Login uses it for menu construction.
- [ ] Keep `buildPermissionsByRoleFromDb_()` in Auth/IAM because Login uses it for user permission context.
- [ ] Implement `getSettingsPermissionsData_(current)` as a read-only Settings response composition function.
- [ ] Make `loadSettingsPermissionsData()` perform admin access check then delegate to `getSettingsPermissionsData_()`.
- [ ] Run Settings behavior and architecture tests.

### Task 7: Remove legacy root Settings file

**Files:**
- Delete: `src/000_server/settings.gs`

- [ ] Confirm all original public/helper functions have a single target owner.
- [ ] Delete the root legacy file.
- [ ] Run `node scripts/verify-settings-architecture.js`.
- [ ] Run `node scripts/test-settings.js`.

### Task 8: Final verification

Run when a complete checkout is available:

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

Expected Settings outputs:

```text
Settings architecture verification passed.
Settings behavior regression tests passed.
```

Also verify:

- four public Settings functions remain discoverable by `verify-server-architecture.js`;
- Settings client routes/API call names are unchanged;
- no Event/Accounting/client/UserDB-schema functional edits are introduced;
- changed `.gs` files parse successfully with Node `vm.Script`.

## Self-Review Results

- The corrected plan preserves the dependency direction `Settings -> Auth/IAM`, while Login also independently consumes Auth/IAM.
- IAM permission tree/matrix ownership is not duplicated in Settings.
- Settings remains extensible for future `074_system`, `075_database`, and `076_integrations` features without taking ownership of IAM tables.
- No empty mutation services, validators, or DAOs are introduced.
