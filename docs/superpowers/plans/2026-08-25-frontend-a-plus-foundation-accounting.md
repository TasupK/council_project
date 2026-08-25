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
- Preserve all Accounting business behavior, form `name` values, IDs needed by behavior/tests, table semantics, approval flow, reconciliation flow, evidence handling, settlement generation/export behavior, and current API client calls.
- Common code must not reference Accounting, Student Fee, Event, Settings, or another domain namespace.
- `App.ui` owns UI mechanics/state only. It must never call Accounting APIs or make Accounting decisions.
- Static markup stays in HTML. JS creates markup only for genuinely data-driven UI such as rows, pagination controls, evidence lists, and transient toast state.
- Do not physically relocate `App_Header.html`, `App_Sidebar.html`, or `App_Shell_Styles.html` in this plan. The new Frame becomes their logical owner while legacy pages continue to include the root files. Physical relocation waits until all protected pages migrate.
- Do not split all existing `.ui-*` CSS out of `App_Styles.html` now. Existing consumers depend on it. `App_UI_Styles.html` adds only behavior/state styling needed by `App.ui`; visual primitive relocation is a later cleanup.
- File upload remains Accounting-owned in this phase because it includes workflow-specific file collection. It must no longer depend on one shared Accounting-global `state` object.
- Every production task follows RED -> minimal GREEN -> focused regression -> commit.

---

## Target File Map for This Plan

### Common foundation

Create:

```text
src/100_common/core/app_core_js.html
src/100_common/ui/App_UI_Styles.html
src/100_common/ui/app_ui_js.html
src/100_common/frame/App_Frame.html
scripts/test-frontend-a-plus-foundation.js
scripts/test-app-ui-components.js
scripts/verify-frontend-a-plus-accounting.js
```

Modify:

```text
src/000_server/Code.js
src/100_common/App_Header.html
src/100_common/app_shell_js.html
scripts/test-app-api-runner.js
scripts/test-api-contract-v1-common-frontend.js
scripts/test-accounting-sidebar-group.js
scripts/test-api-contract-v1-accounting-frontend.js
scripts/verify-ui-system-migration.js
scripts/verify-server-architecture.js
```

Preserve unchanged as transport/client boundaries unless a test-only assertion needs updating:

```text
src/100_common/app_api_runner_js.html
src/100_common/app_client_js.html
src/400_accounting/common/accounting_client_js.html
```

### Accounting shared frontend

Create:

```text
src/400_accounting/common/accounting_file_upload_js.html
```

Modify:

```text
src/400_accounting/common/Accounting_Styles.html
src/400_accounting/410_ledger/Accounting_Ledger_View.html
src/400_accounting/410_ledger/modals/Accounting_Ledger_Register_Modal.html
src/400_accounting/410_ledger/modals/Accounting_Ledger_Detail_Modal.html
src/400_accounting/410_ledger/accounting_ledger_js.html
src/400_accounting/420_reconciliation/Accounting_Reconciliation_View.html
src/400_accounting/420_reconciliation/accounting_reconciliation_js.html
src/400_accounting/430_settlement/Accounting_Settlement_View.html
src/400_accounting/430_settlement/accounting_settlement_js.html
```

Delete only after all three Accounting controllers are GREEN:

```text
src/400_accounting/common/accounting_common_js.html
src/400_accounting/410_ledger/Accounting_Ledger.html
src/400_accounting/420_reconciliation/Accounting_Reconciliation.html
src/400_accounting/430_settlement/Accounting_Settlement.html
```

---

## Public Frontend Contracts Locked by This Plan

### `App.core`

```js
App.core.byId(id, root);
App.core.resolveElement(target, root);
App.core.escapeHtml(value);
App.core.formatNumber(value);
App.core.formatMoney(value);
App.core.formatDate(value);
```

### `App.router`

```js
App.router.url(page, params);
App.router.go(page, params);
```

`url()` uses `APP_BOOTSTRAP.webAppUrl`, then legacy `WEB_APP_URL`, then `window.location.href` as fallback. `go()` writes to `window.top.location.href` to preserve Apps Script iframe navigation behavior.

### `App.shell`

```js
App.shell.init(APP_BOOTSTRAP);
App.shell.setActiveNavigation(page);
App.shell.setDomainVisible(domain, visible);
```

The shell consumes `APP_BOOTSTRAP.user` and `APP_BOOTSTRAP.access` first. It may call `appClient.getCurrentUser()` only as a compatibility fallback when bootstrap user/access data is absent.

### `App.ui`

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

Each owns its page state and explicit `init()`; none may depend on a generic global `state`, `toast`, `escapeHtml`, `currency`, `openModal`, or `closeModal` function.

---

### Task 1: Define the Frontend A+ architecture gate in RED

**Files:**
- Create: `scripts/test-frontend-a-plus-foundation.js`
- Create: `scripts/verify-frontend-a-plus-accounting.js`

**Interfaces:**
- Consumes: repository source only.
- Produces: deterministic failures for missing Frame/core/UI/page-controller contracts.

- [ ] **Step 1: Write the foundation contract test**

Create `scripts/test-frontend-a-plus-foundation.js` using `assert`, `fs`, and `path`. Lock the target files and public namespace shape:

```js
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var ROOT = path.resolve(__dirname, '..');

function read_(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

[
  'src/100_common/core/app_core_js.html',
  'src/100_common/ui/App_UI_Styles.html',
  'src/100_common/ui/app_ui_js.html',
  'src/100_common/frame/App_Frame.html'
].forEach(function (relativePath) {
  assert.ok(fs.existsSync(path.join(ROOT, relativePath)), relativePath + ' must exist');
});

var core = read_('src/100_common/core/app_core_js.html');
['App.core', 'App.router', 'escapeHtml', 'formatMoney', 'formatNumber', 'resolveElement'].forEach(function (token) {
  assert.ok(core.indexOf(token) >= 0, 'core contract missing ' + token);
});

var ui = read_('src/100_common/ui/app_ui_js.html');
[
  'App.ui', 'App.ui.init', 'App.ui.button', 'App.ui.card', 'App.ui.search',
  'App.ui.filter', 'App.ui.modal', 'App.ui.toast', 'App.ui.pagination'
].forEach(function (token) {
  assert.ok(ui.indexOf(token) >= 0, 'UI contract missing ' + token);
});

var frame = read_('src/100_common/frame/App_Frame.html');
[
  "include('100_common/App_Header')",
  "include('100_common/App_Sidebar')",
  "include('100_common/core/app_core_js')",
  "include('100_common/ui/app_ui_js')"
].forEach(function (token) {
  assert.ok(frame.indexOf(token) >= 0, 'Frame contract missing ' + token);
});

assert.ok(frame.indexOf('APP_BOOTSTRAP') >= 0, 'Frame must publish APP_BOOTSTRAP');
console.log('Frontend A+ foundation contract: PASS');
```

- [ ] **Step 2: Write the Accounting architecture verifier**

Create `scripts/verify-frontend-a-plus-accounting.js`. It must accumulate failures and exit `1` when any contract fails. Require:

```text
- all three Accounting routes appear in the server page-descriptor map,
- their descriptor renderer is App_Frame,
- the three old full-document Accounting wrappers are absent after migration,
- Accounting views/partials retain required behavior IDs and form names,
- exactly one shared toast target exists in the Frame composition and Accounting views do not define id="toast",
- all three page JS files expose their named page controller,
- no Accounting page JS contains top-level `const state =`, `var state =`, `function toast(`, `function escapeHtml(`, `function currency(`, `function openModal(`, or `function closeModal(`,
- common files under `src/100_common/core`, `ui`, and `frame` contain no `Accounting` or `accountingClient` references,
- Accounting page JS contains no `google.script.run`,
- `accountingClient` remains the semantic API boundary.
```

Use these behavior-hook contracts:

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

Preserve Ledger register names:

```js
['transaction_date','department_name','amount','counterparty','event_name','description','note']
```

- [ ] **Step 3: Prove RED**

Run:

```bash
node scripts/test-frontend-a-plus-foundation.js
node scripts/verify-frontend-a-plus-accounting.js
```

Expected: both fail because the new common files/page descriptors/controllers do not exist and legacy Accounting shells still exist.

- [ ] **Step 4: Commit tests**

```bash
git add scripts/test-frontend-a-plus-foundation.js scripts/verify-frontend-a-plus-accounting.js
git commit -m "test: define frontend a+ architecture contract"
```

---

### Task 2: Introduce `App.core`, `App.router`, and shared UI behavior

**Files:**
- Create: `src/100_common/core/app_core_js.html`
- Create: `src/100_common/ui/app_ui_js.html`
- Create: `src/100_common/ui/App_UI_Styles.html`
- Create: `scripts/test-app-ui-components.js`
- Test: `scripts/test-frontend-a-plus-foundation.js`

**Interfaces:**
- Produces the domain-neutral public contracts listed above.

- [ ] **Step 1: Add a component behavior test and prove RED**

Create `scripts/test-app-ui-components.js`. Strip `<script>` wrappers before evaluating `app_core_js.html` and `app_ui_js.html` in `vm`. Use a small fake DOM/event target sufficient to test public APIs. Cover at least:

```text
App.core.escapeHtml('<&"\'') -> '&lt;&amp;&quot;&#39;'
App.core.formatNumber(12000) -> '12,000'
App.core.formatMoney(12000) -> '₩12,000'
button setLoading(true) disables and changes label
button setLoading(false) restores original disabled/label state
modal open/close toggles `open` and `is-open`, aria-hidden, and emits one matching custom event
pagination update writes page info, disables prev/next correctly, and click emits ui:page-change
App.ui.init(root) may run twice without duplicate click/input handlers
```

Run:

```bash
node scripts/test-app-ui-components.js
```

Expected: FAIL because the component files do not exist.

- [ ] **Step 2: Implement `app_core_js.html`**

Use one root global only:

```js
<script>
(function (global) {
  var App = global.App = global.App || {};
  App.core = App.core || {};
  App.router = App.router || {};

  App.core.byId = function (id, root) {
    return (root || document).getElementById(id);
  };

  App.core.resolveElement = function (target, root) {
    if (!target) return null;
    if (typeof target !== 'string') return target;
    var scope = root || document;
    return target.charAt(0) === '#'
      ? scope.querySelector(target)
      : (scope.getElementById ? scope.getElementById(target) : scope.querySelector('#' + target));
  };

  App.core.escapeHtml = function (value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  App.core.formatNumber = function (value) {
    return new Intl.NumberFormat('ko-KR').format(Number(value || 0));
  };

  App.core.formatMoney = function (value) {
    return '₩' + App.core.formatNumber(value);
  };

  App.core.formatDate = function (value) {
    return String(value || '').slice(0, 10);
  };

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

- [ ] **Step 3: Implement component behavior in `app_ui_js.html`**

Use an IIFE that extends `window.App.ui`. Keep helpers private to the file. Implement these exact behaviors:

```text
button.setLoading:
- resolve target with App.core.resolveElement
- on first loading=true, store textContent in data-ui-original-label and original disabled state in data-ui-original-disabled
- toggle is-loading and aria-busy
- disable while loading
- restore original text/disabled state when loading=false

card.setLoading:
- toggle is-loading and aria-busy only

search.initAll:
- find [data-ui="search"]
- bind once using data-ui-bound-search="true"
- find input[type="search"] or input
- input event emits ui:search with trimmed value
search.clear:
- blank input, focus it, emit ui:search {value:''}

filter.initAll:
- find form[data-ui="filter"]
- bind submit/reset once
- submit prevents default and emits ui:filter-submit with App.ui.filter.values(form)
- reset emits ui:filter-reset after native reset state is applied
filter.values:
- use FormData and return a plain object

modal.initAll:
- bind [data-ui-modal-close] and legacy [data-close] once
- clicking close resolves the referenced modal id and closes it
modal.open/close:
- toggle both `open` and `is-open`
- update aria-hidden
- emit ui:modal-open/ui:modal-close with {id}

pagination.initAll:
- find [data-ui="pagination"]
- bind [data-ui-page="prev"]/[data-ui-page="next"] once
- derive next page from root.dataset.uiPage / uiTotalPages
- emit ui:page-change {page}
pagination.update:
- persist page/totalPages to dataset
- update [data-ui-page-info]
- disable prev/next at bounds

toast:
- resolve the single document [data-ui="toast"] then fallback #toast
- clear the previous timer
- set message and modifier class ui-toast--<kind>
- toggle show
- success/error delegate to show

App.ui.init:
- call only initAll functions that exist
- safe when invoked repeatedly
```

Use `new CustomEvent(name, { bubbles: true, detail: detail })` for component events.

- [ ] **Step 4: Add behavior-only CSS**

Create `App_UI_Styles.html`:

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

Do not duplicate the base `.ui-btn`, `.ui-card`, `.ui-modal`, or `.ui-toast` visual definitions already in `App_Styles.html`.

- [ ] **Step 5: Run focused tests**

```bash
node scripts/test-app-ui-components.js
node scripts/test-frontend-a-plus-foundation.js
node scripts/test-app-api-runner.js
```

Expected: component tests GREEN; foundation may still fail only for missing Frame; API runner remains GREEN.

- [ ] **Step 6: Commit**

```bash
git add src/100_common/core src/100_common/ui scripts/test-app-ui-components.js scripts/test-frontend-a-plus-foundation.js
git commit -m "feat: add shared frontend core and ui behavior"
```

---

### Task 3: Add the shared App Frame, bootstrap context, and Accounting route descriptors

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
- Test: `scripts/test-frontend-a-plus-foundation.js`
- Test: `scripts/verify-frontend-a-plus-accounting.js`

**Interfaces:**
- Produces shared protected-page composition for the three Accounting routes only.
- Keeps every non-Accounting route on its existing template.

- [ ] **Step 1: Extend the tests to require shared-frame Accounting routing and prove RED**

In `verify-server-architecture.js`, stop requiring the three Accounting routes to map directly to deleted full templates. Instead require that `Code.js` recognizes each route and that `getAppPageDescriptor_()` contains its content paths. Keep the literal route-name check.

In `test-app-api-runner.js`, remove the three Accounting full wrappers from the list of templates that must directly include `app_api_runner_js`; add one assertion that `src/100_common/frame/App_Frame.html` includes it.

In `verify-ui-system-migration.js`, replace Accounting `DOMAIN_SHELLS` with the shared Frame for include verification while keeping Accounting UI-class/hook verification on view/modal partials.

Run focused tests and confirm they fail before the Frame implementation.

- [ ] **Step 2: Add page descriptors in `Code.js`**

Add:

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

The temporary `accounting_common_js` entries intentionally keep pages behavior-compatible while the Frame lands; Tasks 4-7 remove them.

- [ ] **Step 3: Build bootstrap data from the already-authenticated login result**

Add server helpers:

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

Do not call `api_getCurrentUser()` from the server render path. Reuse the `api_checkLogin()` result that `doGet()` already acquired.

- [ ] **Step 4: Add shared-frame renderer**

Add:

```js
function renderAppFrame_(descriptor, data) {
  var template = HtmlService.createTemplateFromFile('100_common/frame/App_Frame');
  var bootstrap = data.appBootstrap || {};
  template.pageTitle = descriptor.title || APP_TITLE;
  template.pageMainClass = descriptor.mainClass || 'main';
  template.pageStyleHtml = (descriptor.styles || []).map(include).join('\n');
  template.pageContentHtml = (descriptor.views || []).map(include).join('\n');
  template.pageScriptHtml = (descriptor.scripts || []).map(include).join('\n');
  template.appBootstrapJson = serializeForHtmlScript_(bootstrap);
  return template.evaluate();
}
```

In `doGet()`, after successful auth/access:

```js
var descriptor = getAppPageDescriptor_(page);
if (descriptor) {
  templateData.appBootstrap = buildAppBootstrap_(page, login, templateData.resourceId);
  return renderAppFrame_(descriptor, templateData)
    .setTitle(APP_TITLE)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
```

All other routes continue through the existing `renderPage_(file, templateData)` path.

- [ ] **Step 5: Implement `App_Frame.html`**

Use the existing shared header/sidebar files and include order:

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
      <main class="<?= pageMainClass ?>">
        <?!= pageContentHtml ?>
      </main>
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

- [ ] **Step 6: Make Header own the one shared toast target**

Change the existing Header toast to:

```html
<div class="ui-toast" id="toast" data-ui="toast" role="status" aria-live="polite"></div>
```

Do not add another toast container to `App_Frame`.

- [ ] **Step 7: Refactor `app_shell_js.html` under `App.shell` with legacy fallback**

Wrap shell behavior in an IIFE and expose only the public methods. `App.shell.init(bootstrap)` must:

```text
1. apply sidebar saved state,
2. render user/profile from bootstrap.user,
3. assign navigation links with App.router.url(),
4. apply bootstrap.access visibility,
5. apply current-page active state,
6. bind sidebar/profile/submenu handlers once,
7. call appClient.getCurrentUser() only if bootstrap.user or bootstrap.access is absent.
```

Keep temporary compatibility functions required by non-migrated pages:

```js
function buildAppPageUrl(page) { return App.router.url(page); }
function getAppElement(id) { return App.core.byId(id); }
```

Do not execute shell initialization at top level anymore; `App_Frame` invokes it explicitly. Legacy full-page shells that still include `app_shell_js` need a compatibility auto-start guarded by `if (!window.APP_BOOTSTRAP)` so they retain current behavior until their later migration.

- [ ] **Step 8: Update sidebar test to assert outcomes, not old private function names**

Retain all current Sidebar structural assertions. Replace regex checks for `setAccountingSubmenuExpanded_()` and direct `buildAppPageUrl()` implementation with assertions that `app_shell_js.html` exposes `App.shell.setActiveNavigation`, references the three Accounting route names, and uses `App.router.url`.

- [ ] **Step 9: Run focused regression**

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

Expected: shared Frame/bootstrap/shell contracts GREEN. `verify-frontend-a-plus-accounting.js` may still fail only on page-controller/global-helper migration and old wrapper deletion.

- [ ] **Step 10: Commit**

```bash
git add src/000_server/Code.js src/100_common scripts/test-app-api-runner.js scripts/test-api-contract-v1-common-frontend.js scripts/test-accounting-sidebar-group.js scripts/verify-server-architecture.js scripts/verify-ui-system-migration.js scripts/test-frontend-a-plus-foundation.js scripts/verify-frontend-a-plus-accounting.js
git commit -m "refactor: render accounting through shared app frame"
```

---

### Task 4: Migrate Accounting Ledger to `AccountingLedgerPage` and shared UI APIs

**Files:**
- Modify: `src/400_accounting/410_ledger/Accounting_Ledger_View.html`
- Modify: `src/400_accounting/410_ledger/modals/Accounting_Ledger_Register_Modal.html`
- Modify: `src/400_accounting/410_ledger/modals/Accounting_Ledger_Detail_Modal.html`
- Modify: `src/400_accounting/410_ledger/accounting_ledger_js.html`
- Modify: `scripts/verify-frontend-a-plus-accounting.js`
- Test: `scripts/test-frontend-api-mapping.js`
- Test: `scripts/test-api-contract-v1-accounting-frontend.js`

**Interfaces:**
- Produces one Ledger page root with page-local state.
- Uses `accountingClient`, `App.core`, and `App.ui` only for cross-file dependencies.

- [ ] **Step 1: Tighten the verifier for Ledger and prove RED**

Require:

```text
AccountingLedgerPage = {
  state,
  init,
  bindEvents,
  refresh/load,
  render,
  actions,
  modals/evidence helpers
}
```

Reject standalone global `state`, `toast`, `escapeHtml`, `currency`, `openModal`, and `closeModal` definitions in the Ledger script.

Run:

```bash
node scripts/verify-frontend-a-plus-accounting.js
```

Expected: Ledger controller/global-helper failures.

- [ ] **Step 2: Add declarative component metadata without changing existing IDs**

Ledger view:

```html
<input class="ui-control" id="keyword" type="search" placeholder="거래처·적요 검색" data-ui-search-input>
...
<div class="accounting-ledger-pagination ui-pagination" id="ledgerPagination" data-ui="pagination">
  <button class="ui-page-btn" id="prevLedgerPage" data-ui-page="prev" type="button" aria-label="이전 페이지">‹</button>
  <span class="page-count" id="ledgerPageInfo" data-ui-page-info>1 / 1</span>
  <button class="ui-page-btn" id="nextLedgerPage" data-ui-page="next" type="button" aria-label="다음 페이지">›</button>
</div>
```

Wrap the search input in/mark a `[data-ui="search"]` container while preserving `id="keyword"`.

Ledger modals:

```text
- add data-ui="modal" to both modal overlays,
- keep every existing modal id,
- add data-ui-modal-close while retaining data-close during compatibility,
- add data-ui="button" to buttons whose loading state is controlled by App.ui.button.
```

Remove the Ledger View's page-owned `<div id="toast">`; the Frame/Header now owns the single shared toast.

- [ ] **Step 3: Replace the global state with controller-local state**

Start the script with:

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

Move all Ledger functions inside this IIFE. Functions that are only used internally remain private; expose business actions under `page.actions` and modal lifecycle under `page.modals` where useful.

Map old generic calls exactly:

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

- [ ] **Step 4: Move button/loading mechanics to `App.ui.button`**

For save/approve/delete/download operations, stop manually changing disabled/text when the behavior is generic. Example:

```js
App.ui.button.setLoading(submitButton, true, draft ? '임시저장 중...' : '저장 중...');
try {
  // existing accountingClient call and business flow unchanged
} finally {
  App.ui.button.setLoading(submitButton, false);
}
```

If two buttons must both be disabled during save, use `setLoading` on the active button and set the sibling's `disabled` property explicitly because sibling locking is page/business coordination, not Button component state.

- [ ] **Step 5: Let pagination emit a UI event**

Replace direct prev/next page behavior with:

```js
App.core.byId('ledgerPagination').addEventListener('ui:page-change', function (event) {
  page.state.page = event.detail.page;
  render_();
});
```

Render pagination via:

```js
App.ui.pagination.update('ledgerPagination', {
  page: page.state.page,
  totalPages: totalPages
});
```

- [ ] **Step 6: Define explicit page initialization**

At minimum:

```js
page.bindEvents = function () {
  App.core.byId('openRegister').addEventListener('click', function () { page.actions.openCreate(); });
  App.core.byId('keyword').addEventListener('input', function () { page.state.page = 1; render_(); });
  ['type','department','event','status'].forEach(function (id) {
    App.core.byId(id).addEventListener('change', function () { page.state.page = 1; render_(); });
  });
  // preserve register/detail/evidence handlers using existing IDs/data attributes
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

All existing API operations must remain present: list/summary/event options, create draft/create/update/delete/process approval, evidence file content, DB link behavior.

- [ ] **Step 7: Run Ledger-focused regression**

```bash
node scripts/test-frontend-api-mapping.js
node scripts/test-api-contract-v1-accounting-frontend.js
node scripts/verify-frontend-api-contract-v1.js
node scripts/verify-ui-system-migration.js
node scripts/verify-frontend-a-plus-accounting.js
```

Expected: Ledger-specific A+ failures gone; Reconciliation/Settlement may remain.

- [ ] **Step 8: Commit**

```bash
git add src/400_accounting/410_ledger scripts/test-frontend-api-mapping.js scripts/test-api-contract-v1-accounting-frontend.js scripts/verify-frontend-a-plus-accounting.js
git commit -m "refactor: migrate accounting ledger page controller"
```

---

### Task 5: Migrate Accounting Reconciliation to `AccountingReconciliationPage`

**Files:**
- Modify: `src/400_accounting/420_reconciliation/Accounting_Reconciliation_View.html`
- Modify: `src/400_accounting/420_reconciliation/accounting_reconciliation_js.html`
- Modify: `scripts/verify-frontend-a-plus-accounting.js`
- Test: `scripts/test-frontend-api-mapping.js`

**Interfaces:**
- Keeps bank-file import, reconciliation, manual link, ledger creation, detail/evidence, and filter behavior unchanged.

- [ ] **Step 1: Require the Reconciliation controller and prove RED**

Require `AccountingReconciliationPage` and reject generic globals in this script. Run the A+ verifier and confirm the Reconciliation slice fails.

- [ ] **Step 2: Update markup contracts**

Keep every existing ID. Add:

```text
reconciliationLedgerDetailModal -> data-ui="modal"
its close buttons -> data-ui-modal-close plus existing data-close
reconciliationSearch container -> data-ui="search"
runMissingCheck -> data-ui="button"
```

Remove the page-owned `id="toast"`.

Do not convert the upload dropzone to a global FileUpload component in this plan.

- [ ] **Step 3: Move all Reconciliation state under the page**

Use:

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

Move old `state.reconciliationDetail`, `state.reconciliationRuns`, `state.reconciliationImporting`, `state.uploadFiles.reconciliation`, and preview state to these properties.

Replace generic helpers:

```text
escapeHtml -> App.core.escapeHtml
currency   -> App.core.formatMoney
toast      -> App.ui.toast.show/error/success
modal add/remove open -> App.ui.modal.open/close
button disabled/text during run -> App.ui.button.setLoading
```

Keep Reconciliation-specific helpers such as `reconcileType`, `reconcileStatusClass`, evidence preview logic, import date aggregation, candidate selection, and reconciliation-result transformation local to this page because their semantics are domain-specific.

- [ ] **Step 4: Preserve the PR #31 response-unwrapping contract**

The ledger-from-reconciliation action must continue to normalize the create response before rendering:

```js
var result = await accountingClient.createLedgerEntryFromReconciliation({ reconciliationItemId: itemId });
var detail = result && result.snapshot ? result.snapshot : result;
showCurrentReconciliationRun_(detail);
```

Keep the current label behavior that does not claim the selector is a complete "대사 이력" history.

- [ ] **Step 5: Use shared modal/button/toast behavior without changing workflow decisions**

Examples:

```js
App.ui.modal.open('reconciliationLedgerDetailModal');
App.ui.modal.close('reconciliationLedgerDetailModal');
App.ui.button.setLoading('runMissingCheck', true, '점검 중...');
App.ui.toast.success('누락 점검을 완료했습니다.');
```

The page remains responsible for deciding when those commands occur and what message means success/failure.

- [ ] **Step 6: Explicit init/binding**

`page.init()` must bind exactly once:

```text
file input/dropzone selection
runMissingCheck click
filter/search changes
filter reset
reconciliationHistory change
row action delegation (detail/link/create/download)
modal close lifecycle needed for evidence URL cleanup
```

Then initialize the empty/current run state without adding a server request not present today.

- [ ] **Step 7: Run focused regression**

```bash
node scripts/test-frontend-api-mapping.js
node scripts/test-api-contract-v1-accounting-frontend.js
node scripts/verify-frontend-api-contract-v1.js
node scripts/verify-ui-system-migration.js
node scripts/verify-frontend-a-plus-accounting.js
```

Expected: Reconciliation-specific A+ failures gone; Settlement/common cleanup may remain.

- [ ] **Step 8: Commit**

```bash
git add src/400_accounting/420_reconciliation scripts/test-frontend-api-mapping.js scripts/verify-frontend-a-plus-accounting.js
git commit -m "refactor: migrate accounting reconciliation page controller"
```

---

### Task 6: Migrate Accounting Settlement to `AccountingSettlementPage`

**Files:**
- Modify: `src/400_accounting/430_settlement/Accounting_Settlement_View.html`
- Modify: `src/400_accounting/430_settlement/accounting_settlement_js.html`
- Modify: `scripts/verify-frontend-a-plus-accounting.js`

**Interfaces:**
- Keeps settlement summary, report history, report creation, detail rendering, and export API flow unchanged.

- [ ] **Step 1: Require the Settlement controller and prove RED**

Require `AccountingSettlementPage` and reject generic globals in the Settlement script. Confirm the verifier fails before production changes.

- [ ] **Step 2: Update markup**

Preserve every current ID. Add `data-ui="button"` to `refreshSettlement`, `generateSettlement`, and `exportSettlement` where loading behavior is used. Remove the page-owned `id="toast"`.

- [ ] **Step 3: Replace shared Accounting state with page-local state**

Use:

```js
var AccountingSettlementPage = (function () {
  var page = {
    state: {
      reports: []
    }
  };
```

Replace:

```text
state.settlementReports -> page.state.reports
currency                -> App.core.formatMoney
escapeHtml              -> App.core.escapeHtml
toast                    -> App.ui.toast
```

Keep period validation, report selection, API calls, and export data formatting as page behavior.

- [ ] **Step 4: Use shared button loading on mutations/requests**

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

Use the same pattern for export only if the current UX benefits from request-state feedback; do not change the exported payload or preview format.

- [ ] **Step 5: Explicit init**

Bind `refreshSettlement`, `generateSettlement`, `settlementHistory`, and `exportSettlement` from `page.bindEvents()`. `page.init()` must call `refreshSettlementHistory_()` exactly once, preserving current behavior.

- [ ] **Step 6: Run focused regression**

```bash
node scripts/test-api-contract-v1-accounting-frontend.js
node scripts/test-frontend-api-mapping.js
node scripts/verify-frontend-api-contract-v1.js
node scripts/verify-ui-system-migration.js
node scripts/verify-frontend-a-plus-accounting.js
```

Expected: all three Accounting page-controller checks GREEN except shared `accounting_common_js`/legacy wrapper cleanup gates.

- [ ] **Step 7: Commit**

```bash
git add src/400_accounting/430_settlement scripts/verify-frontend-a-plus-accounting.js
git commit -m "refactor: migrate accounting settlement page controller"
```

---

### Task 7: Remove Accounting-generic globals and legacy full-page shells

**Files:**
- Create: `src/400_accounting/common/accounting_file_upload_js.html`
- Modify: `src/000_server/Code.js`
- Modify: `src/400_accounting/410_ledger/accounting_ledger_js.html`
- Modify: `src/400_accounting/420_reconciliation/accounting_reconciliation_js.html`
- Modify: `src/400_accounting/common/Accounting_Styles.html`
- Delete: `src/400_accounting/common/accounting_common_js.html`
- Delete: `src/400_accounting/410_ledger/Accounting_Ledger.html`
- Delete: `src/400_accounting/420_reconciliation/Accounting_Reconciliation.html`
- Delete: `src/400_accounting/430_settlement/Accounting_Settlement.html`
- Modify: `scripts/test-api-contract-v1-accounting-frontend.js`
- Modify: `scripts/verify-frontend-a-plus-accounting.js`
- Modify: `scripts/verify-ui-system-migration.js`

**Interfaces:**
- Leaves only Accounting-specific shared code in Accounting common.
- Makes the common Frame the only document shell for migrated Accounting routes.

- [ ] **Step 1: Add cleanup assertions and prove RED**

Require:

```text
- accounting_common_js.html absent,
- three old full Accounting shell HTML files absent,
- accounting_file_upload_js.html exists,
- Code.js descriptors no longer include accounting_common_js,
- no Accounting view contains id="toast",
- Frame/Header composition supplies the one shared toast target.
```

Update `test-api-contract-v1-accounting-frontend.js` so it no longer reads deleted `accounting_common_js.html`; instead assert `accounting_file_upload_js.html` contains no `google.script.run` and no `runAppApi` calls.

Run the verifier and confirm failures before deletion.

- [ ] **Step 2: Extract Accounting-specific file selection helper**

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
    dropzone.addEventListener('dragleave', function () {
      dropzone.classList.remove('drag-over');
    });
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

This helper owns file-selection UI mechanics only. Ledger/Reconciliation callbacks store selected files in their own page state.

- [ ] **Step 3: Switch Ledger and Reconciliation to the helper**

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

Keep file-to-base64 parsing in the page where the domain workflow needs it.

- [ ] **Step 4: Replace descriptor scripts**

Final Accounting descriptor script lists:

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

- [ ] **Step 5: Remove generic modal-state CSS from Accounting only when shared CSS is equivalent**

Delete Accounting-only rules whose only purpose is:

```css
.accounting-page .accounting-modal-overlay { display: none; }
.accounting-page .accounting-modal-overlay.open { display: flex; }
```

because `App_UI_Styles.html` owns `.ui-modal-overlay` state. Retain all Accounting-specific modal sizing, layout, evidence preview, reconciliation layout, ledger column sizing, and settlement composition.

- [ ] **Step 6: Delete obsolete common/global and shell files**

Delete the four files listed above. Do not delete `accounting_client_js.html` or `Accounting_Styles.html`.

- [ ] **Step 7: Run cleanup regression**

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

Expected: all GREEN.

- [ ] **Step 8: Commit**

```bash
git add src/000_server/Code.js src/400_accounting scripts/test-api-contract-v1-accounting-frontend.js scripts/verify-ui-system-migration.js scripts/verify-frontend-a-plus-accounting.js
git commit -m "refactor: remove accounting frontend legacy shell globals"
```

---

### Task 8: Full regression and CI-facing verification

**Files:**
- Modify only tests/verifiers when an assertion still encodes the intentionally removed full-shell implementation rather than preserved behavior.
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

- [ ] **Step 3: Run repository syntax/static checks already used by the relevant workflows**

Run the commands from `.github/workflows/frontend-api-mapping.yml` exactly:

```bash
node scripts/test-frontend-api-mapping.js
node scripts/verify-frontend-api-mapping.js
node scripts/verify-frontend-api-contract-v1.js
```

Also run the Accounting DB workflow commands if its path filters include changed Accounting/server files. Do not claim workflow success without either these local commands or actual GitHub Actions results.

- [ ] **Step 4: Inspect architecture invariants manually**

Verify with grep/search:

```text
- only app_api_runner_js.html contains google.script.run outside server code,
- Accounting scripts contain the three Page controller names,
- no Accounting page script declares generic global state/toast/escapeHtml/currency/openModal/closeModal,
- no Accounting View defines id="toast",
- only one common Frame includes Header + Sidebar for migrated routes,
- Code.js keeps all original route names and access checks,
- common core/ui/frame files contain no Accounting domain references.
```

- [ ] **Step 5: Final commit only if verification files needed corrections**

If test/verifier implementation-detail assertions needed legitimate migration updates, commit only those changes:

```bash
git add scripts .github/workflows
ngit commit -m "test: finalize frontend a+ accounting verification"
```

If no files changed, do not create an empty commit.

---

## Completion Criteria for This Plan

This plan is complete only when all of the following are true:

1. `accounting_ledger`, `accounting_reconciliation`, and `accounting_settlement` are still the public route names and retain existing authorization behavior.
2. All three routes render through `src/100_common/frame/App_Frame.html` rather than page-owned full document shells.
3. Header, Sidebar, common styles, transport, core, UI behavior, and bootstrap context are owned by the Frame/common layer.
4. `APP_BOOTSTRAP` is populated from the already-authenticated server context and the shell does not unconditionally refetch `api_getCurrentUser()` on migrated pages.
5. `App.ui` provides domain-neutral Button/Card/Search/Filter/Modal/Toast/Pagination behavior with idempotent initialization.
6. Accounting Ledger, Reconciliation, and Settlement each own page-local state in a named Page controller.
7. Accounting pages call `accountingClient` for domain APIs and use `App.core`/`App.ui` for generic frontend behavior.
8. `accounting_common_js.html` and all three Accounting full-document shell files are removed.
9. File-selection behavior that remains Accounting-specific is isolated in `Accounting.fileUpload` without a cross-page Accounting `state` object.
10. There is one shared toast target in the migrated Frame composition.
11. Existing Accounting workflows, evidence behavior, reconciliation response unwrapping, settlement behavior, API contracts, form names, and relevant behavior IDs remain intact.
12. Common code has no Accounting dependency and direct `google.script.run` remains isolated to `app_api_runner_js.html`.
13. Every command in Task 8 that is applicable to changed paths exits successfully before merge-ready status is claimed.

## Follow-up Plans After This One

After the Foundation + Accounting plan is verified, create separate plans in this order so each migration can be reviewed independently:

```text
Student Fee -> Event -> Settings/Main/MyPage -> final compatibility/CSS cleanup
```

Those later plans must reuse the public `App.core`, `App.router`, `App.shell`, `App.ui`, Frame, and bootstrap contracts defined here rather than inventing parallel domain frontend frameworks.
