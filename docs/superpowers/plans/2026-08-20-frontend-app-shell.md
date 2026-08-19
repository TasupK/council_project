# Frontend App Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize the authenticated frontend shell so the header and sidebar stay visible, the main content owns scrolling, the sidebar can be completely hidden/restored with persisted client preference, and the legacy footer/status bar is removed.

**Architecture:** Keep the existing shared `100_common` shell and convert its geometry to a viewport-sized two-row CSS Grid (`header + body`). The body is a two-column grid (`sidebar + main`), with a single `sidebar-hidden` state on the app root and persistence owned by `app_shell_js.html`; authenticated entry templates keep their domain markup but remove the legacy footer.

**Tech Stack:** Google Apps Script HTML Service, HTML/CSS, browser JavaScript, Node.js contract tests.

**Spec:** `docs/superpowers/specs/2026-08-20-frontend-app-shell-design.md`

## Global Constraints

- Do not redesign Accounting, Student Fee, Event, Main, My Page, or Settings content in this phase.
- Do not change backend APIs, permissions, navigation authorization, or OperationDB.
- Sidebar states are only visible and completely hidden; no icon-only collapsed mode.
- Sidebar preference is client-only and uses `localStorage`; storage failure must not break rendering or toggling.
- Header and sidebar remain visible while `.main` scrolls.
- Remove footer/status-bar markup rather than hiding it with CSS.
- Existing domain-specific styles may remain, but they must not take ownership of global shell geometry.

---

### Task 1: Lock the Shared Shell Contract with a Failing Test

**Files:**
- Create: `scripts/test-frontend-app-shell.js`
- Modify: none

**Interfaces:**
- Consumes: shared shell files under `src/100_common` and authenticated entry templates listed below.
- Produces: one Node contract test that guards shell markup, CSS geometry, persistence hooks, and footer removal.

Authenticated entry templates to enumerate explicitly in the test:
- `src/250_main/Main.html`
- `src/270_mypage/MyPage.html`
- `src/300_settings/300_home/Settings_Home.html`
- `src/300_settings/310_users/Settings_Users.html`
- `src/300_settings/320_roles/Settings_Roles.html`
- `src/300_settings/330_permissions/Settings_Permissions.html`
- `src/300_settings/340_departments/Settings_Departments.html`
- `src/400_accounting/400_home/Accounting_Home.html`
- `src/400_accounting/410_ledger/Accounting_Ledger.html`
- `src/400_accounting/420_reconciliation/Accounting_Reconciliation.html`
- `src/400_accounting/430_settlement/Accounting_Settlement.html`
- `src/500_student_fee/500_home/Student_Fee_Home.html`
- `src/500_student_fee/510_payers/Student_Fee_Payers.html`
- `src/500_student_fee/520_payments/Student_Fee_Payments.html`
- `src/500_student_fee/530_refunds/Student_Fee_Refunds.html`
- `src/600_event/600_home/Event_Home.html`
- `src/600_event/610_form/Event_Form.html`
- `src/600_event/620_detail/Event_Detail.html`

- [ ] **Step 1: Write the failing shell contract**

Create `scripts/test-frontend-app-shell.js` with assertions equivalent to:

```js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const header = read('src/100_common/App_Header.html');
const sidebar = read('src/100_common/App_Sidebar.html');
const styles = read('src/100_common/App_Styles.html');
const shellJs = read('src/100_common/app_shell_js.html');

assert.match(header, /id=["']appSidebarToggle["']/);
assert.match(header, /aria-controls=["']appSidebar["']/);
assert.match(sidebar, /id=["']appSidebar["']/);
assert.match(styles, /\.app\s*\{[\s\S]*height:\s*100vh/);
assert.match(styles, /grid-template-rows:\s*var\(--header-h\)\s+minmax\(0,\s*1fr\)/);
assert.match(styles, /\.main\s*\{[\s\S]*overflow:\s*auto/);
assert.match(styles, /\.sidebar\s*\{[\s\S]*overflow-y:\s*auto/);
assert.match(styles, /\.app\.sidebar-hidden\s+\.body/);
assert.doesNotMatch(styles, /--status-h/);
assert.doesNotMatch(styles, /\.status-bar\s*\{/);
assert.match(shellJs, /localStorage/);
assert.match(shellJs, /sidebar-hidden/);
assert.match(shellJs, /aria-expanded/);

const templates = [/* exact 18 paths above */];
templates.forEach(file => {
  const source = read(file);
  assert.doesNotMatch(source, /<footer\b[^>]*status-bar/);
  assert.match(source, /include\(['"]100_common\/App_Header['"]\)/);
  assert.match(source, /include\(['"]100_common\/App_Sidebar['"]\)/);
  assert.match(source, /include\(['"]100_common\/app_shell_js['"]\)/);
});

console.log('Frontend app shell contract: PASS');
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
node scripts/test-frontend-app-shell.js
```

Expected: FAIL because the header has no `appSidebarToggle`, sidebar has no `appSidebar`, `.app` still has a footer row, and authenticated templates still render `status-bar` footers.

- [ ] **Step 3: Commit the RED test**

```bash
git add scripts/test-frontend-app-shell.js
git commit -m "test: add frontend app shell contract"
```

---

### Task 2: Convert Shared Markup and CSS to the Viewport Grid Shell

**Files:**
- Modify: `src/100_common/App_Header.html`
- Modify: `src/100_common/App_Sidebar.html`
- Modify: `src/100_common/App_Styles.html`
- Test: `scripts/test-frontend-app-shell.js`

**Interfaces:**
- Consumes: existing `.app`, `.body`, `.header`, `.sidebar`, `.main` shell class names.
- Produces: `#appSidebarToggle`, `#appSidebar`, `.app.sidebar-hidden`, viewport-owned grid geometry.

- [ ] **Step 1: Add stable shell IDs and accessible toggle markup**

Add a button at the left edge of `App_Header.html`:

```html
<button
  class="sidebar-toggle"
  id="appSidebarToggle"
  type="button"
  aria-controls="appSidebar"
  aria-expanded="true"
  aria-label="사이드바 숨기기"
>
  <span aria-hidden="true">☰</span>
</button>
```

Change the root aside in `App_Sidebar.html` to:

```html
<aside class="sidebar" id="appSidebar">
```

Do not change domain navigation IDs or access-control behavior.

- [ ] **Step 2: Replace shell geometry in `App_Styles.html`**

Remove `--status-h`. Make `html`, `body`, and the app shell viewport-bound and prevent competing body scroll:

```css
html, body { height: 100%; }
body { overflow: hidden; }

.app {
  height: 100vh;
  min-height: 0;
  display: grid;
  grid-template-rows: var(--header-h) minmax(0, 1fr);
  overflow: hidden;
}

.body {
  min-height: 0;
  display: grid;
  grid-template-columns: var(--sidebar-w) minmax(0, 1fr);
  overflow: hidden;
}

.app.sidebar-hidden .body {
  grid-template-columns: 0 minmax(0, 1fr);
}

.sidebar {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

.app.sidebar-hidden .sidebar {
  visibility: hidden;
  pointer-events: none;
}

.main {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
}
```

Change `.workspace` from owning the page scroll to participating inside `.main`:

```css
.workspace {
  padding: 24px 32px 32px;
  flex: 1 0 auto;
}
```

Remove the `.status-bar` block and `.status-bar a` rule.

- [ ] **Step 3: Style the toggle without redesigning the header**

Update `.header` grid columns to include the new compact toggle before the brand and add a focused `.sidebar-toggle` rule that visually matches existing header controls. Keep the rest of the header controls unchanged.

- [ ] **Step 4: Run the focused contract**

Run:

```bash
node scripts/test-frontend-app-shell.js
```

Expected: still FAIL only on persistence/footer assertions that belong to later tasks; header/sidebar/CSS geometry assertions should pass.

- [ ] **Step 5: Commit shared shell markup/CSS**

```bash
git add src/100_common/App_Header.html src/100_common/App_Sidebar.html src/100_common/App_Styles.html scripts/test-frontend-app-shell.js
git commit -m "feat: standardize viewport app shell layout"
```

---

### Task 3: Add Persisted Sidebar Visibility Behavior

**Files:**
- Modify: `src/100_common/app_shell_js.html`
- Create: `scripts/test-frontend-app-shell-behavior.js`
- Test: `scripts/test-frontend-app-shell.js`

**Interfaces:**
- Consumes: `#appSidebarToggle`, `#appSidebar`, root `.app` element, `localStorage`.
- Produces internal functions `readAppSidebarHidden_()`, `applyAppSidebarHidden_(hidden)`, `toggleAppSidebar_()`, and a namespaced storage key constant.

- [ ] **Step 1: Write a failing behavior harness**

Create `scripts/test-frontend-app-shell-behavior.js` that strips the `<script>` wrapper, evaluates `app_shell_js.html` in a VM with a fake DOM/localStorage, and verifies:

```js
// default when no stored preference
assert.strictEqual(app.classList.contains('sidebar-hidden'), false);
assert.strictEqual(toggle.getAttribute('aria-expanded'), 'true');

// restore persisted hidden preference
storage.setItem('council.appShell.sidebarHidden', 'true');
context.applyInitialAppSidebarState_();
assert.strictEqual(app.classList.contains('sidebar-hidden'), true);
assert.strictEqual(toggle.getAttribute('aria-expanded'), 'false');

// toggle hidden -> visible
context.toggleAppSidebar_();
assert.strictEqual(app.classList.contains('sidebar-hidden'), false);
assert.strictEqual(storage.getItem('council.appShell.sidebarHidden'), 'false');

// storage exception must not throw
storage.setItem = () => { throw new Error('blocked'); };
assert.doesNotThrow(() => context.toggleAppSidebar_());
```

Stub existing shell dependencies (`google.script.run`, `WEB_APP_URL`, `APP_CURRENT_PAGE`, user constants, navigation elements) so the harness isolates the sidebar state behavior.

- [ ] **Step 2: Run behavior test and verify RED**

```bash
node scripts/test-frontend-app-shell-behavior.js
```

Expected: FAIL because sidebar-state functions do not exist yet.

- [ ] **Step 3: Implement sidebar persistence in `app_shell_js.html`**

Add:

```js
var APP_SIDEBAR_STORAGE_KEY_ = 'council.appShell.sidebarHidden';

function readAppSidebarHidden_() {
  try {
    return window.localStorage.getItem(APP_SIDEBAR_STORAGE_KEY_) === 'true';
  } catch (error) {
    return false;
  }
}

function applyAppSidebarHidden_(hidden) {
  var app = document.querySelector('.app');
  var toggle = getAppElement('appSidebarToggle');
  var sidebar = getAppElement('appSidebar');
  if (!app || !toggle || !sidebar) return;
  app.classList.toggle('sidebar-hidden', !!hidden);
  toggle.setAttribute('aria-expanded', hidden ? 'false' : 'true');
  toggle.setAttribute('aria-label', hidden ? '사이드바 열기' : '사이드바 숨기기');
}

function applyInitialAppSidebarState_() {
  applyAppSidebarHidden_(readAppSidebarHidden_());
}

function toggleAppSidebar_() {
  var app = document.querySelector('.app');
  if (!app) return;
  var hidden = !app.classList.contains('sidebar-hidden');
  applyAppSidebarHidden_(hidden);
  try {
    window.localStorage.setItem(APP_SIDEBAR_STORAGE_KEY_, hidden ? 'true' : 'false');
  } catch (error) {}
}
```

Initialize the state before other nonessential shell work and register the toggle listener only when the element exists:

```js
applyInitialAppSidebarState_();
var appSidebarToggle = getAppElement('appSidebarToggle');
if (appSidebarToggle) appSidebarToggle.addEventListener('click', toggleAppSidebar_);
```

Do not change navigation authorization or Student Fee submenu behavior.

- [ ] **Step 4: Run focused tests**

```bash
node scripts/test-frontend-app-shell-behavior.js
node scripts/test-frontend-app-shell.js
```

Expected: behavior test PASS; structural test still fails only if footer markup remains.

- [ ] **Step 5: Commit sidebar behavior**

```bash
git add src/100_common/app_shell_js.html scripts/test-frontend-app-shell-behavior.js scripts/test-frontend-app-shell.js
git commit -m "feat: persist sidebar visibility preference"
```

---

### Task 4: Remove Legacy Footer from Every Authenticated Entry Template

**Files:**
- Modify the 18 authenticated entry templates enumerated in Task 1.
- Test: `scripts/test-frontend-app-shell.js`

**Interfaces:**
- Consumes: the shared two-row shell from Task 2.
- Produces: authenticated templates containing only header + body inside `.app`, with no footer/status-bar row.

- [ ] **Step 1: Remove footer markup from all 18 templates**

For each entry template, delete only the legacy block matching:

```html
<footer class="status-bar">...</footer>
```

or the settings variant:

```html
<footer class="status-bar" id="statusBar">...</footer>
```

Do not move that text elsewhere in this phase. Preserve each template's domain includes and `.main` modifier classes (`accounting-main`, `sf-main`, `event-main`, etc.).

- [ ] **Step 2: Run shell contract**

```bash
node scripts/test-frontend-app-shell.js
```

Expected: PASS.

- [ ] **Step 3: Run affected frontend/domain tests**

```bash
node scripts/test-sidebar-access.js
node scripts/test-mypage-frontend.js
node scripts/test-settings.js
node scripts/test-student-fee-frontend.js
node scripts/test-event-form-sync-frontend.js
node scripts/verify-ui-system-migration.js
```

Expected: PASS. If an existing test intentionally asserts footer markup, update that test to the approved no-footer contract rather than restoring footer code.

- [ ] **Step 4: Commit footer removal**

```bash
git add src/250_main src/270_mypage src/300_settings src/400_accounting src/500_student_fee src/600_event scripts/test-frontend-app-shell.js
git commit -m "refactor: remove legacy app status footer"
```

---

### Task 5: Full Regression and Merge Gate

**Files:**
- Modify only test harnesses that fail because they encode the superseded shell contract.
- No production scope expansion.

**Interfaces:**
- Consumes: completed shared shell implementation.
- Produces: merge-ready branch with fresh repository-wide verification evidence.

- [ ] **Step 1: Run all Node tests**

```bash
set -euo pipefail
for test_file in scripts/test-*.js; do
  echo "::group::$test_file"
  node "$test_file"
  echo "::endgroup::"
done
```

Expected: every test exits 0.

- [ ] **Step 2: Run architecture and naming verifiers**

```bash
node scripts/verify-public-api-naming.js
node scripts/verify-internal-function-naming.js
node scripts/verify-auth-iam-architecture.js
node scripts/verify-settings-architecture.js
node scripts/verify-accounting-architecture.js
node scripts/verify-student-fee-architecture.js
node scripts/verify-event-architecture.js
node scripts/verify-ui-system-migration.js
node scripts/verify-system-consistency-architecture.js
```

Expected: every verifier exits 0.

- [ ] **Step 3: Review diff for scope**

Confirm:
- no server/API/DB files changed;
- no domain view redesign occurred;
- the only production behavior changes are viewport shell geometry, sidebar toggle/persistence, and footer removal;
- all 18 authenticated entry templates still include shared header/sidebar/shell JS.

- [ ] **Step 4: Commit any necessary test-contract updates**

```bash
git add scripts
git commit -m "test: align frontend regression with app shell contract"
```

Skip this commit if no additional test files needed adjustment.

- [ ] **Step 5: Open/update PR and require CI GREEN before merge**

PR summary must state:
- fixed header/sidebar behavior is implemented through viewport CSS Grid, not independent `position: fixed` offsets;
- `.main` is the primary content-scroll container;
- sidebar can be completely hidden/restored and preference persists in `localStorage`;
- legacy footer/status-bar is removed;
- no backend or DB changes are included.
