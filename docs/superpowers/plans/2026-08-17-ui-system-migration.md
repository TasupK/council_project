# Shared UI System Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate Main, Settings, Accounting, and Event to the Student Fee-derived shared `ui-*` visual system while preserving routes, information architecture, JavaScript behavior contracts, API calls, form semantics, and server behavior.

**Architecture:** `src/100_common/App_Styles.html` owns domain-neutral visual primitives and tokens. Each domain keeps only layout/composition rules that are unique to that domain; visual-only legacy classes are replaced by semantic `ui-*` classes in static views and dynamically generated HTML. Migration order is `Settings -> Main -> Accounting -> Event`, with focused verification after each domain.

**Tech Stack:** Google Apps Script HTML templates, vanilla JavaScript, CSS, Node.js static/regression scripts, Git/GitHub.

## Global Constraints

- Base branch: `refactor/student-fee-frontend`.
- Working branch: `refactor/ui-system-migration`.
- Do not change routes, server APIs, request/response shapes, schema, form field semantics, table column meaning/order, or business workflows.
- Do not promote Student Fee JavaScript helpers into a global frontend framework.
- Preserve JavaScript behavior hooks: element IDs, `data-*` attributes, form `name` attributes, and any class that is still used as a JavaScript selector.
- `src/100_common/App_Styles.html` must remain domain-neutral; do not add Main/Settings/Accounting/Event-specific exception selectors there.
- Domain styles may retain layout/composition rules that are unique to that domain.
- The target migration order is `Settings -> Main -> Accounting -> Event`.
- Each domain must pass its focused checks before work begins on the next domain.
- CSS byte-count reduction is not an acceptance criterion; ownership of generic visual responsibility is.

---

## File Map

### Shared system

- Modify: `src/100_common/App_Styles.html` — shared tokens and `ui-*` primitives.
- Create: `scripts/verify-ui-system-migration.js` — static migration/contract verifier.

### Settings

- Create: `src/300_settings/common/Settings_Styles.html` — Settings-only layout/composition currently living in global CSS.
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
- Modify only class strings needed for rendered markup:
  - `src/300_settings/310_users/settings_users_js.html`
  - `src/300_settings/320_roles/settings_roles_js.html`
  - `src/300_settings/330_permissions/settings_permissions_js.html`
- Keep behavior helper unchanged unless a class string is rendered there:
  - `src/300_settings/common/settings_common_js.html`

### Main

- Modify: `src/250_main/Main_View.html`
- Modify: `src/250_main/Main_Styles.html`
- Modify `src/250_main/Main.html` only if an include/class hook is required; do not change template globals or routing.

### Accounting

- Modify: `src/400_accounting/common/Accounting_Styles.html`
- Modify views:
  - `src/400_accounting/400_home/Accounting_Home_View.html`
  - `src/400_accounting/410_ledger/Accounting_Ledger_View.html`
  - `src/400_accounting/420_reconciliation/Accounting_Reconciliation_View.html`
  - `src/400_accounting/430_settlement/Accounting_Settlement_View.html`
- Modify dynamic markup class strings only:
  - `src/400_accounting/410_ledger/accounting_ledger_js.html`
  - `src/400_accounting/420_reconciliation/accounting_reconciliation_js.html`
  - `src/400_accounting/430_settlement/accounting_settlement_js.html`
- Keep `src/400_accounting/common/accounting_common_js.html` behavior unchanged unless it emits visual class strings.
- Do not change Accounting shell routes/templates or API calls.

### Event

- Modify: `src/600_event/common/Event_Styles.html`
- Modify views:
  - `src/600_event/600_home/Event_Home_View.html`
  - `src/600_event/610_form/Event_Form_View.html`
  - `src/600_event/620_detail/Event_Detail_View.html`
- Modify dynamic markup class strings only:
  - `src/600_event/600_home/event_home_js.html`
  - `src/600_event/610_form/event_form_js.html`
  - `src/600_event/620_detail/event_detail_js.html`
  - `src/600_event/common/event_common_js.html` only where it emits shared visual markup such as toast/modal/status UI.
- Do not change Event shell routes/templates or API calls.

---

### Task 1: Establish the UI migration verifier in RED

**Files:**
- Create: `scripts/verify-ui-system-migration.js`

**Interfaces:**
- Consumes: current repository files only.
- Produces: one deterministic Node verifier with exit code `0` on complete migration and `1` with explicit messages otherwise.

- [ ] **Step 1: Create the verifier with exact migration targets**

Use these target primitives:

```js
var REQUIRED_SHARED_PRIMITIVES = [
  'ui-page-head',
  'ui-page-actions',
  'ui-card',
  'ui-stat-card',
  'ui-btn',
  'ui-field',
  'ui-toolbar',
  'ui-table-wrap',
  'ui-table',
  'ui-badge',
  'ui-tabs',
  'ui-tab',
  'ui-modal-overlay',
  'ui-modal',
  'ui-loading',
  'ui-empty',
  'ui-toast'
];
```

The verifier must read files with `fs.readFileSync` and accumulate failures instead of throwing at the first failure.

Add domain adoption rules:

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

Add shell include checks for `100_common/App_Styles`. Settings shells must additionally include `300_settings/common/Settings_Styles` after Task 3.

Add a global-style boundary check that rejects domain-specific selectors in `App_Styles.html` after migration:

```js
var FORBIDDEN_GLOBAL_SELECTORS = [
  '.settings-list', '.settings-row', '.role-panel', '.perm-table', '.perm-group', '.perm-child',
  '.dashboard-section', '.status-grid', '.status-card', '.quick-grid', '.quick-action',
  '.accounting-page', '.accounting-tabs',
  '.ew-app', '.ew-btn', '.ew-card', '.ew-field', '.ew-table', '.ew-toast', '.ew-loading'
];
```

Only fail on literal CSS selector definitions in `App_Styles.html`, not text occurring elsewhere.

- [ ] **Step 2: Add behavior-hook preservation checks**

Use explicit critical hooks rather than heuristics. At minimum verify these current contracts remain present in the relevant view/JS source pairs:

```js
var REQUIRED_HOOKS = {
  'src/300_settings/310_users/Settings_Users_View.html': ['userQ', 'userRole', 'userStatus', 'userReset', 'userTbody'],
  'src/400_accounting/410_ledger/Accounting_Ledger_View.html': ['ledger'],
  'src/600_event/600_home/Event_Home_View.html': ['ew-event-search', 'ew-event-summary', 'ew-event-table', 'ew-loading', 'ew-modal-root', 'ew-toast'],
  'src/600_event/610_form/Event_Form_View.html': ['name=', 'data-action='],
  'src/600_event/620_detail/Event_Detail_View.html': ['data-action=', 'ew-']
};
```

For Accounting ledger, inspect the actual view before finalizing the literal IDs in the script and enumerate every ID referenced through `getElementById`/the domain helper in `accounting_ledger_js.html`. Do the same for Event form/detail. The verifier file committed in this task must contain the resolved literal lists, not comments instructing future work.

- [ ] **Step 3: Add legacy visual-class migration checks**

The verifier must reject these visual-only families after their owning task is complete:

```text
Event: ew-btn, ew-card, ew-field, ew-toast, ew-loading
Main: status-card as sole visual class, quick-action as sole visual class
Accounting: generic visual card/button/table/tab rules that remain owned only by Accounting_Styles
Settings: legacy btn/field/select/table-wrap/table.data usage in migrated views when a ui-* equivalent exists
```

Allow layout classes such as `ew-filter-grid`, `ew-date-range`, Accounting-specific grids, permission matrix classes, and Main grid classes.

Implement the verifier so each domain check is gated by a `MIGRATED_DOMAINS` array initially set to `[]`. Later tasks append the domain name when that domain is migrated. Shared primitive checks run immediately.

- [ ] **Step 4: Run the verifier and prove RED**

Run:

```bash
node scripts/verify-ui-system-migration.js
```

Expected: exit `1`. The failure list must include at least missing `ui-tabs`/`ui-tab` or an equivalent missing shared primitive in the current `App_Styles.html`. Do not proceed if it exits `0` before any migration work.

- [ ] **Step 5: Commit the RED verifier**

```bash
git add scripts/verify-ui-system-migration.js
git commit -m "test: define shared ui migration contract"
```

---

### Task 2: Complete the domain-neutral shared UI primitives

**Files:**
- Modify: `src/100_common/App_Styles.html`
- Modify: `scripts/verify-ui-system-migration.js` only if the existing Student Fee primitive spelling differs from the exact design contract.
- Test: `scripts/verify-student-fee-frontend.js`

**Interfaces:**
- Consumes: Student Fee `ui-*` tokens/primitives already present in `App_Styles.html`.
- Produces: domain-neutral shared primitives usable by all four domains without CSS exception selectors.

- [ ] **Step 1: Record the existing shared primitives before editing**

Run:

```bash
grep -o "\.ui-[A-Za-z0-9_-]*" src/100_common/App_Styles.html | sort -u
```

Confirm existing Student Fee primitives are preserved. This task extends them; it must not rename classes already consumed by `src/500_student_fee/**`.

- [ ] **Step 2: Add missing spacing and shared component tokens**

Keep existing tokens and add only missing values:

```css
--ui-space-1: 4px;
--ui-space-2: 8px;
--ui-space-3: 12px;
--ui-space-4: 16px;
--ui-space-5: 20px;
--ui-space-6: 24px;
--ui-space-8: 32px;
```

Do not create domain-specific tokens such as `--event-*` or `--accounting-*` in `App_Styles.html`.

- [ ] **Step 3: Add/normalize page head and tabs**

Use domain-neutral rules equivalent to:

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

Reuse existing Student Fee variables (`--ui-surface`, `--ui-border`, `--ui-muted`, `--ui-primary`) rather than inventing parallel values.

- [ ] **Step 4: Normalize modifier contracts**

Ensure these modifiers exist and are compatible with Student Fee markup:

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

If the current Student Fee CSS uses these already, do not duplicate the selector; consolidate the existing rule.

- [ ] **Step 5: Run shared-scope regression checks**

Run:

```bash
node scripts/test-student-fee-frontend.js
node scripts/verify-student-fee-frontend.js
node scripts/verify-ui-system-migration.js
```

Expected:
- Student Fee tests/verifier exit `0`.
- UI migration verifier may still exit `1` only for not-yet-migrated domain/shared-boundary failures; missing shared primitive failures must be gone.

- [ ] **Step 6: Commit**

```bash
git add src/100_common/App_Styles.html scripts/verify-ui-system-migration.js
git commit -m "feat: complete shared ui primitives"
```

---

### Task 3: Migrate Settings and extract Settings-only CSS

**Files:**
- Create: `src/300_settings/common/Settings_Styles.html`
- Modify:
  - `src/100_common/App_Styles.html`
  - `src/300_settings/300_home/Settings_Home.html`
  - `src/300_settings/310_users/Settings_Users.html`
  - `src/300_settings/320_roles/Settings_Roles.html`
  - `src/300_settings/330_permissions/Settings_Permissions.html`
  - `src/300_settings/300_home/Settings_Home_View.html`
  - `src/300_settings/310_users/Settings_Users_View.html`
  - `src/300_settings/320_roles/Settings_Roles_View.html`
  - `src/300_settings/330_permissions/Settings_Permissions_View.html`
  - `src/300_settings/310_users/settings_users_js.html` if generated rows contain visual-only class names
  - `src/300_settings/320_roles/settings_roles_js.html` if generated rows contain visual-only class names
  - `src/300_settings/330_permissions/settings_permissions_js.html` if generated rows contain visual-only class names
  - `scripts/verify-ui-system-migration.js`

**Interfaces:**
- Consumes: shared `ui-*` primitives from Task 2.
- Produces: Settings screens whose generic visuals are shared and whose permission/layout rules are isolated in `Settings_Styles.html`.

- [ ] **Step 1: Add Settings to the verifier migration gate and verify RED**

Change:

```js
var MIGRATED_DOMAINS = [];
```

to:

```js
var MIGRATED_DOMAINS = ['settings'];
```

Add assertions that every Settings shell includes:

```html
<?!= include('100_common/App_Styles'); ?>
<?!= include('300_settings/common/Settings_Styles'); ?>
```

Run:

```bash
node scripts/verify-ui-system-migration.js
```

Expected: exit `1` with Settings adoption failures.

- [ ] **Step 2: Extract Settings-only selectors from global CSS**

Move these current domain-specific rules from `App_Styles.html` into the new `Settings_Styles.html`:

```text
.settings-list
.settings-row
.role-panel and descendants
.perm-table
.perm-group
.perm-child
.na when used only by permission matrix
.check when used only by permission matrix
.th-hint when used only by permission matrix
```

`Settings_Styles.html` must contain a single `<style>...</style>` block and no JavaScript.

Do not move generic `.loading`, `.toolbar`, `.field`, `.select`, `.search-field`, `.table-wrap`, `table.data`, or `.btn*` rules; their markup is migrated to `ui-*` instead.

- [ ] **Step 3: Include Settings_Styles in all four Settings shells**

Place the include immediately after `App_Styles`:

```html
<?!= include('100_common/App_Styles'); ?>
<?!= include('300_settings/common/Settings_Styles'); ?>
```

Preserve all existing template globals and script include order.

- [ ] **Step 4: Migrate Settings views to semantic shared classes**

Apply these mappings while retaining IDs and unique layout classes:

```text
page-header        -> add ui-page-head
btn                -> ui-btn
btn-primary        -> primary
btn-secondary      -> outline
toolbar            -> add ui-toolbar
field/select/search-field -> add ui-field or replace visual-only legacy class
loading            -> add ui-loading
table-wrap         -> add ui-table-wrap
table.data         -> add ui-table
```

For `Settings_Users_View.html`, the target shape is conceptually:

```html
<header class="page-header ui-page-head">...</header>
...
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

Compatibility classes such as `page-header`, `toolbar`, `search-field`, `select`, `table-wrap`, and `data` may remain temporarily when existing CSS/JS still requires them; the shared `ui-*` class must own the visual treatment.

- [ ] **Step 5: Update dynamic Settings markup only where visual classes are emitted**

Do not rewrite filtering/data logic. If JS emits status cells or rows using generic visual classes, change only the emitted class string to shared equivalents, for example:

```js
'<span class="ui-badge ' + (row.active ? 'success' : 'neutral') + '">...</span>'
```

Preserve IDs, dataset keys, event handlers, and data fields.

- [ ] **Step 6: Run focused Settings verification**

Run:

```bash
node scripts/test-settings.js
node scripts/verify-settings-architecture.js
node scripts/verify-ui-system-migration.js
node scripts/test-student-fee-frontend.js
```

Expected: Settings tests/verifier and Student Fee frontend test exit `0`. UI migration verifier may still fail only for domains not yet added to `MIGRATED_DOMAINS`; Settings failures must be zero.

- [ ] **Step 7: Commit**

```bash
git add src/100_common/App_Styles.html src/300_settings scripts/verify-ui-system-migration.js
git commit -m "refactor: migrate settings to shared ui system"
```

---

### Task 4: Migrate Main dashboard visual components

**Files:**
- Modify: `src/250_main/Main_View.html`
- Modify: `src/250_main/Main_Styles.html`
- Modify: `scripts/verify-ui-system-migration.js`

**Interfaces:**
- Consumes: shared cards/stat cards/buttons/status tokens from Task 2.
- Produces: Main dashboard retaining its existing dashboard/quick-action grids while using shared surfaces and spacing.

- [ ] **Step 1: Add Main to the migration gate and verify RED**

Set:

```js
var MIGRATED_DOMAINS = ['settings', 'main'];
```

Require `Main_View.html` to contain at least `ui-page-head`, `ui-stat-card`, and `ui-card` or `ui-btn` for quick actions.

Run:

```bash
node scripts/verify-ui-system-migration.js
```

Expected: exit `1` with Main adoption failures.

- [ ] **Step 2: Migrate the static Main markup without changing content order**

Use these mappings:

```text
page-header main-page-header -> keep layout hooks, add ui-page-head
status-card                  -> add ui-stat-card
quick-action                 -> add ui-card and/or ui-btn-compatible semantics
metric color classes         -> use shared status/text token classes where available
```

Do not reorder the three status cards or six quick actions. Do not change their labels or metrics in this phase.

Target pattern:

```html
<article class="status-card ui-stat-card">...</article>
<button class="quick-action ui-card" type="button">...</button>
```

The `status-card` and `quick-action` classes may remain only for grid/composition selectors in `Main_Styles.html`.

- [ ] **Step 3: Reduce Main_Styles to composition responsibility**

Retain selectors for:

```text
.dashboard-workspace
.dashboard-section
.status-grid
.metric
.recent-transactions
.quick-section
.quick-grid
.quick-action layout-only child alignment
```

Remove duplicated generic surface, border, radius, shadow, hover surface, and base button/card typography when `ui-card`/`ui-stat-card` now owns those values.

Replace hard-coded spacing that is equivalent to the shared scale with `var(--ui-space-*)` where doing so does not alter layout intent.

- [ ] **Step 4: Run focused Main/shared checks**

Run:

```bash
node scripts/verify-ui-system-migration.js
node scripts/test-student-fee-frontend.js
```

Also syntax-check any Main inline script if `Main.html` contains one:

```bash
node --check /tmp/main-inline.js
```

Only create `/tmp/main-inline.js` if JavaScript was touched. Otherwise skip the syntax command.

Expected: no Settings/Main migration failures.

- [ ] **Step 5: Commit**

```bash
git add src/250_main scripts/verify-ui-system-migration.js
git commit -m "refactor: migrate main dashboard to shared ui system"
```

---

### Task 5: Migrate Accounting shared visuals while preserving accounting layouts

**Files:**
- Modify: `src/400_accounting/common/Accounting_Styles.html`
- Modify:
  - `src/400_accounting/400_home/Accounting_Home_View.html`
  - `src/400_accounting/410_ledger/Accounting_Ledger_View.html`
  - `src/400_accounting/420_reconciliation/Accounting_Reconciliation_View.html`
  - `src/400_accounting/430_settlement/Accounting_Settlement_View.html`
- Modify class strings only where required:
  - `src/400_accounting/410_ledger/accounting_ledger_js.html`
  - `src/400_accounting/420_reconciliation/accounting_reconciliation_js.html`
  - `src/400_accounting/430_settlement/accounting_settlement_js.html`
  - `src/400_accounting/common/accounting_common_js.html`
- Modify: `scripts/verify-ui-system-migration.js`

**Interfaces:**
- Consumes: `ui-tabs`, `ui-tab`, `ui-card`, `ui-btn`, `ui-field`, `ui-toolbar`, `ui-table-wrap`, `ui-table`, `ui-badge`, modal/loading/toast primitives.
- Produces: Accounting pages with current ledger/reconciliation/settlement structure and JavaScript behavior but shared generic visuals.

- [ ] **Step 1: Add Accounting to migration gate and verify RED**

Set:

```js
var MIGRATED_DOMAINS = ['settings', 'main', 'accounting'];
```

Require all four Accounting views to adopt shared classes appropriate to their roles. The home view must use `ui-page-head`, `ui-tabs`/`ui-tab`, and `ui-card`.

Run:

```bash
node scripts/verify-ui-system-migration.js
```

Expected: Accounting adoption failures.

- [ ] **Step 2: Migrate Accounting home**

Transform the existing structure without changing links or `data-accounting-page` values:

```html
<section class="page-head ui-page-head">...</section>
<nav class="accounting-tabs ui-tabs" aria-label="회계관리 화면">
  <a class="active ui-tab" data-accounting-page="accounting_ledger">...</a>
  ...
</nav>
<section class="cards">
  <a class="card ui-card" data-accounting-page="accounting_ledger">...</a>
  ...
</section>
```

Keep `accounting-tabs`, `cards`, and `card` only if Accounting_Styles still needs them for page-specific layout; shared classes own visual appearance.

- [ ] **Step 3: Migrate ledger/reconciliation/settlement static views**

Inspect each current view before editing and map only visual roles:

```text
page head      -> ui-page-head
page actions   -> ui-page-actions
buttons        -> ui-btn + modifier
tabs           -> ui-tabs / ui-tab
filter/toolbars-> ui-toolbar
inputs/selects -> ui-field
cards/panels   -> ui-card
status labels  -> ui-badge + status modifier
table wrapper  -> ui-table-wrap
table          -> ui-table
modal shell    -> ui-modal-overlay / ui-modal
loading/empty  -> ui-loading / ui-empty
```

Preserve all current IDs, `data-accounting-page`, other `data-*` hooks, and form `name` attributes exactly.

- [ ] **Step 4: Migrate dynamically generated Accounting visual classes**

Search:

```bash
grep -R "class=.*\(btn\|card\|table\|badge\|modal\|loading\|toast\)" src/400_accounting --include='*_js.html'
```

For each generated element, add shared classes while preserving any class used by JS selectors. Do not change API calls, click actions, request objects, confirm text, calculation rules, or state transitions.

Example pattern:

```js
'<button class="existing-action-hook ui-btn primary" data-action="...">...</button>'
```

- [ ] **Step 5: Reduce Accounting_Styles generic visual ownership**

Remove/reduce rules whose only job is generic:

```text
button base appearance
card surface/border/radius/shadow
generic field border/background/radius
generic table header/cell surface/border
generic badge colors
generic modal overlay/shell
generic toast/loading surface
generic tab active underline/color
```

Retain ledger widths, reconciliation columns, settlement/report grids, accounting page body structure, responsive sizing, and any selector that defines meaningful Accounting composition.

Do not rename `Accounting_Styles.html` or split it into multiple CSS files in this phase.

- [ ] **Step 6: Run Accounting behavior and architecture tests**

Run:

```bash
node scripts/test-accounting.js
node scripts/verify-accounting-architecture.js
node scripts/verify-ui-system-migration.js
node scripts/test-student-fee-frontend.js
```

Compile embedded changed Accounting JS by stripping outer `<script>` tags and passing the body to `new vm.Script(...)`. Expected: zero syntax errors.

Expected: no Settings/Main/Accounting migration failures.

- [ ] **Step 7: Commit**

```bash
git add src/400_accounting scripts/verify-ui-system-migration.js
git commit -m "refactor: migrate accounting to shared ui system"
```

---

### Task 6: Migrate Event shared visuals while preserving event layouts and action hooks

**Files:**
- Modify: `src/600_event/common/Event_Styles.html`
- Modify:
  - `src/600_event/600_home/Event_Home_View.html`
  - `src/600_event/610_form/Event_Form_View.html`
  - `src/600_event/620_detail/Event_Detail_View.html`
- Modify class strings only:
  - `src/600_event/600_home/event_home_js.html`
  - `src/600_event/610_form/event_form_js.html`
  - `src/600_event/620_detail/event_detail_js.html`
  - `src/600_event/common/event_common_js.html`
- Modify: `scripts/verify-ui-system-migration.js`

**Interfaces:**
- Consumes: all shared UI primitives from Task 2.
- Produces: Event list/form/detail pages using shared visual primitives while retaining all event-specific grids, action hooks, APIs, and dynamic workflows.

- [ ] **Step 1: Add Event to the migration gate and verify RED**

Set:

```js
var MIGRATED_DOMAINS = ['settings', 'main', 'accounting', 'event'];
```

The verifier must reject remaining visual-only `ew-btn`, `ew-card`, `ew-field`, `ew-toast`, and `ew-loading` ownership unless those legacy classes are retained solely as JS compatibility hooks and have a paired `ui-*` class.

Run:

```bash
node scripts/verify-ui-system-migration.js
```

Expected: Event migration failures.

- [ ] **Step 2: Migrate Event Home static markup**

Starting from the current view, retain `ew-*` layout/behavior hooks but pair visual roles with shared classes:

```html
<section class="ew-page-head ui-page-head">...</section>
<div class="ew-page-actions ui-page-actions">
  <button type="button" class="ew-btn ew-btn-primary ew-btn-icon ui-btn primary" data-action="go-create">＋ 행사 생성</button>
</div>
<form id="ew-event-search" class="ew-card ew-filter-card ui-card">...</form>
...
<div id="ew-event-summary" class="ew-card ew-summary ui-card"></div>
<div id="ew-event-table" class="ew-card ew-table-card ui-card"></div>
<div id="ew-loading" class="ew-loading ui-loading" hidden>...</div>
<div id="ew-toast" class="ew-toast ui-toast" role="status" hidden></div>
```

For fields, add `ui-field` to the actual input/select or to the field wrapper only if the current shared primitive is defined for wrappers. Use one convention consistently across all Event pages.

Do not alter `id="ew-event-search"`, `data-action` values, field names, or filter option values.

- [ ] **Step 3: Migrate Event Form and Detail static markup**

Use shared primitives for common roles while retaining layout classes such as:

```text
ew-filter-grid
ew-filter-grid-secondary
ew-date-range
ew-form-grid
ew-detail-*
ew-application-*
ew-attendance-*
```

Do not rename form controls or action attributes. The form submit/request shape must be byte-for-byte equivalent except for markup class attributes.

- [ ] **Step 4: Migrate dynamically generated Event markup**

Search all Event JS:

```bash
grep -R "ew-\(btn\|card\|field\|table\|badge\|modal\|toast\|loading\)" src/600_event --include='*_js.html'
```

For generated buttons/cards/tables/badges/modals, add the corresponding `ui-*` class. If a legacy `ew-*` class is referenced through `.querySelector`, `.closest`, `classList`, or a CSS layout selector, keep it as a compatibility/layout hook; otherwise remove it after its visual rule is removed from Event_Styles.

Examples:

```js
'<button class="ui-btn primary" data-action="process-applicant">...</button>'
'<span class="ui-badge success">승인</span>'
'<div class="ui-modal-overlay"><section class="ui-modal">...</section></div>'
```

Never change `data-action` strings or API function names during this step.

- [ ] **Step 5: Reduce Event_Styles to Event composition**

Remove/reduce generic visual definitions for:

```text
ew-btn / ew-btn-primary visual appearance
ew-card surface/border/radius/shadow
ew-field generic control appearance
ew-table generic table appearance
ew-badge generic status colors
ew-modal generic overlay/shell
ew-toast generic toast appearance
ew-loading generic loading appearance
```

Keep event-specific grid, date-range, toggle/switch layout, contract-note layout, form/detail section geometry, attendance/application composition, responsive rules, and any behavior-hook styling not expressible as a domain-neutral primitive.

- [ ] **Step 6: Run Event behavior and architecture tests**

Run:

```bash
node scripts/test-event.js
node scripts/verify-event-architecture.js
node scripts/verify-ui-system-migration.js
node scripts/test-student-fee-frontend.js
node scripts/verify-student-fee-frontend.js
```

Compile all changed Event `*_js.html` bodies with `new vm.Script(...)` after removing outer `<script>` tags. Expected: zero syntax errors.

Expected: UI migration verifier exits `0` for all four migrated domains.

- [ ] **Step 7: Commit**

```bash
git add src/600_event scripts/verify-ui-system-migration.js
git commit -m "refactor: migrate event to shared ui system"
```

---

### Task 7: Finalize shared-style ownership and migration assertions

**Files:**
- Modify: `src/100_common/App_Styles.html` only if cleanup is required.
- Modify: `src/300_settings/common/Settings_Styles.html` only if Settings-specific rules were accidentally left global.
- Modify: `src/250_main/Main_Styles.html` only if generic visual rules remain.
- Modify: `src/400_accounting/common/Accounting_Styles.html` only if generic visual rules remain.
- Modify: `src/600_event/common/Event_Styles.html` only if generic visual rules remain.
- Modify: `scripts/verify-ui-system-migration.js`

**Interfaces:**
- Consumes: migrated four-domain tree.
- Produces: a final enforceable ownership boundary between shared visual CSS and domain layout CSS.

- [ ] **Step 1: Scan style ownership**

Run:

```bash
grep -n "\.settings-\|\.role-panel\|\.perm-\|\.dashboard-\|\.status-card\|\.quick-action\|\.accounting-\|\.ew-" src/100_common/App_Styles.html
```

Expected: no domain-specific selectors remain in `App_Styles.html` except a selector that predates this phase and is demonstrably part of the global app shell. If any result is domain-content styling, move it to the appropriate domain stylesheet.

- [ ] **Step 2: Scan parallel visual systems in Accounting/Event**

Run:

```bash
grep -n "background:.*#\|border-radius:\|box-shadow:\|button\|table\|modal\|toast" src/400_accounting/common/Accounting_Styles.html src/600_event/common/Event_Styles.html
```

Review each hit. Keep hard-coded values only when they express domain-specific composition/state that has no shared semantic equivalent. Generic surface/radius/shadow/button/table/modal/toast rules must use or defer to shared tokens/primitives.

- [ ] **Step 3: Strengthen verifier against regression**

Remove any temporary migration gates/allowances that were needed during Tasks 3-6. Final verifier state must use:

```js
var MIGRATED_DOMAINS = ['settings', 'main', 'accounting', 'event'];
```

and exit `0` only when all four domains satisfy the shared-system contract.

The verifier must print exactly one success summary on green:

```text
Shared UI system migration verification passed.
```

- [ ] **Step 4: Run final focused UI checks**

Run:

```bash
node scripts/verify-ui-system-migration.js
node scripts/test-student-fee-frontend.js
node scripts/verify-student-fee-frontend.js
```

Expected: every command exits `0`.

- [ ] **Step 5: Commit cleanup only if files changed**

```bash
git status --short
```

If this task produced changes:

```bash
git add src/100_common/App_Styles.html src/300_settings/common/Settings_Styles.html src/250_main/Main_Styles.html src/400_accounting/common/Accounting_Styles.html src/600_event/common/Event_Styles.html scripts/verify-ui-system-migration.js
git commit -m "refactor: enforce shared ui style ownership"
```

If there are no changes, do not create an empty commit.

---

### Task 8: Full regression, scope, and phase-boundary verification

**Files:**
- Modify only when a fresh verification command exposes a real migration defect.

**Interfaces:**
- Produces: completion evidence for the UI migration branch.

- [ ] **Step 1: Capture the execution base**

Run:

```bash
BASE_SHA=$(git merge-base HEAD refactor/student-fee-frontend)
printf '%s\n' "$BASE_SHA"
```

Expected base: the commit from which `refactor/ui-system-migration` was created. Keep `BASE_SHA` for later diff checks.

- [ ] **Step 2: Run all behavior tests**

Run:

```bash
node scripts/test-core.js
node scripts/test-auth-iam.js
node scripts/test-event.js
node scripts/test-accounting.js
node scripts/test-settings.js
node scripts/test-student-fee.js
node scripts/test-student-fee-frontend.js
```

Expected: every command exits `0`.

If the environment cannot run the full repository suite, do not infer success from focused tests. Record exactly which commands could not be executed and why.

- [ ] **Step 3: Run all architecture/migration verifiers**

Run:

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

Expected: every command exits `0`.

- [ ] **Step 4: Syntax-check every changed embedded JS file**

Use a Node one-liner/script that obtains changed `*_js.html` files from:

```bash
git diff --name-only "$BASE_SHA"...HEAD -- '*_js.html'
```

For each file, strip the outer `<script>`/`</script>` tags and compile with `new vm.Script(source, { filename: file })`. Expected: zero syntax errors.

- [ ] **Step 5: Verify no server/schema/route changes were introduced**

Run:

```bash
git diff --exit-code "$BASE_SHA" -- src/000_server
git diff --name-only "$BASE_SHA"...HEAD
```

Expected: the first command exits `0`.

Allowed production paths are limited to:

```text
src/100_common/App_Styles.html
src/250_main/**
src/300_settings/**
src/400_accounting/**
src/600_event/**
```

plus `scripts/verify-ui-system-migration.js` and the design/plan docs for this phase. `src/500_student_fee/**` must remain unchanged; it is the visual reference and regression consumer of the shared system.

- [ ] **Step 6: Verify behavior-contract-sensitive source did not drift semantically**

Inspect diffs of every changed `*_js.html` file:

```bash
git diff "$BASE_SHA"...HEAD -- src/300_settings src/400_accounting src/600_event | grep -E "^[+-].*(api_|data-action|name=|getElementById|querySelector|request|payload)"
```

Expected: no API name, request/payload property, `data-action` value, form `name`, or behavior selector change. Class-string changes on the same lines are allowed.

If a behavior-contract line changed for formatting reasons, manually compare before/after and prove the literal contract value is identical.

- [ ] **Step 7: Inspect diff quality**

Run:

```bash
git diff --check
git status --short
git diff --stat "$BASE_SHA"...HEAD
```

Expected: no whitespace errors, no uncommitted implementation changes, and scope limited to Step 5.

- [ ] **Step 8: Re-run any command affected by a correction**

If Steps 2-7 expose a defect, make the smallest correction, rerun the exact failed command, then rerun:

```bash
node scripts/verify-ui-system-migration.js
```

Commit only the correction files:

```bash
git add <exact-corrected-files>
git commit -m "fix: correct shared ui migration regression"
```

Do not create a final commit if no correction was required.

---

## Completion Boundary

This plan is complete when the four existing domains consume the shared visual system, their domain CSS primarily expresses layout/composition, Student Fee remains green as the reference consumer, no server/schema/API/route/business-flow changes exist in the diff, and the migration verifier plus all executable regression/architecture checks are green.
