# Auth / MyPage Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the useful MyPage behavior from `codex/mypage-update` into the current Google-session Auth/IAM architecture without importing the old credential-login, alternate DB, mock-user, or monolithic UI structure.

**Architecture:** Keep `030_auth` and `040_iam` authoritative. Add only an additive `permissionDetails` view to the existing `api_getMyPermissions()` contract, then add a frontend-only `270_mypage` page that consumes `api_getCurrentUser()` and `api_getMyPermissions()`. Route access remains protected by the existing `doGet()` login guard, and the shared header user card becomes the sole primary MyPage entry point.

**Tech Stack:** Google Apps Script, HTMLService templates, vanilla JavaScript, Google Sheets-backed IAM, Node.js VM/static regression scripts.

**Spec:** `docs/superpowers/specs/2026-08-18-auth-mypage-port-design.md`

## Global Constraints

- Preserve the current Google-account-based login flow.
- Preserve current `030_auth` and `040_iam` ownership boundaries.
- Do not create a second user database or alternate login state.
- Do not use browser session storage as an authentication source of truth.
- MyPage is read-only for this port.
- Notification settings are out of scope.
- Do not introduce email/password login or credential endpoints.
- Do not introduce mock-user or implicit chairman/admin fallback behavior.
- Do not hard-code role-to-permission mappings in the client.
- Preserve all existing `api_getCurrentUser()` and `api_getMyPermissions()` fields; `permissionDetails` is additive only.
- Reuse `100_common/App_Header`, `App_Sidebar`, `App_Styles`, and `app_shell_js` rather than copying the source branch shell.
- No MyPage DAO, Sheet, or server-owned MyPage service.

---

## Target File Map

**Modify**
- `src/000_server/030_auth/auth_api.gs` — expose additive human-readable permission detail data through the current-user permission API.
- `src/000_server/040_iam/043_permissions/permissions_query_service.gs` — compose effective permission metadata owned by IAM.
- `src/000_server/Code.js` — register `mypage` route and include it in protected-page login checks.
- `src/100_common/App_Header.html` — make the shared user card an accessible MyPage entry point.
- `src/100_common/app_shell_js.html` — bind the user card to `buildAppPageUrl('mypage')`.
- `scripts/test-auth-iam.js` — regression coverage for additive permission details and unchanged Auth behavior.
- `scripts/verify-auth-iam-architecture.js` — reject credential login, alternate DB, mock-user fallback, and client-owned auth regressions where appropriate.
- `scripts/verify-ui-system-migration.js` — ensure MyPage reuses the shared shell.

**Create**
- `src/270_mypage/MyPage.html` — page template and shared-shell composition.
- `src/270_mypage/MyPage_View.html` — profile, roles, and effective-permissions markup.
- `src/270_mypage/MyPage_Styles.html` — MyPage-only layout rules.
- `src/270_mypage/mypage_js.html` — calls existing Auth APIs and renders read-only data.
- `scripts/test-mypage-frontend.js` — focused static/behavioral frontend regression.
- `scripts/verify-mypage-architecture.js` — MyPage ownership and anti-regression verifier.

---

### Task 1: Add IAM-Owned Effective Permission Details

**Files:**
- Modify: `src/000_server/040_iam/043_permissions/permissions_query_service.gs`
- Modify: `src/000_server/030_auth/auth_api.gs`
- Test: `scripts/test-auth-iam.js`

**Interfaces:**
- Consumes: `getPermissionsById_()`, `getPermissionIdsByRoleId_()`, `permissionScreenId_(permission)`, `buildUserPermissionsFromDb_(roleIds)`.
- Produces: `buildEffectivePermissionDetails_(roleIds, effectivePermissions)` returning an array of `{ id, screenId, area, action, name, description, grants }` and additive `permissionDetails` from `api_getMyPermissions()`.
- Existing `permissions.byScreen`, `permissions.menus`, `roles`, and all current response keys remain unchanged.

- [ ] **Step 1: Write the failing IAM regression**

Extend `testPermissionModel_()` in `scripts/test-auth-iam.js` with human-readable metadata and effective grants:

```js
function testPermissionDetails_() {
  var context = createContext_();
  installValueStubs_(context);
  installPermissionRows_(context);
  load_(context, 'src/000_server/040_iam/043_permissions/permissions_query_service.gs');

  var effective = context.buildUserPermissionsFromDb_(['ROLE_ADMIN']);
  var details = context.buildEffectivePermissionDetails_(['ROLE_ADMIN'], effective);

  assert.deepStrictEqual(plain_(details), [
    {
      id: 'EVENT_VIEW',
      screenId: 'perm_EVENT_VIEW',
      area: '행사',
      action: '조회',
      name: '행사 조회',
      description: '',
      grants: { menu: true, view: true, edit: false, approve: false, export: false }
    },
    {
      id: 'EVENT_EDIT',
      screenId: 'perm_EVENT_EDIT',
      area: '행사',
      action: '수정',
      name: '행사 수정',
      description: '',
      grants: { menu: true, view: false, edit: true, approve: false, export: false }
    }
  ]);
}
```

Also extend `testRequireLoginAndAuthApis_()` so `api_getMyPermissions()` exposes `permissionDetails` without removing existing data:

```js
full.permissionDetails = [{ id: 'EVENT_VIEW', screenId: 'perm_EVENT_VIEW', name: '행사 조회' }];
var myPermissions = context.api_getMyPermissions();
assert.strictEqual(myPermissions.permissions.byScreen.perm_EVENT_VIEW.view, true);
assert.strictEqual(myPermissions.permissionDetails[0].id, 'EVENT_VIEW');
```

Call `testPermissionDetails_()` near the bottom of the test file.

- [ ] **Step 2: Run the focused test and verify red state**

Run:

```bash
node scripts/test-auth-iam.js
```

Expected: FAIL because `buildEffectivePermissionDetails_` is not defined and/or `permissionDetails` is not returned.

- [ ] **Step 3: Implement IAM-owned permission detail composition**

Add to `permissions_query_service.gs` after `buildUserPermissionsFromDb_`:

```js
function buildEffectivePermissionDetails_(roleIds, effectivePermissions) {
  var permissionsById = getPermissionsById_();
  var permissionIdsByRole = getPermissionIdsByRoleId_();
  var seen = {};
  var details = [];
  var byScreen = effectivePermissions && effectivePermissions.byScreen ? effectivePermissions.byScreen : {};

  (roleIds || []).forEach(function (roleId) {
    (permissionIdsByRole[roleId] || []).forEach(function (permissionId) {
      if (seen[permissionId]) return;
      var permission = permissionsById[permissionId];
      if (!permission) return;
      var screenId = permissionScreenId_(permission);
      var grants = byScreen[screenId];
      if (!grants) return;
      seen[permissionId] = true;
      details.push({
        id: permission.id,
        screenId: screenId,
        area: permission.area,
        action: permission.action,
        name: permission.name,
        description: permission.description,
        grants: {
          menu: !!grants.menu,
          view: !!grants.view,
          edit: !!grants.edit,
          approve: !!grants.approve,
          export: !!grants.export
        }
      });
    });
  });

  return details;
}
```

In `buildSessionUserContextFromDb_()` or `api_getMyPermissions()` use IAM-owned metadata without changing ownership. Prefer computing once in the session context so downstream reads share one source:

```js
var permissions = buildUserPermissionsFromDb_(roleIds);
var permissionDetails = buildEffectivePermissionDetails_(roleIds, permissions);
```

Then include `permissionDetails` additively in the context and `api_getMyPermissions()`:

```js
return okResponse_({
  roles: current.user.roles || [],
  permissions: current.permissions || {},
  permissionDetails: current.permissionDetails || []
});
```

Do not remove or rename any existing response field.

- [ ] **Step 4: Run Auth/IAM behavior tests and verify green state**

Run:

```bash
node scripts/test-auth-iam.js
```

Expected: `Auth/IAM behavior regression tests passed.`

- [ ] **Step 5: Commit the server contract change**

```bash
git add scripts/test-auth-iam.js \
  src/000_server/030_auth/auth_api.gs \
  src/000_server/030_auth/auth_context.gs \
  src/000_server/040_iam/043_permissions/permissions_query_service.gs
git commit -m "feat: expose effective permission details"
```

---

### Task 2: Add Protected MyPage Routing and Header Entry Point

**Files:**
- Modify: `src/000_server/Code.js`
- Modify: `src/100_common/App_Header.html`
- Modify: `src/100_common/app_shell_js.html`
- Test: `scripts/test-mypage-frontend.js`

**Interfaces:**
- Produces route: `?page=mypage -> 270_mypage/MyPage`.
- Produces DOM hook: `#appUserCard`.
- Uses existing `buildAppPageUrl(page)` and the same login guard as other protected pages.

- [ ] **Step 1: Create failing route/header regression test**

Create `scripts/test-mypage-frontend.js`:

```js
var assert = require('assert');
var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
function read_(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

var code = read_('src/000_server/Code.js');
var header = read_('src/100_common/App_Header.html');
var shell = read_('src/100_common/app_shell_js.html');

assert.ok(code.indexOf("mypage: '270_mypage/MyPage'") !== -1, 'mypage route must exist');
assert.ok(/page === 'mypage'|page\.indexOf\('mypage'\)/.test(code), 'mypage must be login protected');
assert.ok(header.indexOf('id="appUserCard"') !== -1, 'shared header must expose user-card hook');
assert.ok(shell.indexOf("buildAppPageUrl('mypage')") !== -1, 'shared shell must link user card to mypage');

console.log('MyPage frontend routing regression tests passed.');
```

- [ ] **Step 2: Run the test and verify red state**

Run:

```bash
node scripts/test-mypage-frontend.js
```

Expected: FAIL because route and header hook do not exist.

- [ ] **Step 3: Add the protected route**

In `src/000_server/Code.js`, add:

```js
mypage: '270_mypage/MyPage',
```

Add `mypage` to the existing protected-page condition without restructuring unrelated routing:

```js
if (
  page === 'main' ||
  page === 'mypage' ||
  page.indexOf('accounting') === 0 ||
  page.indexOf('student_fee') === 0 ||
  page.indexOf('event') === 0 ||
  page.indexOf('settings') === 0
) {
```

Preserve the existing login failure behavior.

- [ ] **Step 4: Make the header user card accessible and navigable**

Change the shared user card wrapper in `App_Header.html` to a button or link with stable ID. Prefer an anchor because navigation is its sole behavior:

```html
<a class="user-card" id="appUserCard" target="_top" aria-label="마이페이지로 이동">
  <div class="avatar" aria-hidden="true"></div>
  <div>
    <strong id="appUserName">운영자</strong>
    <span id="appUserTitle">사용자</span>
  </div>
</a>
```

In `app_shell_js.html`, add beside the other shared links:

```js
getAppElement('appUserCard').href = buildAppPageUrl('mypage');
```

Do not add a sidebar MyPage item.

- [ ] **Step 5: Run the route/header test and shared UI verifier**

Run:

```bash
node scripts/test-mypage-frontend.js
node scripts/verify-ui-system-migration.js
```

Expected: both PASS.

- [ ] **Step 6: Commit routing and entry-point wiring**

```bash
git add src/000_server/Code.js \
  src/100_common/App_Header.html \
  src/100_common/app_shell_js.html \
  scripts/test-mypage-frontend.js
git commit -m "feat: add protected mypage entry point"
```

---

### Task 3: Create the Shared-Shell MyPage View

**Files:**
- Create: `src/270_mypage/MyPage.html`
- Create: `src/270_mypage/MyPage_View.html`
- Create: `src/270_mypage/MyPage_Styles.html`
- Modify: `scripts/test-mypage-frontend.js`

**Interfaces:**
- Consumes template values already supplied by `Code.js`: `mainUserName`, `mainUserTitle`, `isAdmin`, `currentPage`, `getWebAppUrl()`.
- Produces DOM hooks for Task 4: `mypageName`, `mypageEmail`, `mypageDepartment`, `mypageStatus`, `mypageTitle`, `mypageAvatar`, `mypageRoles`, `mypagePermissionMenus`, `mypagePermissionDetails`, `mypageError`, `mypageLoading`.

- [ ] **Step 1: Extend frontend test with shell and DOM expectations**

Append to `scripts/test-mypage-frontend.js`:

```js
var page = read_('src/270_mypage/MyPage.html');
var view = read_('src/270_mypage/MyPage_View.html');

[
  "include('100_common/App_Styles')",
  "include('100_common/App_Header')",
  "include('100_common/App_Sidebar')",
  "include('100_common/app_shell_js')",
  "include('270_mypage/MyPage_Styles')",
  "include('270_mypage/mypage_js')"
].forEach(function (needle) {
  assert.ok(page.indexOf(needle) !== -1, 'MyPage must reuse shared shell: ' + needle);
});

[
  'mypageName', 'mypageEmail', 'mypageDepartment', 'mypageStatus', 'mypageTitle',
  'mypageAvatar', 'mypageRoles', 'mypagePermissionMenus', 'mypagePermissionDetails',
  'mypageError', 'mypageLoading'
].forEach(function (id) {
  assert.ok(view.indexOf('id="' + id + '"') !== -1, 'missing MyPage hook: ' + id);
});
```

- [ ] **Step 2: Run the frontend test and verify red state**

Run:

```bash
node scripts/test-mypage-frontend.js
```

Expected: FAIL because `270_mypage` files do not exist.

- [ ] **Step 3: Create `MyPage.html` using the established page template pattern**

Use the same shell structure as `src/250_main/Main.html`:

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <base target="_top">
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>학생회 통합 업무관리</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&display=swap" rel="stylesheet">
  <?!= include('100_common/App_Styles'); ?>
  <?!= include('270_mypage/MyPage_Styles'); ?>
  <script>
    var WEB_APP_URL = '<?= getWebAppUrl() ?>';
    var APP_USER_NAME = <?!= JSON.stringify(mainUserName || '') ?>;
    var APP_USER_TITLE = <?!= JSON.stringify(mainUserTitle || '') ?>;
    var APP_IS_ADMIN = <?!= JSON.stringify(!!isAdmin) ?>;
    var APP_CURRENT_PAGE = <?!= JSON.stringify(currentPage || 'mypage') ?>;
  </script>
</head>
<body class="app-mode">
  <div class="app mypage-page">
    <?!= include('100_common/App_Header'); ?>
    <div class="body">
      <?!= include('100_common/App_Sidebar'); ?>
      <main class="main"><?!= include('270_mypage/MyPage_View'); ?></main>
    </div>
    <footer class="status-bar">시스템 v0.7 · Google Sheets DB 연결됨 · 2026학년도</footer>
  </div>
  <?!= include('100_common/app_shell_js'); ?>
  <?!= include('270_mypage/mypage_js'); ?>
</body>
</html>
```

- [ ] **Step 4: Create the read-only MyPage view**

`MyPage_View.html` contains only presentation structure, no mock values beyond neutral loading placeholders:

```html
<section class="page-head">
  <div>
    <h1>마이페이지</h1>
    <p>현재 Google 계정과 배정된 역할·권한을 확인합니다.</p>
  </div>
</section>

<div id="mypageError" class="hidden" role="alert"></div>
<div id="mypageLoading" class="card">내 정보를 불러오는 중입니다.</div>

<section class="mypage-content hidden" id="mypageContent">
  <section class="card mypage-profile-card">
    <div class="mypage-avatar" id="mypageAvatar" aria-hidden="true"></div>
    <div class="mypage-profile-summary">
      <h2 id="mypageName"></h2>
      <span id="mypageStatus" class="badge"></span>
    </div>
    <dl class="mypage-profile-grid">
      <div><dt>Google 계정</dt><dd id="mypageEmail"></dd></div>
      <div><dt>대표 역할</dt><dd id="mypageTitle"></dd></div>
      <div><dt>소속·부서</dt><dd id="mypageDepartment"></dd></div>
    </dl>
  </section>

  <section class="card">
    <h2>내 역할</h2>
    <div id="mypageRoles" class="mypage-role-list"></div>
  </section>

  <section class="card">
    <h2>내 권한</h2>
    <div id="mypagePermissionMenus" class="mypage-menu-list"></div>
    <div id="mypagePermissionDetails" class="mypage-permission-list"></div>
  </section>
</section>
```

- [ ] **Step 5: Add MyPage-only layout CSS**

Keep styles scoped under `.mypage-page` / `.mypage-*`. Do not redefine `.header`, `.sidebar`, `.card`, `.nav-item`, or other shared primitives. Include responsive behavior for profile grid and permission rows.

Example minimum:

```css
.mypage-page .mypage-profile-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) minmax(320px, 1.5fr);
  gap: 24px;
  align-items: center;
}

.mypage-avatar {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 28px;
  font-weight: 700;
}

.mypage-profile-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 24px;
}

@media (max-width: 900px) {
  .mypage-page .mypage-profile-card,
  .mypage-profile-grid {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 6: Run frontend/static syntax checks**

Run:

```bash
node scripts/test-mypage-frontend.js
python3 - <<'PY'
from pathlib import Path
import re, subprocess
for p in Path('src/270_mypage').glob('*_js.html'):
    text = p.read_text(encoding='utf-8')
    match = re.search(r'<script>(.*)</script>', text, re.S)
    if match:
        out = Path('/tmp/__mypage_check.js')
        out.write_text(match.group(1), encoding='utf-8')
        subprocess.run(['node', '--check', str(out)], check=True)
PY
```

At this step the JS include may still be absent until Task 4; if so create a minimal empty `<script></script>` file only as part of Task 4, not as placeholder production code. The page/view/style structure must already satisfy its assertions.

- [ ] **Step 7: Commit the view structure**

```bash
git add src/270_mypage/MyPage.html \
  src/270_mypage/MyPage_View.html \
  src/270_mypage/MyPage_Styles.html \
  scripts/test-mypage-frontend.js
git commit -m "feat: add shared-shell mypage view"
```

---

### Task 4: Wire MyPage to Existing Auth/IAM APIs

**Files:**
- Create: `src/270_mypage/mypage_js.html`
- Modify: `scripts/test-mypage-frontend.js`

**Interfaces:**
- Calls: `api_getCurrentUser()` and `api_getMyPermissions()` only.
- Consumes `api_getCurrentUser().user = { id, name, title, email, department, status, roleIds, roles }`.
- Consumes `api_getMyPermissions() = { roles, permissions, permissionDetails }`.
- Does not accept user ID/email input from the browser.

- [ ] **Step 1: Extend frontend test with API and anti-pattern assertions**

Append:

```js
var mypageJs = read_('src/270_mypage/mypage_js.html');
assert.ok(mypageJs.indexOf("api_getCurrentUser") !== -1, 'MyPage must read current user from Auth');
assert.ok(mypageJs.indexOf("api_getMyPermissions") !== -1, 'MyPage must read effective permissions from Auth/IAM');
assert.strictEqual(mypageJs.indexOf('sessionStorage'), -1, 'MyPage must not use sessionStorage as auth/user source');
assert.strictEqual(mypageJs.indexOf('localStorage'), -1, 'MyPage must not use localStorage as auth/user source');
assert.strictEqual(mypageJs.indexOf('DB_URL'), -1, 'MyPage must not access alternate user DB');
assert.strictEqual(mypageJs.indexOf('loginWithCredentials'), -1, 'MyPage must not introduce credential login');
assert.strictEqual(mypageJs.indexOf('테스트 유저'), -1, 'MyPage must not introduce mock-user fallback');
assert.strictEqual(mypageJs.indexOf('회장\'\:'), -1, 'MyPage must not hard-code role permission maps');
```

- [ ] **Step 2: Run test and verify red state**

Run:

```bash
node scripts/test-mypage-frontend.js
```

Expected: FAIL because `mypage_js.html` does not exist or does not call the two APIs.

- [ ] **Step 3: Implement MyPage data loading with current server-call convention**

Use `google.script.run` directly or the existing shared client call helper if it is included on all domain pages. Do not introduce a new generic RPC abstraction only for MyPage.

Core flow:

```js
function initializeMyPage() {
  Promise.all([
    callMyPageApi_('api_getCurrentUser'),
    callMyPageApi_('api_getMyPermissions')
  ]).then(function (results) {
    renderMyPage_(results[0], results[1]);
  }).catch(function (error) {
    showMyPageError_(error && error.message ? error.message : '내 정보를 불러오지 못했습니다.');
  });
}
```

Implement a tiny page-local Promise wrapper if no shared one is available:

```js
function callMyPageApi_(name) {
  return new Promise(function (resolve, reject) {
    google.script.run
      .withSuccessHandler(function (result) {
        if (!result || result.ok === false) {
          reject(new Error(result && result.message ? result.message : '요청에 실패했습니다.'));
          return;
        }
        resolve(result);
      })
      .withFailureHandler(reject)[name]();
  });
}
```

- [ ] **Step 4: Render profile and roles without client inference**

Use the server DTO as-is:

```js
function renderProfile_(current) {
  var user = current.user || {};
  setMyPageText_('mypageName', user.name || '이름 미등록');
  setMyPageText_('mypageEmail', user.email || '');
  setMyPageText_('mypageDepartment', user.department || '소속 미등록');
  setMyPageText_('mypageStatus', user.status === 'active' ? '활성 계정' : String(user.status || '상태 미등록'));
  setMyPageText_('mypageTitle', user.title || '역할 미등록');
  setMyPageText_('mypageAvatar', String(user.name || '?').charAt(0));
}
```

Render roles from `current.user.roles` only. Show `role.name`, with `role.id` as secondary text if useful. Do not map role names to permissions.

- [ ] **Step 5: Render effective menus and permission details from IAM results**

Use `permissions.menus` and `permissionDetails` directly:

```js
function renderPermissions_(permissionResult) {
  var permissions = permissionResult.permissions || {};
  var menus = permissions.menus || [];
  var details = permissionResult.permissionDetails || [];

  renderMyPageMenus_(menus);
  renderMyPagePermissionDetails_(details);
}
```

For each detail show `area`, `name || action`, optional `description`, and grant labels derived only from `detail.grants` booleans. The client may translate grant keys to labels (`view -> 조회`, `edit -> 등록·수정`, etc.), but it must not infer whether a grant exists from role name or permission name.

- [ ] **Step 6: Implement loading and error states**

On success hide `mypageLoading`, show `mypageContent`. On failure hide loading and show `mypageError`. Never populate fallback profile/permission data.

- [ ] **Step 7: Run MyPage frontend/static checks**

Run:

```bash
node scripts/test-mypage-frontend.js
python3 - <<'PY'
from pathlib import Path
import re, subprocess
p = Path('src/270_mypage/mypage_js.html')
text = p.read_text(encoding='utf-8')
match = re.search(r'<script>(.*)</script>', text, re.S)
assert match, 'mypage_js.html must contain script block'
out = Path('/tmp/__mypage_check.js')
out.write_text(match.group(1), encoding='utf-8')
subprocess.run(['node', '--check', str(out)], check=True)
PY
```

Expected: PASS.

- [ ] **Step 8: Commit MyPage behavior**

```bash
git add src/270_mypage/mypage_js.html scripts/test-mypage-frontend.js
git commit -m "feat: render current user roles and permissions"
```

---

### Task 5: Add Architecture Guardrails for the Port

**Files:**
- Create: `scripts/verify-mypage-architecture.js`
- Modify: `scripts/verify-auth-iam-architecture.js`
- Modify: `scripts/verify-ui-system-migration.js`

**Interfaces:**
- Produces CI/static guarantees that old `codex/mypage-update` architecture cannot silently re-enter the current tree.

- [ ] **Step 1: Create failing MyPage architecture verifier**

Create `scripts/verify-mypage-architecture.js` that asserts:

```js
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var ROOT = path.resolve(__dirname, '..');

function read_(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

var page = read_('src/270_mypage/MyPage.html');
var js = read_('src/270_mypage/mypage_js.html');
var code = read_('src/000_server/Code.js');

assert.ok(code.indexOf("mypage: '270_mypage/MyPage'") !== -1);
assert.ok(page.indexOf("include('100_common/App_Header')") !== -1);
assert.ok(page.indexOf("include('100_common/App_Sidebar')") !== -1);
assert.ok(js.indexOf('api_getCurrentUser') !== -1);
assert.ok(js.indexOf('api_getMyPermissions') !== -1);

['sessionStorage', 'localStorage', 'DB_URL', 'setupDatabaseSheet', 'loginWithCredentials', '테스트 유저'].forEach(function (forbidden) {
  assert.strictEqual(js.indexOf(forbidden), -1, 'forbidden MyPage dependency: ' + forbidden);
});

console.log('MyPage architecture verification passed.');
```

- [ ] **Step 2: Run verifier and confirm any missing guard fails**

Run:

```bash
node scripts/verify-mypage-architecture.js
```

Expected before final verifier adjustments: FAIL on any still-missing shell/API contract.

- [ ] **Step 3: Extend Auth/IAM architecture verifier with source-branch anti-patterns**

Add checks scoped to current source files that reject:

```text
loginWithCredentials
setupDatabaseSheet
DB_URL
mock chairman/test-user fallback
password input/credential-auth endpoint in server Auth
```

Do not reject legitimate password words in unrelated comments/docs; scope checks to `src/000_server/030_auth`, `src/200_login`, and `src/270_mypage`.

- [ ] **Step 4: Extend shared UI verifier for MyPage shell reuse**

Ensure `verify-ui-system-migration.js` includes `270_mypage` and rejects duplicated shared `.header`, `.sidebar`, `.nav-item`, or wholesale shell CSS definitions in `MyPage_Styles.html`.

- [ ] **Step 5: Run all architecture verifiers**

Run:

```bash
node scripts/verify-auth-iam-architecture.js
node scripts/verify-mypage-architecture.js
node scripts/verify-ui-system-migration.js
```

Expected: PASS.

- [ ] **Step 6: Commit architecture guardrails**

```bash
git add scripts/verify-auth-iam-architecture.js \
  scripts/verify-mypage-architecture.js \
  scripts/verify-ui-system-migration.js
git commit -m "test: enforce mypage architecture boundaries"
```

---

### Task 6: Run Full Repository Regression and Source-Branch Leakage Checks

**Files:**
- Test only; modify production files only if a regression exposes a real defect.

**Interfaces:**
- Validates that the MyPage port preserves existing project behavior and that rejected source-branch architecture is absent.

- [ ] **Step 1: Run JavaScript and GAS syntax checks**

```bash
node --check scripts/*.js
find src -name '*.js' -print0 | while IFS= read -r -d '' file; do node --check "$file"; done
find src -name '*.gs' -print0 | while IFS= read -r -d '' file; do cp "$file" /tmp/__gas_check.js; node --check /tmp/__gas_check.js; done
python3 - <<'PY'
from pathlib import Path
import re, subprocess
for p in Path('src').rglob('*_js.html'):
    text = p.read_text(encoding='utf-8')
    m = re.search(r'<script>(.*)</script>', text, re.S)
    if not m:
        continue
    out = Path('/tmp/__inline_check.js')
    out.write_text(m.group(1), encoding='utf-8')
    subprocess.run(['node', '--check', str(out)], check=True)
PY
```

Expected: all exit 0.

- [ ] **Step 2: Run behavior regression suites**

```bash
node scripts/test-core.js
node scripts/test-auth-iam.js
node scripts/test-settings.js
node scripts/test-accounting.js
node scripts/test-event.js
node scripts/test-student-fee.js
node scripts/test-student-fee-frontend.js
node scripts/test-mypage-frontend.js
```

Expected: all PASS.

- [ ] **Step 3: Run architecture verifiers**

```bash
node scripts/verify-server-architecture.js
node scripts/verify-auth-iam-architecture.js
node scripts/verify-settings-architecture.js
node scripts/verify-accounting-architecture.js
node scripts/verify-event-architecture.js
node scripts/verify-student-fee-architecture.js
node scripts/verify-student-fee-frontend.js
node scripts/verify-ui-system-migration.js
node scripts/verify-mypage-architecture.js
```

Expected: all PASS.

- [ ] **Step 4: Check rejected source-branch patterns did not leak into production**

Run:

```bash
! grep -R -n -E 'loginWithCredentials|setupDatabaseSheet|DB_URL|테스트 유저' src/000_server/030_auth src/200_login src/270_mypage
! grep -R -n 'sessionStorage' src/270_mypage
! grep -R -n 'localStorage' src/270_mypage
```

Expected: no matches; each negated grep exits 0.

- [ ] **Step 5: Verify route and source branch comparison intent**

Confirm `main` is the base of `refactor/auth-mypage-port` and no files from the old branch root (`Login.html`, `MyPage.html`, root `Code.js` monolith, `.DS_Store`) were copied wholesale. Use GitHub compare or local `git diff --name-status main...HEAD`.

Expected production changes are limited to current architecture files, `270_mypage`, tests, and docs.

- [ ] **Step 6: Commit any final regression-only adjustments**

If no fixes are needed, do not create an empty commit. If verifier/test changes are needed:

```bash
git add <only-files-changed-to-fix-regression>
git commit -m "test: finalize auth mypage regression coverage"
```

- [ ] **Step 7: Document deployment caveat in handoff**

State explicitly that repository regression proves static/Node/GAS contract behavior, but deployed Apps Script live E2E with a real Google session and real UserDB should still be verified separately before production rollout.
