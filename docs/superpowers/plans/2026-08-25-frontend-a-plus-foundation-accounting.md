# Frontend A+ Foundation and Accounting Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce the shared App Frame, `App`/`App.ui` frontend foundation, and `APP_BOOTSTRAP`, then migrate Accounting Ledger, Reconciliation, and Settlement off duplicated page shells and generic global helpers without changing routes, API contracts, authorization semantics, schema, or business workflows.

**Architecture:** Keep Google Apps Script `HtmlService + include() + Vanilla JS + ?page=` routing. Protected Accounting routes render through one common `App_Frame`; generic frontend behavior lives under `App.core`, `App.router`, `App.shell`, and `App.ui`; Accounting pages expose page-local controller namespaces and depend only on common APIs plus `accountingClient`. Non-Accounting pages remain on their current full-page templates in this plan so migration is incremental rather than a big-bang rewrite.

**Tech Stack:** Google Apps Script HTML templates and `.gs`, vanilla JavaScript, CSS, Node.js `assert`/`vm`/`fs` regression and architecture checks, clasp/GitHub.

**Spec:** `docs/superpowers/specs/2026-08-25-frontend-a-plus-architecture-design.md`

## Global Constraints

- Working branch: `refactor/frontend-architecture-a-plus`.
- Base branch/commit: `main` at `ff4ffe0415ff4db6258f324e0a8e9039bc9e21f0`.
- This plan covers only Common Foundation + Accounting (`Ledger -> Reconciliation -> Settlement`). Student Fee, Event, Settings, Main, and MyPage migration are follow-up plans.
- Do not introduce React, Vue, Svelte, TypeScript, npm build output, Vite, esbuild, Rollup, Webpack, SPA routing, client-owned routes, or external frontend hosting.
- Keep `clasp push`, Apps Script templates, and `doGet(?page=...)` as deployment/navigation mechanisms.
- Preserve route names: `accounting_ledger`, `accounting_reconciliation`, `accounting_settlement`.
- Preserve server API names and request/response shapes. `runAppApi()` remains the only direct `google.script.run` transport boundary.
- Preserve authentication/authorization behavior. `api_checkLogin()` and `canAccessPage_()` remain authoritative before protected rendering.
- Preserve Accounting business behavior, form `name` values, behavior IDs, table semantics, approval flow, reconciliation flow, evidence behavior, settlement generation/export behavior, and existing API client calls.
- Common code must not reference Accounting, Student Fee, Event, Settings, or another domain namespace.
- `App.ui` owns UI mechanics/state only. It must never call Accounting APIs or make Accounting decisions.
- Static markup stays in HTML. JS creates markup only for genuinely data-driven structures such as table rows, evidence lists, pagination items, or transient toast state.
- Do not physically relocate `App_Header.html`, `App_Sidebar.html`, or `App_Shell_Styles.html` in this plan. The new Frame becomes their logical owner while legacy pages continue to use the root files. Physical relocation waits until all protected pages migrate.
- Do not move all existing `.ui-*` visual CSS out of `App_Styles.html` now. Existing pages depend on it. `App_UI_Styles.html` adds only behavior/state rules needed by `App.ui`.
- File upload remains Accounting-owned because the workflows are domain-specific. It must no longer depend on one cross-page Accounting-global `state` object.
- Non-Accounting full-page templates are not required to include `app_core_js.html` in this plan. Therefore `app_shell_js.html` must contain compatibility fallbacks when `App.core`/`App.router` are absent on a legacy page.
- Every production task follows RED -> minimal GREEN -> focused regression -> commit.

---

## Target File Map

### Create

```text
src/100_common/core/app_core_js.html
src/100_common/ui/App_UI_Styles.html
src/100_common/ui/app_ui_js.html
src/100_common/frame/App_Frame.html
src/400_accounting/common/accounting_file_upload_js.html
scripts/test-frontend-a-plus-foundation.js
scripts/test-app-ui-components.js
scripts/verify-frontend-a-plus-accounting.js
```

### Modify

```text
src/000_server/Code.js
src/100_common/App_Header.html
src/100_common/app_shell_js.html
src/400_accounting/common/Accounting_Styles.html
src/400_accounting/410_ledger/Accounting_Ledger_View.html
src/400_accounting/410_ledger/modals/Accounting_Ledger_Register_Modal.html
src/400_accounting/410_ledger/modals/Accounting_Ledger_Detail_Modal.html
src/400_accounting/410_ledger/accounting_ledger_js.html
src/400_accounting/420_reconciliation/Accounting_Reconciliation_View.html
src/400_accounting/420_reconciliation/accounting_reconciliation_js.html
src/400_accounting/430_settlement/Accounting_Settlement_View.html
src/400_accounting/430_settlement/accounting_settlement_js.html
scripts/test-app-api-runner.js
scripts/test-api-contract-v1-common-frontend.js
scripts/test-accounting-sidebar-group.js
scripts/test-api-contract-v1-accounting-frontend.js
scripts/verify-ui-system-migration.js
scripts/verify-server-architecture.js
```

### Preserve transport/client boundaries

```text
src/100_common/app_api_runner_js.html
src/100_common/app_client_js.html
src/400_accounting/common/accounting_client_js.html
```

### Delete only after all three Accounting page controllers are GREEN

```text
src/400_accounting/common/accounting_common_js.html
src/400_accounting/410_ledger/Accounting_Ledger.html
src/400_accounting/420_reconciliation/Accounting_Reconciliation.html
src/400_accounting/430_settlement/Accounting_Settlement.html
```

---

## Public Frontend Contracts

### Core and router

```js
App.core.byId(id, root);
App.core.resolveElement(target, root);
App.core.escapeHtml(value);
App.core.formatNumber(value);
App.core.formatMoney(value);
App.core.formatDate(value);
App.router.url(page, params);
App.router.go(page, params);
```

`App.router.url()` resolves the base URL in this order: `APP_BOOTSTRAP.webAppUrl` -> legacy `WEB_APP_URL` -> current `window.location.href`. `App.router.go()` writes to `window.top.location.href` for Apps Script iframe navigation.

### Shell

```js
App.shell.init(APP_BOOTSTRAP);
App.shell.setActiveNavigation(page);
App.shell.setDomainVisible(domain, visible);
```

The shell consumes `APP_BOOTSTRAP.user` and `APP_BOOTSTRAP.access` first. `appClient.getCurrentUser()` is compatibility fallback only when bootstrap user/access is absent.

### UI

```js
App.ui.init(root);
App.ui.button.setLoading(target, loading, loadingLabel);
App.ui.card.setLoading(target, loading);
App.ui.search.clear(target);
App.ui.filter.values(target);
App.ui.filter.reset(target);
App.ui.modal.open(target);
App.ui.modal.close(target);
App.ui.toast.show(message, kind);
App.ui.toast.success(message);
App.ui.toast.error(message);
App.ui.pagination.update(target, { page, totalPages });
```

Component events:

```text
ui:search           detail: { value }
ui:filter-submit    detail: { values }
ui:filter-reset     detail: { values }
ui:page-change      detail: { page }
ui:modal-open       detail: { id }
ui:modal-close      detail: { id }
```

### Accounting page roots

```js
AccountingLedgerPage
AccountingReconciliationPage
AccountingSettlementPage
```

Each controller owns page-local state and explicit initialization. No migrated Accounting page may depend on generic global `state`, `toast`, `escapeHtml`, `currency`, `openModal`, or `closeModal` functions.

---

### Task 1: Add the Frontend A+ architecture gate in RED

**Files:**
- Create: `scripts/test-frontend-a-plus-foundation.js`
- Create: `scripts/verify-frontend-a-plus-accounting.js`

- [ ] **Step 1: Add the common-foundation contract test**

Create `scripts/test-frontend-a-plus-foundation.js`:

```js
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var ROOT = path.resolve(__dirname, '..');
function read_(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }

[
  'src/100_common/core/app_core_js.html',
  'src/100_common/ui/App_UI_Styles.html',
  'src/100_common/ui/app_ui_js.html',
  'src/100_common/frame/App_Frame.html'
].forEach(function (p) {
  assert.ok(fs.existsSync(path.join(ROOT, p)), p + ' must exist');
});

var core = read_('src/100_common/core/app_core_js.html');
['App.core','App.router','escapeHtml','formatMoney','formatNumber','resolveElement'].forEach(function (token) {
  assert.ok(core.indexOf(token) >= 0, 'core contract missing ' + token);
});
var ui = read_('src/100_common/ui/app_ui_js.html');
['App.ui','App.ui.init','App.ui.button','App.ui.card','App.ui.search','App.ui.filter','App.ui.modal','App.ui.toast','App.ui.pagination'].forEach(function (token) {
  assert.ok(ui.indexOf(token) >= 0, 'UI contract missing ' + token);
});
var frame = read_('src/100_common/frame/App_Frame.html');
[
  "include('100_common/App_Header')",
  "include('100_common/App_Sidebar')",
  "include('100_common/core/app_core_js')",
  "include('100_common/ui/app_ui_js')",
  'APP_BOOTSTRAP'
].forEach(function (token) {
  assert.ok(frame.indexOf(token) >= 0, 'Frame contract missing ' + token);
});
console.log('Frontend A+ foundation contract: PASS');
```

- [ ] **Step 2: Add Accounting architecture verification**

Create `scripts/verify-frontend-a-plus-accounting.js` with accumulated failures and exit code `1`. Lock these invariants:

```text
- Code.js has App Frame descriptors for accounting_ledger/accounting_reconciliation/accounting_settlement.
- after final migration, the old three Accounting full-document wrappers are absent.
- all behavior IDs/form names below remain present.
- Accounting views no longer define id="toast"; the shared Header owns it.
- each page script exposes its named controller.
- page scripts contain no top-level generic state/toast/escapeHtml/currency/openModal/closeModal declaration.
- core/ui/frame files contain neither Accounting nor accountingClient references.
- Accounting page scripts contain no google.script.run.
- accountingClient remains the semantic server client.
```

Use these literal hooks:

```js
var REQUIRED_IDS = {
  'src/400_accounting/410_ledger/Accounting_Ledger_View.html': [
    'ledgerDbLink','openRegister','sumIncome','sumExpense','sumPending','sumReview',
    'keyword','type','department','event','status','rows','ledgerPagination',
    'prevLedgerPage','ledgerPageInfo','nextLedgerPage'
  ],
  'src/400_accounting/410_ledger/modals/Accounting_Ledger_Register_Modal.html': [
    'registerModal','entryForm','expenseBtn','incomeBtn','formDepartment','formEvent',
    'eventBalance','entryEvidenceDropzone','entryEvidenceFile','entryEvidenceFileName','draft','create'
  ],
  'src/400_accounting/410_ledger/modals/Accounting_Ledger_Detail_Modal.html': [
    'detailModal','detailTitle','detailStatus','detailAlert','detailRows','detailEvidenceList',
    'editLedger','deleteLedger','approve'
  ],
  'src/400_accounting/420_reconciliation/Accounting_Reconciliation_View.html': [
    'reconciliationView','reconciliationDropzone','reconciliationFile','reconciliationFileName',
    'runMissingCheck','ocrResultSummary','reconciliationStartDate','reconciliationEndDate',
    'reconciliationStatus','reconciliationSearch','resetReconciliationFilters',
    'reconciliationHistory','reconciliationRows','reconciliationSummary',
    'reconciliationLedgerDetailModal','reconciliationLedgerDetailTitle',
    'reconciliationLedgerDetailStatus','reconciliationLedgerDetailRows','reconciliationLedgerEvidenceList'
  ],
  'src/400_accounting/430_settlement/Accounting_Settlement_View.html': [
    'settlementView','settlementIncome','settlementExpense','settlementBalance',
    'settlementIncomeCount','settlementExpenseCount','settlementEvidenceCount',
    'settlementStartDate','settlementEndDate','refreshSettlement','generateSettlement',
    'settlementHistory','exportSettlement','settlementExportPreview'
  ]
};
```

Preserve Ledger form names:

```js
['transaction_date','department_name','amount','counterparty','event_name','description','note']
```

- [ ] **Step 3: Prove RED**

```bash
node scripts/test-frontend-a-plus-foundation.js
node scripts/verify-frontend-a-plus-accounting.js
```

Expected: FAIL because the new common files/controllers/descriptors do not yet exist and legacy Accounting wrappers still exist.

- [ ] **Step 4: Commit**

```bash
git add scripts/test-frontend-a-plus-foundation.js scripts/verify-frontend-a-plus-accounting.js
git commit -m "test: define frontend a+ architecture contract"
```

---

### Task 2: Implement `App.core`, `App.router`, and `App.ui`

**Files:**
- Create: `src/100_common/core/app_core_js.html`
- Create: `src/100_common/ui/app_ui_js.html`
- Create: `src/100_common/ui/App_UI_Styles.html`
- Create: `scripts/test-app-ui-components.js`

- [ ] **Step 1: Add component behavior tests and prove RED**

`test-app-ui-components.js` strips `<script>` wrappers and evaluates common scripts in `vm` with a small fake DOM/event target. Test:

```text
escapeHtml('<&"\'') = '&lt;&amp;&quot;&#39;'
formatNumber(12000) = '12,000'
formatMoney(12000) = '₩12,000'
button loading disables and replaces label, then restores both label and original disabled state
modal open/close toggles open + is-open and emits exactly one matching event
pagination update writes page info/bounds and click emits ui:page-change
App.ui.init(root) may run twice without duplicate input/click handlers
```

Run and confirm failure because the files are absent:

```bash
node scripts/test-app-ui-components.js
```

- [ ] **Step 2: Implement `app_core_js.html`**

```js
<script>
(function (global) {
  var App = global.App = global.App || {};
  App.core = App.core || {};
  App.router = App.router || {};

  App.core.byId = function (id, root) {
    var scope = root || document;
    return scope.getElementById ? scope.getElementById(id) : scope.querySelector('#' + id);
  };
  App.core.resolveElement = function (target, root) {
    if (!target) return null;
    if (typeof target !== 'string') return target;
    return target.charAt(0) === '#'
      ? (root || document).querySelector(target)
      : App.core.byId(target, root);
  };
  App.core.escapeHtml = function (value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
  App.core.formatNumber = function (value) {
    return new Intl.NumberFormat('ko-KR').format(Number(value || 0));
  };
  App.core.formatMoney = function (value) { return '₩' + App.core.formatNumber(value); };
  App.core.formatDate = function (value) { return String(value || '').slice(0, 10); };

  App.router.url = function (page, params) {
    var bootstrap = global.APP_BOOTSTRAP || {};
    var base = bootstrap.webAppUrl || global.WEB_APP_URL || global.location.href;
    var url = new URL(base, global.location.href);
    url.searchParams.set('page', page);
    Object.keys(params || {}).forEach(function (key) {
      var value = params[key];
      if (value === null || typeof value === 'undefined' || value === '') return;
      url.searchParams.set(key, value);
    });
    return url.toString();
  };
  App.router.go = function (page, params) {
    global.top.location.href = App.router.url(page, params);
  };
})(window);
</script>
```

Do not move `runAppApi()` into this file.

- [ ] **Step 3: Implement `app_ui_js.html`**

Use an IIFE extending `window.App.ui`. Implement these mechanics exactly:

```text
button.setLoading(target, true, label)
  store original text/disabled once in data attributes
  add is-loading + aria-busy=true
  disable and optionally replace label
button.setLoading(target, false)
  remove loading state and restore original text/disabled

card.setLoading
  toggle is-loading and aria-busy

search.initAll
  bind [data-ui="search"] once with data-ui-bound-search="true"
  input emits ui:search {value: trimmedValue}
search.clear
  clear + focus + emit ui:search {value:''}

filter.initAll
  bind form[data-ui="filter"] submit/reset once
  submit prevents default and emits ui:filter-submit with filter.values(form)
  reset emits ui:filter-reset after native reset
filter.values
  FormData -> plain object

modal.initAll
  bind [data-ui-modal-close] and compatibility [data-close] once
modal.open/close
  toggle open + is-open, update aria-hidden, emit ui:modal-open/ui:modal-close

pagination.initAll
  bind [data-ui="pagination"] prev/next controls once
  click derives bounded next page from root dataset and emits ui:page-change
pagination.update
  save page/totalPages in root dataset, update [data-ui-page-info], disable boundary buttons

toast.show
  resolve document [data-ui="toast"], fallback #toast
  clear previous timer; set message/kind; toggle show; auto-hide
success/error
  delegate to show

App.ui.init(root)
  call only component initAll functions that exist; repeated calls must not duplicate binding
```

Use:

```js
new CustomEvent(name, { bubbles: true, detail: detail });
```

for UI events.

- [ ] **Step 4: Add behavior-only styles**

`App_UI_Styles.html`:

```css
<style>
  .ui-btn.is-loading { cursor: wait; }
  .ui-card.is-loading { cursor: progress; }
  .ui-modal-overlay { display: none; }
  .ui-modal-overlay.open,
  .ui-modal-overlay.is-open { display: flex; }
  .ui-toast.ui-toast--success { border-color: var(--ui-success-fg); }
  .ui-toast.ui-toast--error { border-color: var(--ui-danger-fg); }
</style>
```

Do not duplicate base visual definitions from `App_Styles.html`.

- [ ] **Step 5: Verify and commit**

```bash
node scripts/test-app-ui-components.js
node scripts/test-app-api-runner.js
```

Expected: both PASS.

```bash
git add src/100_common/core src/100_common/ui scripts/test-app-ui-components.js
git commit -m "feat: add shared frontend core and ui behavior"
```

---

### Task 3: Add shared App Frame, bootstrap context, and Accounting descriptors

**Files:**
- Create: `src/100_common/frame/App_Frame.html`
- Modify: `src/000_server/Code.js`
- Modify: `src/100_common/App_Header.html`
- Modify: `src/100_common/app_shell_js.html`
- Modify: `scripts/test-app-api-runner.js`
- Modify: `scripts/test-api-contract-v1-common-frontend.js`
- Modify: `scripts/test-accounting-sidebar-group.js`
- Modify: `scripts/verify-server-architecture.js`
- Modify: `scripts/verify-ui-system-migration.js`

- [ ] **Step 1: Update tests for shared-frame routing and prove RED**

Change `verify-server-architecture.js` so Accounting routes remain required by name but are verified through `getAppPageDescriptor_()` rather than required direct template files. In `test-app-api-runner.js`, remove the three Accounting full wrappers from the direct-include list and assert `App_Frame.html` includes `100_common/app_api_runner_js`. In `verify-ui-system-migration.js`, use the common Frame as the Accounting shell target while retaining view/modal class/hook checks.

Run:

```bash
node scripts/test-app-api-runner.js
node scripts/verify-server-architecture.js
node scripts/verify-ui-system-migration.js
```

Expected: FAIL until descriptors/Frame exist.

- [ ] **Step 2: Add Accounting page descriptors**

In `Code.js`:

```js
function getAppPageDescriptor_(page) {
  var descriptors = {
    accounting_ledger: {
      title: '수입·지출 관리',
      mainClass: 'main accounting-main',
      views: [
        '400_accounting/410_ledger/Accounting_Ledger_View',
        '400_accounting/410_ledger/modals/Accounting_Ledger_Register_Modal',
        '400_accounting/410_ledger/modals/Accounting_Ledger_Detail_Modal'
      ],
      styles: ['400_accounting/common/Accounting_Styles'],
      scripts: [
        '400_accounting/common/accounting_client_js',
        '400_accounting/common/accounting_common_js',
        '400_accounting/410_ledger/accounting_ledger_js'
      ]
    },
    accounting_reconciliation: {
      title: '계좌·장부 대조',
      mainClass: 'main accounting-main',
      views: ['400_accounting/420_reconciliation/Accounting_Reconciliation_View'],
      styles: ['400_accounting/common/Accounting_Styles'],
      scripts: [
        '400_accounting/common/accounting_client_js',
        '400_accounting/common/accounting_common_js',
        '400_accounting/420_reconciliation/accounting_reconciliation_js'
      ]
    },
    accounting_settlement: {
      title: '결산 보고서',
      mainClass: 'main accounting-main',
      views: ['400_accounting/430_settlement/Accounting_Settlement_View'],
      styles: ['400_accounting/common/Accounting_Styles'],
      scripts: [
        '400_accounting/common/accounting_client_js',
        '400_accounting/common/accounting_common_js',
        '400_accounting/430_settlement/accounting_settlement_js'
      ]
    }
  };
  return descriptors[page] || null;
}
```

The temporary `accounting_common_js` entries preserve behavior until Tasks 4-7.

- [ ] **Step 3: Build bootstrap from the existing authenticated login result**

```js
function buildAppBootstrap_(page, login, resourceId) {
  var user = login && login.user ? login.user : {};
  return {
    webAppUrl: getWebAppUrl(),
    currentPage: page,
    resourceId: resourceId || '',
    user: {
      name: user.name || '',
      title: user.title || '',
      email: login && login.email ? login.email : '',
      isAdmin: !!(login && login.isAdmin)
    },
    access: login && login.domainAccess ? login.domainAccess : {}
  };
}

function serializeForHtmlScript_(value) {
  return JSON.stringify(value || {})
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
```

Do not call `api_getCurrentUser()` from the render path. Reuse the result already returned by `api_checkLogin()`.

- [ ] **Step 4: Add Frame renderer and route branch**

```js
function renderAppFrame_(descriptor, data) {
  var template = HtmlService.createTemplateFromFile('100_common/frame/App_Frame');
  template.pageTitle = descriptor.title || APP_TITLE;
  template.pageMainClass = descriptor.mainClass || 'main';
  template.pageStyleHtml = (descriptor.styles || []).map(include).join('\n');
  template.pageContentHtml = (descriptor.views || []).map(include).join('\n');
  template.pageScriptHtml = (descriptor.scripts || []).map(include).join('\n');
  template.appBootstrapJson = serializeForHtmlScript_(data.appBootstrap || {});
  return template.evaluate();
}
```

After successful existing login/access checks in `doGet()`:

```js
var descriptor = getAppPageDescriptor_(page);
if (descriptor) {
  templateData.appBootstrap = buildAppBootstrap_(page, login, templateData.resourceId);
  return renderAppFrame_(descriptor, templateData)
    .setTitle(APP_TITLE)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
```

Other routes continue through existing `renderPage_()`.

- [ ] **Step 5: Implement `App_Frame.html`**

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <base target="_top">
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><?= pageTitle ?></title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&display=swap" rel="stylesheet">
  <?!= include('100_common/App_Styles'); ?>
  <?!= include('100_common/App_Shell_Styles'); ?>
  <?!= include('100_common/ui/App_UI_Styles'); ?>
  <?!= pageStyleHtml ?>
  <?!= include('100_common/app_api_runner_js'); ?>
  <?!= include('100_common/app_client_js'); ?>
  <?!= include('100_common/core/app_core_js'); ?>
  <script>window.APP_BOOTSTRAP = <?!= appBootstrapJson ?>;</script>
</head>
<body class="app-mode">
  <div class="app">
    <?!= include('100_common/App_Header'); ?>
    <div class="body">
      <?!= include('100_common/App_Sidebar'); ?>
      <main class="<?= pageMainClass ?>"><?!= pageContentHtml ?></main>
    </div>
  </div>
  <?!= include('100_common/ui/app_ui_js'); ?>
  <?!= include('100_common/app_shell_js'); ?>
  <script>
    App.ui.init(document);
    App.shell.init(window.APP_BOOTSTRAP || {});
  </script>
  <?!= pageScriptHtml ?>
</body>
</html>
```

- [ ] **Step 6: Make Header the shared toast owner**

Replace the existing header toast markup with:

```html
<div class="ui-toast" id="toast" data-ui="toast" role="status" aria-live="polite"></div>
```

Accounting page-owned toast nodes remain temporarily until each page migration removes them. Do not add a second Frame-level toast.

- [ ] **Step 7: Refactor shell under `App.shell` with legacy-page fallbacks**

Start `app_shell_js.html` with:

```js
(function (global) {
  var App = global.App = global.App || {};
  App.shell = App.shell || {};

  function byId_(id) {
    return App.core && App.core.byId ? App.core.byId(id) : document.getElementById(id);
  }

  function pageUrl_(page) {
    if (App.router && App.router.url) return App.router.url(page);
    var base = global.WEB_APP_URL || global.location.href;
    var separator = base.indexOf('?') >= 0 ? '&' : '?';
    return base + separator + 'page=' + encodeURIComponent(page);
  }
```

`App.shell.init(bootstrap)` performs, in order:

```text
apply sidebar saved state
render user/profile from bootstrap.user
wire links using pageUrl_
apply bootstrap.access visibility
apply current-page active state
bind sidebar/profile/accounting/student-fee handlers once
if bootstrap user/access are missing, fetch appClient.getCurrentUser() as compatibility fallback
```

Expose:

```js
App.shell.setActiveNavigation = setActiveNavigation_;
App.shell.setDomainVisible = setDomainVisible_;
```

At the bottom retain compatibility wrappers for legacy scripts/tests:

```js
function buildAppPageUrl(page) { return pageUrl_(page); }
function getAppElement(id) { return byId_(id); }

if (!global.APP_BOOTSTRAP) {
  App.shell.init({
    webAppUrl: global.WEB_APP_URL || '',
    currentPage: global.APP_CURRENT_PAGE || '',
    user: {
      name: global.APP_USER_NAME || '',
      title: global.APP_USER_TITLE || '',
      isAdmin: !!global.APP_IS_ADMIN
    }
  });
}
})(window);
```

This fallback is mandatory because legacy non-Accounting templates do not load `app_core_js.html` yet.

- [ ] **Step 8: Update sidebar tests to assert public outcomes**

Keep Sidebar markup assertions. Replace tests for private old shell function names with checks that the shell exposes `App.shell.setActiveNavigation`, contains the three Accounting route literals, and routes through `pageUrl_`/`App.router.url` when available.

- [ ] **Step 9: Verify and commit**

```bash
node scripts/test-frontend-a-plus-foundation.js
node scripts/test-app-ui-components.js
node scripts/test-app-api-runner.js
node scripts/test-api-contract-v1-common-frontend.js
node scripts/test-accounting-sidebar-group.js
node scripts/test-auth-iam.js
node scripts/verify-server-architecture.js
node scripts/verify-ui-system-migration.js
```

Expected: Frame/bootstrap/shell tests PASS. The Accounting A+ verifier can still report controller/global-helper/legacy-wrapper work reserved for later tasks.

```bash
git add src/000_server/Code.js src/100_common scripts/test-app-api-runner.js scripts/test-api-contract-v1-common-frontend.js scripts/test-accounting-sidebar-group.js scripts/verify-server-architecture.js scripts/verify-ui-system-migration.js
git commit -m "refactor: render accounting through shared app frame"
```

---

### Task 4: Migrate Ledger to `AccountingLedgerPage`

**Files:**
- Modify: Ledger View, both Ledger modal partials, `accounting_ledger_js.html`, A+ verifier.

- [ ] **Step 1: Tighten Ledger controller assertions and prove RED**

Require `AccountingLedgerPage`, `state`, `init`, `bindEvents`, render/load behavior, actions, and modal/evidence lifecycle. Reject generic globals. Run:

```bash
node scripts/verify-frontend-a-plus-accounting.js
```

Expected: Ledger slice FAIL.

- [ ] **Step 2: Add component metadata without changing behavior hooks**

Preserve every current ID/name. Add a `[data-ui="search"]` container around `#keyword`. Change pagination to:

```html
<div class="accounting-ledger-pagination ui-pagination" id="ledgerPagination" data-ui="pagination">
  <button class="ui-page-btn" id="prevLedgerPage" data-ui-page="prev" type="button" aria-label="이전 페이지">‹</button>
  <span class="page-count" id="ledgerPageInfo" data-ui-page-info>1 / 1</span>
  <button class="ui-page-btn" id="nextLedgerPage" data-ui-page="next" type="button" aria-label="다음 페이지">›</button>
</div>
```

For both modals add `data-ui="modal"`; on close controls add `data-ui-modal-close` while retaining existing `data-close` during migration. Add `data-ui="button"` where loading behavior is used. Remove the Ledger View's page-owned `id="toast"`.

- [ ] **Step 3: Replace shared global state with page-local state**

Start the page script:

```js
<script>
var AccountingLedgerPage = (function () {
  var page = {
    state: {
      items: [],
      events: [],
      selectedType: '지출',
      selectedId: null,
      editingLedgerId: null,
      page: 1,
      pageSize: 10,
      saving: false,
      uploadFiles: [],
      evidencePreviewUrls: [],
      evidencePreviewRequest: 0
    }
  };
```

Move all Ledger-only functions into this IIFE. Keep private helpers private; expose page business actions under `page.actions` and lifecycle under `page.modals` where needed.

Mechanical replacements:

```text
escapeHtml(x)        -> App.core.escapeHtml(x)
currency(x)          -> App.core.formatMoney(x)
won.format(x)        -> App.core.formatNumber(x)
toast(message)       -> App.ui.toast.show(message)
openModal(id)        -> App.ui.modal.open(id)
closeModal(id)       -> App.ui.modal.close(id)
state.ledgerPage     -> page.state.page
state.ledgerPageSize -> page.state.pageSize
state.items/events   -> page.state.items/events
```

- [ ] **Step 4: Move generic button/pagination mechanics to App.ui**

Use:

```js
App.ui.button.setLoading(button, true, draft ? '임시저장 중...' : '저장 중...');
try {
  // existing accountingClient mutation and workflow
} finally {
  App.ui.button.setLoading(button, false);
}
```

Pagination listens once:

```js
App.core.byId('ledgerPagination').addEventListener('ui:page-change', function (event) {
  page.state.page = event.detail.page;
  render_();
});
```

and render calls:

```js
App.ui.pagination.update('ledgerPagination', { page: page.state.page, totalPages: totalPages });
```

Remove old direct prev/next handlers so the UI event is not double-bound.

- [ ] **Step 5: Let App.ui own modal close controls**

Remove any Ledger page listener whose only job is reading `[data-close]` and toggling `.open`. Keep page listeners only when closing requires domain cleanup. If cleanup is needed, listen for `ui:modal-close` rather than binding the same close button a second time.

- [ ] **Step 6: Explicit init**

```js
page.bindEvents = function () {
  App.core.byId('openRegister').addEventListener('click', function () { page.actions.openCreate(); });
  App.core.byId('keyword').addEventListener('input', function () { page.state.page = 1; render_(); });
  ['type','department','event','status'].forEach(function (id) {
    App.core.byId(id).addEventListener('change', function () { page.state.page = 1; render_(); });
  });
  // bind existing register/detail/evidence business actions once
};
page.init = function () {
  page.bindEvents();
  refresh_().catch(function (error) {
    App.ui.toast.error(error && error.message ? error.message : '장부를 불러오지 못했습니다.');
  });
};
return page;
})();
AccountingLedgerPage.init();
</script>
```

Preserve all existing Ledger API calls: DB info, summary/list/event options, create draft/create/update/delete/process approval, and evidence file content.

- [ ] **Step 7: Verify and commit**

```bash
node scripts/test-frontend-api-mapping.js
node scripts/test-api-contract-v1-accounting-frontend.js
node scripts/verify-frontend-api-contract-v1.js
node scripts/verify-ui-system-migration.js
node scripts/verify-frontend-a-plus-accounting.js
```

Expected: Ledger-specific failures gone; Reconciliation/Settlement/common cleanup may remain.

```bash
git add src/400_accounting/410_ledger scripts/verify-frontend-a-plus-accounting.js
git commit -m "refactor: migrate accounting ledger page controller"
```

---

### Task 5: Migrate Reconciliation to `AccountingReconciliationPage`

**Files:**
- Modify: `Accounting_Reconciliation_View.html`, `accounting_reconciliation_js.html`, A+ verifier.

- [ ] **Step 1: Require controller and prove RED**

Require `AccountingReconciliationPage` and reject generic globals. Confirm the Reconciliation slice fails before production changes.

- [ ] **Step 2: Add component metadata**

Preserve every existing ID. Add:

```text
#reconciliationLedgerDetailModal -> data-ui="modal"
its close buttons -> data-ui-modal-close plus existing data-close
search wrapper -> data-ui="search"
#runMissingCheck -> data-ui="button"
```

Remove the Reconciliation View's page-owned `id="toast"`. Keep the upload dropzone Accounting-specific.

- [ ] **Step 3: Move state under the page root**

```js
var AccountingReconciliationPage = (function () {
  var page = {
    state: {
      files: [],
      detail: { header: null, items: [] },
      runs: [],
      importing: false,
      evidencePreviewUrls: [],
      evidencePreviewRequest: 0
    }
  };
```

Map old state:

```text
state.reconciliationDetail         -> page.state.detail
state.reconciliationRuns           -> page.state.runs
state.reconciliationImporting      -> page.state.importing
state.uploadFiles.reconciliation   -> page.state.files
state reconciliation preview fields -> page.state evidence preview fields
```

Generic replacements:

```text
escapeHtml -> App.core.escapeHtml
currency   -> App.core.formatMoney
toast      -> App.ui.toast
modal class toggling -> App.ui.modal.open/close
run button generic loading -> App.ui.button.setLoading
```

Keep Reconciliation-specific functions local: bank payload parsing, transaction type/status mapping, evidence preview logic, import range aggregation, candidate selection, linking, and reconciliation result transformations.

- [ ] **Step 4: Preserve PR #31 create-response normalization**

Keep:

```js
var result = await accountingClient.createLedgerEntryFromReconciliation({ reconciliationItemId: itemId });
var detail = result && result.snapshot ? result.snapshot : result;
showCurrentReconciliationRun_(detail);
```

Do not relabel the current-run selector as a complete reconciliation history.

- [ ] **Step 5: Remove duplicate modal close binding**

Let `App.ui.modal` own close-button mechanics. If evidence object URLs must be revoked when the modal closes, attach one `ui:modal-close` listener to the modal root and perform only cleanup there.

- [ ] **Step 6: Explicit init**

`page.init()` binds once:

```text
file input/dropzone selection
runMissingCheck click
filter/search changes
reset filter
reconciliationHistory change
row action delegation: detail/link/create/download
ui:modal-close cleanup for evidence previews
```

Initialize current empty/run presentation without adding a new server request.

- [ ] **Step 7: Verify and commit**

```bash
node scripts/test-frontend-api-mapping.js
node scripts/test-api-contract-v1-accounting-frontend.js
node scripts/verify-frontend-api-contract-v1.js
node scripts/verify-ui-system-migration.js
node scripts/verify-frontend-a-plus-accounting.js
```

Expected: Reconciliation-specific failures gone.

```bash
git add src/400_accounting/420_reconciliation scripts/verify-frontend-a-plus-accounting.js
git commit -m "refactor: migrate accounting reconciliation page controller"
```

---

### Task 6: Migrate Settlement to `AccountingSettlementPage`

**Files:**
- Modify: `Accounting_Settlement_View.html`, `accounting_settlement_js.html`, A+ verifier.

- [ ] **Step 1: Require controller and prove RED**

Require `AccountingSettlementPage` and reject generic globals. Confirm Settlement fails before migration.

- [ ] **Step 2: Update markup**

Preserve all existing IDs. Add `data-ui="button"` to `refreshSettlement`, `generateSettlement`, and `exportSettlement` where loading behavior is used. Remove the Settlement View's page-owned `id="toast"`.

- [ ] **Step 3: Move shared state to page-local state**

```js
var AccountingSettlementPage = (function () {
  var page = { state: { reports: [] } };
```

Replace:

```text
state.settlementReports -> page.state.reports
currency                -> App.core.formatMoney
escapeHtml              -> App.core.escapeHtml
toast                    -> App.ui.toast
```

Keep period validation, summary rendering, report selection, API calls, and export preview formatting page-owned.

- [ ] **Step 4: Shared button loading**

For snapshot generation:

```js
App.ui.button.setLoading('generateSettlement', true, '생성 중...');
try {
  var report = await accountingClient.createSettlementReport(period);
  renderSettlement_(report);
  await refreshSettlementHistory_(report.id);
  App.ui.toast.success('결산 스냅샷이 생성되었습니다.');
} catch (error) {
  App.ui.toast.error(error && error.message ? error.message : '결산 생성에 실패했습니다.');
} finally {
  App.ui.button.setLoading('generateSettlement', false);
}
```

Do not change report payload/export format.

- [ ] **Step 5: Explicit init**

Bind `refreshSettlement`, `generateSettlement`, `settlementHistory`, and `exportSettlement` in `page.bindEvents()`. `page.init()` calls `refreshSettlementHistory_()` exactly once, preserving current initial behavior.

- [ ] **Step 6: Verify and commit**

```bash
node scripts/test-api-contract-v1-accounting-frontend.js
node scripts/test-frontend-api-mapping.js
node scripts/verify-frontend-api-contract-v1.js
node scripts/verify-ui-system-migration.js
node scripts/verify-frontend-a-plus-accounting.js
```

Expected: all three page-controller checks GREEN except cleanup gates.

```bash
git add src/400_accounting/430_settlement scripts/verify-frontend-a-plus-accounting.js
git commit -m "refactor: migrate accounting settlement page controller"
```

---

### Task 7: Remove Accounting-generic globals and old full-document shells

**Files:**
- Create: `src/400_accounting/common/accounting_file_upload_js.html`
- Modify: `src/000_server/Code.js`
- Modify: Ledger/Reconciliation scripts, `Accounting_Styles.html`, Accounting frontend contract test, A+ verifier, UI migration verifier.
- Delete: `accounting_common_js.html` and the three Accounting full shell HTML files.

- [ ] **Step 1: Add cleanup gates and prove RED**

Require:

```text
accounting_common_js.html absent
Accounting_Ledger.html absent
Accounting_Reconciliation.html absent
Accounting_Settlement.html absent
accounting_file_upload_js.html present
Code.js descriptors contain no accounting_common_js
Accounting Views contain no id="toast"
Frame/Header composition owns the shared toast
```

Update `test-api-contract-v1-accounting-frontend.js` to stop reading `accounting_common_js.html` and instead assert `accounting_file_upload_js.html` contains neither `google.script.run` nor `runAppApi`.

- [ ] **Step 2: Extract domain-specific file selection mechanics**

Create:

```js
<script>
var Accounting = window.Accounting || {};
Accounting.fileUpload = (function () {
  function bind(config) {
    var dropzone = document.getElementById(config.dropzoneId);
    var input = document.getElementById(config.inputId);
    var label = document.getElementById(config.labelId);
    if (!dropzone || !input) return;
    if (dropzone.dataset.accountingUploadBound === 'true') return;
    dropzone.dataset.accountingUploadBound = 'true';

    function apply(files) {
      var selected = Array.prototype.slice.call(files || []);
      if (label) label.textContent = selected.length
        ? selected.map(function (file) { return file.name; }).join(', ')
        : '선택된 파일 없음';
      if (typeof config.onChange === 'function') config.onChange(selected);
    }

    input.addEventListener('change', function () { apply(input.files); });
    dropzone.addEventListener('dragover', function (event) {
      event.preventDefault();
      dropzone.classList.add('drag-over');
    });
    dropzone.addEventListener('dragleave', function () { dropzone.classList.remove('drag-over'); });
    dropzone.addEventListener('drop', function (event) {
      event.preventDefault();
      dropzone.classList.remove('drag-over');
      apply(event.dataTransfer && event.dataTransfer.files);
    });
  }
  return { bind: bind };
})();
</script>
```

This helper owns selection mechanics only; it owns no page state and calls no API.

- [ ] **Step 3: Switch Ledger/Reconciliation upload state to callbacks**

Ledger:

```js
Accounting.fileUpload.bind({
  dropzoneId: 'entryEvidenceDropzone',
  inputId: 'entryEvidenceFile',
  labelId: 'entryEvidenceFileName',
  onChange: function (files) { page.state.uploadFiles = files; }
});
```

Reconciliation:

```js
Accounting.fileUpload.bind({
  dropzoneId: 'reconciliationDropzone',
  inputId: 'reconciliationFile',
  labelId: 'reconciliationFileName',
  onChange: function (files) {
    page.state.files = files;
    resetCurrentReconciliation_(files);
  }
});
```

Keep base64 parsing/workflow logic in its owning page.

- [ ] **Step 4: Finalize descriptor script lists**

```js
accounting_ledger: [
  '400_accounting/common/accounting_client_js',
  '400_accounting/common/accounting_file_upload_js',
  '400_accounting/410_ledger/accounting_ledger_js'
],
accounting_reconciliation: [
  '400_accounting/common/accounting_client_js',
  '400_accounting/common/accounting_file_upload_js',
  '400_accounting/420_reconciliation/accounting_reconciliation_js'
],
accounting_settlement: [
  '400_accounting/common/accounting_client_js',
  '400_accounting/430_settlement/accounting_settlement_js'
]
```

- [ ] **Step 5: Remove only generic modal-state CSS from Accounting**

When shared behavior CSS is active, remove:

```css
.accounting-page .accounting-modal-overlay { display: none; }
.accounting-page .accounting-modal-overlay.open { display: flex; }
```

Retain Accounting-specific modal sizing/layout, evidence preview, Ledger widths, Reconciliation layout, and Settlement composition.

- [ ] **Step 6: Delete obsolete files**

Delete the four files listed in the file map. Keep `accounting_client_js.html` and `Accounting_Styles.html`.

- [ ] **Step 7: Verify and commit**

```bash
node scripts/test-frontend-a-plus-foundation.js
node scripts/test-app-ui-components.js
node scripts/test-app-api-runner.js
node scripts/test-api-contract-v1-common-frontend.js
node scripts/test-api-contract-v1-accounting-frontend.js
node scripts/test-frontend-api-mapping.js
node scripts/verify-frontend-api-mapping.js
node scripts/verify-frontend-api-contract-v1.js
node scripts/test-accounting-sidebar-group.js
node scripts/verify-ui-system-migration.js
node scripts/verify-frontend-a-plus-accounting.js
```

Expected: all PASS.

```bash
git add src/000_server/Code.js src/400_accounting scripts/test-api-contract-v1-accounting-frontend.js scripts/verify-ui-system-migration.js scripts/verify-frontend-a-plus-accounting.js
git commit -m "refactor: remove accounting frontend legacy shell globals"
```

---

### Task 8: Full regression and CI-facing verification

**Files:**
- Modify tests/verifiers only if an assertion still encodes an intentionally removed implementation detail instead of preserved behavior.
- Do not change production behavior in this task.

- [ ] **Step 1: Run common/server regression**

```bash
node scripts/test-core.js
node scripts/test-auth-iam.js
node scripts/test-api-contract-v1-server.js
node scripts/test-app-api-runner.js
node scripts/test-api-contract-v1-common-frontend.js
node scripts/verify-server-architecture.js
node scripts/verify-frontend-api-contract-v1.js
node scripts/test-frontend-api-mapping.js
node scripts/verify-frontend-api-mapping.js
```

Expected: all exit `0`.

- [ ] **Step 2: Run Accounting regression**

```bash
node scripts/test-accounting.js
node scripts/test-accounting-boundary-contract.js
node scripts/test-accounting-sidebar-group.js
node scripts/test-api-contract-v1-accounting-frontend.js
node scripts/verify-accounting-architecture.js
node scripts/verify-ui-system-migration.js
node scripts/test-frontend-a-plus-foundation.js
node scripts/test-app-ui-components.js
node scripts/verify-frontend-a-plus-accounting.js
```

Expected: all exit `0`.

- [ ] **Step 3: Run the existing frontend workflow commands exactly**

`.github/workflows/frontend-api-mapping.yml` currently executes:

```bash
node scripts/test-frontend-api-mapping.js
node scripts/verify-frontend-api-mapping.js
node scripts/verify-frontend-api-contract-v1.js
```

Run them exactly. Also run the Accounting DB workflow commands when its path filters are triggered by changed server/Accounting files. Do not claim GitHub Actions success unless actual Actions results are checked.

- [ ] **Step 4: Manually inspect architecture invariants**

Confirm:

```text
only app_api_runner_js.html contains google.script.run outside server code
three Accounting scripts expose their Page controller roots
no migrated Accounting script declares generic global state/toast/escapeHtml/currency/openModal/closeModal
no Accounting View defines id="toast"
Frame owns Header + Sidebar for the three migrated routes
Code.js retains all route names and protected access checks
core/ui/frame common files contain no Accounting/accountingClient reference
```

- [ ] **Step 5: Commit verifier-only corrections if any**

If legitimate migration-related test/verifier corrections changed files:

```bash
git add scripts .github/workflows
git commit -m "test: finalize frontend a+ accounting verification"
```

If nothing changed, do not create an empty commit.

---

## Completion Criteria

1. `accounting_ledger`, `accounting_reconciliation`, and `accounting_settlement` keep their public route names and authorization behavior.
2. The three routes render through `src/100_common/frame/App_Frame.html` instead of page-owned full document shells.
3. Header, Sidebar, common resources, `App.core`, `App.ui`, shell initialization, and bootstrap context are Frame/common-owned.
4. `APP_BOOTSTRAP` comes from the already-authenticated server context; the shell does not unconditionally refetch the current user on migrated pages.
5. `App.ui` provides domain-neutral Button/Card/Search/Filter/Modal/Toast/Pagination behavior with duplicate-binding protection.
6. Ledger, Reconciliation, and Settlement each own page-local state in a named controller.
7. Accounting pages use `accountingClient` for server APIs and `App.core`/`App.ui` for generic frontend behavior.
8. `accounting_common_js.html` and all three Accounting full document shells are removed.
9. Accounting file selection is isolated in `Accounting.fileUpload` without cross-page global state.
10. The migrated Frame composition has one shared toast target.
11. Existing Accounting workflows, evidence behavior, reconciliation response unwrapping, settlement behavior, API contracts, form names, and behavior IDs remain intact.
12. Common code has no Accounting dependency and direct `google.script.run` remains isolated to `app_api_runner_js.html`.
13. Every applicable verification command in Task 8 passes before merge-ready status is claimed.

## Follow-up Plans

After Foundation + Accounting is verified, create independently reviewable follow-up plans in this order:

```text
Student Fee -> Event -> Settings/Main/MyPage -> final compatibility/CSS cleanup
```

Each follow-up must reuse the public Frame, bootstrap, `App.core`, `App.router`, `App.shell`, and `App.ui` contracts from this plan instead of creating another domain frontend framework.
