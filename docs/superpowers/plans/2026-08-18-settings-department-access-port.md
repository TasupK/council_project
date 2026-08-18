# Settings Department / IAM Access Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port Department data, read-only organization charts, user-to-department assignment, and IAM-backed page/sidebar access from `feature/settings-admin-sheets` into the current layered Google Apps Script architecture.

**Architecture:** Extend UserDB with `departments` and nullable `users.departmentId`, keep Department ownership inside IAM, expose only a narrow Settings mutation for user department assignment, and add a read-only Settings Department view. Route authorization is enforced server-side from the current authenticated IAM permission context, while the shared sidebar mirrors the same effective domain access for UX.

**Tech Stack:** Google Apps Script, HTMLService templates, vanilla JavaScript, Google Sheets-backed UserDB/IAM, Node.js VM/static regression scripts.

**Spec:** `docs/superpowers/specs/2026-08-18-settings-department-access-port-design.md`

## Global Constraints

- `feature/settings-admin-sheets` is behavior/reference only; do not merge or cherry-pick its monolithic `Code.js`, `index.html`, deployment config, or `apiV1_*` surface.
- UserDB schema owns persistence shape and referential integrity.
- IAM owns Department reads and Department identity data.
- Settings is an admin application layer over IAM and must not own Department sheet persistence.
- Department screen is read-only in this phase; no Department CRUD API/UI.
- Existing User/Role/Permission Settings modules remain intact except additive user department support.
- User management gets only the minimum mutation needed to change `departmentId`; do not expand into general user CRUD.
- Server-side authorization is authoritative; sidebar visibility is UX only.
- `mypage` remains accessible to any authenticated registered user and bypasses business-domain permissions.
- Admin remains an allow-all path.
- Do not introduce role-name string parsing as a durable hierarchy rule.
- Do not introduce global browser-wide `loadAllData()` auth/data caching.
- Academic year, semester, and operation-period settings remain out of scope.

---

## Target File Map

### Modify
- `src/000_server/020_schema/user_db_schema.gs` — add `users.departmentId` and `departments` table schema.
- `src/000_server/020_schema/user_db_integrity.gs` — validate optional user department references and duplicate Department IDs.
- `src/000_server/040_iam/041_users/users_query_service.gs` — expose `departmentId` and resolved department name in user DTOs.
- `src/000_server/070_settings/071_users/settings_users_api.gs` — return Department options and expose narrow assignment API.
- `src/000_server/070_settings/071_users/settings_users_query_service.gs` — compose Settings user rows with Department data.
- `src/000_server/Code.js` — add `settings_departments` route and server-side domain authorization.
- `src/100_common/App_Sidebar.html` — add Settings Department entry where appropriate and visibility hooks.
- `src/100_common/app_shell_js.html` — apply IAM-backed domain menu visibility and Department link.
- `src/300_settings/300_home/*` — surface Department as the first Settings item, following current home-page pattern.
- `src/300_settings/310_users/Settings_Users_View.html` — add Department filtering/edit interaction without expanding general CRUD.
- `src/300_settings/310_users/settings_users_js.html` — load Department options and perform department assignment.
- existing schema/setup scripts that materialize UserDB headers/tables, if they are separate from `user_db_schema.gs`.

### Create
- `src/000_server/040_iam/044_departments/departments_sheet_dao.gs`
- `src/000_server/040_iam/044_departments/departments_query_service.gs`
- `src/000_server/070_settings/074_departments/settings_departments_api.gs`
- `src/000_server/070_settings/074_departments/settings_departments_query_service.gs`
- `src/300_settings/340_departments/Settings_Departments.html`
- `src/300_settings/340_departments/Settings_Departments_View.html`
- `src/300_settings/340_departments/Settings_Departments_Styles.html`
- `src/300_settings/340_departments/settings_departments_js.html`
- `src/100_common/Access_Denied.html` or the smallest existing-pattern shared denied view if one already exists.
- focused tests/architecture verifiers under `scripts/` named for Department and route access.

---

### Task 1: Add Department to UserDB schema and IAM reads

**Files:**
- Modify: `src/000_server/020_schema/user_db_schema.gs`
- Modify: `src/000_server/020_schema/user_db_integrity.gs`
- Create: `src/000_server/040_iam/044_departments/departments_sheet_dao.gs`
- Create: `src/000_server/040_iam/044_departments/departments_query_service.gs`
- Modify: `src/000_server/040_iam/041_users/users_query_service.gs`
- Test: `scripts/test-department-iam.js`
- Test: `scripts/verify-auth-iam-architecture.js`

**Interfaces:**
- Produces `listDepartmentRows_(): Object[]`.
- Produces `toDepartmentDto_(row): {id,name,type,sortOrder,status}`.
- Produces `getDepartmentsById_(): Object<string,DepartmentDto>`.
- Produces `listActiveDepartments_(): DepartmentDto[]` sorted by `sortOrder`, then name.
- Extends `toUserDto_()` with `departmentId` and `department` while preserving all current fields.

- [ ] **Step 1: Write failing schema/IAM tests**

Add tests that assert:

```js
assert.equal(getUserDbFields_('users').departmentId, '부서ID');
assert.equal(getUserDbFields_('departments').id, '부서ID');
assert.equal(getUserDbFields_('departments').name, '부서명');
assert.equal(getUserDbFields_('departments').type, '부서유형');
assert.equal(getUserDbFields_('departments').sortOrder, '정렬순서');
assert.equal(getUserDbFields_('departments').active, '활성여부');
```

Test `toDepartmentDto_()` with active/inactive rows and numeric/string sort order normalization. Test `toUserDto_()` with a known department lookup so it returns both `departmentId` and human-readable `department`. Test blank/unknown department reference returns `department: ''` without crashing.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
node scripts/test-department-iam.js
node scripts/verify-auth-iam-architecture.js
```

Expected: `test-department-iam.js` fails because Department schema/query functions do not yet exist. Architecture verifier may also fail once ownership expectations are added.

- [ ] **Step 3: Implement schema and Department IAM read layer**

Extend UserDB schema conceptually to:

```js
users.fields.departmentId = '부서ID';

departments: {
  name: '부서',
  sheetName: '부서',
  fields: {
    id: '부서ID',
    name: '부서명',
    type: '부서유형',
    sortOrder: '정렬순서',
    active: '활성여부'
  },
  primaryKey: ['id'],
  foreignKeys: []
}
```

Add the users foreign key from `departmentId` to `departments.id` only if the integrity framework supports nullable foreign keys correctly; otherwise enforce the optional reference explicitly in `user_db_integrity.gs` while keeping the schema declaration readable.

DAO owns only:

```js
function listDepartmentRows_() {
  var schema = getUserDbTableSchema_('departments');
  return readTableRows_(openUserSpreadsheet_(), schema.sheetName);
}
```

Use the actual existing sheet-read helper signatures if they differ; do not introduce a new generic storage abstraction.

Query Service owns DTO conversion, lookup, and active sorting.

Update `toUserDto_()` to resolve Department through `getDepartmentsById_()` or a supplied lookup path that avoids per-row sheet reads. Preserve every existing DTO field.

- [ ] **Step 4: Extend integrity checks**

Add checks for:
- duplicate nonblank Department IDs,
- blank user department is valid,
- nonblank user department must exist,
- unresolved references are reported as integrity issues, not fabricated.

Extend setup/header generation only where current schema machinery requires it to materialize the new sheet/column.

- [ ] **Step 5: Run focused tests and verify GREEN**

```bash
node scripts/test-department-iam.js
node scripts/verify-auth-iam-architecture.js
node scripts/test-auth-iam.js
```

Expected: all pass with zero failures.

- [ ] **Step 6: Commit**

```bash
git add src/000_server/020_schema src/000_server/040_iam scripts/test-department-iam.js scripts/verify-auth-iam-architecture.js
git commit -m "feat: add department iam model"
```

---

### Task 2: Add narrow user department assignment in Settings

**Files:**
- Modify: `src/000_server/070_settings/071_users/settings_users_api.gs`
- Modify: `src/000_server/070_settings/071_users/settings_users_query_service.gs`
- Create or modify the narrow Settings user mutation service file following the current `070_settings` mutation naming pattern.
- Modify: `src/300_settings/310_users/Settings_Users_View.html`
- Modify: `src/300_settings/310_users/settings_users_js.html`
- Test: `scripts/test-settings-departments.js`

**Interfaces:**
- `loadSettingsUsersData()` remains backward compatible and adds `departments: DepartmentDto[]`.
- Add `saveSettingsUserDepartment({email, departmentId})` or the repository's equivalent API naming convention.
- Mutation returns the standard `okResponse_`/failure response contract.

- [ ] **Step 1: Write failing Settings tests**

Test additive response:

```js
var result = loadSettingsUsersData();
assert.equal(result.ok, true);
assert.ok(Array.isArray(result.departments));
```

Test mutation rules:
- known active Department updates exactly one user,
- blank `departmentId` clears the assignment,
- unknown Department fails validation,
- inactive Department fails validation,
- unknown user fails not-found,
- non-admin actor is rejected by existing Settings authorization,
- affected user's login cache invalidation is called after a successful update.

- [ ] **Step 2: Run tests and verify RED**

```bash
node scripts/test-settings-departments.js
```

Expected: fails because Department options and assignment API do not exist.

- [ ] **Step 3: Implement minimal server mutation**

Use the existing Settings authorization entrypoint, e.g. `getAdminSettingsCurrent_()` / equivalent.

Mutation algorithm:

```text
authorize Settings actor
normalize email and departmentId
find target user row
if missing -> NOT_FOUND
if departmentId nonblank:
  resolve Department from IAM
  require active
update only users.부서ID plus existing update metadata fields
invalidate target user's login-context cache
return updated user DTO
```

Do not add user creation, role editing, status editing, or general save-user endpoints.

- [ ] **Step 4: Add minimal UI interaction**

Keep the existing users table. Add Department options from `data.departments` and the smallest row action needed to update the selected user's Department. Preferred interaction:
- Department column renders a `<select>` per row,
- changing selection calls the narrow assignment API,
- on success update local row state and show the existing Settings toast/status pattern,
- on failure restore previous selection and show existing error UI.

Do not add a full user-edit modal unless the existing page already has one by implementation time.

- [ ] **Step 5: Run focused tests and inline JS syntax checks**

```bash
node scripts/test-settings-departments.js
node scripts/test-settings.js
node --check /tmp/settings_users_js.js
```

For the last command, extract the `<script>` body from `settings_users_js.html` using the same helper/pattern used by current frontend verification scripts.

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/000_server/070_settings/071_users src/300_settings/310_users scripts/test-settings-departments.js
git commit -m "feat: assign user departments"
```

---

### Task 3: Add read-only Department organization chart

**Files:**
- Create: `src/000_server/070_settings/074_departments/settings_departments_api.gs`
- Create: `src/000_server/070_settings/074_departments/settings_departments_query_service.gs`
- Create: `src/300_settings/340_departments/Settings_Departments.html`
- Create: `src/300_settings/340_departments/Settings_Departments_View.html`
- Create: `src/300_settings/340_departments/Settings_Departments_Styles.html`
- Create: `src/300_settings/340_departments/settings_departments_js.html`
- Modify: `src/300_settings/300_home/*`
- Test: `scripts/test-settings-department-chart.js`
- Test: `scripts/verify-settings-architecture.js`
- Test: `scripts/verify-ui-system-migration.js`

**Interfaces:**
- `loadSettingsDepartmentsData()` returns the standard Settings base fields plus:

```js
{
  summary: {
    totalUsers: Number,
    activeUsers: Number,
    departmentCount: Number,
    roleCount: Number
  },
  departments: [{
    id: String,
    name: String,
    type: String,
    members: [{
      email: String,
      name: String,
      status: String,
      roles: Array,
      permissionAreas: String[]
    }]
  }],
  unassigned: MemberDto[]
}
```

No `executives` field in phase 1.

- [ ] **Step 1: Write failing organization-chart tests**

Test:
- Departments sorted by `sortOrder`, then name.
- Users assigned by `departmentId`.
- Blank/unresolved Department users appear in `unassigned`.
- Summary counts are correct.
- Member roles come from IAM role DTOs.
- `permissionAreas` are derived from effective IAM permission data, never hard-coded role maps.
- The API rejects unauthorized Settings callers.

Frontend/static test must assert the Department screen contains no create/edit/delete Department controls.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
node scripts/test-settings-department-chart.js
node scripts/verify-settings-architecture.js
```

Expected: chart API/files are missing.

- [ ] **Step 3: Implement Settings composition service**

`settings_departments_query_service.gs` may depend on IAM query services but must not read Sheets directly.

Compose:

```text
active Departments
all Settings-visible users
role map / user-role map
current effective permission data needed to summarize each member's allowed business areas
```

Keep role-name sorting presentation-only and deterministic. Do not infer chair/director hierarchy from strings.

- [ ] **Step 4: Implement read-only frontend**

Use the shared Settings shell and common UI styles. Show:
- four summary cards,
- Department cards in server-provided order,
- member name, roles, account status, permission-area tags,
- a `미배정` group when nonempty.

No Department mutation buttons.

Add Department as the first Settings home navigation item.

- [ ] **Step 5: Run focused and UI architecture verification**

```bash
node scripts/test-settings-department-chart.js
node scripts/verify-settings-architecture.js
node scripts/verify-ui-system-migration.js
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/000_server/070_settings/074_departments src/300_settings/340_departments src/300_settings/300_home scripts/test-settings-department-chart.js scripts/verify-settings-architecture.js scripts/verify-ui-system-migration.js
git commit -m "feat: add department organization view"
```

---

### Task 4: Enforce IAM-backed server route access

**Files:**
- Modify: `src/000_server/Code.js`
- Create or modify a focused access helper under `src/000_server/030_auth/` or `010_core/` only if that location matches current ownership; prefer Auth/IAM-adjacent ownership over putting authorization logic into Settings.
- Create: `src/100_common/Access_Denied.html` if no equivalent exists.
- Test: `scripts/test-route-access.js`
- Test: `scripts/verify-server-architecture.js`

**Interfaces:**
- Produce `resolvePageAccess_(page, context)` or an equivalent clearly named helper.
- Produce one domain mapping source used by route authorization and sidebar-access derivation where practical.

- [ ] **Step 1: Write failing route-access tests**

Cover:
- `login` public.
- unauthenticated `main`, accounting, student fee, event, settings, mypage use existing login failure path.
- authenticated `mypage` allowed without business-domain permission.
- admin allowed for every known protected route.
- permitted non-admin allowed for mapped domain.
- authenticated non-permitted direct URL returns denied page/view, not login.
- unknown business route never renders a protected feature accidentally.
- `settings_departments` maps to Settings domain authorization.

- [ ] **Step 2: Run and verify RED**

```bash
node scripts/test-route-access.js
```

Expected: current `doGet()` only checks authentication, so non-permitted direct URL test fails.

- [ ] **Step 3: Implement minimal domain mapping**

Define one explicit mapping in code, conceptually:

```js
var APP_PAGE_ACCESS = {
  main: 'main',
  accounting: 'accounting',
  accounting_ledger: 'accounting',
  accounting_reconciliation: 'accounting',
  accounting_settlement: 'accounting',
  student_fee: 'student_fee',
  student_fee_payers: 'student_fee',
  student_fee_payments: 'student_fee',
  student_fee_refunds: 'student_fee',
  event: 'event',
  event_form: 'event',
  event_detail: 'event',
  settings: 'settings',
  settings_users: 'settings',
  settings_roles: 'settings',
  settings_permissions: 'settings',
  settings_departments: 'settings'
};
```

Use the actual IAM permission screen IDs/catalog to determine domain access. Do not invent a second permission store. The helper should check effective `menu || view` grants for the mapped domain and honor `context.isAdmin`.

- [ ] **Step 4: Wire `doGet()`**

After authentication succeeds:
- attach user/title/admin data as today,
- authorize requested protected page,
- render denied view on authorization failure,
- preserve `mypage` exception.

- [ ] **Step 5: Run route/server tests**

```bash
node scripts/test-route-access.js
node scripts/test-auth-iam.js
node scripts/verify-server-architecture.js
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/000_server/Code.js src/000_server/030_auth src/100_common/Access_Denied.html scripts/test-route-access.js scripts/verify-server-architecture.js
git commit -m "feat: enforce page access permissions"
```

---

### Task 5: Mirror effective access in the shared sidebar

**Files:**
- Modify: `src/100_common/App_Sidebar.html`
- Modify: `src/100_common/app_shell_js.html`
- Modify: relevant page templates only if they need to expose additive permission/menu data to the shell.
- Test: `scripts/test-sidebar-access.js`
- Test: `scripts/verify-ui-system-migration.js`

**Interfaces:**
- Sidebar consumes existing Auth/IAM menu/effective-access data.
- Settings visibility is no longer `APP_IS_ADMIN` only; explicit effective Settings access also reveals it.
- Admin continues to see all domain navigation.

- [ ] **Step 1: Write failing sidebar tests**

Static/VM tests must verify:
- accounting link hidden without accounting access,
- student-fee group hidden without student-fee access,
- event hidden without event access,
- Settings visible for non-admin with Settings permission,
- Settings hidden for non-admin without Settings permission,
- admin sees all,
- MyPage header link remains unaffected.

- [ ] **Step 2: Run and verify RED**

```bash
node scripts/test-sidebar-access.js
```

Expected: current shell only special-cases Settings with `APP_IS_ADMIN` and leaves other domain links visible.

- [ ] **Step 3: Implement sidebar visibility from effective IAM access**

Prefer one normalized client object such as:

```js
APP_DOMAIN_ACCESS = {
  main: true,
  accounting: false,
  student_fee: true,
  event: false,
  settings: true
};
```

Populate it from server-provided current-user access or derive it from the already returned Auth/IAM permission/menu response. Avoid extra page-load RPCs if existing template/API data can provide it cleanly.

Toggle full group containers for grouped domains so inaccessible submenus are not left interactive.

- [ ] **Step 4: Run sidebar/UI verification**

```bash
node scripts/test-sidebar-access.js
node scripts/verify-ui-system-migration.js
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/100_common scripts/test-sidebar-access.js scripts/verify-ui-system-migration.js
git commit -m "feat: filter sidebar by iam access"
```

---

### Task 6: Add architecture guardrails and run full regression

**Files:**
- Modify/create: `scripts/verify-auth-iam-architecture.js`
- Modify/create: `scripts/verify-settings-architecture.js`
- Modify/create: `scripts/verify-server-architecture.js`
- Modify/create: `scripts/verify-ui-system-migration.js`
- Add any focused tests created in Tasks 1-5 to the repository's normal verification command/documentation if such a registry exists.

**Interfaces:**
- Architecture checks enforce Department ownership and forbid legacy branch patterns from entering the new modules.

- [ ] **Step 1: Add architecture assertions**

Verify:
- Department DAO exists only under `040_iam/044_departments`.
- Settings Department files do not call `SpreadsheetApp`, `openUserSpreadsheet_`, or raw sheet helpers directly.
- IAM Department files do not depend on Settings.
- no `apiV1_*`, `loadAllData()`, legacy credential/auth cache, or copied monolithic source-branch code appears in new Department modules.
- Department frontend has no create/update/delete Department calls.
- route authorization remains server-side and sidebar tests are not treated as security proof.

- [ ] **Step 2: Run all focused tests**

```bash
node scripts/test-department-iam.js
node scripts/test-settings-departments.js
node scripts/test-settings-department-chart.js
node scripts/test-route-access.js
node scripts/test-sidebar-access.js
```

Expected: zero failures.

- [ ] **Step 3: Run full repository regression**

```bash
node scripts/test-core.js
node scripts/test-auth-iam.js
node scripts/test-settings.js
node scripts/test-accounting.js
node scripts/test-event.js
node scripts/test-student-fee.js
node scripts/test-student-fee-frontend.js
node scripts/test-mypage-auth.js
node scripts/test-mypage-routing.js
node scripts/test-mypage-frontend.js
node scripts/verify-auth-iam-architecture.js
node scripts/verify-server-architecture.js
node scripts/verify-settings-architecture.js
node scripts/verify-accounting-architecture.js
node scripts/verify-event-architecture.js
node scripts/verify-student-fee-architecture.js
node scripts/verify-student-fee-frontend.js
node scripts/verify-ui-system-migration.js
node scripts/verify-mypage-architecture.js
```

If any listed script is absent because repository names changed, use the current equivalent discovered from `scripts/`; do not silently skip a domain.

Expected: all present regression scripts pass with exit code 0.

- [ ] **Step 4: Compare branch against `main`**

Confirm changed product files are limited to:
- UserDB schema/integrity,
- IAM Department/read extensions,
- Settings user Department assignment,
- Settings Department screen,
- route authorization,
- shared sidebar visibility,
- focused tests/spec/plan.

Confirm no `.clasp.json`, `appsscript.json`, root legacy `Code.js`, root `index.html`, or source-branch deployment assumptions were imported.

- [ ] **Step 5: Commit final verifier changes**

```bash
git add scripts
git commit -m "test: guard department access architecture"
```

---

## Completion Checklist

The implementation is ready for integration only when all are true:

- Department is a first-class UserDB/IAM concept.
- Existing user DTOs expose Department additively.
- Settings user management can assign/clear only Department without introducing general user CRUD.
- Department organization view is read-only and includes `미배정` users.
- No role-name hierarchy parsing became a business rule.
- `settings_departments` is protected by Settings domain permission.
- All protected business routes enforce IAM access server-side.
- Sidebar visibility mirrors the same effective access and Settings is not admin-only.
- `mypage` remains authenticated-user accessible.
- No legacy monolithic branch architecture or deployment config is imported.
- Focused tests and full repository regression suite pass.
