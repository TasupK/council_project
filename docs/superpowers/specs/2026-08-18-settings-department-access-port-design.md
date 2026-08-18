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

### Server

Extend the user DTO with:

```text
- departmentId
- department
```

`department` is the resolved human-readable Department name and remains empty when unassigned or unresolved.

`loadSettingsUsersData()` should add the active Department option list needed by the UI while preserving existing response fields.

The existing Settings user mutation path, if present, owns the assignment operation. If the current code has no usable user mutation path, add the smallest Settings user mutation service/API needed specifically to update `departmentId`; do not add Department CRUD.

Mutation rules:

- admin/settings authorization required using existing Settings authorization pattern
- blank `departmentId` means unassigned
- nonblank `departmentId` must resolve to an active Department
- update only the targeted user row and existing metadata fields expected by the current user-update convention
- invalidate login context cache for the affected user because the current-user DTO can expose department information

### Frontend

Existing Settings Users already displays a `소속부서` column. Connect it to real data.

Add a department selector to the existing user edit flow rather than creating a second user-management screen.

If the current user page is still read-only at implementation time, add only the smallest row/edit interaction required for department assignment; do not expand this phase into general user CRUD redesign.

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

Recommended shape:

```text
{
  summary: {
    totalUsers,
    activeUsers,
    departmentCount,
    roleCount
  },
  executives: [...],
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

### Hierarchy and ordering

The old branch's visual idea is retained: executives at the top, then department groups and their members.

However, role-name text matching such as `name.includes('국장')` must not become a durable IAM business rule.

For this first phase:

- use existing role metadata for display
- use stable Department `sortOrder` for department ordering
- use a deterministic presentation-only member sort fallback such as role name then user name
- do not add `hierarchyLevel`, `positionOrder`, or a new position domain yet

If exact chair/director/deputy hierarchy becomes a confirmed business requirement later, model it explicitly in a follow-up spec.

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
- executive block when identifiable from current data
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

The implementation must map each route family to the existing IAM permission catalog/screen nodes actually used in `permissions.byScreen`; do not invent a parallel authorization store.

Add a helper conceptually equivalent to:

```text
resolvePageAccess_(page, context)
```

Rules:

1. `login` is public.
2. `mypage` requires successful authentication but no business-domain permission.
3. `isAdmin` bypasses domain checks.
4. Other protected pages require effective `menu` or `view` access for the mapped business area.
5. Unknown/unauthorized protected routes must not render the requested business page.

Unauthorized UX should be explicit. Prefer a small shared `403 / 권한 없음` page or an equivalent protected error view over redirecting to login, because authentication succeeded and authorization failed.

### Security boundary

Server routing is authoritative.

Client-side hiding does not replace server checks.

---

## 5. Sidebar Visibility

The shared shell should receive or fetch the current user's effective menu/area access from existing Auth/IAM APIs.

Use that data to hide/show:

- Main
- Accounting
- Student Fee group
- Event
- Settings

Settings must no longer rely solely on `APP_IS_ADMIN` for visibility. Admin remains an allow-all case, but a non-admin with explicit Settings access should see Settings.

For grouped pages, visibility is based on the domain-level access resolved from effective IAM permissions. Subpages do not each require independent sidebar entries unless they already exist.

The sidebar only mirrors server authorization. A stale or manipulated client cannot bypass the server route guard.

---

## 6. Cache and Session Implications

Do not port the source branch's global `loadAllData()` browser cache.

Continue using the current session/login-context cache model.

Department assignment changes may affect current-user presentation, so the affected user's login context cache must be invalidated on assignment mutation.

Department list changes are out of scope because Department CRUD is out of scope.

---

## 7. Error Handling

Department reads:

- missing Department sheet/schema should fail through existing DB/schema error conventions, not silently fabricate production departments
- unassigned user is valid and appears under `미배정`
- stale/missing department reference should be surfaced safely as unassigned/unresolved in read models while integrity verification reports the mismatch

Department assignment:

- invalid/inactive Department -> validation failure
- unknown user -> not-found failure
- unauthorized actor -> existing Settings authorization failure

Page access:

- unauthenticated -> existing login flow
- authenticated but unauthorized -> explicit permission-denied view

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
- user DTO resolves `departmentId` and name
- unresolved department does not crash read models

### Settings user assignment
- department options are returned additively
- valid assignment updates one user
- blank assignment clears Department
- inactive/unknown Department is rejected
- affected login cache is invalidated

### Organization chart
- departments sorted by `sortOrder`
- active/unassigned users represented correctly
- role and effective permission-area summaries come from IAM data, not hard-coded maps
- screen has no Department mutation controls

### Page authorization
- unauthenticated protected route is blocked
- `mypage` works for any authenticated registered user
- admin can access all mapped domains
- permitted non-admin can access mapped domain
- non-permitted direct URL is denied

### Sidebar
- visible domains match effective server permission areas
- Settings visibility is permission-based, not admin-only
- client hiding does not alter server tests

Run the existing full repository regression suite after focused tests.

---

## 10. Explicitly Out of Scope

- Department CRUD UI/API
- precise executive/position hierarchy domain modeling
- academic year, semester, operation period
- notifications
- Drive/file integration
- global browser data cache
- replacing existing Auth/IAM APIs
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
│  │  ├─ 041_users/
│  │  ├─ 042_roles/
│  │  ├─ 043_permissions/
│  │  └─ 044_departments/       NEW
│  ├─ 070_settings/
│  │  ├─ 071_users/             department assignment extension
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

## Success Criteria

The port is successful when:

1. No legacy monolithic source-branch architecture is imported.
2. Department is a first-class IAM concept backed by UserDB schema.
3. Admins can assign a user's Department from existing user management.
4. Settings provides a read-only organization chart using current IAM data.
5. Sidebar visibility reflects effective IAM access.
6. Direct protected URLs enforce the same access server-side.
7. Existing Auth/IAM/Settings behavior remains compatible outside these additive changes.
8. Full repository regression tests pass.
