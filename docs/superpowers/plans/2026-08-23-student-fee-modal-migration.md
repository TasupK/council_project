# Student Fee Page-Owned Modal Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all six static Student Fee page-specific modal trees out of `*_View.html` files into page-owned `modals/*_Modal.html` partials without changing Student Fee behavior, DOM hooks, API calls, or visual semantics.

**Architecture:** Each Student Fee top-level page remains the composition root. `Student_Fee_Payers.html`, `Student_Fee_Payments.html`, and `Student_Fee_Refunds.html` will include their visible View first and their page-owned modal partials as sibling includes inside `<main class="main sf-main">`. The View keeps visible page content, loading/error state, and toast; modal partials own stable dialog markup; existing page JavaScript continues to bind the same IDs/names/data-actions.

**Tech Stack:** Google Apps Script HTML templates, vanilla HTML/CSS/JavaScript, Node.js contract/verifier scripts, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-23-page-owned-modal-partials-design.md`

## Global Constraints

- Do not change Apps Script routes or server/API contracts.
- Do not change Student Fee mutation sequencing, busy guards, approval/refund calculations, or error handling.
- Preserve every existing modal DOM ID, form name, data-action, `aria-*` hook, and `hidden` default.
- One page-specific modal responsibility per `modals/*_Modal.html` file.
- Modal partials must not contain `<script>` blocks or nested `include()` calls.
- `*_View.html` files must not contain `ui-modal-overlay` after migration.
- Keep shared modal presentation in `100_common/App_Styles.html`; do not create Student Fee copies of `.ui-modal`, `.ui-modal-overlay`, `.ui-field`, or `.ui-btn`.
- `Student_Fee_Styles.html` may keep only Student Fee composition such as `.sf-modal-grid` and `.sf-modal-amount`.
- Every task follows TDD: add/strengthen a failing architecture contract first, verify RED, make the smallest markup/composition change, then verify GREEN.

---

## File Structure After Migration

```text
src/500_student_fee/
├─ 510_payers/
│  ├─ Student_Fee_Payers.html
│  ├─ Student_Fee_Payers_View.html
│  ├─ modals/
│  │  └─ Student_Fee_Payer_Edit_Modal.html
│  └─ student_fee_payers_js.html
├─ 520_payments/
│  ├─ Student_Fee_Payments.html
│  ├─ Student_Fee_Payments_View.html
│  ├─ modals/
│  │  ├─ Student_Fee_Payment_Detail_Modal.html
│  │  └─ Student_Fee_Payment_Confirm_Modal.html
│  └─ student_fee_payments_js.html
└─ 530_refunds/
   ├─ Student_Fee_Refunds.html
   ├─ Student_Fee_Refunds_View.html
   ├─ modals/
   │  ├─ Student_Fee_Refund_Detail_Modal.html
   │  ├─ Student_Fee_Refund_Approval_Modal.html
   │  └─ Student_Fee_Refund_Transfer_Modal.html
   └─ student_fee_refunds_js.html
```

No JS file is expected to change unless implementation reveals a concrete path/selector assumption that cannot survive DOM-preserving extraction. If such an assumption is found, stop and treat it as a separate behavior change rather than silently editing it.

---

### Task 1: Add Student Fee composed-modal architecture contract

**Files:**
- Modify: `scripts/verify-student-fee-ui-reference.js`
- Modify: `scripts/test-student-fee-frontend.js`

**Interfaces:**
- Consumes: current Student Fee shells, Views, and six embedded modal trees.
- Produces: a reusable verifier contract that treats shell + View + modal partials as the page UI and rejects modal ownership inside migrated Views.

- [ ] **Step 1: Add safe partial reading and page composition metadata to the verifier**

Add a non-throwing helper and page map:

```js
function readOptional_(relativePath) {
  var target = path.join(FRONTEND_ROOT, relativePath);
  return fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
}

var MODAL_PAGES = {
  '510_payers': {
    shell: '510_payers/Student_Fee_Payers.html',
    view: '510_payers/Student_Fee_Payers_View.html',
    partials: ['510_payers/modals/Student_Fee_Payer_Edit_Modal.html']
  },
  '520_payments': {
    shell: '520_payments/Student_Fee_Payments.html',
    view: '520_payments/Student_Fee_Payments_View.html',
    partials: [
      '520_payments/modals/Student_Fee_Payment_Detail_Modal.html',
      '520_payments/modals/Student_Fee_Payment_Confirm_Modal.html'
    ]
  },
  '530_refunds': {
    shell: '530_refunds/Student_Fee_Refunds.html',
    view: '530_refunds/Student_Fee_Refunds_View.html',
    partials: [
      '530_refunds/modals/Student_Fee_Refund_Detail_Modal.html',
      '530_refunds/modals/Student_Fee_Refund_Approval_Modal.html',
      '530_refunds/modals/Student_Fee_Refund_Transfer_Modal.html'
    ]
  }
};
```

For each map entry, verify:

```js
var view = read_(page.view);
var shell = read_(page.shell);
if (/ui-modal-overlay/.test(view)) {
  failures.push(page.view + ' must not own page-specific modal markup.');
}
page.partials.forEach(function (partial) {
  var source = readOptional_(partial);
  if (!source) failures.push('Missing Student Fee modal partial: ' + partial);
  var includePath = partial.replace(/\.html$/, '');
  if (shell.indexOf("include('500_student_fee/" + includePath + "')") < 0) {
    failures.push(page.shell + ' must include ' + partial + '.');
  }
});
```

- [ ] **Step 2: Add exact modal hook contracts**

Verify the composed modal sources contain these hooks:

```js
var payerModal = readOptional_('510_payers/modals/Student_Fee_Payer_Edit_Modal.html');
['sf-payer-modal', 'sf-payer-modal-title', 'sf-payer-modal-desc', 'sf-payer-form',
 'sf-payer-student-id', 'sf-payer-name', 'sf-payer-affiliation-input',
 'sf-payer-semester', 'sf-payer-submit'].forEach(function (id) {
  if (payerModal.indexOf('id="' + id + '"') < 0) failures.push('Payer modal missing id=' + id);
});
['studentId', 'name', 'affiliation', 'startSemesterId'].forEach(function (name) {
  if (payerModal.indexOf('name="' + name + '"') < 0) failures.push('Payer modal missing name=' + name);
});
if (payerModal.indexOf('data-action="close-payer-modal"') < 0) failures.push('Payer modal missing close action.');

var paymentDetail = readOptional_('520_payments/modals/Student_Fee_Payment_Detail_Modal.html');
['sf-payment-detail-modal', 'sf-payment-detail-title', 'sf-payment-detail-content', 'sf-payment-detail-actions'].forEach(function (id) {
  if (paymentDetail.indexOf('id="' + id + '"') < 0) failures.push('Payment detail modal missing id=' + id);
});

var paymentConfirm = readOptional_('520_payments/modals/Student_Fee_Payment_Confirm_Modal.html');
['sf-payment-confirm-modal', 'sf-payment-confirm-title', 'sf-payment-confirm-form',
 'sf-payment-depositor', 'sf-payment-confirm-reason'].forEach(function (id) {
  if (paymentConfirm.indexOf('id="' + id + '"') < 0) failures.push('Payment confirm modal missing id=' + id);
});
['depositorName', 'reason'].forEach(function (name) {
  if (paymentConfirm.indexOf('name="' + name + '"') < 0) failures.push('Payment confirm modal missing name=' + name);
});
['close-payment-confirm', 'confirm-payment'].forEach(function (action) {
  if (paymentConfirm.indexOf('data-action="' + action + '"') < 0) failures.push('Payment confirm modal missing action=' + action);
});

var refundDetail = readOptional_('530_refunds/modals/Student_Fee_Refund_Detail_Modal.html');
['sf-refund-detail-modal', 'sf-refund-detail-title', 'sf-refund-detail-content', 'sf-refund-detail-actions'].forEach(function (id) {
  if (refundDetail.indexOf('id="' + id + '"') < 0) failures.push('Refund detail modal missing id=' + id);
});

var refundApproval = readOptional_('530_refunds/modals/Student_Fee_Refund_Approval_Modal.html');
['sf-refund-approval-modal', 'sf-refund-approval-title', 'sf-refund-approval-form',
 'sf-refund-maximum', 'sf-refund-approved-amount', 'sf-refund-approval-reason',
 'sf-refund-approve-submit'].forEach(function (id) {
  if (refundApproval.indexOf('id="' + id + '"') < 0) failures.push('Refund approval modal missing id=' + id);
});
['approvedAmount', 'reason'].forEach(function (name) {
  if (refundApproval.indexOf('name="' + name + '"') < 0) failures.push('Refund approval modal missing name=' + name);
});
if (refundApproval.indexOf('data-action="close-refund-approval"') < 0) failures.push('Refund approval modal missing close action.');

var refundTransfer = readOptional_('530_refunds/modals/Student_Fee_Refund_Transfer_Modal.html');
['sf-refund-transfer-modal', 'sf-refund-transfer-title', 'sf-refund-transfer-form',
 'sf-refund-transfer-date', 'sf-refund-transfer-file', 'sf-refund-transfer-reason'].forEach(function (id) {
  if (refundTransfer.indexOf('id="' + id + '"') < 0) failures.push('Refund transfer modal missing id=' + id);
});
['transferDate', 'transferEvidenceId', 'reason'].forEach(function (name) {
  if (refundTransfer.indexOf('name="' + name + '"') < 0) failures.push('Refund transfer modal missing name=' + name);
});
['close-refund-transfer', 'confirm-refund-transfer'].forEach(function (action) {
  if (refundTransfer.indexOf('data-action="' + action + '"') < 0) failures.push('Refund transfer modal missing action=' + action);
});
```

Also require every non-empty modal partial to include `ui-modal-overlay`, `ui-modal`, and `aria-modal="true"`, and reject `<script` or `include(` in modal partials.

- [ ] **Step 3: Add a frontend regression assertion that Student Fee behavior JS remains markup-independent**

Add to `scripts/test-student-fee-frontend.js`:

```js
function testStudentFeeViewsDoNotOwnModalsAfterMigration_() {
  [
    'src/500_student_fee/510_payers/Student_Fee_Payers_View.html',
    'src/500_student_fee/520_payments/Student_Fee_Payments_View.html',
    'src/500_student_fee/530_refunds/Student_Fee_Refunds_View.html'
  ].forEach(function (file) {
    assert.doesNotMatch(read_(file), /ui-modal-overlay/);
  });
}
```

Call it before the final success log.

- [ ] **Step 4: Run RED verification**

Run:

```bash
node scripts/verify-student-fee-ui-reference.js
node scripts/test-student-fee-frontend.js
```

Expected: both commands fail because modal partials do not exist and the three Views still contain `ui-modal-overlay`.

- [ ] **Step 5: Commit the RED contract**

```bash
git add scripts/verify-student-fee-ui-reference.js scripts/test-student-fee-frontend.js
git commit -m "test(student-fee): define page-owned modal contract"
```

---

### Task 2: Migrate Student Fee Payers modal

**Files:**
- Create: `src/500_student_fee/510_payers/modals/Student_Fee_Payer_Edit_Modal.html`
- Modify: `src/500_student_fee/510_payers/Student_Fee_Payers_View.html`
- Modify: `src/500_student_fee/510_payers/Student_Fee_Payers.html`
- Test: `scripts/verify-student-fee-ui-reference.js`
- Test: `scripts/test-student-fee-frontend.js`

**Interfaces:**
- Consumes: existing payer modal IDs, form names, `close-payer-modal` action, and `student_fee_payers_js.html` selectors.
- Produces: one page-owned payer modal partial included by the Payers shell.

- [ ] **Step 1: Move the existing payer modal tree verbatim into the new partial**

`Student_Fee_Payer_Edit_Modal.html` must contain the current `#sf-payer-modal` overlay from `Student_Fee_Payers_View.html`, starting with:

```html
<div id="sf-payer-modal" class="ui-modal-overlay" hidden>
  <div class="ui-modal" role="dialog" aria-modal="true" aria-labelledby="sf-payer-modal-title">
```

and ending after the existing `sf-payer-form` / `ui-modal-actions` content. Do not rename IDs, names, actions, labels, or default attributes.

- [ ] **Step 2: Remove only the modal tree from the View**

Keep `.sf-workspace`, page header, search/list UI, loading/error state, and `#sf-toast` in `Student_Fee_Payers_View.html`. After the change, the View must contain no `ui-modal-overlay`.

- [ ] **Step 3: Include the modal partial in the Payers shell**

Inside `<main class="main sf-main">`, immediately after the View include, add:

```html
<?!= include('500_student_fee/510_payers/modals/Student_Fee_Payer_Edit_Modal'); ?>
```

- [ ] **Step 4: Run page-focused verification**

Run:

```bash
node scripts/verify-student-fee-ui-reference.js
node scripts/test-student-fee-frontend.js
```

Expected: failures remain for Payments and Refunds only; Payers ownership/include/hook errors disappear.

- [ ] **Step 5: Commit Payers migration**

```bash
git add src/500_student_fee/510_payers scripts/verify-student-fee-ui-reference.js scripts/test-student-fee-frontend.js
git commit -m "refactor(student-fee): split payer modal partial"
```

---

### Task 3: Migrate Student Fee Payments modals

**Files:**
- Create: `src/500_student_fee/520_payments/modals/Student_Fee_Payment_Detail_Modal.html`
- Create: `src/500_student_fee/520_payments/modals/Student_Fee_Payment_Confirm_Modal.html`
- Modify: `src/500_student_fee/520_payments/Student_Fee_Payments_View.html`
- Modify: `src/500_student_fee/520_payments/Student_Fee_Payments.html`
- Test: `scripts/verify-student-fee-ui-reference.js`
- Test: `scripts/test-student-fee-frontend.js`

**Interfaces:**
- Consumes: current payment detail/confirmation IDs, form names, actions, and `student_fee_payments_js.html` behavior.
- Produces: two page-owned payment modal partials included by the Payments shell.

- [ ] **Step 1: Extract the payment detail modal verbatim**

Create `Student_Fee_Payment_Detail_Modal.html` from the existing `#sf-payment-detail-modal` tree. Preserve:

```html
id="sf-payment-detail-modal"
id="sf-payment-detail-title"
id="sf-payment-detail-content"
id="sf-payment-detail-actions"
```

and keep `hidden`, `role="dialog"`, `aria-modal="true"`, and `aria-labelledby="sf-payment-detail-title"` unchanged.

- [ ] **Step 2: Extract the payment confirmation modal verbatim**

Create `Student_Fee_Payment_Confirm_Modal.html` from the current `#sf-payment-confirm-modal` tree. Preserve IDs `sf-payment-confirm-modal`, `sf-payment-confirm-title`, `sf-payment-confirm-form`, `sf-payment-depositor`, `sf-payment-confirm-reason`; names `depositorName`, `reason`; actions `close-payment-confirm`, `confirm-payment`; and `data-result="MISMATCH"` / `data-result="DONE"`.

- [ ] **Step 3: Remove both modal trees from the View and include both partials in shell order**

`Student_Fee_Payments_View.html` keeps visible list/bulk/loading/error/toast UI only. In `Student_Fee_Payments.html`, add after the View include:

```html
<?!= include('500_student_fee/520_payments/modals/Student_Fee_Payment_Detail_Modal'); ?>
<?!= include('500_student_fee/520_payments/modals/Student_Fee_Payment_Confirm_Modal'); ?>
```

- [ ] **Step 4: Run page-focused verification**

Run:

```bash
node scripts/verify-student-fee-ui-reference.js
node scripts/test-student-fee-frontend.js
```

Expected: Payers and Payments contracts pass; remaining RED failures refer only to Refund modal ownership/partials.

- [ ] **Step 5: Commit Payments migration**

```bash
git add src/500_student_fee/520_payments
git commit -m "refactor(student-fee): split payment modal partials"
```

---

### Task 4: Migrate Student Fee Refunds modals

**Files:**
- Create: `src/500_student_fee/530_refunds/modals/Student_Fee_Refund_Detail_Modal.html`
- Create: `src/500_student_fee/530_refunds/modals/Student_Fee_Refund_Approval_Modal.html`
- Create: `src/500_student_fee/530_refunds/modals/Student_Fee_Refund_Transfer_Modal.html`
- Modify: `src/500_student_fee/530_refunds/Student_Fee_Refunds_View.html`
- Modify: `src/500_student_fee/530_refunds/Student_Fee_Refunds.html`
- Test: `scripts/verify-student-fee-ui-reference.js`
- Test: `scripts/test-student-fee-frontend.js`

**Interfaces:**
- Consumes: current refund detail/approval/transfer IDs, names, data-actions, data-results, and `student_fee_refunds_js.html` behavior.
- Produces: three page-owned refund modal partials included by the Refunds shell.

- [ ] **Step 1: Extract the refund detail modal verbatim**

Preserve IDs `sf-refund-detail-modal`, `sf-refund-detail-title`, `sf-refund-detail-content`, and `sf-refund-detail-actions`, plus the existing dialog accessibility attributes.

- [ ] **Step 2: Extract the refund approval modal verbatim**

Preserve IDs `sf-refund-approval-modal`, `sf-refund-approval-title`, `sf-refund-approval-form`, `sf-refund-maximum`, `sf-refund-approved-amount`, `sf-refund-approval-reason`, `sf-refund-approve-submit`; names `approvedAmount`, `reason`; and action `close-refund-approval`.

- [ ] **Step 3: Extract the refund transfer modal verbatim**

Preserve IDs `sf-refund-transfer-modal`, `sf-refund-transfer-title`, `sf-refund-transfer-form`, `sf-refund-transfer-date`, `sf-refund-transfer-file`, `sf-refund-transfer-reason`; names `transferDate`, `transferEvidenceId`, `reason`; actions `close-refund-transfer`, `confirm-refund-transfer`; and `data-result="FAILED"` / `data-result="DONE"`.

- [ ] **Step 4: Remove all refund modal trees from the View and include the three partials**

Add after the Refunds View include:

```html
<?!= include('500_student_fee/530_refunds/modals/Student_Fee_Refund_Detail_Modal'); ?>
<?!= include('500_student_fee/530_refunds/modals/Student_Fee_Refund_Approval_Modal'); ?>
<?!= include('500_student_fee/530_refunds/modals/Student_Fee_Refund_Transfer_Modal'); ?>
```

Keep `#sf-toast` in the View.

- [ ] **Step 5: Verify GREEN for Student Fee architecture and behavior**

Run:

```bash
node scripts/verify-student-fee-ui-reference.js
node scripts/test-student-fee-frontend.js
```

Expected: both commands exit 0 with `Student Fee UI reference verification passed.` and `Student Fee frontend regression tests passed.`

- [ ] **Step 6: Commit Refunds migration**

```bash
git add src/500_student_fee/530_refunds
git commit -m "refactor(student-fee): split refund modal partials"
```

---

### Task 5: Full regression, review, and PR gate

**Files:**
- Review: all files changed by Tasks 1-4
- Test: all `scripts/test-*.js`
- Test: all `scripts/verify-*.js`

**Interfaces:**
- Consumes: completed Student Fee modal migration.
- Produces: a reviewable PR that changes markup ownership only, with fresh CI evidence.

- [ ] **Step 1: Verify no behavior JS or server files changed**

Run:

```bash
git diff --name-only main...HEAD
```

Expected production changes are limited to the three Student Fee page shells, three Student Fee Views, six new modal partials, plus verifier/test files and this plan/spec documentation inherited from the architecture work. No `src/000_server/**` or `student_fee_*_js.html` behavior file should appear.

- [ ] **Step 2: Run the full Node regression suite**

Run:

```bash
set -euo pipefail
for test_file in scripts/test-*.js; do node "$test_file"; done
```

Expected: exit 0 for every test file.

- [ ] **Step 3: Run all architecture/naming verifiers**

Run:

```bash
set -euo pipefail
for verify_file in scripts/verify-*.js; do [ -e "$verify_file" ] || continue; node "$verify_file"; done
```

Expected: exit 0 for every verifier.

- [ ] **Step 4: Review the final diff for accidental markup changes**

For each modal, compare the old View tree and new partial and verify there are no changes to:
- IDs
- `name` attributes
- `data-action`
- `data-result`
- `hidden`
- `role="dialog"`
- `aria-modal`
- `aria-labelledby`
- button types
- form submit semantics

Only file ownership and shell include location should differ.

- [ ] **Step 5: Push/update PR and wait for fresh GitHub Actions**

Required CI gate:
- Frontend API mapping: success
- Accounting DB v2: success
- Operation user FK semester normalization: success
- Business audit taxonomy/full regression: success

- [ ] **Step 6: Manual browser QA before merge**

Open each migrated modal and verify:
- Payers: create and edit open/close, fields retain two-column layout, save error keeps modal open.
- Payments: detail opens with dynamic content; confirmation modal accepts depositor/reason; actions stay visible.
- Refunds: detail opens; approval max amount/amount/reason render correctly; transfer date/evidence/reason render correctly.
- No modal is clipped by the main content area and no field rows overlap.

If any visual regression is found, keep the PR unmerged and fix it with a new RED regression/architecture contract where practical.

- [ ] **Step 7: Final commit only if verification-required files changed during review**

If review required a test/verifier correction, commit it with:

```bash
git add scripts src/500_student_fee
git commit -m "test(student-fee): harden modal composition contract"
```

Otherwise do not create an empty commit.
