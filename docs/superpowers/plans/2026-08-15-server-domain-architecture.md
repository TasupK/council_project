# Server Domain Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the Apps Script server into domain packages with a shared API lifecycle and schema-based Sheet CRUD while preserving the current client routes, public function names, inputs, and return shapes.

**Architecture:** Public `api_*` functions declare lifecycle options and call `apiHandler_()`. Domain Services contain business flow, domain Sheet DAOs express data access intent, and Core Sheet CRUD resolves the central Schema and performs batched Google Sheets I/O. Migration proceeds Core, Event, Accounting, Auth/Login, Settings, then final cleanup.

**Tech Stack:** Google Apps Script V8, HtmlService, `google.script.run`, Google Sheets, LockService, clasp, Node.js static verification scripts, Git.

## Global Constraints

- Modify server code under `src/000_server`; do not reorganize client HTML or client JavaScript.
- Preserve all current `page` parameter values and template paths in `Code.js`.
- Preserve public API names, accepted inputs, and return shapes.
- New public client-callable server functions use the `api_` prefix; internal server functions end in `_`. Preserve the four legacy `loadSettings*` public names because the current client calls them directly.
- Do not use arrow functions.
- Do not remove user-authored comments or TODO comments without an explicit replacement reason.
- Keep UserDB and OperationDB table and field names in `020_schema`.
- Keep runtime spreadsheet and Drive IDs in `010_core/config.gs`.
- Do not add audit logging, redesign cache policy, introduce query builders, or standardize all error responses.
- Do not run `clasp push` unless the user explicitly requests it.
- Event and Accounting currently have no confirmed non-admin permission IDs in UserDB. Implement Handler permission support, enforce the existing Settings permission IDs, and keep Event/Accounting at `requireLogin: true` until their permission records are separately approved and populated.

---

## Target File Map

```text
src/000_server/
├─ 010_core/
│  ├─ api_handler.gs              API lifecycle only
│  ├─ sheet_crud.gs               schema resolution and Sheet CRUD
│  ├─ sheets.gs                   spreadsheet openers and scalar/date helpers
│  ├─ response.gs
│  └─ config.gs
├─ 020_schema/                    central UserDB and OperationDB schemas
├─ 030_auth/
│  ├─ auth_context.gs             login and permission guards
│  ├─ 031_users/
│  │  ├─ users_service.gs
│  │  └─ users_sheet_dao.gs
│  ├─ 032_roles/
│  │  ├─ roles_service.gs
│  │  └─ roles_sheet_dao.gs
│  └─ 033_permissions/
│     ├─ permissions_service.gs
│     └─ permissions_sheet_dao.gs
├─ 040_login/
│  ├─ login_api.gs
│  ├─ login_service.gs
│  ├─ login_session.gs
│  └─ login_cache.gs
├─ 050_event/
│  ├─ 050_common/
│  ├─ 051_events/
│  │  ├─ events_api.gs
│  │  ├─ events_service.gs
│  │  └─ events_sheet_dao.gs
│  ├─ 052_applicants/
│  │  ├─ applicants_api.gs
│  │  ├─ applicants_service.gs
│  │  └─ applicants_sheet_dao.gs
│  ├─ 053_attendance/
│  │  ├─ attendance_api.gs
│  │  ├─ attendance_service.gs
│  │  └─ attendance_sheet_dao.gs
│  ├─ 054_refunds/
│  │  ├─ refunds_api.gs
│  │  ├─ refunds_service.gs
│  │  └─ refunds_sheet_dao.gs
│  └─ 055_files/
│     └─ event_files_service.gs
├─ 060_accounting/
│  ├─ 060_common/
│  │  └─ accounting_common.gs
│  ├─ 061_ledger/
│  │  ├─ ledger_api.gs
│  │  ├─ ledger_service.gs
│  │  └─ ledger_sheet_dao.gs
│  ├─ 062_reconciliation/
│  │  ├─ reconciliation_api.gs
│  │  └─ reconciliation_service.gs
│  ├─ 063_settlement/
│  │  ├─ settlement_api.gs
│  │  └─ settlement_service.gs
│  └─ 064_evidence/
│     ├─ evidence_api.gs
│     ├─ evidence_service.gs
│     └─ evidence_sheet_dao.gs
├─ 070_settings/
│  ├─ settings_api.gs
│  └─ settings_service.gs
└─ Code.js

scripts/
└─ verify-server-architecture.js
```

## Task 1: Freeze the Current Server Contract

**Files:**
- Create: `scripts/verify-server-architecture.js`
- Read: `src/000_server/Code.js`
- Read: all `src/**/*_js.html`
- Read: all `src/000_server/**/*.gs` and `src/000_server/**/*.js`

**Interfaces:**
- Consumes: the current route map, public server functions, client dynamic `google.script.run` calls, and server function declarations.
- Produces: a repeatable command `node scripts/verify-server-architecture.js` that exits nonzero on broken routes, missing public calls, duplicate functions, arrow functions, or forbidden direct Sheet access.

- [ ] **Step 1: Create a failing contract verifier with the baseline route and API names**

Create `scripts/verify-server-architecture.js` with Node built-ins only. It must recursively read `src`, extract `function <name>(` declarations, and assert these public functions remain present:

```javascript
var requiredPublicFunctions = [
  'api_checkLogin',
  'api_getCurrentUser',
  'api_getMyPermissions',
  'api_checkUserDbIntegrity',
  'api_checkOperationDbIntegrity',
  'api_getEventList',
  'api_getEventForEdit',
  'api_getEventDetail',
  'api_createEvent',
  'api_updateEvent',
  'api_updateEventStatus',
  'api_closeEvent',
  'api_getApplicantList',
  'api_getApplicantDetail',
  'api_processApplicant',
  'api_getAttendanceList',
  'api_applyAttendanceChanges',
  'api_getEventRefundList',
  'api_getLedgerDatabaseInfo',
  'api_getLedgerList',
  'api_getLedgerDetail',
  'api_getLedgerEventOptions',
  'api_createLedgerEntry',
  'api_saveLedgerDraft',
  'api_processLedgerEntry',
  'api_getSettlementSummary',
  'api_getEvidenceFileContent'
];

var requiredPages = [
  'login', 'main',
  'accounting', 'accounting_ledger',
  'accounting_reconciliation', 'accounting_settlement',
  'event', 'event_form', 'event_detail',
  'settings', 'settings_users',
  'settings_roles', 'settings_permissions'
];
```

The script must also parse every server `.gs` and `.js` source with `new vm.Script(source, { filename: file })` and:

```javascript
assertNoDuplicateFunctions(serverFiles);
assertNoArrowFunctions(serverFiles);
assertRoutesAndTemplatesExist(codeText, requiredPages);
assertPublicFunctionsExist(serverFiles, requiredPublicFunctions);
```

Add a temporary required function named `apiHandler_` so the first run fails before Core is implemented.

- [ ] **Step 2: Run the verifier and confirm the intended failure**

Run:

```bash
node scripts/verify-server-architecture.js
```

Expected: nonzero exit with `Missing function: apiHandler_` and no baseline route or public API failures.

- [ ] **Step 3: Record the current client call mechanism**

Confirm that client calls made through bracket access such as `[fn].apply(google.script.run, args)` are included by maintaining the explicit `requiredPublicFunctions` contract. Do not rewrite client files.

- [ ] **Step 4: Commit the contract verifier**

```bash
git add scripts/verify-server-architecture.js
git commit -m "test: freeze Apps Script server contract"
```

## Task 2: Implement Core API Lifecycle and Sheet CRUD

**Files:**
- Create: `src/000_server/010_core/api_handler.gs`
- Create: `src/000_server/010_core/sheet_crud.gs`
- Modify: `src/000_server/010_core/sheets.gs`
- Modify: `src/000_server/030_auth/auth_context.gs`
- Modify: `scripts/verify-server-architecture.js`

**Interfaces:**
- Consumes: `requireLoginContext_()`, central Schema functions, `DB_CONFIG`, and existing cell conversion helpers.
- Produces: `apiHandler_(options)`, `requirePermission_(context, permission)`, `sheetFindAll_(database, tableKey)`, `sheetFindById_(database, tableKey, id)`, `sheetInsert_(database, tableKey, item)`, and `sheetUpdateById_(database, tableKey, id, changes)`.

- [ ] **Step 1: Extend the verifier with Core boundary checks**

Add checks that fail when:

```javascript
var requiredCoreFunctions = [
  'apiHandler_',
  'requirePermission_',
  'sheetFindAll_',
  'sheetFindById_',
  'sheetInsert_',
  'sheetUpdateById_'
];
```

Also assert that `src/000_server/010_core` contains no literal references to `event`, `accounting`, or `settings`, excluding comments in the verification script itself.

- [ ] **Step 2: Run the verifier and confirm Core failures**

Run `node scripts/verify-server-architecture.js`.

Expected: missing Core functions and missing Core files.

- [ ] **Step 3: Implement `apiHandler_()`**

Create `api_handler.gs` with this lifecycle and no response wrapping:

```javascript
function apiHandler_(options) {
  var settings = options || {};
  try {
    var context = settings.requireLogin ? requireLoginContext_() : null;
    if (settings.permission) {
      requirePermission_(context, settings.permission);
    }
    var request = settings.parse ? settings.parse(settings.input) : settings.input;
    return settings.service(request, context);
  } catch (error) {
    console.error(
      '[' + (settings.operation || 'unknown') + '] ' +
      (error && error.stack ? error.stack : error)
    );
    throw error;
  }
}
```

Validate at the top that `settings.service` is a function and throw a clear configuration error when it is missing.

- [ ] **Step 4: Implement Auth permission evaluation without changing current domain access**

Add these interfaces to `auth_context.gs`:

```javascript
function requirePermission_(context, permission) {
  if (!context || !context.ok) throw createAuthError_('NO_SESSION', '로그인이 필요합니다.');
  if (context.isAdmin) return true;
  if (hasPermission_(context, permission)) return true;
  throw createAuthError_('FORBIDDEN', '해당 업무를 수행할 권한이 없습니다.');
}

function hasPermission_(context, permission) {
  var permissionId = permission && permission.id ? String(permission.id) : '';
  var screenId = permissionId ? 'perm_' + permissionId : '';
  var action = permission && permission.action ? String(permission.action) : 'view';
  var byScreen = context && context.permissions ? context.permissions.byScreen || {} : {};
  return !!(screenId && byScreen[screenId] && byScreen[screenId][action]);
}
```

Use an internal `createAuthError_(code, message)` helper so `error.code` remains available. Do not add Event or Accounting permission declarations in this task.

- [ ] **Step 5: Implement database and table resolution in `sheet_crud.gs`**

Define:

```javascript
function getDatabaseDefinition_(database) {
  if (database === 'user') {
    return { spreadsheet: openUserSpreadsheet_, schema: getUserDbTableSchema_ };
  }
  if (database === 'operation') {
    return { spreadsheet: openOperationSpreadsheet_, schema: getOperationDbTableSchema_ };
  }
  throw new Error('지원하지 않는 데이터베이스입니다: ' + database);
}
```

Implement a shared table reader that resolves the central Schema, verifies required headers by name, reads the used rectangle once with `getValues()`, and maps rows to field-key objects with `_rowNumber`.

- [ ] **Step 6: Implement the four CRUD methods with batched writes**

Requirements:

```text
sheetFindAll_: one used-range read, field-key object output
sheetFindById_: first Schema primary key only, null when absent
sheetInsert_: one setValues call at the next row, ScriptLock around write
sheetUpdateById_: one read, one setValues call for the entire matching row, ScriptLock around read-modify-write
```

Do not implement delete. Preserve unknown fields by reading the existing row before update. Throw when the table has no primary key or the target row does not exist.

- [ ] **Step 7: Reduce `sheets.gs` to openers and scalar helpers**

Move generic table read/write functions into `sheet_crud.gs`. Keep compatibility wrappers temporarily:

```javascript
function readOperationTableRows_(tableKey) {
  return sheetFindAll_('operation', tableKey);
}
```

Keep these helpers in `sheets.gs`: spreadsheet openers, normalization, active-state checks, date conversion, client cell conversion, and current timestamp.

- [ ] **Step 8: Run Core verification**

Run:

```bash
node scripts/verify-server-architecture.js
git diff --check
```

Expected: all Core function and boundary checks pass; baseline APIs and routes remain unchanged.

- [ ] **Step 9: Commit Core**

```bash
git add src/000_server/010_core src/000_server/030_auth/auth_context.gs scripts/verify-server-architecture.js
git commit -m "refactor: add API lifecycle and Sheet CRUD core"
```

## Task 3: Convert Event Domain

**Files:**
- Rename: Event API and Service files under `src/000_server/050_event/051_events` through `055_files`
- Create: `events_sheet_dao.gs`, `applicants_sheet_dao.gs`, `attendance_sheet_dao.gs`, `refunds_sheet_dao.gs`
- Modify: Event APIs and Services
- Modify: `scripts/verify-server-architecture.js`

**Interfaces:**
- Consumes: `apiHandler_()`, OperationDB Sheet CRUD, existing Event request parsing, pagination, constants, and file helpers.
- Produces: unchanged Event public API contract and domain DAO functions such as `findAllEvents_()`, `findEventById_()`, `insertEvent_()`, and `updateEvent_()`.

- [ ] **Step 1: Add Event architecture failures to the verifier**

Assert every Event public API file calls `apiHandler_`, every Event Service avoids `readOperationTable*`, `appendOperationTableRow_`, `updateOperationTableRow_`, and `SpreadsheetApp`, and every Event DAO calls only `sheetFind*`, `sheetInsert_`, or `sheetUpdateById_` for Sheet access.

- [ ] **Step 2: Run the verifier and confirm Event boundary failures**

Run `node scripts/verify-server-architecture.js`.

Expected: current Event Service files fail for direct Core Sheet helper usage.

- [ ] **Step 3: Rename Event files without changing functions**

Use these exact names:

```text
events.gs -> events_api.gs
event_events.gs -> events_service.gs
applicants.gs -> applicants_api.gs
event_applicants.gs -> applicants_service.gs
attendance.gs -> attendance_api.gs
event_attendance.gs -> attendance_service.gs
refunds.gs -> refunds_api.gs
event_refunds.gs -> refunds_service.gs
event_files.gs -> event_files_service.gs
```

- [ ] **Step 4: Add Event DAOs**

Create focused functions, including:

```javascript
function findAllEvents_() { return sheetFindAll_('operation', 'events'); }
function findEventById_(id) { return sheetFindById_('operation', 'events', id); }
function insertEvent_(item) { return sheetInsert_('operation', 'events', item); }
function updateEvent_(id, changes) { return sheetUpdateById_('operation', 'events', id, changes); }
```

Define equivalent functions for `eventApplications`, `eventAttendance`, `eventRefunds`, and `eventPayments`. Filtering by `eventId` or `applicationId` belongs in the relevant DAO, using a single `sheetFindAll_()` result per DAO call.

- [ ] **Step 5: Convert Event APIs to the Handler**

Example:

```javascript
function api_getEventList(input) {
  return apiHandler_({
    operation: 'getEventList',
    input: input,
    requireLogin: true,
    parse: parseEventRequest_,
    service: getEventListData_
  });
}
```

Do not set `permission` yet because approved Event permission IDs are not present in the current UserDB contract. Preserve every current public function name and return value.

- [ ] **Step 6: Convert Event Services to DAO calls**

Replace direct table helper calls one flow at a time: Events, Applicants, Attendance, Refunds, then Event file metadata. Keep business filtering, DTO composition, status rules, comments, and TODOs in their existing Services.

- [ ] **Step 7: Verify Event contract and syntax**

Run:

```bash
node scripts/verify-server-architecture.js
git diff --check
```

Expected: all Event APIs remain present; no Event Service directly accesses Core Sheet helpers; no duplicate functions or arrows.

- [ ] **Step 8: Commit Event conversion**

```bash
git add src/000_server/050_event scripts/verify-server-architecture.js
git commit -m "refactor: package event server by domain"
```

## Task 4: Convert Accounting Domain

**Files:**
- Create: `src/000_server/060_accounting/060_common/accounting_common.gs`
- Create: `061_ledger/ledger_api.gs`, `ledger_service.gs`, `ledger_sheet_dao.gs`
- Create: `062_reconciliation/reconciliation_api.gs`, `reconciliation_service.gs`
- Create: `063_settlement/settlement_api.gs`, `settlement_service.gs`
- Create: `064_evidence/evidence_api.gs`, `evidence_service.gs`, `evidence_sheet_dao.gs`
- Remove after verification: old root Accounting files
- Modify: `scripts/verify-server-architecture.js`

**Interfaces:**
- Consumes: Core Handler and CRUD, OperationDB Schema, existing ledger and evidence behavior.
- Produces: unchanged Accounting public APIs and ledger/evidence DAO boundaries.

- [ ] **Step 1: Add Accounting boundary checks**

Assert Accounting Services contain no `SpreadsheetApp`, `readOperationTable*`, `appendOperationTableRow_`, or `updateOperationTableRow_`. Assert every existing `api_*` Accounting function remains declared once.

- [ ] **Step 2: Run the verifier and confirm Accounting failures**

Run `node scripts/verify-server-architecture.js`.

Expected: current `accounting_service.gs`, `ledger.gs`, `settlement.gs`, and `evidence.gs` violate the target boundaries.

- [ ] **Step 3: Move common pure helpers**

Move `groupBy_`, filter normalization, ID generation, and DTO conversion only when they are shared by two Accounting subdomains. Keep ledger-only helpers in `ledger_service.gs`.

- [ ] **Step 4: Add Ledger and Evidence DAOs**

Define exact data access functions:

```javascript
function findAllLedgerEntries_() { return sheetFindAll_('operation', 'ledger'); }
function findLedgerEntryById_(id) { return sheetFindById_('operation', 'ledger', id); }
function insertLedgerEntry_(item) { return sheetInsert_('operation', 'ledger', item); }
function updateLedgerEntry_(id, changes) { return sheetUpdateById_('operation', 'ledger', id, changes); }
function findAllEvidence_() { return sheetFindAll_('operation', 'evidence'); }
function insertEvidence_(item) { return sheetInsert_('operation', 'evidence', item); }
```

Event option lookup must use an Event Service or a small domain read interface, not the Event DAO directly. Add `listEventOptionsForAccounting_()` to the Event Service and consume that from Accounting.

- [ ] **Step 5: Convert Accounting public APIs to `apiHandler_()`**

Use `requireLogin: true`, preserve inputs and return shapes, and omit `permission` until Accounting permission IDs are approved in UserDB.

- [ ] **Step 6: Separate Reconciliation and Settlement Services**

Move only existing behavior. Do not implement missing reconciliation writes or new settlement calculations. Keep unimplemented screen calls disabled with their existing TODO comments.

- [ ] **Step 7: Remove old root files after reference verification**

Run `rg` for every moved function name. Remove old files only after each function exists exactly once in the new structure.

- [ ] **Step 8: Verify and commit Accounting conversion**

Run:

```bash
node scripts/verify-server-architecture.js
git diff --check
```

Then commit:

```bash
git add src/000_server/050_event src/000_server/060_accounting scripts/verify-server-architecture.js
git commit -m "refactor: package accounting server by domain"
```

## Task 5: Convert Auth and Login Domains

**Files:**
- Create: `src/000_server/030_auth/031_users/users_service.gs`
- Create: `src/000_server/030_auth/031_users/users_sheet_dao.gs`
- Create: `src/000_server/030_auth/032_roles/roles_service.gs`
- Create: `src/000_server/030_auth/032_roles/roles_sheet_dao.gs`
- Create: `src/000_server/030_auth/033_permissions/permissions_service.gs`
- Create: `src/000_server/030_auth/033_permissions/permissions_sheet_dao.gs`
- Modify: `src/000_server/030_auth/auth_context.gs`
- Create: `src/000_server/040_login/login_service.gs`
- Modify: `src/000_server/040_login/login_api.gs`
- Preserve: `login_session.gs`, `login_cache.gs`
- Remove after verification: old `users.gs`, `roles.gs`, `permissions.gs`, `login_context.gs`

**Interfaces:**
- Consumes: UserDB Sheet CRUD, Schema, Session, current cache helpers.
- Produces: unchanged login API responses, unchanged login cache behavior, and Auth Service/DAO boundaries.

- [ ] **Step 1: Add Auth/Login boundary checks**

Assert Auth/Login Services do not call `SpreadsheetApp` or `readTableRows_`; Auth DAOs use `sheetFindAll_('user', tableKey)`; cache and Session remain confined to Login files.

- [ ] **Step 2: Run the verifier and confirm expected failures**

Expected: current `users.gs`, `roles.gs`, and `permissions.gs` directly use legacy table reads.

- [ ] **Step 3: Create UserDB DAOs**

Define:

```javascript
function findAllUserRows_() { return sheetFindAll_('user', 'users'); }
function findAllRoleRows_() { return sheetFindAll_('user', 'roles'); }
function findAllUserRoleRows_() { return sheetFindAll_('user', 'userRoles'); }
function findAllPermissionRows_() { return sheetFindAll_('user', 'permissions'); }
function findAllRolePermissionRows_() { return sheetFindAll_('user', 'rolePermissions'); }
```

Because generic CRUD returns field-key objects, update Services to use `row.email`, `row.status`, `row.id`, and other Schema keys instead of physical header strings.

- [ ] **Step 4: Split Auth Services by Users, Roles, and Permissions**

Move DTO conversion and indexes to their domain Services. Preserve these callable internal function names where existing Login and Settings code depends on them:

```text
findUserRowByEmail_
toUserDto_
getRolesById_
getActiveRoleIdsByEmail_
summarizeRoleForUser_
listUsersForSettings_
listRolesForSettings_
buildPermissionTreeFromDb_
buildPermissionsByRoleFromDb_
```

- [ ] **Step 5: Move login context construction into `login_service.gs`**

Move `getSessionUserContext_`, `buildSessionUserContextFromDb_`, `isAdminRoleSet_`, `buildUserPermissionsFromDb_`, and `buildMenusFromPermissions_` while preserving their runtime order and comments. Do not change cache key, TTL, lock timeout, or fallback behavior.

- [ ] **Step 6: Preserve the direct Login API response flow**

Keep `api_checkLogin()`, `api_getCurrentUser()`, and `api_getMyPermissions()` as direct Login Service flows. They must continue returning failure response objects instead of throwing because `doGet(e)` and current clients inspect `result.ok`. The Handler is not used for these three APIs in this redesign.

- [ ] **Step 7: Verify login data path**

Statically trace:

```text
Session email
-> login cache
-> findUserRowByEmail_
-> active user
-> active user role
-> role and permission integrity
-> context cache
-> existing login response
```

Run `node scripts/verify-server-architecture.js` and `git diff --check`.

- [ ] **Step 8: Commit Auth/Login conversion**

```bash
git add src/000_server/030_auth src/000_server/040_login scripts/verify-server-architecture.js
git commit -m "refactor: package auth and login server domains"
```

## Task 6: Convert Settings and Enforce Existing Permissions

**Files:**
- Create: `src/000_server/070_settings/settings_api.gs`
- Create: `src/000_server/070_settings/settings_service.gs`
- Remove after verification: `src/000_server/settings.gs`
- Modify: `scripts/verify-server-architecture.js`

**Interfaces:**
- Consumes: `apiHandler_()`, Auth Services, `okResponse_()`, existing `settings_view` permission.
- Produces: unchanged public Settings function names and response objects with centralized login and permission enforcement.

- [ ] **Step 1: Add Settings contract checks**

Add these existing public functions to the explicit contract even though they do not currently use the `api_` prefix:

```javascript
var settingsPublicFunctions = [
  'loadSettingsHomeData',
  'loadSettingsUsersData',
  'loadSettingsRolesData',
  'loadSettingsPermissionsData'
];
```

Preserve their names because client files already call them dynamically.

- [ ] **Step 2: Run verifier and confirm Settings packaging failure**

Expected: `src/000_server/settings.gs` is outside the target domain folder.

- [ ] **Step 3: Move Settings data assembly into Service**

Move `buildSettingsBaseData_()` and page-specific assembly to `settings_service.gs`. Keep all current response fields and static app/database metadata unchanged.

- [ ] **Step 4: Use Handler for Settings entry functions**

Each Settings public entry function declares:

```javascript
return apiHandler_({
  operation: 'loadSettingsHomeData',
  requireLogin: true,
  permission: { id: 'settings_view', action: 'view' },
  service: loadSettingsHomeData_
});
```

Because current Settings public functions return failure objects, add this narrowly scoped `onError` branch to `apiHandler_()`:

```javascript
if (settings.onError) return settings.onError(error);
throw error;
```

Use `onError` to return `failResponse_(error.code, error.message)` and preserve the existing client contract. Do not globally wrap unrelated APIs.

- [ ] **Step 5: Preserve administrator behavior**

`requirePermission_()` already allows `context.isAdmin`. Non-admin users require the active `settings_view` role-permission link. Keep page-specific user, role, and permission data assembly unchanged.

- [ ] **Step 6: Verify and commit Settings conversion**

Run:

```bash
node scripts/verify-server-architecture.js
git diff --check
```

Then commit:

```bash
git add src/000_server/010_core/api_handler.gs src/000_server/070_settings src/000_server/settings.gs scripts/verify-server-architecture.js
git commit -m "refactor: package settings server domain"
```

## Task 7: Remove Compatibility Wrappers and Update Documentation

**Files:**
- Modify: `src/000_server/010_core/sheets.gs`
- Modify: `src/000_server/010_core/sheet_crud.gs`
- Modify: `src/000_server/Code.js` only if formatting or comments need alignment; route values must not change
- Modify: `README.md`
- Modify: `directory_docs/000_server.md`
- Modify: `docs/development-workflow.md`
- Modify: domain documentation files
- Modify: `scripts/verify-server-architecture.js`

**Interfaces:**
- Consumes: all converted domains.
- Produces: final architecture with no legacy Sheet wrappers or stale documentation.

- [ ] **Step 1: Add final forbidden-wrapper checks**

Fail if any server file contains calls to:

```text
readOperationTableRows_
readOperationTableClientRows_
findOperationTableRowById_
appendOperationTableRow_
updateOperationTableRow_
updateOperationTableRowByNumber_
withOperationWriteLock_
```

- [ ] **Step 2: Run verifier and identify remaining callers**

Run `node scripts/verify-server-architecture.js` and use `rg` to list each remaining caller. Migrate each caller to a domain DAO before deleting a compatibility wrapper.

- [ ] **Step 3: Remove legacy wrappers**

Delete only wrappers with zero callers. Keep scalar/date helpers in `sheets.gs`. Confirm every function declaration remains unique.

- [ ] **Step 4: Verify route and client API compatibility**

Confirm all `Code.js` route keys and template targets match the baseline contract and all client dynamic calls resolve to one server function. Do not rename `loadSettings*` functions in this redesign.

- [ ] **Step 5: Update architecture documentation**

Document:

```text
Package by Domain
API -> Handler -> Service -> DAO -> Sheet CRUD
central Schema ownership
Handler login and permission lifecycle
Event/Accounting permission-data limitation
public API and route compatibility policy
```

- [ ] **Step 6: Run the full local verification gate**

Run:

```bash
node scripts/verify-server-architecture.js
git diff --check
git status --short
```

The verifier must parse every server `.gs` and `.js` file with `vm.Script`; this is the required local syntax check. Do not claim deployed behavior without `clasp push` and web-app testing.

- [ ] **Step 7: Commit final cleanup and docs**

```bash
git add src/000_server README.md directory_docs docs scripts/verify-server-architecture.js
git commit -m "docs: finalize server domain architecture"
```

## Final Acceptance Checklist

- [ ] Every baseline route points to the same template file as before.
- [ ] Every baseline public server function exists exactly once.
- [ ] Existing public inputs and return shapes are preserved.
- [ ] Core contains no domain-specific dependency.
- [ ] Services contain no direct `SpreadsheetApp` access.
- [ ] Domain DAOs are the only domain files that call Sheet CRUD.
- [ ] Sheet CRUD uses the central UserDB or OperationDB Schema.
- [ ] Writes use ScriptLock and batched row writes.
- [ ] Settings uses the existing permission data through `apiHandler_()`.
- [ ] Event and Accounting remain login-protected without unapproved permission IDs.
- [ ] Login Session and cache behavior are unchanged.
- [ ] No arrow functions, duplicate functions, stale wrappers, or removed references remain.
- [ ] Local verification passes.
- [ ] Apps Script deployment remains untouched until explicitly requested.
