# Auth / MyPage Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the useful MyPage behavior from `codex/mypage-update` into the current Google-session Auth/IAM architecture without importing credential login, an alternate user DB, mock users, or the old monolithic UI.

**Architecture:** `030_auth` continues to resolve and validate the active Google user; `040_iam` continues to own users, roles, and effective permissions. The existing Auth context gains additive human-readable `permissionDetails`, and a frontend-only `270_mypage` consumes `api_getCurrentUser()` plus `api_getMyPermissions()`. `mypage` is protected by the existing `doGet()` guard and entered through the shared header user card.

**Tech Stack:** Google Apps Script, HTMLService templates, vanilla JavaScript, Google Sheets-backed IAM, Node.js VM/static regression scripts.

**Spec:** `docs/superpowers/specs/2026-08-18-auth-mypage-port-design.md`

## Global Constraints

- Preserve the current Google-account-based login flow.
- Preserve current `030_auth` and `040_iam` ownership boundaries.
- Do not create a second user database or alternate login state.
- Do not use browser storage as an authentication source of truth.
- MyPage is read-only.
- Notification settings are out of scope.
- Do not introduce email/password login or credential endpoints.
- Do not introduce mock-user or implicit chairman/admin fallback behavior.
- Do not hard-code role-to-permission mappings in the client.
- Preserve every existing `api_getCurrentUser()` and `api_getMyPermissions()` field; `permissionDetails` is additive only.
- Reuse `100_common/App_Header`, `App_Sidebar`, `App_Styles`, and `app_shell_js`.
- No MyPage DAO, Sheet, server service, or new IAM schema field.

---

## Target File Map

**Modify**
- `src/000_server/030_auth/auth_context.gs` — attach IAM-owned readable effective permission details to the existing session context.
- `src/000_server/030_auth/auth_api.gs` — expose `permissionDetails` additively from `api_getMyPermissions()`.
- `src/000_server/040_iam/043_permissions/permissions_query_service.gs` — compose readable effective permission metadata.
- `src/000_server/Code.js` — add and protect `mypage` route.
- `src/100_common/App_Header.html` — make shared user card an accessible MyPage link.
- `src/100_common/app_shell_js.html` — assign MyPage URL to the user card.
- `scripts/test-auth-iam.js` — behavior regression for permission details and unchanged Auth contract.
- `scripts/verify-auth-iam-architecture.js` — reject old credential/alternate-DB/mock-user architecture in Auth/Login/MyPage scope.
- `scripts/verify-ui-system-migration.js` — include MyPage in shared-shell checks.

**Create**
- `src/270_mypage/MyPage.html` — HTMLService page template.
- `src/270_mypage/MyPage_View.html` — read-only profile/roles/permissions markup.
- `src/270_mypage/MyPage_Styles.html` — MyPage-specific layout only.
- `src/270_mypage/mypage_js.html` — page-local RPC + rendering.
- `scripts/test-mypage-frontend.js` — route, shell, API-consumption, and anti-pattern regression.
- `scripts/verify-mypage-architecture.js` — ownership and source-branch leakage guard.

---

### Task 1: Add IAM-Owned Effective Permission Details

**Files:**
- Modify: `src/000_server/040_iam/043_permissions/permissions_query_service.gs`
- Modify: `src/000_server/030_auth/auth_context.gs`
- Modify: `src/000_server/030_auth/auth_api.gs`
- Test: `scripts/test-auth-iam.js`

**Interfaces:**
- Consumes: `getPermissionsById_()`, `getPermissionIdsByRoleId_()`, `permissionScreenId_(permission)`, `buildUserPermissionsFromDb_(roleIds)`.
- Produces: `buildEffectivePermissionDetails_(roleIds, effectivePermissions)` -> array of `{ id, screenId, area, action, name, description, grants }`.
- Adds `permissionDetails` to session context and `api_getMyPermissions()` only; existing fields stay unchanged.

- [ ] **Step 1: Write the failing IAM regression**

Add to `scripts/test-auth-iam.js`:

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

In `testBuildSessionUserContext_()`, stub `buildEffectivePermissionDetails_()` and update the expected successful context keys to include `permissionDetails`:

```js
context.buildEffectivePermissionDetails_ = function () { return []; };
assert.deepStrictEqual(
  Object.keys(plain_(result)).sort(),
  ['dbMode', 'email', 'isAdmin', 'ok', 'permissionDetails', 'permissions', 'preview', 'roles', 'user'].sort()
);
```

In `testRequireLoginAndAuthApis_()` add readable details to the full context and assert additive API output:

```js
full.permissionDetails = [
  {
    id: 'EVENT_VIEW',
    screenId: 'perm_EVENT_VIEW',
    area: '행사',
    action: '조회',
    name: '행사 조회',
    description: '',
    grants: { menu: true, view: true, edit: false, approve: false, export: false }
  }
];
var myPermissions = context.api_getMyPermissions();
assert.strictEqual(myPermissions.permissions.byScreen.perm_EVENT_VIEW.view, true);
assert.strictEqual(myPermissions.permissionDetails[0].id, 'EVENT_VIEW');
```

Call `testPermissionDetails_()` before the final success log.

- [ ] **Step 2: Run red test**

```bash
node scripts/test-auth-iam.js
```

Expected: FAIL because `buildEffectivePermissionDetails_` and additive context/API data are absent.

- [ ] **Step 3: Implement `buildEffectivePermissionDetails_` in IAM**

Add to `permissions_query_service.gs`:

```js
function buildEffectivePermissionDetails_(roleIds, effectivePermissions) {
  var permissionsById = getPermissionsById_();
  var permissionIdsByRole = getPermissionIdsByRoleId_();
  var byScreen = effectivePermissions && effectivePermissions.byScreen ? effectivePermissions.byScreen : {};
  var seen = {};
  var details = [];

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

- [ ] **Step 4: Add details to the current Auth context and API**

In `buildSessionUserContextFromDb_()`:

```js
var permissions = buildUserPermissionsFromDb_(roleIds);
var permissionDetails = buildEffectivePermissionDetails_(roleIds, permissions);

return okResponse_({
  email: email,
  user: user,
  roles: roles,
  permissions: permissions,
  permissionDetails: permissionDetails,
  isAdmin: isAdminRoleSet_(roleIds, roleMap),
  dbMode: 'connected',
  preview: false
});
```

In `api_getMyPermissions()`:

```js
return okResponse_({
  roles: current.user.roles || [],
  permissions: current.permissions || {},
  permissionDetails: current.permissionDetails || []
});
```

- [ ] **Step 5: Run green test**

```bash
node scripts/test-auth-iam.js
```

Expected: `Auth/IAM behavior regression tests passed.`

- [ ] **Step 6: Commit**

```bash
git add scripts/test-auth-iam.js \
  src/000_server/030_auth/auth_context.gs \
  src/000_server/030_auth/auth_api.gs \
  src/000_server/040_iam/043_permissions/permissions_query_service.gs
git commit -m "feat: expose effective permission details"
```

---

### Task 2: Add Protected MyPage Route and Header Entry

**Files:**
- Modify: `src/000_server/Code.js`
- Modify: `src/100_common/App_Header.html`
- Modify: `src/100_common/app_shell_js.html`
- Create: `scripts/test-mypage-frontend.js`

**Interfaces:**
- Produces route `?page=mypage -> 270_mypage/MyPage`.
- Produces shared DOM hook `#appUserCard`.
- Uses existing `buildAppPageUrl(page)`.

- [ ] **Step 1: Write the failing route/header regression**

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
assert.ok(code.indexOf("page === 'mypage'") !== -1, 'mypage must be protected');
assert.ok(header.indexOf('id="appUserCard"') !== -1, 'shared header must expose MyPage link');
assert.ok(shell.indexOf("buildAppPageUrl('mypage')") !== -1, 'shared shell must assign MyPage URL');

console.log('MyPage frontend regression tests passed.');
```

- [ ] **Step 2: Run red test**

```bash
node scripts/test-mypage-frontend.js
```

Expected: FAIL on missing route and/or `appUserCard`.

- [ ] **Step 3: Add and protect the route**

In `src/000_server/Code.js` add:

```js
mypage: '270_mypage/MyPage',
```

Extend the existing protected-page condition with exactly:

```js
page === 'mypage' ||
```

Do not change existing login failure semantics.

- [ ] **Step 4: Convert shared user card to an accessible link**

In `App_Header.html`:

```html
<a class="user-card" id="appUserCard" target="_top" aria-label="마이페이지로 이동">
  <div class="avatar" aria-hidden="true"></div>
  <div>
    <strong id="appUserName">운영자</strong>
    <span id="appUserTitle">사용자</span>
  </div>
</a>
```

In `app_shell_js.html` beside other global links:

```js
getAppElement('appUserCard').href = buildAppPageUrl('mypage');
```

Do not add MyPage to the sidebar.

- [ ] **Step 5: Run green route/header test**

```bash
node scripts/test-mypage-frontend.js
node scripts/verify-ui-system-migration.js
```

Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add src/000_server/Code.js src/100_common/App_Header.html \
  src/100_common/app_shell_js.html scripts/test-mypage-frontend.js
git commit -m "feat: add protected mypage entry point"
```

---

### Task 3: Build the Functional Shared-Shell MyPage

**Files:**
- Create: `src/270_mypage/MyPage.html`
- Create: `src/270_mypage/MyPage_View.html`
- Create: `src/270_mypage/MyPage_Styles.html`
- Create: `src/270_mypage/mypage_js.html`
- Modify: `scripts/test-mypage-frontend.js`

**Interfaces:**
- Calls only `api_getCurrentUser()` and `api_getMyPermissions()`.
- Consumes `api_getCurrentUser().user = { id, name, title, email, department, status, roleIds, roles }`.
- Consumes `api_getMyPermissions() = { roles, permissions, permissionDetails }`.
- Produces read-only profile, assigned-role, accessible-menu, and effective-permission presentation.

- [ ] **Step 1: Extend the frontend test before creating the page**

Append:

```js
var page = read_('src/270_mypage/MyPage.html');
var view = read_('src/270_mypage/MyPage_View.html');
var mypageJs = read_('src/270_mypage/mypage_js.html');

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
  'mypageError', 'mypageLoading', 'mypageContent'
].forEach(function (id) {
  assert.ok(view.indexOf('id="' + id + '"') !== -1, 'missing hook: ' + id);
});

assert.ok(mypageJs.indexOf('api_getCurrentUser') !== -1);
assert.ok(mypageJs.indexOf('api_getMyPermissions') !== -1);
['sessionStorage', 'localStorage', 'DB_URL', 'loginWithCredentials', 'setupDatabaseSheet', '테스트 유저'].forEach(function (forbidden) {
  assert.strictEqual(mypageJs.indexOf(forbidden), -1, 'forbidden MyPage dependency: ' + forbidden);
});
```

- [ ] **Step 2: Run red test**

```bash
node scripts/test-mypage-frontend.js
```

Expected: FAIL because `src/270_mypage` does not exist.

- [ ] **Step 3: Create `MyPage.html` using the current page template pattern**

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

- [ ] **Step 4: Create the read-only view with stable hooks**

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
    <h3>접근 가능한 업무 영역</h3>
    <div id="mypagePermissionMenus" class="mypage-menu-list"></div>
    <h3>세부 권한</h3>
    <div id="mypagePermissionDetails" class="mypage-permission-list"></div>
  </section>
</section>
```

- [ ] **Step 5: Add only MyPage-specific CSS**

Use exactly scoped selectors; do not redefine common shell primitives:

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
  background: var(--surface-soft, #e8f2ff);
}

.mypage-profile-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 24px;
  margin: 0;
}

.mypage-profile-grid dt {
  font-size: 12px;
  font-weight: 600;
  opacity: .7;
}

.mypage-profile-grid dd {
  margin: 4px 0 0;
  font-weight: 600;
}

.mypage-role-list,
.mypage-menu-list,
.mypage-permission-list {
  display: grid;
  gap: 12px;
}

.mypage-role-item,
.mypage-menu-item,
.mypage-permission-item {
  padding: 14px 16px;
  border: 1px solid var(--border, #dde1e6);
  border-radius: 8px;
}

.mypage-grants {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

@media (max-width: 900px) {
  .mypage-page .mypage-profile-card,
  .mypage-profile-grid {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 6: Implement page-local RPC; do not add a new shared abstraction**

`mypage_js.html` starts with:

```html
<script>
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
      .withFailureHandler(function (error) {
        reject(error instanceof Error ? error : new Error(String(error || '요청에 실패했습니다.')));
      })[name]();
  });
}
```

- [ ] **Step 7: Implement profile and role rendering directly from Auth DTO**

```js
function setMyPageText_(id, value) {
  document.getElementById(id).textContent = value;
}

function renderProfile_(current) {
  var user = current.user || {};
  setMyPageText_('mypageName', user.name || '이름 미등록');
  setMyPageText_('mypageEmail', user.email || '');
  setMyPageText_('mypageDepartment', user.department || '소속 미등록');
  setMyPageText_('mypageStatus', user.status === 'active' ? '활성 계정' : String(user.status || '상태 미등록'));
  setMyPageText_('mypageTitle', user.title || '역할 미등록');
  setMyPageText_('mypageAvatar', String(user.name || '?').charAt(0));

  var roles = user.roles || [];
  document.getElementById('mypageRoles').innerHTML = roles.length
    ? roles.map(function (role) {
        return '<div class="mypage-role-item"><strong>' + escapeMyPageHtml_(role.name || role.id || '역할') + '</strong>' +
          (role.id ? '<div>' + escapeMyPageHtml_(role.id) + '</div>' : '') + '</div>';
      }).join('')
    : '<div class="mypage-role-item">배정된 역할이 없습니다.</div>';
}
```

Implement `escapeMyPageHtml_()` with text-node-safe escaping for `& < > " '` before any server value is inserted into `innerHTML`.

- [ ] **Step 8: Render menus and permission details without role-name inference**

```js
var MY_PAGE_GRANT_LABELS = {
  menu: '메뉴 접근',
  view: '조회',
  edit: '등록·수정',
  approve: '승인·보관',
  export: '다운로드·출력'
};

function renderPermissions_(result) {
  var permissions = result.permissions || {};
  var menus = permissions.menus || [];
  var details = result.permissionDetails || [];

  document.getElementById('mypagePermissionMenus').innerHTML = menus.length
    ? menus.map(function (menu) {
        return '<div class="mypage-menu-item">' + escapeMyPageHtml_(menu.name || menu.id || '업무 영역') + '</div>';
      }).join('')
    : '<div class="mypage-menu-item">접근 가능한 업무 영역이 없습니다.</div>';

  document.getElementById('mypagePermissionDetails').innerHTML = details.length
    ? details.map(function (detail) {
        var grants = Object.keys(MY_PAGE_GRANT_LABELS).filter(function (key) {
          return detail.grants && detail.grants[key];
        }).map(function (key) {
          return '<span class="badge">' + MY_PAGE_GRANT_LABELS[key] + '</span>';
        }).join('');
        return '<div class="mypage-permission-item">' +
          '<strong>' + escapeMyPageHtml_(detail.name || detail.action || detail.id) + '</strong>' +
          '<div>' + escapeMyPageHtml_(detail.area || '') + '</div>' +
          (detail.description ? '<p>' + escapeMyPageHtml_(detail.description) + '</p>' : '') +
          '<div class="mypage-grants">' + grants + '</div></div>';
      }).join('')
    : '<div class="mypage-permission-item">표시할 세부 권한이 없습니다.</div>';
}
```

The grant-label map translates boolean grant keys only. It does not infer grants from role or permission names.

- [ ] **Step 9: Add initialization, success, loading, and error behavior**

```js
function showMyPageError_(message) {
  document.getElementById('mypageLoading').classList.add('hidden');
  document.getElementById('mypageContent').classList.add('hidden');
  var error = document.getElementById('mypageError');
  error.textContent = message;
  error.classList.remove('hidden');
}

function initializeMyPage() {
  Promise.all([
    callMyPageApi_('api_getCurrentUser'),
    callMyPageApi_('api_getMyPermissions')
  ]).then(function (results) {
    renderProfile_(results[0]);
    renderPermissions_(results[1]);
    document.getElementById('mypageError').classList.add('hidden');
    document.getElementById('mypageLoading').classList.add('hidden');
    document.getElementById('mypageContent').classList.remove('hidden');
  }).catch(function (error) {
    showMyPageError_(error && error.message ? error.message : '내 정보를 불러오지 못했습니다.');
  });
}

initializeMyPage();
</script>
```

- [ ] **Step 10: Run green frontend and syntax checks**

```bash
node scripts/test-mypage-frontend.js
python3 - <<'PY'
from pathlib import Path
import re, subprocess
p = Path('src/270_mypage/mypage_js.html')
text = p.read_text(encoding='utf-8')
m = re.search(r'<script>(.*)</script>', text, re.S)
assert m, 'mypage_js.html must contain a script block'
out = Path('/tmp/__mypage_check.js')
out.write_text(m.group(1), encoding='utf-8')
subprocess.run(['node', '--check', str(out)], check=True)
PY
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/270_mypage scripts/test-mypage-frontend.js
git commit -m "feat: add auth-backed mypage"
```

---

### Task 4: Add Architecture Guardrails

**Files:**
- Create: `scripts/verify-mypage-architecture.js`
- Modify: `scripts/verify-auth-iam-architecture.js`
- Modify: `scripts/verify-ui-system-migration.js`

**Interfaces:**
- Guarantees that old `codex/mypage-update` architecture cannot silently re-enter Auth/Login/MyPage scope.

- [ ] **Step 1: Create MyPage architecture verifier**

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
var header = read_('src/100_common/App_Header.html');

assert.ok(code.indexOf("mypage: '270_mypage/MyPage'") !== -1);
assert.ok(code.indexOf("page === 'mypage'") !== -1);
assert.ok(header.indexOf('id="appUserCard"') !== -1);
assert.ok(page.indexOf("include('100_common/App_Header')") !== -1);
assert.ok(page.indexOf("include('100_common/App_Sidebar')") !== -1);
assert.ok(js.indexOf('api_getCurrentUser') !== -1);
assert.ok(js.indexOf('api_getMyPermissions') !== -1);

['sessionStorage', 'localStorage', 'DB_URL', 'setupDatabaseSheet', 'loginWithCredentials', '테스트 유저'].forEach(function (forbidden) {
  assert.strictEqual(js.indexOf(forbidden), -1, 'forbidden MyPage dependency: ' + forbidden);
});

console.log('MyPage architecture verification passed.');
```

- [ ] **Step 2: Extend Auth/IAM verifier with scoped source-branch anti-pattern checks**

Read only files under `src/000_server/030_auth`, `src/200_login`, and `src/270_mypage`, then reject these exact tokens in production code:

```text
loginWithCredentials
setupDatabaseSheet
DB_URL
테스트 유저
password123
```

Do not scan docs or unrelated domains.

- [ ] **Step 3: Extend UI-system verifier for MyPage**

Require `src/270_mypage/MyPage.html` to include shared header/sidebar/styles and reject page-local definitions of shared shell selectors `.header`, `.sidebar`, and `.nav-item` in `MyPage_Styles.html`.

- [ ] **Step 4: Run guardrails**

```bash
node scripts/verify-auth-iam-architecture.js
node scripts/verify-mypage-architecture.js
node scripts/verify-ui-system-migration.js
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-auth-iam-architecture.js \
  scripts/verify-mypage-architecture.js \
  scripts/verify-ui-system-migration.js
git commit -m "test: enforce mypage architecture boundaries"
```

---

### Task 5: Full Repository Regression and Leakage Check

**Files:**
- Test only; change production files only when a fresh regression proves a defect.

**Interfaces:**
- Final evidence for integration readiness.

- [ ] **Step 1: Run syntax checks**

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

- [ ] **Step 2: Run behavior suites**

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

- [ ] **Step 4: Verify rejected old-branch patterns did not leak**

```bash
! grep -R -n -E 'loginWithCredentials|setupDatabaseSheet|DB_URL|테스트 유저|password123' \
  src/000_server/030_auth src/200_login src/270_mypage
! grep -R -n -E 'sessionStorage|localStorage' src/270_mypage
```

Expected: no matches and exit 0.

- [ ] **Step 5: Verify diff scope against `main`**

```bash
git diff --name-status main...HEAD
```

Expected changes are limited to current Auth/IAM/router/shared-header files, `270_mypage`, tests/verifiers, and spec/plan docs. Root-level old-branch `Login.html`, `MyPage.html`, `Code.js`, `.DS_Store`, `.clasp.json`, and old manifest must not appear.

- [ ] **Step 6: Commit only proven regression fixes, if any**

If tests are already green, create no empty commit. If a fresh test exposed a defect, commit only the minimal fix plus its regression test:

```bash
git add <specific-fix-files>
git commit -m "test: finalize auth mypage regression coverage"
```

- [ ] **Step 7: Handoff caveat**

Report that repository regression validates static/Node/GAS contracts, while deployed Apps Script live E2E with a real Google session and real UserDB remains a separate production-environment verification.
