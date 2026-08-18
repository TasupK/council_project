# Settings Department / IAM Access Port Design

## Goal

Port the useful parts of `feature/settings-admin-sheets` into the current architecture without merging its legacy monolithic `Code.js` / `index.html` structure.

This phase covers only:

1. Department data and a read-only organization chart in Settings.
2. User-to-department assignment through the existing Settings user-management flow.
3. IAM-backed sidebar visibility and server-side page access control.

Academic year / term / operation-period settings are deferred to a later phase.

## Source Branch Treatment

`feature/settings-admin-sheets` is a behavioral reference only. Do not merge or cherry-pick its old architecture.

Do not port:

- monolithic `Code.js`
- monolithic `index.html`
- `apiV1_*`
- `loadAllData()` browser-wide cache as an auth/data source
- `.clasp.json` changes
- legacy `appsscript.json` changes
- duplicate User/Role/Permission CRUD
- placeholder business screens
- deployment-account-specific assumptions

## Architecture Principles

- UserDB schema owns persistence shape and referential integrity.
- IAM owns organization identity concepts: User, Role, Permission, Department.
- Settings is an admin/read application layer over IAM; Settings does not own Department persistence.
- Server-side authorization is authoritative; client-side menu hiding is UX only.
- Existing public API contracts should remain additive where possible.
- Do not introduce a generic repository or cross-domain shared service.

---

## 1. Department Domain Ownership

### UserDB schema

Extend the current UserDB schema with a `departments` table and a nullable `departmentId` foreign key on `users`.

Conceptual schema:

```text
users
- Google이메일 (PK)
- 성명
- 학번
- 연락처
- 부서ID (nullable FK -> departments.부서ID)
- 계정상태
- 최종수정일시
- 등록자이메일

departments
- 부서ID (PK)
- 부서명
- 부서유형
- 정렬순서
- 활성여부
```

The exact Korean sheet headers must follow the existing schema conventions. `departmentId` is nullable so unassigned users remain valid.

### IAM structure

Add:

```text
src/000_server/040_iam/044_departments/
├─ departments_sheet_dao.gs
└─ departments_query_service.gs
```

Responsibilities:

- DAO reads Department sheet rows only.
- Query Service converts rows to Department DTOs and provides ID/name lookup helpers.
- IAM must not depend on Settings.

Department DTO minimum contract:

```text
{
  id,
  name,
  type,
  sortOrder,
  status
}
```

No Department mutation API is added in this phase.

---

## 2. User Department Assignment

Department assignment is edited only in existing Settings > User Management.

The current user-management page is read-only and explicitly leaves user saving as a TODO, so this phase adds one narrow mutation only: updating a user's `departmentId`. It does not introduce general user CRUD.

### Server

Extend the user DTO with:

```text
- departmentId
- department
```

`department` is the resolved human-readable Department name and remains empty when unassigned or unresolved.

`loadSettingsUsersData()` should add the active Department option list needed by the UI while preserving existing response fields.

Add the smallest Settings user mutation service/API needed specifically to update `departmentId`. The API must delegate persistence to the existing User IAM/DAO ownership pattern rather than writing the sheet directly from Settings.

Mutation rules:

- admin/settings authorization required using the existing Settings authorization pattern
- blank `departmentId` means unassigned
- nonblank `departmentId` must resolve to an active Department
- update only the targeted user's Department field and the existing user-update metadata fields required by current persistence conventions
- invalidate login context cache for the affected user because current-user presentation can expose department information
- do not expose name/email/status/role editing through this mutation

### Frontend

Existing Settings Users already displays a `소속부서` column. Connect it to real data.

Add a small row-level Department assignment interaction to the existing user table, using the Department option list returned by `loadSettingsUsersData()`.

The interaction should edit only Department membership. Do not turn this task into a general-purpose user edit modal or user CRUD redesign.

---

## 3. Read-only Department / Organization Chart

### Settings server application layer

Add:

```text
src/000_server/070_settings/074_departments/
├─ settings_departments_api.gs
└─ settings_departments_query_service.gs
```

Responsibilities:

- require existing Settings/admin authorization
- compose Department + User + Role read models
- never read sheets directly; consume IAM query services
- never mutate Department data in this phase

Organization-chart response should be a presentation-oriented DTO, not raw sheet rows.

Required shape:

```text
{
  summary: {
    totalUsers,
    activeUsers,
    departmentCount,
    roleCount
  },
  departments: [
    {
      id,
      name,
      type,
      members: [...]
    }
  ],
  unassigned: [...]
}
```

Member minimum shape:

```text
{
  email,
  name,
  status,
  roles,
  permissionAreas
}
```

### Ordering

For this first phase:

- Department order uses stable Department `sortOrder`, then Department name as fallback.
- Member order is presentation-only and deterministic: primary role name, then user name.
- No special `회장/부회장/국장/차장` hierarchy is inferred from role-name strings.
- Do not add `hierarchyLevel`, `positionOrder`, or a new position domain yet.

If exact executive/position hierarchy becomes a confirmed business requirement later, model it explicitly in a follow-up spec instead of parsing role labels.

### Frontend

Add:

```text
src/300_settings/340_departments/
├─ Settings_Departments.html
├─ Settings_Departments_View.html
├─ Settings_Departments_Styles.html
└─ settings_departments_js.html
```

The screen is read-only.

Show:

- summary cards
- department cards/groups
- member name, roles, account status, allowed business areas
- unassigned users group

Do not add create/edit/delete Department controls.

Add Department as the first item in the Settings navigation/home list.

---

## 4. IAM-backed Page Access

### Problem

Current `doGet()` authenticates protected pages but generally does not authorize each business area. A logged-in user can therefore attempt direct URLs even when the sidebar should not expose that domain.

### Server authorization model

Add a small route-access mapping owned near routing/auth infrastructure rather than duplicating checks across pages.

Conceptual mapping:

```text
main*                -> main
accounting*          -> accounting
student_fee*         -> student_fee
event*               -> event
settings*            -> settings
mypage               -> authenticated-user exception
```

The implementation must resolve those route families against the existing IAM permission catalog and effective `permissions.byScreen`; do not create a second role/permission store or duplicate hard-coded role mappings.

Add a helper conceptually equivalent to:

```text
resolvePageAccess_(page, context)
```

Rules:

1. `login` is public.
2. `mypage` requires successful authentication but no business-domain permission.
3. `isAdmin` bypasses domain checks.
4. Other protected pages require at least one effective `menu` or `view` grant in the route's mapped business area.
5. Child routes inherit their business-area requirement from the route family.
6. Unknown/unauthorized protected routes must not render the requested business page.

Unauthorized UX is an explicit shared `403 / 권한 없음` protected view. Do not redirect an authenticated-but-unauthorized user back to login.

### Security boundary

Server routing is authoritative.

Client-side hiding does not replace server checks.

---

## 5. Sidebar Visibility

The shared shell should receive or fetch the current user's effective access through existing Auth/IAM APIs.

Use that data to hide/show:

- Main
- Accounting
- Student Fee group
- Event
- Settings

Settings must no longer rely solely on `APP_IS_ADMIN` for visibility. Admin remains allow-all, but a non-admin with explicit Settings access should see Settings.

For grouped pages, visibility is based on the same domain-level access resolver used by server routing. The client must not maintain a separate permission interpretation table with different semantics.

The sidebar only mirrors server authorization. A stale or manipulated client cannot bypass the server route guard.

---

## 6. Cache and Session Implications

Do not port the source branch's global `loadAllData()` browser cache.

Continue using the current session/login-context cache model.

Department assignment changes affect current-user presentation, so the affected user's login context cache must be invalidated after a successful assignment mutation.

Department list changes are out of scope because Department CRUD is out of scope.

---

## 7. Error Handling

Department reads:

- missing Department sheet/schema should fail through existing DB/schema error conventions, not silently fabricate production departments
- unassigned user is valid and appears under `미배정`
- stale/missing department reference should be surfaced safely as unresolved/unassigned in read models while integrity verification reports the mismatch

Department assignment:

- invalid/inactive Department -> validation failure
- unknown user -> not-found failure
- unauthorized actor -> existing Settings authorization failure

Page access:

- unauthenticated -> existing login flow
- authenticated but unauthorized -> shared permission-denied view

---

## 8. Integrity and Migration

Update UserDB schema/integrity checks so:

- `departments` is a known table
- `users.departmentId` is optional
- nonblank user department references must exist
- duplicate Department IDs are invalid

Do not auto-create organization-specific Department rows in runtime business code.

If schema setup/migration utilities already seed required table headers, extend those utilities only to create the Department table/header structure. Business Department records remain data, not hard-coded schema.

---

## 9. Testing

Add focused regression tests for:

### Department schema/IAM
- schema exposes `departments`
- `users.departmentId` exists and is nullable
- Department DAO/query ownership
- user DTO resolves `departmentId` and Department name
- unresolved Department does not crash read models

### Settings user assignment
- department options are returned additively
- valid assignment updates one user Department only
- blank assignment clears Department
- inactive/unknown Department is rejected
- affected login cache is invalidated
- mutation cannot be used to edit unrelated user fields

### Organization chart
- departments sorted by `sortOrder`
- users grouped by Department and unassigned state correctly
- member ordering is deterministic without role-name hierarchy inference
- role and effective permission-area summaries come from IAM data, not hard-coded maps
- screen has no Department mutation controls

### Page authorization
- unauthenticated protected route is blocked
- `mypage` works for any authenticated registered user
- admin can access all mapped domains
- permitted non-admin can access mapped domain
- non-permitted direct URL is denied with permission-denied view
- child routes inherit domain authorization

### Sidebar
- visible domains match the same effective access resolver as server routing
- Settings visibility is permission-based, not admin-only
- client hiding does not alter server authorization tests

Run the existing full repository regression suite after focused tests.

---

## 10. Explicitly Out of Scope

- Department CRUD UI/API
- executive/position hierarchy domain modeling
- academic year, semester, operation period
- notifications
- Drive/file integration
- global browser data cache
- replacing existing Auth/IAM APIs
- general user CRUD
- rewriting existing User/Role/Permission Settings modules
- importing source-branch deployment configuration

---

## Expected Target Structure

```text
src/
├─ 000_server/
│  ├─ 020_schema/
│  │  └─ UserDB schema + integrity extensions
│  ├─ 030_auth/
│  │  └─ existing session context/cache reused
│  ├─ 040_iam/
│  │  ├─ 041_users/             user Department field persistence/query extension
│  │  ├─ 042_roles/
│  │  ├─ 043_permissions/
│  │  └─ 044_departments/       NEW
│  ├─ 070_settings/
│  │  ├─ 071_users/             Department assignment-only extension
│  │  └─ 074_departments/       NEW read-only composition
│  └─ Code.js                   route authorization integration
│
├─ 100_common/
│  ├─ App_Sidebar.html
│  └─ app_shell_js.html
│
└─ 300_settings/
   ├─ 300_home/
   ├─ 310_users/
   └─ 340_departments/          NEW
```

A small shared permission-denied page/view may be added under the existing common/frontend structure rather than under a business domain.

## Success Criteria

The port is successful when:

1. No legacy monolithic source-branch architecture is imported.
2. Department is a first-class IAM concept backed by UserDB schema.
3. Admins can assign only a user's Department from existing user management without opening general user CRUD.
4. Settings provides a read-only Department organization view using current IAM data.
5. Sidebar visibility reflects effective IAM access.
6. Direct protected URLs enforce the same access server-side.
7. Existing Auth/IAM/Settings behavior remains compatible outside these additive changes.
8. Full repository regression tests pass.
