# UI Foundation and App Shell Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate the current shared UI foundation and App shell so later domain migrations can rely on one token system, one shell styling contract, and one set of domain-neutral primitives without changing business behavior.

**Architecture:** `src/100_common/App_Styles.html` becomes the domain-neutral source for Foundation + shared visual primitives. `src/100_common/App_Shell_Styles.html` becomes the only owner of App shell layout/state styling. Existing page templates, DOM IDs, routes, APIs, sidebar behavior, and domain-specific styles remain behaviorally unchanged in this phase.

**Tech Stack:** Google Apps Script HTML templates, vanilla JavaScript, CSS, Node.js static/behavior regression scripts, Git/GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-23-ui-system-consolidation-design.md`

## Global Constraints

- Base architecture is current `main` after PR #23.
- Visual direction stays aligned with the current Student Fee UI.
- Do not change server APIs, routes, schema, request/response payloads, table meaning, form field meaning, or business workflows.
- Do not change `src/000_server/**` in this phase.
- Preserve IDs, `data-*`, `name`, `aria-*`, page constants, and JavaScript selector hooks.
- `src/100_common/App_Styles.html` must remain domain-neutral.
- `src/100_common/App_Shell_Styles.html` owns App shell layout and shell state styles.
- Domain styles remain untouched except where a focused regression test proves a shell conflict requires a compatibility change.
- Canonical shared visual tokens use the `--ui-*` namespace.
- Legacy tokens may remain only as temporary compatibility aliases that resolve to canonical `--ui-*` tokens.
- Do not perform Student Fee, Accounting, Event, Settings, MyPage, Main, or Login visual redesign in this PR.
- TDD is required: add/modify tests first, prove RED, make the minimum implementation, prove GREEN.

---

## File Map

### Shared UI
- Modify: `src/100_common/App_Styles.html`
- Modify: `src/100_common/App_Shell_Styles.html`
- Read/verify only unless a tested accessibility issue requires a markup fix:
  - `src/100_common/App_Header.html`
  - `src/100_common/App_Sidebar.html`
  - `src/100_common/app_shell_js.html`

### Tests / verification
- Create: `scripts/verify-ui-system-architecture.js`
- Modify: `scripts/test-frontend-app-shell.js`
- Run unchanged:
  - `scripts/test-frontend-app-shell-behavior.js`
  - `scripts/test-sidebar-access.js`
  - `scripts/test-mypage-frontend.js`
  - `scripts/test-student-fee-frontend.js`
  - `scripts/test-accounting-sidebar-group.js`
  - all `scripts/test-*.js`
  - all `scripts/verify-*.js`

### Explicitly out of scope in this plan
- `src/400_accounting/common/Accounting_Styles.html`
- `src/500_student_fee/common/Student_Fee_Styles.html`
- `src/600_event/600_common/Event_Styles.html`
- Settings/Main/MyPage/Login domain view redesigns

---

### Task 1: Add the shared UI architecture verifier in RED

**Files:**
- Create: `scripts/verify-ui-system-architecture.js`

**Interfaces:**
- Consumes: `src/100_common/App_Styles.html`, `src/100_common/App_Shell_Styles.html`, and shared page templates.
- Produces: deterministic exit code `0` on a valid UI architecture; exit code `1` with one message per violated contract.

- [ ] **Step 1: Create the verifier skeleton**

Create the file with repository-relative readers and failure aggregation:

```js
var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
function read_(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

var appStyles = read_('src/100_common/App_Styles.html');
var shellStyles = read_('src/100_common/App_Shell_Styles.html');
var failures = [];

function fail_(message) {
  failures.push(message);
}

function finish_() {
  if (failures.length) {
    failures.forEach(function (failure) { console.error(failure); });
    process.exitCode = 1;
    return;
  }
  console.log('UI system architecture verification passed.');
}
```

- [ ] **Step 2: Enforce canonical `--ui-*` tokens**

Require these token definitions in `App_Styles.html`:

```js
var REQUIRED_TOKENS = [
  '--ui-bg', '--ui-surface', '--ui-border', '--ui-border-strong',
  '--ui-text', '--ui-muted', '--ui-primary', '--ui-primary-hover',
  '--ui-info-bg', '--ui-info-fg', '--ui-success-bg', '--ui-success-fg',
  '--ui-warning-bg', '--ui-warning-fg', '--ui-danger-bg', '--ui-danger-fg',
  '--ui-neutral-bg', '--ui-neutral-fg', '--ui-radius-sm', '--ui-radius-md',
  '--ui-radius-lg', '--ui-shadow', '--ui-space-1', '--ui-space-2',
  '--ui-space-3', '--ui-space-4', '--ui-space-5', '--ui-space-6', '--ui-space-8'
];

REQUIRED_TOKENS.forEach(function (token) {
  if (appStyles.indexOf(token + ':') === -1) fail_('Missing canonical UI token: ' + token);
});
```

- [ ] **Step 3: Reject independent legacy token values**

Legacy names may exist only as aliases to `--ui-*`. For the first migration gate, reject literal color/radius/shadow values on these declarations:

```js
var LEGACY_ALIAS_TOKENS = [
  '--bg', '--surface', '--border', '--border-strong', '--text-2', '--text-3',
  '--primary', '--primary-hover', '--radius', '--shadow'
];
```

For each token, if present, require the declaration value to contain `var(--ui-`. Example accepted form:

```css
--bg: var(--ui-bg);
--surface: var(--ui-surface);
--primary: var(--ui-primary);
--radius: var(--ui-radius-md);
```

Do not require deletion yet; Phase 7 of the overall design owns final alias removal.

- [ ] **Step 4: Enforce shell ownership boundaries**

Reject definitions for the following shell layout selectors in `App_Styles.html`:

```js
var SHELL_OWNED_SELECTORS = [
  '.app', '.header', '.body', '.sidebar', '.main', '.sidebar-toggle',
  '.nav-item', '.nav-group', '.nav-submenu', '.nav-subitem',
  '.global-search', '.term-select', '.icon-btn', '.user-trigger', '.pop'
];
```

For this check, detect selector blocks rather than raw substring use. The same class name may appear as a value in comments or markup examples without failing.

Require those visual/layout selectors to exist in `App_Shell_Styles.html` after Task 3.

- [ ] **Step 5: Reject broad global state selectors**

The shared files must not define an unscoped state selector that can change unrelated components. Reject selector blocks for:

```text
.active
.brand
.crumb
.page
.side
.top
.shell
```

Scoped forms such as `.nav-item.active`, `.header .brand`, `.page-header .crumb`, and `.app.sidebar-hidden` are allowed.

- [ ] **Step 6: Preserve shared-shell includes**

Copy the current template list from `scripts/test-frontend-app-shell.js` and require every App-shell page to include both:

```text
100_common/App_Styles
100_common/App_Shell_Styles
```

Do not include `src/200_login/Login.html` in the shell-page list because Login is a standalone layout.

- [ ] **Step 7: Prove RED**

Run:

```bash
node scripts/verify-ui-system-architecture.js
```

Expected: exit `1`. At minimum it must report independent legacy token values and/or shell selectors still owned by `App_Styles.html`.

- [ ] **Step 8: Commit the RED contract**

```bash
git add scripts/verify-ui-system-architecture.js
git commit -m "test: define shared ui architecture contract"
```

---

### Task 2: Make `--ui-*` the canonical token namespace

**Files:**
- Modify: `src/100_common/App_Styles.html`
- Test: `scripts/verify-ui-system-architecture.js`

**Interfaces:**
- Consumes: current Student Fee-derived `--ui-*` values.
- Produces: canonical token definitions plus temporary compatibility aliases for legacy consumers.

- [ ] **Step 1: Keep the existing Student Fee-derived values authoritative**

Retain the current canonical values for:

```css
--ui-bg: #f5f6f8;
--ui-surface: #ffffff;
--ui-border: #e5e7eb;
--ui-border-strong: #d1d5db;
--ui-text: #1f2430;
--ui-muted: #6b7280;
--ui-primary: #2f3b52;
--ui-primary-hover: #3f4d6b;
```

Keep the existing semantic status, spacing, radius, and shadow values unchanged in this phase.

- [ ] **Step 2: Convert legacy declarations to aliases**

Replace independent legacy values with compatibility aliases:

```css
--bg: var(--ui-bg);
--surface: var(--ui-surface);
--border: var(--ui-border);
--border-strong: var(--ui-border-strong);
--text: var(--ui-text);
--text-2: var(--ui-text);
--text-3: var(--ui-muted);
--text-4: var(--ui-muted);
--primary: var(--ui-primary);
--primary-hover: var(--ui-primary-hover);
--active-bg: var(--ui-info-bg);
--active-text: var(--ui-info-fg);
--danger: var(--ui-danger-fg);
--green: var(--ui-success-fg);
--radius: var(--ui-radius-md);
--shadow: var(--ui-shadow);
```

Keep `--brand`, `--sidebar-w`, `--header-h`, `--status-h`, and `--font` as structural/brand compatibility tokens for now; they are not duplicated semantic color systems.

- [ ] **Step 3: Normalize base element styles onto canonical tokens**

Change the base `body`, form controls, borders, and generic shared primitive rules touched by this task to reference `--ui-*` directly where doing so does not require domain markup changes.

Example:

```css
body {
  margin: 0;
  font-family: var(--font);
  color: var(--ui-text);
  background: var(--ui-bg);
}
```

Do not mechanically rewrite domain-specific selectors in this task.

- [ ] **Step 4: Run focused GREEN checks**

Run:

```bash
node scripts/verify-ui-system-architecture.js
node scripts/test-student-fee-frontend.js
node scripts/test-frontend-app-shell.js
```

Expected: the token-alias failures are gone. The architecture verifier may still fail on shell ownership until Task 3.

- [ ] **Step 5: Commit**

```bash
git add src/100_common/App_Styles.html scripts/verify-ui-system-architecture.js
git commit -m "refactor: canonicalize shared ui tokens"
```

---

### Task 3: Make `App_Shell_Styles.html` the sole shell style owner

**Files:**
- Modify: `src/100_common/App_Styles.html`
- Modify: `src/100_common/App_Shell_Styles.html`
- Modify: `scripts/test-frontend-app-shell.js`
- Test: `scripts/test-frontend-app-shell-behavior.js`
- Test: `scripts/verify-ui-system-architecture.js`

**Interfaces:**
- Consumes: canonical `--ui-*` tokens and existing App shell markup/JS.
- Produces: one authoritative shell stylesheet with no duplicate shell layout definitions in `App_Styles.html`.

- [ ] **Step 1: Extend the shell test first**

Add assertions to `scripts/test-frontend-app-shell.js` that require `App_Shell_Styles.html` to own the current shell structures:

```js
assert.match(shellStyles, /\.header\s*\{/);
assert.match(shellStyles, /\.global-search\s*\{/);
assert.match(shellStyles, /\.sidebar\s*\{/);
assert.match(shellStyles, /\.nav-item\s*\{/);
assert.match(shellStyles, /\.nav-submenu\s*\{/);
assert.match(shellStyles, /\.nav-subitem\s*\{/);
assert.match(shellStyles, /\.user-trigger\s*\{/);
assert.match(shellStyles, /\.pop\s*\{/);
```

Also read `App_Styles.html` and assert it no longer defines those selector blocks.

- [ ] **Step 2: Prove RED**

Run:

```bash
node scripts/test-frontend-app-shell.js
```

Expected: FAIL because several shell selectors still live in `App_Styles.html` and are absent from `App_Shell_Styles.html`.

- [ ] **Step 3: Move shell visual rules without changing markup or behavior**

Move the current shared shell rules from `App_Styles.html` into `App_Shell_Styles.html`, preserving computed behavior for:

```text
.app
.header
.header .brand
global search
term selector
notification icon/dot
user trigger/avatar
profile popover
.body
.sidebar
nav item/group/submenu/subitem
.main
page header shell container
workspace shell sizing
```

Keep page-content primitives such as `ui-card`, `ui-btn`, `ui-field`, `ui-table`, `ui-badge`, modal primitives, loading/empty/error, and domain-neutral content patterns in `App_Styles.html`.

- [ ] **Step 4: Remove the compatibility overrides that only exist because of the old global `.active` rule**

Delete the current `App_Shell_Styles.html` workaround comment and override blocks for:

```css
.nav-item.active
.nav-subitem.active
.page-panel.active
```

Only after Task 4 removes the unscoped `.active` rule from `App_Styles.html`. Until then, leave the overrides in place and keep this step pending.

- [ ] **Step 5: Run shell behavior checks**

Run:

```bash
node scripts/test-frontend-app-shell.js
node scripts/test-frontend-app-shell-behavior.js
node scripts/test-sidebar-access.js
node scripts/test-accounting-sidebar-group.js
```

Expected: all PASS.

- [ ] **Step 6: Commit the shell ownership move**

```bash
git add src/100_common/App_Styles.html src/100_common/App_Shell_Styles.html scripts/test-frontend-app-shell.js
git commit -m "refactor: centralize app shell styles"
```

---

### Task 4: Remove broad selector collisions from the shared layer

**Files:**
- Modify: `src/100_common/App_Styles.html`
- Modify: `src/100_common/App_Shell_Styles.html`
- Test: `scripts/verify-ui-system-architecture.js`
- Test: `scripts/test-frontend-app-shell.js`
- Run domain regression tests unchanged.

**Interfaces:**
- Consumes: shell ownership from Task 3.
- Produces: scoped state/name selectors that cannot leak across domain pages.

- [ ] **Step 1: Add collision assertions and prove RED**

Ensure `verify-ui-system-architecture.js` rejects literal selector blocks for standalone:

```text
.active
.brand
.crumb
.page
.side
.top
.shell
```

Run:

```bash
node scripts/verify-ui-system-architecture.js
```

Expected: FAIL on the existing broad legacy definitions in `App_Styles.html`.

- [ ] **Step 2: Remove the global `.active` presentation rule**

The legacy rule currently gives `.active` display, margin, color, and typography. Delete it. Preserve only component-scoped state rules such as:

```css
.nav-item.active { ... }
.nav-subitem.active { ... }
.page-panel.active { display: block; }
```

After deletion, remove the defensive `.nav-item.active`, `.nav-subitem.active`, and `.page-panel.active` resets from `App_Shell_Styles.html` if their only purpose was to override the global rule.

- [ ] **Step 3: Scope generic naming collisions**

Convert generic shared selectors to component-scoped forms where they are part of shared shell/content infrastructure:

```text
.brand       -> .header .brand
.crumb       -> .page-header .crumb (or existing canonical page-header scope)
```

Legacy `.shell`, `.top`, `.side`, `.page` blocks that are not referenced by the current App-shell templates must be removed from `App_Styles.html`. Do not remove selectors whose actual usage is found during implementation; instead record them in the verifier allowlist and defer them to the owning domain migration.

- [ ] **Step 4: Preserve Login as standalone**

Do not force Login to include `App_Shell_Styles.html`. Keep `src/200_login/Login.html` using only `App_Styles.html` plus its standalone login markup. Login-specific selectors may remain in `App_Styles.html` during this phase only if they are scoped under `.login-mode` or `.login` and do not collide with App shell selectors.

- [ ] **Step 5: Run focused regressions**

Run:

```bash
node scripts/verify-ui-system-architecture.js
node scripts/test-frontend-app-shell.js
node scripts/test-frontend-app-shell-behavior.js
node scripts/test-mypage-frontend.js
node scripts/test-student-fee-frontend.js
node scripts/test-accounting-sidebar-group.js
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/100_common/App_Styles.html src/100_common/App_Shell_Styles.html scripts/verify-ui-system-architecture.js
git commit -m "refactor: scope shared ui state selectors"
```

---

### Task 5: Normalize the minimum shared primitive contract for later domain migrations

**Files:**
- Modify: `src/100_common/App_Styles.html`
- Modify: `scripts/verify-ui-system-architecture.js`

**Interfaces:**
- Consumes: canonical tokens from Task 2.
- Produces: stable shared primitive class names for later Student Fee/Accounting/Event migration plans.

- [ ] **Step 1: Add primitive requirements to the verifier**

Require selector blocks for:

```js
var REQUIRED_PRIMITIVES = [
  '.ui-btn', '.ui-field', '.ui-card', '.ui-stat-card', '.ui-badge',
  '.ui-table-wrap', '.ui-table', '.ui-modal', '.ui-tabs', '.ui-tab',
  '.ui-pagination', '.ui-toast', '.ui-loading', '.ui-empty', '.ui-error'
];
```

Where the repository already uses an established equivalent spelling, keep the existing public class name and update this list to that exact spelling rather than creating a duplicate synonym.

- [ ] **Step 2: Prove RED only for genuinely missing primitives**

Run:

```bash
node scripts/verify-ui-system-architecture.js
```

Expected: FAIL only for primitives that are actually absent. If every required primitive already exists, this task starts GREEN and must not invent unnecessary CSS; instead tighten modifier tests in Step 3.

- [ ] **Step 3: Normalize modifier contracts**

Ensure the shared layer has semantic variants for:

```text
button: primary / secondary-or-outline / ghost / danger / small / large
badge: neutral / info / success / warning / danger
field: disabled / invalid
```

Use the existing project naming style if already established. Do not introduce both `.ui-btn-primary` and `.ui-btn.primary` for the same role; one public convention only.

- [ ] **Step 4: Add focus-visible baseline**

Ensure interactive shared primitives and shell controls have a visible focus treatment using `--ui-primary`. At minimum cover:

```text
ui buttons
ui fields/selects/textarea
sidebar toggle
nav links/buttons
profile trigger
```

Do not change tab order or JavaScript focus lifecycle in this phase.

- [ ] **Step 5: Run primitive and Student Fee regressions**

Run:

```bash
node scripts/verify-ui-system-architecture.js
node scripts/test-student-fee-frontend.js
node scripts/test-frontend-app-shell.js
```

Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/100_common/App_Styles.html scripts/verify-ui-system-architecture.js
git commit -m "refactor: stabilize shared ui primitives"
```

---

### Task 6: Full regression and PR gate

**Files:**
- No production changes unless a failing test demonstrates a regression caused by Tasks 1-5.
- Update the plan checkbox state only after verification.

**Interfaces:**
- Consumes: Tasks 1-5.
- Produces: a merge-ready Phase 0+1 PR that later domain plans can depend on.

- [ ] **Step 1: Run the full Node test suite**

Run:

```bash
set -euo pipefail
for test_file in scripts/test-*.js; do
  node "$test_file"
done
```

Expected: exit `0`, no failed test script.

- [ ] **Step 2: Run every architecture verifier**

Run:

```bash
set -euo pipefail
for verify_file in scripts/verify-*.js; do
  [ -e "$verify_file" ] || continue
  node "$verify_file"
done
```

Expected: exit `0`, including `verify-ui-system-architecture.js`.

- [ ] **Step 3: Inspect diff boundaries**

The implementation PR must contain only:

```text
src/100_common/App_Styles.html
src/100_common/App_Shell_Styles.html
scripts/verify-ui-system-architecture.js
scripts/test-frontend-app-shell.js
(optional) one narrowly justified shared markup file if a tested accessibility contract required it
docs/superpowers/specs/2026-08-23-ui-system-consolidation-design.md
docs/superpowers/plans/2026-08-23-ui-foundation-shell.md
```

If domain-specific stylesheet/view changes appear, split them out before review.

- [ ] **Step 4: Rebase/merge latest `main` and verify synthetic merge CI**

Before merge, update the feature branch with latest `main`, then require all repository PR workflows to complete successfully. Do not rely on a previous head SHA.

- [ ] **Step 5: Open PR with explicit non-goals**

Use a PR summary equivalent to:

```markdown
## 목적
- 공통 UI token을 `--ui-*` 기준으로 단일화
- App shell 스타일 책임을 `App_Shell_Styles.html`로 일원화
- 광범위한 legacy selector 충돌 제거
- 이후 도메인 UI migration을 위한 primitive 계약 고정

## 변경하지 않음
- API / route / schema / business workflow
- 도메인별 화면 레이아웃 및 정보구조
- Accounting / Student Fee / Event 업무 로직

## 검증
- 전체 `scripts/test-*.js`
- 전체 `scripts/verify-*.js`
- 최신 main synthetic merge CI
```

- [ ] **Step 6: Stop after Phase 0+1 merge readiness**

Do not begin Student Fee cleanup in the same branch. After this PR reaches `main`, create a fresh plan/branch for Phase 2 using this shared contract as the baseline.

---

## Self-Review Notes

### Spec coverage

This plan covers only the intentionally isolated first implementation slice of the approved design:

- Phase 0: selector/token inventory expressed as an executable architecture verifier.
- Phase 1: canonical tokens, authoritative App shell ownership, collision cleanup, primitive stabilization, accessibility baseline.

Student Fee, Accounting, Event, Settings/MyPage, Main/Login migrations are deliberately excluded because the approved design requires independent PRs and the writing-plans scope rule favors independently testable subprojects.

### Placeholder scan

No `TBD`, `TODO`, unspecified test step, or undefined interface is required by this plan. If implementation discovers a selector is still actively used, the executor must preserve it and document that exact selector in the verifier allowlist rather than deleting it speculatively.

### Type/name consistency

The plan consistently uses:

```text
App_Styles.html                = Foundation + shared primitives
App_Shell_Styles.html          = App shell layout/state
verify-ui-system-architecture.js = architecture gate
--ui-*                         = canonical visual token namespace
```
