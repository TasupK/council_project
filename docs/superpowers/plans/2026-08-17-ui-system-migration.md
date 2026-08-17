# Shared UI System Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate Main, Settings, Accounting, and Event to the Student Fee-derived shared `ui-*` visual system without changing routes, information architecture, JavaScript behavior contracts, API calls, form semantics, or server behavior.

**Architecture:** `src/100_common/App_Styles.html` owns domain-neutral tokens and visual primitives. Main/Settings/Accounting/Event retain only layout/composition rules that are unique to their screens. Static views and dynamically generated markup adopt semantic `ui-*` classes in the order `Settings -> Main -> Accounting -> Event`.

**Tech Stack:** Google Apps Script HTML templates, vanilla JavaScript, CSS, Node.js regression/static verification, Git/GitHub.

## Global Constraints

- Base branch: `refactor/student-fee-frontend`.
- Working branch: `refactor/ui-system-migration`.
- Do not change `src/000_server/**`.
- Do not change routes, API names, request/response properties, schema, business workflows, table column meaning/order, form field `name` values, or `data-action` values.
- Preserve IDs and `data-*` attributes used by JavaScript.
- Do not promote Student Fee JavaScript helpers into a global frontend framework.
- `src/100_common/App_Styles.html` must remain domain-neutral.
- Domain styles may retain layout/composition rules unique to that domain.
- Do not modify `src/500_student_fee/**`; Student Fee is the reference consumer used for regression checks.
- CSS byte-count reduction is not a goal; shared visual ownership is.

---

## File Map

### Shared
- Modify: `src/100_common/App_Styles.html`
- Create: `scripts/verify-ui-system-migration.js`

### Settings
- Create: `src/300_settings/common/Settings_Styles.html`
- Modify shells:
  - `src/300_settings/300_home/Settings_Home.html`
  - `src/300_settings/310_users/Settings_Users.html`
  - `src/300_settings/320_roles/Settings_Roles.html`
  - `src/300_settings/330_permissions/Settings_Permissions.html`
- Modify views:
  - `src/300_settings/300_home/Settings_Home_View.html`
  - `src/300_settings/310_users/Settings_Users_View.html`
  - `src/300_settings/320_roles/Settings_Roles_View.html`
  - `src/300_settings/330_permissions/Settings_Permissions_View.html`
- Leave Settings JS behavior files unchanged. `settings_permissions_js.html` may continue to emit `perm-group`, `perm-child`, `meta-sub`, `na`, and `check`; these remain Settings-specific presentation/layout hooks owned by `Settings_Styles.html`.

### Main
- Modify: `src/250_main/Main_View.html`
- Modify: `src/250_main/Main_Styles.html`

### Accounting
- Modify: `src/400_accounting/common/Accounting_Styles.html`
- Modify views:
  - `src/400_accounting/400_home/Accounting_Home_View.html`
  - `src/400_accounting/410_ledger/Accounting_Ledger_View.html`
  - `src/400_accounting/420_reconciliation/Accounting_Reconciliation_View.html`
  - `src/400_accounting/430_settlement/Accounting_Settlement_View.html`
- Modify only generated visual class strings when present:
  - `src/400_accounting/410_ledger/accounting_ledger_js.html`
  - `src/400_accounting/420_reconciliation/accounting_reconciliation_js.html`
  - `src/400_accounting/430_settlement/accounting_settlement_js.html`
  - `src/400_accounting/common/accounting_common_js.html`

### Event
- Modify: `src/600_event/common/Event_Styles.html`
- Modify views:
  - `src/600_event/600_home/Event_Home_View.html`
  - `src/600_event/610_form/Event_Form_View.html`
  - `src/600_event/620_detail/Event_Detail_View.html`
- Modify only generated visual class strings:
  - `src/600_event/600_home/event_home_js.html`
  - `src/600_event/610_form/event_form_js.html`
  - `src/600_event/620_detail/event_detail_js.html`
  - `src/600_event/common/event_common_js.html`

---

### Task 1: Add the UI migration verifier in RED

**Files:**
- Create: `scripts/verify-ui-system-migration.js`

**Interfaces:**
- Consumes: repository source files only.
- Produces: deterministic exit code `0`/`1` plus explicit migration failures.

- [ ] **Step 1: Define required shared primitives**

Create the verifier with:

```js
var REQUIRED_SHARED_PRIMITIVES = [
  'ui-page-head', 'ui-page-actions',
  'ui-card', 'ui-stat-card',
  'ui-btn', 'ui-field', 'ui-toolbar',
  'ui-table-wrap', 'ui-table', 'ui-badge',
  'ui-tabs', 'ui-tab',
  'ui-modal-overlay', 'ui-modal',
  'ui-loading', 'ui-empty', 'ui-toast'
];

var MIGRATED_DOMAINS = [];
```

Read files with `fs.readFileSync`, accumulate failures in an array, print every failure, and set `process.exitCode = 1` when non-empty.

- [ ] **Step 2: Define domain targets and shell requirements**

Use:

```js
var DOMAIN_TARGETS = {
  settings: [
    'src/300_settings/300_home/Settings_Home_View.html',
    'src/300_settings/310_users/Settings_Users_View.html',
    'src/300_settings/320_roles/Settings_Roles_View.html',
    'src/300_settings/330_permissions/Settings_Permissions_View.html'
  ],
  main: ['src/250_main/Main_View.html'],
  accounting: [
    'src/400_accounting/400_home/Accounting_Home_View.html',
    'src/400_accounting/410_ledger/Accounting_Ledger_View.html',
    'src/400_accounting/420_reconciliation/Accounting_Reconciliation_View.html',
    'src/400_accounting/430_settlement/Accounting_Settlement_View.html'
  ],
  event: [
    'src/600_event/600_home/Event_Home_View.html',
    'src/600_event/610_form/Event_Form_View.html',
    'src/600_event/620_detail/Event_Detail_View.html'
  ]
};
```

All target page shells must continue to include `100_common/App_Styles`. After Settings migration, all four Settings shells must also include `300_settings/common/Settings_Styles` immediately after `App_Styles`.

- [ ] **Step 3: Hard-code behavior-hook preservation contracts**

Use the current literal contracts below.

```js
var REQUIRED_IDS = {
  'src/300_settings/310_users/Settings_Users_View.html': [
    'userQ', 'userRole', 'userStatus', 'userReset', 'userCountLabel',
    'userTbody', 'userFooterTotal'
  ],
  'src/400_accounting/410_ledger/Accounting_Ledger_View.html': [
    'ledgerDbLink', 'openRegister', 'sumIncome', 'sumExpense', 'sumPending', 'sumReview',
    'keyword', 'type', 'department', 'event', 'status', 'rows',
    'ledgerPagination', 'prevLedgerPage', 'ledgerPageInfo', 'nextLedgerPage',
    'registerModal', 'entryForm', 'expenseBtn', 'incomeBtn', 'formDepartment', 'formEvent',
    'eventBalance', 'entryEvidenceDropzone', 'entryEvidenceFile', 'entryEvidenceFileName',
    'draft', 'create', 'detailModal', 'detailTitle', 'detailStatus', 'detailAlert',
    'detailRows', 'detailEvidenceList', 'approve', 'toast'
  ],
  'src/600_event/600_home/Event_Home_View.html': [
    'ew-event-search', 'ew-managerId-filter', 'ew-type-filter', 'ew-status-filter',
    'ew-event-summary', 'ew-event-table', 'ew-loading', 'ew-modal-root', 'ew-toast'
  ],
  'src/600_event/610_form/Event_Form_View.html': [
    'ew-app', 'ew-form-breadcrumb', 'ew-form-title', 'ew-event-form',
    'ew-member-fee', 'ew-non-member-fee', 'ew-event-status-radios',
    'ew-related-material-file', 'ew-related-material-name', 'ew-existing-material',
    'ew-loading', 'ew-modal-root', 'ew-toast'
  ],
  'src/600_event/620_detail/Event_Detail_View.html': [
    'ew-app', 'ew-edit-event', 'ew-detail-name', 'ew-detail-status', 'ew-detail-meta',
    'ew-kpi-total', 'ew-kpi-approved', 'ew-kpi-paid', 'ew-kpi-attended', 'ew-kpi-balance',
    'ew-tab-panel', 'ew-loading', 'ew-modal-root', 'ew-toast'
  ]
};
```

Also preserve these form/action contracts:

```js
var REQUIRED_FORM_NAMES = {
  'src/400_accounting/410_ledger/Accounting_Ledger_View.html': [
    'transaction_date', 'department_name', 'amount', 'counterparty', 'event_name', 'description', 'note'
  ],
  'src/600_event/610_form/Event_Form_View.html': [
    'name', 'category', 'description', 'applicationStartAt', 'applicationEndAt',
    'eventStartAt', 'capacity', 'managerId', 'payerFee', 'nonPayerFee', 'status'
  ]
};

var REQUIRED_DATA_ACTIONS = {
  'src/600_event/600_home/Event_Home_View.html': ['go-create', 'reset-event-filters'],
  'src/600_event/610_form/Event_Form_View.html': ['go-list'],
  'src/600_event/620_detail/Event_Detail_View.html': ['go-list', 'edit-event', 'detail-tab']
};
```

For Event detail, also assert `data-tab` values `basic`, `applicants`, `attendance`, `ledger`, `refund` remain present.

- [ ] **Step 4: Define global CSS boundary rules**

Reject these literal selector definitions in `App_Styles.html` after migration:

```js
var FORBIDDEN_GLOBAL_SELECTORS = [
  '.settings-list', '.settings-row', '.role-panel', '.perm-table', '.perm-group', '.perm-child',
  '.dashboard-section', '.status-grid', '.status-card', '.quick-grid', '.quick-action',
  '.accounting-page', '.accounting-tabs',
  '.ew-app', '.ew-btn', '.ew-card', '.ew-field', '.ew-table', '.ew-toast', '.ew-loading'
];
```

Allow domain selectors in their own domain stylesheet.

- [ ] **Step 5: Add domain adoption checks**

When a domain appears in `MIGRATED_DOMAINS`, require:

```text
Settings: ui-page-head, ui-btn, ui-toolbar, ui-field, ui-table-wrap, ui-table, ui-loading
Main: ui-page-head, ui-stat-card, ui-card
Accounting: ui-page-head plus ui-tabs/ui-tab on Accounting home, and shared card/field/table/modal primitives on applicable pages
Event: ui-page-head, ui-page-actions, ui-card, ui-btn, ui-field, ui-loading, ui-toast; detail also ui-tabs/ui-tab
```

Legacy compatibility classes may remain only when paired with the corresponding `ui-*` class or when they express layout/behavior rather than generic visual appearance.

- [ ] **Step 6: Prove RED**

Run:

```bash
node scripts/verify-ui-system-migration.js
```

Expected: exit `1`; at minimum `ui-tabs` or `ui-tab` must be reported missing before Task 2.

- [ ] **Step 7: Commit**

```bash
git add scripts/verify-ui-system-migration.js
git commit -m "test: define shared ui migration contract"
```

---

### Task 2: Complete the domain-neutral shared UI primitives

**Files:**
- Modify: `src/100_common/App_Styles.html`
- Modify: `scripts/verify-ui-system-migration.js` only if an existing Student Fee primitive spelling requires the verifier to match the established public class contract.

**Interfaces:**
- Consumes: Student Fee `ui-*` primitives already in `App_Styles.html`.
- Produces: complete domain-neutral shared primitives for all four domains.

- [ ] **Step 1: Inventory existing primitives**

Run:

```bash
grep -o "\.ui-[A-Za-z0-9_-]*" src/100_common/App_Styles.html | sort -u
```

Do not rename/remove any class already used under `src/500_student_fee/**`.

- [ ] **Step 2: Add missing spacing tokens**

Add only missing values:

```css
--ui-space-1: 4px;
--ui-space-2: 8px;
--ui-space-3: 12px;
--ui-space-4: 16px;
--ui-space-5: 20px;
--ui-space-6: 24px;
--ui-space-8: 32px;
```

- [ ] **Step 3: Add/normalize shared page head and tabs**

Use:

```css
.ui-page-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--ui-space-4);
  padding: var(--ui-space-4) var(--ui-space-8) var(--ui-space-5);
  background: var(--ui-surface);
  border-bottom: 1px solid var(--ui-border);
}
.ui-page-actions { display: flex; align-items: center; gap: var(--ui-space-2); }
.ui-tabs {
  display: flex;
  gap: var(--ui-space-1);
  padding: 0 var(--ui-space-8);
  background: var(--ui-surface);
  border-bottom: 1px solid var(--ui-border);
}
.ui-tab {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0 var(--ui-space-4);
  border-bottom: 2px solid transparent;
  color: var(--ui-muted);
  font-weight: 600;
}
.ui-tab.active {
  color: var(--ui-text);
  border-bottom-color: var(--ui-primary);
}
```

Reuse existing `--ui-surface`, `--ui-border`, `--ui-muted`, `--ui-text`, and `--ui-primary`.

- [ ] **Step 4: Normalize modifiers without duplicating rules**

Ensure these contracts exist:

```text
ui-btn primary
ui-btn outline
ui-btn danger
ui-btn small
ui-badge success
ui-badge warning
ui-badge danger
ui-badge neutral
```

- [ ] **Step 5: Run shared regression checks**

Run:

```bash
node scripts/test-student-fee-frontend.js
node scripts/verify-student-fee-frontend.js
node scripts/verify-ui-system-migration.js
```

Expected: Student Fee checks exit `0`; migration verifier may remain `1`, but no missing-shared-primitive failure may remain.

- [ ] **Step 6: Commit**

```bash
git add src/100_common/App_Styles.html scripts/verify-ui-system-migration.js
git commit -m "feat: complete shared ui primitives"
```

---

### Task 3: Migrate Settings and extract Settings-only CSS

**Files:**
- Create: `src/300_settings/common/Settings_Styles.html`
- Modify: `src/100_common/App_Styles.html`
- Modify all four Settings shells and views listed in the File Map.
- Modify: `scripts/verify-ui-system-migration.js`
- Do not modify Settings JS behavior files.

**Interfaces:**
- Consumes: Task 2 shared primitives.
- Produces: Settings using shared generic visuals with Settings-only matrix/list composition isolated locally.

- [ ] **Step 1: Turn on Settings checks and prove RED**

Set:

```js
var MIGRATED_DOMAINS = ['settings'];
```

Run `node scripts/verify-ui-system-migration.js` and confirm Settings adoption/include failures.

- [ ] **Step 2: Extract Settings-specific CSS**

Move from `App_Styles.html` into new `Settings_Styles.html`:

```text
.settings-list
.settings-row
.role-panel and descendants
.perm-table
.perm-group
.perm-child
.meta-sub if used only by Settings
.na
.check
.th-hint
```

`Settings_Styles.html` contains one `<style>` block and no JavaScript.

Do not move generic `.btn*`, `.toolbar`, `.field`, `.select`, `.search-field`, `.table-wrap`, `table.data`, or `.loading`; migrated markup will use `ui-*`.

- [ ] **Step 3: Include Settings_Styles in all four Settings shells**

Immediately after App_Styles:

```html
<?!= include('100_common/App_Styles'); ?>
<?!= include('300_settings/common/Settings_Styles'); ?>
```

Do not alter template globals or script include order.

- [ ] **Step 4: Migrate Settings views**

Use these mappings:

```text
page-header -> add ui-page-head
btn -> ui-btn
btn-primary -> primary
btn-secondary -> outline
toolbar -> add ui-toolbar
field/select/search-field -> add ui-field
loading -> add ui-loading
table-wrap -> add ui-table-wrap
table.data -> add ui-table
```

`Settings_Users_View.html` target pattern:

```html
<header class="page-header ui-page-head">...</header>
<div class="toolbar ui-toolbar">
  <input class="search-field ui-field" id="userQ" ...>
  <select class="select ui-field" id="userRole">...</select>
  <select class="select ui-field" id="userStatus">...</select>
  <button class="ui-btn outline" id="userReset" type="button">초기화</button>
</div>
<div class="table-wrap ui-table-wrap">
  <table class="data ui-table">...</table>
</div>
```

Keep permission-matrix classes because they are Settings-specific and their JS emits them unchanged.

- [ ] **Step 5: Run Settings checks**

```bash
node scripts/test-settings.js
node scripts/verify-settings-architecture.js
node scripts/verify-ui-system-migration.js
node scripts/test-student-fee-frontend.js
```

Expected: no Settings migration failure; Student Fee remains green.

- [ ] **Step 6: Commit**

```bash
git add src/100_common/App_Styles.html src/300_settings scripts/verify-ui-system-migration.js
git commit -m "refactor: migrate settings to shared ui system"
```

---

### Task 4: Migrate Main dashboard visuals

**Files:**
- Modify: `src/250_main/Main_View.html`
- Modify: `src/250_main/Main_Styles.html`
- Modify: `scripts/verify-ui-system-migration.js`

**Interfaces:**
- Consumes: shared page/card/stat primitives.
- Produces: unchanged Main information structure with shared surfaces and spacing.

- [ ] **Step 1: Turn on Main checks and prove RED**

```js
var MIGRATED_DOMAINS = ['settings', 'main'];
```

Run migration verifier; expect Main failures.

- [ ] **Step 2: Add semantic shared classes without reordering content**

Apply:

```html
<header class="page-header main-page-header ui-page-head">...</header>
<article class="status-card ui-stat-card">...</article>
<button class="quick-action ui-card" type="button">...</button>
```

Keep all three status cards, all six quick actions, existing text, and order unchanged.

- [ ] **Step 3: Reduce Main_Styles to composition**

Retain:

```text
.dashboard-workspace
.dashboard-section
.status-grid
.metric
.recent-transactions
.quick-section
.quick-grid
.quick-action child alignment/layout
```

Remove generic surface, border, radius, shadow, and generic card/button hover definitions now owned by `ui-card`/`ui-stat-card`. Replace equivalent hard-coded spacing with `var(--ui-space-*)` without changing layout geometry.

- [ ] **Step 4: Run checks**

```bash
node scripts/verify-ui-system-migration.js
node scripts/test-student-fee-frontend.js
```

Expected: no Settings/Main migration failures.

- [ ] **Step 5: Commit**

```bash
git add src/250_main scripts/verify-ui-system-migration.js
git commit -m "refactor: migrate main dashboard to shared ui system"
```

---

### Task 5: Migrate Accounting generic visuals

**Files:**
- Modify: `src/400_accounting/common/Accounting_Styles.html`
- Modify all four Accounting views listed in the File Map.
- Modify Accounting `*_js.html` files only where they render visual class strings.
- Modify: `scripts/verify-ui-system-migration.js`

**Interfaces:**
- Consumes: shared tabs/card/button/field/table/badge/modal/loading/toast primitives.
- Produces: unchanged ledger/reconciliation/settlement workflows with shared generic visuals.

- [ ] **Step 1: Turn on Accounting checks and prove RED**

```js
var MIGRATED_DOMAINS = ['settings', 'main', 'accounting'];
```

Run migration verifier; expect Accounting failures.

- [ ] **Step 2: Migrate Accounting home**

Preserve every `data-accounting-page` value:

```html
<section class="page-head ui-page-head">...</section>
<nav class="accounting-tabs ui-tabs" aria-label="회계관리 화면">
  <a class="active ui-tab" data-accounting-page="accounting_ledger">수입·지출 관리</a>
  <a class="ui-tab" data-accounting-page="accounting_reconciliation">계좌·장부 대조</a>
  <a class="ui-tab" data-accounting-page="accounting_settlement">결산 보고서</a>
</nav>
<section class="cards">
  <a class="card ui-card" data-accounting-page="accounting_ledger">...</a>
  ...
</section>
```

- [ ] **Step 3: Migrate Ledger static visuals without changing hooks**

Starting from the current Ledger view, add:

```text
page-head -> ui-page-head
accounting-page-actions -> ui-page-actions
primary/secondary/approve action controls -> ui-btn + primary/outline/success-compatible modifier
cards/card -> ui-stat-card or ui-card
filters -> ui-toolbar
filter inputs/selects and modal form inputs/selects/textarea -> ui-field
table-wrap/table -> ui-table-wrap/ui-table
backdrop/modal -> ui-modal-overlay/ui-modal
badge -> ui-badge + status modifier
toast -> ui-toast
pagination -> ui-pagination where markup semantics match
```

Preserve the exact Ledger ID/name list enforced by Task 1.

- [ ] **Step 4: Migrate Reconciliation and Settlement static visuals**

Apply the same semantic mapping to their existing page heads, tabs, cards, filters, tables, status elements, and modal/loading/empty surfaces. Preserve all IDs, form names, route data attributes, column order, and text.

- [ ] **Step 5: Update dynamically generated Accounting class strings only**

Run:

```bash
grep -R "class=.*\(primary\|secondary\|card\|table\|badge\|modal\|toast\|loading\)" src/400_accounting --include='*_js.html'
```

For each result that emits generic visual markup, pair it with `ui-*`. Keep any legacy class used by `.querySelector`, `.closest`, `classList`, or domain layout CSS. Do not alter API calls, request objects, calculation rules, confirmation text, or state transitions.

- [ ] **Step 6: Reduce Accounting_Styles generic ownership**

Remove/reduce generic rules for:

```text
button appearance
card surface/border/radius/shadow
field control border/background/radius
table surface/header/cell border
badge colors
modal overlay/shell
toast/loading appearance
tab active color/underline
```

Retain Accounting page layout, ledger column sizing, reconciliation composition, settlement/report grids, responsive sizing, and layout hooks.

- [ ] **Step 7: Run Accounting checks and JS syntax compile**

```bash
node scripts/test-accounting.js
node scripts/verify-accounting-architecture.js
node scripts/verify-ui-system-migration.js
node scripts/test-student-fee-frontend.js
```

For every changed Accounting `*_js.html`, strip outer `<script>` tags and compile the body with `new vm.Script(source, { filename: file })`. Expected: zero syntax errors.

- [ ] **Step 8: Commit**

```bash
git add src/400_accounting scripts/verify-ui-system-migration.js
git commit -m "refactor: migrate accounting to shared ui system"
```

---

### Task 6: Migrate Event generic visuals

**Files:**
- Modify: `src/600_event/common/Event_Styles.html`
- Modify all three Event views listed in the File Map.
- Modify Event `*_js.html` files only for generated visual class strings.
- Modify: `scripts/verify-ui-system-migration.js`

**Interfaces:**
- Consumes: all Task 2 shared primitives.
- Produces: unchanged Event list/form/detail workflows with Event-specific layout retained.

- [ ] **Step 1: Turn on Event checks and prove RED**

```js
var MIGRATED_DOMAINS = ['settings', 'main', 'accounting', 'event'];
```

Run migration verifier; expect Event failures.

- [ ] **Step 2: Migrate Event Home**

Use:

```html
<section class="ew-page-head ui-page-head">...</section>
<div class="ew-page-actions ui-page-actions">
  <button class="ew-btn ew-btn-primary ew-btn-icon ui-btn primary" data-action="go-create" type="button">＋ 행사 생성</button>
</div>
<form id="ew-event-search" class="ew-card ew-filter-card ui-card">...</form>
<div id="ew-event-summary" class="ew-card ew-summary ui-card"></div>
<div id="ew-event-table" class="ew-card ew-table-card ui-card"></div>
<div id="ew-loading" class="ew-loading ui-loading" hidden>...</div>
<div id="ew-toast" class="ew-toast ui-toast" role="status" hidden></div>
```

Add `ui-field` to actual inputs/selects; retain `ew-field` wrappers only for Event-specific field-grid layout.

- [ ] **Step 3: Migrate Event Form**

Preserve the exact IDs, form names, and `go-list` action from Task 1. Add shared classes to:

```text
ew-page-head -> ui-page-head
ew-page-actions -> ui-page-actions
ew-form-card -> ui-card
all actual input/select/textarea controls -> ui-field
ew-btn visual buttons -> ui-btn (+ primary where applicable)
ew-status generic state pill -> ui-badge where semantics match
ew-loading -> ui-loading
ew-toast -> ui-toast
```

Keep `ew-form-row`, `ew-form-label`, `ew-form-control`, `ew-date-range`, `ew-fee-*`, `ew-radio-*`, file-upload layout classes, and pending-field composition.

- [ ] **Step 4: Migrate Event Detail**

Preserve the exact detail IDs/actions/tab values from Task 1. Add:

```text
ew-page-head -> ui-page-head
ew-page-actions -> ui-page-actions
ew-event-hero -> ui-card
ew-kpi cards -> ui-stat-card
ew-tabs -> ui-tabs
ew-tab -> ui-tab
ew-btn -> ui-btn
ew-status -> ui-badge
ew-loading -> ui-loading
ew-toast -> ui-toast
```

Keep Event-specific hero/meta/KPI grid/detail-body layout classes.

- [ ] **Step 5: Migrate generated Event markup**

Run:

```bash
grep -R "ew-\(btn\|card\|field\|table\|status\|modal\|toast\|loading\)" src/600_event --include='*_js.html'
```

Pair generated generic visuals with the corresponding `ui-*`. Keep `ew-*` only when it remains a JS selector or Event layout hook. Never change `data-action` values or API function names.

- [ ] **Step 6: Reduce Event_Styles to Event composition**

Remove/reduce generic visual responsibility from:

```text
ew-btn / ew-btn-primary
ew-card
ew-field control appearance
ew-table generic appearance
ew-status generic color system
ew-modal generic shell
ew-toast
ew-loading
```

Retain filter grids, form rows, date ranges, switches, fee controls, file-upload layout, detail/KPI layout, attendance/application composition, and responsive geometry.

- [ ] **Step 7: Run Event checks and JS syntax compile**

```bash
node scripts/test-event.js
node scripts/verify-event-architecture.js
node scripts/verify-ui-system-migration.js
node scripts/test-student-fee-frontend.js
node scripts/verify-student-fee-frontend.js
```

Compile each changed Event `*_js.html` body with `new vm.Script(...)`. Expected: zero syntax errors and migration verifier exit `0`.

- [ ] **Step 8: Commit**

```bash
git add src/600_event scripts/verify-ui-system-migration.js
git commit -m "refactor: migrate event to shared ui system"
```

---

### Task 7: Enforce final style ownership

**Files:**
- Modify only as required:
  - `src/100_common/App_Styles.html`
  - `src/300_settings/common/Settings_Styles.html`
  - `src/250_main/Main_Styles.html`
  - `src/400_accounting/common/Accounting_Styles.html`
  - `src/600_event/common/Event_Styles.html`
  - `scripts/verify-ui-system-migration.js`

**Interfaces:**
- Produces: final enforceable shared-vs-domain CSS boundary.

- [ ] **Step 1: Verify no domain content selector remains global**

```bash
grep -n "\.settings-\|\.role-panel\|\.perm-\|\.dashboard-\|\.status-card\|\.quick-action\|\.accounting-\|\.ew-" src/100_common/App_Styles.html
```

Expected: no domain-content selectors. App shell selectors such as `.sidebar` are unrelated and remain allowed.

- [ ] **Step 2: Inspect parallel visual-system remnants**

```bash
grep -n "background:.*#\|border-radius:\|box-shadow:\|modal\|toast" src/400_accounting/common/Accounting_Styles.html src/600_event/common/Event_Styles.html
```

Keep a hit only when it expresses domain-specific composition/state with no shared semantic equivalent; otherwise defer to shared primitive/tokens.

- [ ] **Step 3: Remove temporary verifier allowances**

Final verifier must use:

```js
var MIGRATED_DOMAINS = ['settings', 'main', 'accounting', 'event'];
```

and print on success:

```text
Shared UI system migration verification passed.
```

- [ ] **Step 4: Run focused shared checks**

```bash
node scripts/verify-ui-system-migration.js
node scripts/test-student-fee-frontend.js
node scripts/verify-student-fee-frontend.js
```

Expected: all exit `0`.

- [ ] **Step 5: Commit only when cleanup changed files**

```bash
git status --short
```

If changed:

```bash
git add src/100_common/App_Styles.html src/300_settings/common/Settings_Styles.html src/250_main/Main_Styles.html src/400_accounting/common/Accounting_Styles.html src/600_event/common/Event_Styles.html scripts/verify-ui-system-migration.js
git diff --cached --name-only
git commit -m "refactor: enforce shared ui style ownership"
```

If unchanged, do not create a commit.

---

### Task 8: Full regression and phase-boundary verification

**Files:**
- Modify only if a fresh verification command reveals a real migration defect.

**Interfaces:**
- Produces: completion evidence for the branch.

- [ ] **Step 1: Capture base SHA**

```bash
BASE_SHA=$(git merge-base HEAD refactor/student-fee-frontend)
printf '%s\n' "$BASE_SHA"
```

Keep the value for all later diff commands.

- [ ] **Step 2: Run all behavior tests**

```bash
node scripts/test-core.js
node scripts/test-auth-iam.js
node scripts/test-event.js
node scripts/test-accounting.js
node scripts/test-settings.js
node scripts/test-student-fee.js
node scripts/test-student-fee-frontend.js
```

Expected: every executable command exits `0`. If the environment cannot run the complete suite, report the exact commands not executed; do not infer them green.

- [ ] **Step 3: Run all architecture/migration verifiers**

```bash
node scripts/verify-auth-iam-architecture.js
node scripts/verify-event-architecture.js
node scripts/verify-accounting-architecture.js
node scripts/verify-settings-architecture.js
node scripts/verify-student-fee-architecture.js
node scripts/verify-student-fee-frontend.js
node scripts/verify-server-architecture.js
node scripts/verify-ui-system-migration.js
```

Expected: every executable command exits `0`.

- [ ] **Step 4: Syntax-check every changed embedded JS**

Obtain files with:

```bash
git diff --name-only "$BASE_SHA"...HEAD -- '*_js.html'
```

For every listed file, strip the first `<script...>` and final `</script>`, then compile with:

```js
new vm.Script(source, { filename: file });
```

Expected: zero syntax errors.

- [ ] **Step 5: Prove server and Student Fee source immutability**

```bash
git diff --exit-code "$BASE_SHA" -- src/000_server
git diff --exit-code "$BASE_SHA" -- src/500_student_fee
```

Expected: both exit `0`.

- [ ] **Step 6: Verify allowed changed paths**

```bash
git diff --name-only "$BASE_SHA"...HEAD
```

Allowed production paths:

```text
src/100_common/App_Styles.html
src/250_main/**
src/300_settings/**
src/400_accounting/**
src/600_event/**
```

Allowed support files:

```text
scripts/verify-ui-system-migration.js
docs/superpowers/specs/2026-08-17-ui-system-migration-design.md
docs/superpowers/plans/2026-08-17-ui-system-migration.md
```

No other path is allowed.

- [ ] **Step 7: Scan behavior-contract diffs**

```bash
git diff "$BASE_SHA"...HEAD -- src/300_settings src/400_accounting src/600_event | grep -E "^[+-].*(api_|data-action|name=|getElementById|querySelector|request|payload)"
```

Expected: no API name, request/payload property, `data-action` value, form `name`, or selector literal changes. A line may differ because its `class` attribute/string changed; in that case compare before/after and confirm the contract literal on the line is identical.

- [ ] **Step 8: Inspect final diff quality**

```bash
git diff --check
git status --short
git diff --stat "$BASE_SHA"...HEAD
```

Expected: no whitespace errors and no uncommitted implementation changes.

- [ ] **Step 9: Correct and re-verify only if a check fails**

After the smallest correction, rerun the failed command and then:

```bash
node scripts/verify-ui-system-migration.js
```

Stage only allowed implementation/support areas and review the staged list:

```bash
git add src/100_common/App_Styles.html src/250_main src/300_settings src/400_accounting src/600_event scripts/verify-ui-system-migration.js
git diff --cached --name-only
git commit -m "fix: correct shared ui migration regression"
```

Do not create this correction commit when no correction was required.

---

## Completion Boundary

The phase is complete when Main, Settings, Accounting, and Event consume the shared visual system; domain CSS primarily expresses domain layout/composition; Student Fee remains green as the unchanged reference consumer; no server/schema/API/route/business-flow change exists; and every verification command executable in the environment is freshly green with any unexecuted cross-domain checks explicitly reported.
