# Auth / MyPage Port Design

Date: 2026-08-18
Source branch: `codex/mypage-update`
Target base: current `main`

## Goal

Port the useful login/MyPage behavior from the old `codex/mypage-update` branch into the current architecture without merging the old monolithic structure. The current Auth/IAM design is authoritative; the source branch is treated only as a behavior/UI reference.

## Constraints

- Preserve the current Google-account-based login flow.
- Preserve current `030_auth` and `040_iam` ownership boundaries.
- Do not create a second user database or alternate login state.
- Do not use browser session storage as an authentication source of truth.
- MyPage is read-only for this port.
- Notification settings are out of scope.
- Prefer existing shared UI primitives and shell components.
- Preserve existing API and routing behavior outside the new MyPage route.

## Source Branch Assessment

`codex/mypage-update` diverges heavily from current `main` and is based on an older monolithic structure (`Code.js`, `index.html`, `Login.html`, `MyPage.html`). Direct merge/cherry-pick is not appropriate.

Useful source behavior:

- profile card showing current user information
- role display
- permission display
- login/authorization error feedback patterns

Source behavior explicitly rejected:

- email/password credential login
- independent `DB_URL` user spreadsheet
- `setupDatabaseSheet()`
- fallback mock user / implicit chairman role
- hard-coded role-to-permission maps
- `sessionStorage` as the user/authentication source
- notification settings persisted in User Properties
- standalone sidebar/header layout
- source `.clasp.json` and manifest changes

## Architecture

### Ownership

`030_auth` remains responsible for:

- resolving the active Google session
- validating login eligibility
- building current-user authentication context
- exposing current-user APIs

`040_iam` remains responsible for:

- users
- roles
- role assignments
- permissions
- effective permissions
- permission metadata used for display

`270_mypage` is a frontend-only read consumer of those capabilities. It does not own user, role, permission, or authentication business rules.

```text
Google Session
    ↓
030_auth
    ├─ api_checkLogin()
    ├─ api_getCurrentUser()
    └─ api_getMyPermissions()
    ↓
040_iam
    ├─ Users
    ├─ Roles
    └─ Permissions
    ↓
270_mypage
    └─ read-only presentation
```

No `mypage_service.gs`, MyPage DAO, or MyPage-owned database table is introduced.

## Target File Structure

```text
src/
├─ 000_server/
│  ├─ 030_auth/
│  ├─ 040_iam/
│  └─ Code.js
├─ 100_common/
│  ├─ App_Header.html
│  └─ app_shell_js.html
└─ 270_mypage/
   ├─ MyPage.html
   ├─ MyPage_View.html
   ├─ MyPage_Styles.html
   └─ mypage_js.html
```

## Routing

Add a protected `mypage` route in `src/000_server/Code.js`:

```text
mypage -> 270_mypage/MyPage
```

`mypage` must be covered by the same login guard as `main`, `accounting*`, `student_fee*`, `event*`, and `settings*`.

Unauthenticated, unregistered, inactive, role-less, or integrity-invalid users do not receive mock data. The route follows the existing login failure behavior and displays the existing Auth message through the login page.

## Entry Point

The shared header user card is the sole primary entry point for MyPage in this port.

Current elements:

- `appUserName`
- `appUserTitle`
- containing `.user-card`

The user card becomes an accessible link or button that navigates to `buildAppPageUrl('mypage')`.

Do not add a duplicate MyPage menu item to the sidebar.

## MyPage Screen

The screen has three read-only sections.

### 1. My Information

Display data already available from `api_getCurrentUser()`:

- name
- Google account email
- department
- account status
- representative role/title
- avatar initial derived from display name

### 2. My Roles

Display all roles returned by the current Auth DTO. The current login role summary DTO intentionally contains only:

- role ID
- role name

That is sufficient for this port. MyPage does not re-query the role sheet and does not widen the role summary DTO only to show decorative metadata such as description/type/update audit fields.

### 3. My Permissions

Display effective permissions from IAM without interpreting role names or permission IDs on the client.

The current `permissions` object contains:

- `byScreen`: effective booleans (`menu`, `view`, `edit`, `approve`, `export`) keyed by permission screen ID
- `menus`: accessible menu groups with IDs and names

`byScreen` alone is not human-readable because its keys are `perm_<permissionId>`. Therefore IAM must expose the already-owned permission metadata alongside the effective booleans.

`api_getMyPermissions()` is extended additively with:

```text
permissionDetails[]
- id
- screenId
- area
- action
- name
- description
- grants
  - menu
  - view
  - edit
  - approve
  - export
```

`permissionDetails` is produced server-side from the IAM permission catalog plus the current user's merged effective permissions. Only permissions for which at least one grant is true are returned.

This is an IAM/Auth API DTO enhancement, not a MyPage-owned permission model. Existing `roles` and `permissions` response fields remain unchanged for backward compatibility.

Presentation may group permission details by `area` and show the granted actions. MyPage must not contain a hard-coded permission map.

## API Contract

No new MyPage-specific server API is introduced.

Frontend calls:

```text
api_getCurrentUser()
api_getMyPermissions()
```

The screen may request them in parallel.

`api_getCurrentUser()` remains the source for profile and assigned role summaries.

`api_getMyPermissions()` remains the source for effective permissions and is extended additively:

```text
{
  ok: true,
  roles: [...],
  permissions: {
    byScreen: {...},
    menus: [...]
  },
  permissionDetails: [...]
}
```

The frontend does not merge permissions by role name and does not query Sheets directly.

## Shared UI Integration

`MyPage.html` uses the same shell composition pattern as the current domain pages:

- `100_common/App_Styles`
- `100_common/App_Header`
- `100_common/App_Sidebar`
- `100_common/app_shell_js`
- page-specific `MyPage_Styles`
- page-specific `mypage_js`

The old branch's standalone header/sidebar CSS is not copied.

Use existing shared primitives such as page heads, cards, badges, loading states, empty/error states where appropriate. Page-specific CSS owns only MyPage layout details.

`APP_CURRENT_PAGE = 'mypage'` is supported by the shell. No sidebar item needs an active state for MyPage because entry is through the header user card.

## Authentication and Error Handling

Current Auth errors remain authoritative:

- `NO_SESSION`
- `NOT_REGISTERED`
- `INACTIVE`
- `NO_ROLE`
- `LOGIN_DB_INTEGRITY_ERROR`

Route-level login failure uses the existing login page flow.

If an API call fails after MyPage has rendered, show a page-level error state/toast using the existing client server-call pattern. Never substitute mock profile or permission data.

## Security

- The client cannot request another user's profile by ID/email.
- MyPage APIs resolve the user from the active Apps Script session.
- No password field or credential authentication endpoint is introduced.
- Permission labels and grants are composed server-side from IAM-owned data.
- No permissions are inferred on the client.
- No raw user DB data is exposed beyond the existing/additive DTO contracts.

## Scope Exclusions

This port does not include:

- email/password login
- account registration
- password reset
- profile editing
- role editing
- permission editing
- notification preferences
- Google profile photo integration
- logout/session revocation feature
- new IAM schema fields solely for MyPage
- source branch database/setup helpers

These can be designed separately if needed.

## Testing Strategy

### Auth / Server Regression

Extend existing Auth/IAM tests or architecture checks to verify:

- existing Google session flow is unchanged
- no credential-login endpoint is introduced
- no mock-user fallback is introduced
- `mypage` is a protected route
- `api_getCurrentUser()` contract remains valid
- `api_getMyPermissions()` preserves existing fields
- `permissionDetails` is composed from IAM data and contains only granted effective permissions

### MyPage Frontend

Add focused frontend/static verification for:

- `270_mypage` shell files exist
- page consumes `api_getCurrentUser()` and `api_getMyPermissions()`
- page renders profile, roles, and permission details
- page does not contain `sessionStorage` auth/user logic
- page does not contain hard-coded role/permission mappings
- common shell/header/sidebar/styles are reused
- header user card links to `mypage`
- required profile/roles/permissions hooks are present

### Repository Regression

Run the full existing suite after integration:

- static JavaScript/GAS syntax checks
- Core/Auth/IAM/Settings tests
- Accounting/Event tests
- Student Fee tests
- server architecture verifiers
- Auth/IAM architecture verifier
- shared UI system verifier
- new MyPage checks

## Migration Strategy

Do not merge `codex/mypage-update` directly.

Implementation starts from current `main` and ports only the approved behavior into `refactor/auth-mypage-port`.

The old branch remains historical reference only.

## Acceptance Criteria

The port is complete when:

1. Current Google-only login semantics are unchanged.
2. Clicking the shared header user card opens protected MyPage.
3. MyPage shows current user's profile data from Auth/IAM.
4. MyPage shows every assigned role by current role summary (`id`, `name`).
5. MyPage shows human-readable effective permission details produced by IAM, without client-side inference.
6. Existing `api_getMyPermissions()` consumers remain compatible.
7. No credential login, alternate DB, mock chairman fallback, hard-coded permission table, or notification settings are introduced.
8. MyPage uses the current shared UI shell.
9. Existing repository regression tests and architecture verifiers pass.
