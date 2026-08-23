# Accounting Ledger Modal Partials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split Accounting Ledger page-specific modal markup into dedicated partial files while preserving existing DOM/API behavior and fixing the legacy `.field` collision that broke the modal layout.

**Architecture:** `Accounting_Ledger.html` becomes the composition root for the Ledger page. It owns `.accounting-page` and includes the visible View plus two page-owned modal partials as siblings. Shared visual primitives remain in `App_Styles`; Accounting CSS keeps only domain layout.

**Tech Stack:** Google Apps Script HTML templates, HTML/CSS/vanilla JavaScript, Node.js contract/verifier scripts, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-23-page-owned-modal-partials-design.md`

## Global Constraints
- Do not change Accounting API, routes, schema, or server business logic.
- Preserve all existing Ledger modal DOM IDs and form `name` attributes.
- Do not use nested `include()` calls inside modal partials.
- Do not use the legacy standalone `field` class in the Ledger register modal.
- Apply this file-ownership rule only to Accounting Ledger in this PR.

---

### Task 1: Lock the page-owned modal contract

**Files:**
- Modify: `scripts/verify-accounting-ui-reference.js`
- Test: `scripts/verify-accounting-ui-reference.js`

**Interfaces:**
- Consumes: current Ledger shell/View structure.
- Produces: a verifier contract requiring two modal partials and forbidding modal markup in the View.

- [ ] **Step 1: Write the failing structural assertions**

Add checks equivalent to:

```js
var ledgerShellPath = path.join(ROOT, 'src', '400_accounting', '410_ledger', 'Accounting_Ledger.html');
var ledgerShell = fs.readFileSync(ledgerShellPath, 'utf8');
var registerModal = read_('410_ledger/modals/Accounting_Ledger_Register_Modal.html');
var detailModal = read_('410_ledger/modals/Accounting_Ledger_Detail_Modal.html');

if (/ui-modal-overlay|registerModal|detailModal/.test(ledger)) {
  failures.push('Ledger View must not own modal markup.');
}
if (ledgerShell.indexOf("include('400_accounting/410_ledger/modals/Accounting_Ledger_Register_Modal')") < 0) {
  failures.push('Ledger shell must include the register modal partial.');
}
if (ledgerShell.indexOf("include('400_accounting/410_ledger/modals/Accounting_Ledger_Detail_Modal')") < 0) {
  failures.push('Ledger shell must include the detail modal partial.');
}
if (hasExactClassToken_(registerModal, ['field'])) {
  failures.push('Ledger register modal must not use legacy .field.');
}
```

Also assert the preserved register/detail IDs and form names in their respective partials.

- [ ] **Step 2: Run the verifier and confirm RED**

Run:

```bash
node scripts/verify-accounting-ui-reference.js
```

Expected: FAIL because the modal partial files do not exist and modal markup is still in `Accounting_Ledger_View.html`.

- [ ] **Step 3: Commit the RED contract**

```bash
git add scripts/verify-accounting-ui-reference.js
git commit -m "test: require page-owned accounting modal partials"
```

---

### Task 2: Split Ledger register/detail modal markup

**Files:**
- Modify: `src/400_accounting/410_ledger/Accounting_Ledger.html`
- Modify: `src/400_accounting/410_ledger/Accounting_Ledger_View.html`
- Create: `src/400_accounting/410_ledger/modals/Accounting_Ledger_Register_Modal.html`
- Create: `src/400_accounting/410_ledger/modals/Accounting_Ledger_Detail_Modal.html`
- Test: `scripts/verify-accounting-ui-reference.js`

**Interfaces:**
- Consumes: all current Ledger modal IDs and `accounting_ledger_js.html` selectors.
- Produces: the same rendered DOM after template composition, but with modal markup stored in dedicated files.

- [ ] **Step 1: Move the domain root to the Ledger shell**

Change the main composition to:

```html
<main class="main accounting-main">
  <div class="accounting-page">
    <?!= include('400_accounting/410_ledger/Accounting_Ledger_View'); ?>
    <?!= include('400_accounting/410_ledger/modals/Accounting_Ledger_Register_Modal'); ?>
    <?!= include('400_accounting/410_ledger/modals/Accounting_Ledger_Detail_Modal'); ?>
  </div>
</main>
```

- [ ] **Step 2: Reduce the View to visible page content only**

`Accounting_Ledger_View.html` must contain the current `.workspace` page content and the non-modal toast, but no `ui-modal-overlay`, `registerModal`, or `detailModal` markup. Remove the old outer `.accounting-page` wrapper because the shell now owns it.

- [ ] **Step 3: Create the register modal partial**

Move the current register modal block into `modals/Accounting_Ledger_Register_Modal.html`. Keep this composition:

```html
<div class="accounting-modal-overlay ui-modal-overlay" id="registerModal">
  <section class="accounting-modal accounting-register-modal ui-modal">
    ... existing header ...
    <div class="modal-body">
      <form id="entryForm">
        <div class="feature-view">
          ... existing ui-field controls and two-column grid ...
        </div>
      </form>
    </div>
    <div class="accounting-modal-actions ui-modal-actions">
      <button class="ui-btn outline" id="draft" type="button">임시저장</button>
      <button class="ui-btn" id="create" type="button">등록하기</button>
    </div>
  </section>
</div>
```

Preserve all IDs/form names listed in the spec. Do not add class `field` to any wrapper.

- [ ] **Step 4: Create the detail modal partial**

Move the current detail modal block into `modals/Accounting_Ledger_Detail_Modal.html`, preserving:

```html
<div class="accounting-modal-overlay ui-modal-overlay" id="detailModal">
  <section class="accounting-modal accounting-detail-modal ui-modal">
    ... `detailTitle`, `detailStatus`, `detailAlert`, `detailRows`, `detailEvidenceList` ...
    <div class="accounting-modal-actions ui-modal-actions">
      <button class="ui-btn outline" id="editLedger" type="button">수정</button>
      <button class="ui-btn danger" id="deleteLedger" type="button">삭제</button>
      <button class="ui-btn success" id="approve" type="button">정상 처리</button>
    </div>
  </section>
</div>
```

- [ ] **Step 5: Run the Accounting UI verifier**

```bash
node scripts/verify-accounting-ui-reference.js
```

Expected: PASS.

- [ ] **Step 6: Commit the split**

```bash
git add src/400_accounting/410_ledger/Accounting_Ledger.html src/400_accounting/410_ledger/Accounting_Ledger_View.html src/400_accounting/410_ledger/modals scripts/verify-accounting-ui-reference.js
git commit -m "fix: split accounting ledger modal partials"
```

---

### Task 3: Make migration verification composition-aware

**Files:**
- Modify: `scripts/verify-ui-system-migration.js`
- Test: `scripts/verify-ui-system-migration.js`

**Interfaces:**
- Consumes: Ledger View + Register Modal + Detail Modal partials.
- Produces: required hook/form-name validation over the rendered page composition rather than a single View file.

- [ ] **Step 1: Add composed-source support for Ledger hooks**

Introduce a helper:

```js
function readMany(rels) {
  return rels.map((rel) => read(rel)).join('\n');
}
```

For Accounting Ledger required IDs/form names, validate the concatenated source of:

```js
[
  'src/400_accounting/410_ledger/Accounting_Ledger_View.html',
  'src/400_accounting/410_ledger/modals/Accounting_Ledger_Register_Modal.html',
  'src/400_accounting/410_ledger/modals/Accounting_Ledger_Detail_Modal.html'
]
```

Do not require modal hooks to remain physically in the View file.

- [ ] **Step 2: Run the migration verifier**

```bash
node scripts/verify-ui-system-migration.js
```

Expected: PASS with the split-file structure.

- [ ] **Step 3: Run all Node tests and architecture verifiers**

```bash
set -euo pipefail
for test_file in scripts/test-*.js; do node "$test_file"; done
for verify_file in scripts/verify-*.js; do node "$verify_file"; done
```

Expected: every command exits 0.

- [ ] **Step 4: Commit the verifier adaptation**

```bash
git add scripts/verify-ui-system-migration.js
git commit -m "test: verify composed accounting ledger partials"
```

---

### Task 4: PR verification and manual modal QA checkpoint

**Files:**
- Modify: PR #27 description only.

**Interfaces:**
- Consumes: final branch head and GitHub Actions results.
- Produces: a reviewable hotfix/refactor PR ready for manual UI confirmation before merge.

- [ ] **Step 1: Confirm GitHub Actions on the final head**

Require all project workflows triggered for PR #27 to conclude `success`, including the workflow containing the full Node regression suite and architecture verifiers.

- [ ] **Step 2: Update PR #27 description**

Record the root cause, the page-owned modal partial structure, preserved contracts, automated verification results, and note that the user should visually re-open the register/edit modal before merge.

- [ ] **Step 3: Stop before merge**

Do not merge #27 automatically. Manual browser QA of the previously broken Accounting register/edit modal is the acceptance checkpoint because the bug is visual layout behavior that static contract tests cannot fully prove.
