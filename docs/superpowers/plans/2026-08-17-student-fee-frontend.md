# Student Fee Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the four-route Student Fee frontend inside the current Apps Script shell, establish Student Fee-derived shared UI primitives, and connect modal-centered payer/payment/refund workflows to the existing `080_student_fee` server APIs.

**Architecture:** Extend `100_common` with backward-compatible design tokens and semantic UI primitives, then compose four focused pages under `500_student_fee`. Page JavaScript owns presentation and interaction state only. The server remains authoritative for fee calculations, refund limits, state transitions, actor identity, and persistence. One read-only semester reference API and one payer-list lookup-key field are added because the approved UI cannot function correctly without them.

**Tech Stack:** Google Apps Script V8, Apps Script HTML templates, plain HTML/CSS/JavaScript, `google.script.run`, Node.js `assert`/`vm`/static verification scripts.

## Global Constraints

- Execution starts from `refactor/student-fee-server` in an isolated workspace/branch.
- Recommended execution branch: `refactor/student-fee-frontend`.
- `src/000_server/020_schema/operation_db_schema.gs` MUST remain unchanged.
- No Google Form integration, export, archive, `apiV1_*`, `API_REGISTRY`, `callApi_`, client `hasFullAccess`, or new IAM permission IDs.
- No Student Fee UI fields named `유형`, `적용종료학기`, or `보관여부`.
- Existing Main, Accounting, Event, and Settings page markup is not visually migrated in this phase.
- Shared CSS changes must preserve existing class behavior used by current pages.
- Student Fee routes are real Apps Script routes, not client-side tabs.
- Payer/payment/refund operational actions are modal-centered.
- Mutation buttons use busy/double-submit protection.
- Payment/refund calculations displayed before mutation come from fresh server API calls.
- Frontend code never directly reads Sheets or Drive.
- No empty placeholder files.

---

## Target Files

```text
src/000_server/080_student_fee/080_common/
├─ student_fee_reference_query_service.gs   (modify)
└─ student_fee_reference_api.gs             (create)

src/000_server/080_student_fee/081_payers/
└─ fee_payers_query_service.gs              (modify)

src/000_server/Code.js                      (modify)
src/100_common/App_Styles.html              (modify)
src/100_common/App_Sidebar.html             (modify)
src/100_common/app_shell_js.html            (modify)

src/500_student_fee/
├─ common/
│  ├─ Student_Fee_Styles.html
│  └─ student_fee_common_js.html
├─ 500_home/
│  ├─ Student_Fee_Home.html
│  ├─ Student_Fee_Home_View.html
│  └─ student_fee_home_js.html
├─ 510_payers/
│  ├─ Student_Fee_Payers.html
│  ├─ Student_Fee_Payers_View.html
│  └─ student_fee_payers_js.html
├─ 520_payments/
│  ├─ Student_Fee_Payments.html
│  ├─ Student_Fee_Payments_View.html
│  └─ student_fee_payments_js.html
└─ 530_refunds/
   ├─ Student_Fee_Refunds.html
   ├─ Student_Fee_Refunds_View.html
   └─ student_fee_refunds_js.html

scripts/test-student-fee.js                 (modify)
scripts/test-student-fee-frontend.js        (create)
scripts/verify-student-fee-architecture.js  (modify)
scripts/verify-student-fee-frontend.js      (create)
scripts/verify-server-architecture.js       (modify)
```

## Approved Frontend API Surface

```text
api_getStudentFeeReferenceData
api_getStudentFeeSummary
api_getFeePayerList
api_getFeePayerDetail
api_createFeePayer
api_updateFeePayer
api_getFeeApplicationList
api_getFeeApplicationDetail
api_processFeeApplications
api_calculateFeeAmount
api_confirmFeePayment
api_getFeeRefundRequestList
api_getFeeRefundRequestDetail
api_processFeeRefundRequests
api_calculateFeeRefund
api_confirmFeeRefund
```

---

### Task 1: Add RED frontend and server-contract tests

**Files:**
- Create: `scripts/test-student-fee-frontend.js`
- Create: `scripts/verify-student-fee-frontend.js`
- Modify: `scripts/test-student-fee.js`

**Interfaces:**
- Produces failing tests for the reference API, payer lookup key, four routes, common helpers, modal workflows, and architecture boundaries.

- [ ] **Step 1: Add RED server-contract tests**

Extend `scripts/test-student-fee.js` with:

```js
function testStudentFeeReferenceData_() {
  var context = createContext_();
  context.readOperationTableClientRows_ = function (table) {
    assert.strictEqual(table, 'semesters');
    return [
      { id: '2026-1', year: 2026, type: '1학기', startDate: '2026-03-01', endDate: '2026-06-30', active: true },
      { id: '2025-2', year: 2025, type: '2학기', startDate: '2025-09-01', endDate: '2025-12-31', active: false }
    ];
  };
  context.isTruthyValue_ = function (value) { return value === true; };
  load_(context, 'src/000_server/080_student_fee/080_common/student_fee_reference_query_service.gs');
  var data = context.getStudentFeeReferenceData_();
  assert.strictEqual(data.semesters[0].id, '2026-1');
  assert.strictEqual(data.semesters[0].label, '2026학년도 1학기');
  assert.strictEqual(data.semesters[1].active, false);
}

function testPayerListKeepsMaskedDisplayAndLookupKey_() {
  var context = createContext_();
  context.findAllFeePayerRows_ = function () {
    return [{ studentId: '60201234', name: '홍길동', affiliation: '경영정보학과', startSemesterId: '2026-1', managerId: 'admin@example.com', updatedAt: '2026-08-17T10:00:00+09:00' }];
  };
  load_(context, 'src/000_server/080_student_fee/081_payers/fee_payers_query_service.gs');
  var row = context.getFeePayerListData_({ page: 1, pageSize: 20 }).items[0];
  assert.strictEqual(row.studentId, '60****34');
  assert.strictEqual(row.studentIdKey, '60201234');
}
```

`studentIdKey` is used only for authenticated detail/update requests and must never be rendered in list text.

- [ ] **Step 2: Verify RED**

Run:

```bash
node scripts/test-student-fee.js
```

Expected: FAIL because the new reference query and `studentIdKey` are absent.

- [ ] **Step 3: Create frontend VM harness**

Create `scripts/test-student-fee-frontend.js`:

```js
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var ROOT = path.resolve(__dirname, '..');

function read_(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function scriptBody_(relativePath) {
  return read_(relativePath)
    .replace(/^\s*<script[^>]*>/, '')
    .replace(/<\/script>\s*$/, '');
}
```

Define named tests:

```text
testStudentFeeApiWrapper_
testBusyGuardPreventsDoubleSubmit_
testStudentFeeRouteHelpers_
testPayerEditUsesLookupKey_
testPaymentApprovalCalculatesBeforeMutation_
testRefundApprovalCalculatesBeforeMutation_
testBulkRefundApprovalOmitsSharedApprovedAmount_
testModalFailureKeepsDialogOpen_
```

- [ ] **Step 4: Create frontend architecture verifier**

`verify-student-fee-frontend.js` must require all 14 frontend files and enforce:

```text
- four route mappings
- student_fee prefix login protection
- App_Styles/App_Header/App_Sidebar includes on all page shells
- Student_Fee_Styles/student_fee_common_js includes on all page shells
- four Student Fee submenu links
- parent/child active-navigation logic
- approved api_* names only
- no apiV1_, hasFullAccess, FormApp, newTrigger
- no 유형/적용종료학기/보관여부 fields
- no copied standalone topbar/sidebar shell
- payment/refund checkbox + bulk action structure
- payer/payment/refund modal structure
- mutation page scripts use busy protection
```

- [ ] **Step 5: Verify frontend RED**

```bash
node scripts/test-student-fee-frontend.js
node scripts/verify-student-fee-frontend.js
```

Expected: FAIL because `500_student_fee` and route mappings do not exist.

- [ ] **Step 6: Commit tests**

```bash
git add scripts/test-student-fee.js scripts/test-student-fee-frontend.js scripts/verify-student-fee-frontend.js
git commit -m "test: define student fee frontend contracts"
```

---

### Task 2: Add minimal server contracts required by the frontend

**Files:**
- Modify: `src/000_server/080_student_fee/080_common/student_fee_reference_query_service.gs`
- Create: `src/000_server/080_student_fee/080_common/student_fee_reference_api.gs`
- Modify: `src/000_server/080_student_fee/081_payers/fee_payers_query_service.gs`
- Modify: `scripts/test-student-fee.js`
- Modify: `scripts/verify-student-fee-architecture.js`

**Interfaces:**
- Produces: `findAllStudentFeeSemesterRows_()`, `getStudentFeeReferenceData_()`, `api_getStudentFeeReferenceData(input)`, and payer list field `studentIdKey`.

- [ ] **Step 1: Implement semester reference query**

```js
function findAllStudentFeeSemesterRows_() {
  return readOperationTableClientRows_('semesters');
}

function getStudentFeeReferenceData_() {
  var semesters = findAllStudentFeeSemesterRows_().map(function (row) {
    return {
      id: row.id,
      year: Number(row.year) || row.year,
      type: row.type,
      startDate: formatStudentFeeDateKey_(row.startDate),
      endDate: formatStudentFeeDateKey_(row.endDate),
      active: typeof isTruthyValue_ === 'function' ? isTruthyValue_(row.active) : !!row.active,
      label: String(row.year || '') + '학년도 ' + String(row.type || '')
    };
  });
  semesters.sort(function (a, b) {
    if (Number(a.year) !== Number(b.year)) return Number(b.year) - Number(a.year);
    return String(b.type || '').localeCompare(String(a.type || ''), 'ko');
  });
  return { semesters: semesters };
}
```

Do not filter inactive semesters on the server. Create UI filters to active; edit UI may retain an inactive current value.

- [ ] **Step 2: Add reference API**

```js
function api_getStudentFeeReferenceData(input) {
  return apiHandler_({
    operation: 'getStudentFeeReferenceData',
    input: input,
    requireLogin: true,
    parse: parseStudentFeeRequest_,
    service: function () { return getStudentFeeReferenceData_(); }
  });
}
```

- [ ] **Step 3: Add payer lookup key**

Change list DTO to include:

```js
studentId: maskStudentFeeStudentId_(row.studentId),
studentIdKey: String(row.studentId || '')
```

Do not alter payer detail/create/update semantics.

- [ ] **Step 4: Extend Student Fee server verifier**

Require `student_fee_reference_api.gs` and unique ownership of:

```text
api_getStudentFeeReferenceData
findAllStudentFeeSemesterRows_
getStudentFeeReferenceData_
```

Keep reference query code read-only.

- [ ] **Step 5: Run GREEN checks**

```bash
node scripts/test-student-fee.js
node scripts/verify-student-fee-architecture.js
```

Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/000_server/080_student_fee scripts/test-student-fee.js scripts/verify-student-fee-architecture.js
git commit -m "feat: expose student fee frontend reference data"
```

---

### Task 3: Add routes, shared design primitives, and expandable Student Fee navigation

**Files:**
- Modify: `src/000_server/Code.js`
- Modify: `src/100_common/App_Styles.html`
- Modify: `src/100_common/App_Sidebar.html`
- Modify: `src/100_common/app_shell_js.html`
- Modify: `scripts/test-student-fee-frontend.js`

**Interfaces:**
- Produces routes `student_fee`, `student_fee_payers`, `student_fee_payments`, `student_fee_refunds` and reusable `ui-*` classes.

- [ ] **Step 1: Add failing route/navigation assertions**

Verify exact route mappings and `page.indexOf('student_fee') === 0` login protection. Verify IDs:

```text
appNavStudentFee
appStudentFeeSubmenu
appNavStudentFeeHome
appNavStudentFeePayers
appNavStudentFeePayments
appNavStudentFeeRefunds
```

- [ ] **Step 2: Add four route mappings**

```text
student_fee          -> 500_student_fee/500_home/Student_Fee_Home
student_fee_payers   -> 500_student_fee/510_payers/Student_Fee_Payers
student_fee_payments -> 500_student_fee/520_payments/Student_Fee_Payments
student_fee_refunds  -> 500_student_fee/530_refunds/Student_Fee_Refunds
```

Extend the authenticated-page condition with `page.indexOf('student_fee') === 0`.

- [ ] **Step 3: Implement expandable sidebar group**

```html
<div class="nav-group" id="appNavStudentFeeGroup">
  <button class="nav-item nav-group-toggle" id="appNavStudentFee" type="button" aria-expanded="false" aria-controls="appStudentFeeSubmenu">
    <span class="label">학생회비관리</span><span class="nav-chevron">▼</span>
  </button>
  <div class="nav-submenu" id="appStudentFeeSubmenu" hidden>
    <a class="nav-subitem" id="appNavStudentFeeHome" target="_top">전체 현황</a>
    <a class="nav-subitem" id="appNavStudentFeePayers" target="_top">가입자 조회</a>
    <a class="nav-subitem" id="appNavStudentFeePayments" target="_top">납부 관리</a>
    <a class="nav-subitem" id="appNavStudentFeeRefunds" target="_top">환불 관리</a>
  </div>
</div>
```

- [ ] **Step 4: Extend app shell JS**

Assign URLs with `buildAppPageUrl`. Add:

```js
function isStudentFeePage_(page) {
  return String(page || '').indexOf('student_fee') === 0;
}

function setStudentFeeSubmenuExpanded_(expanded) {
  var toggle = getAppElement('appNavStudentFee');
  var submenu = getAppElement('appStudentFeeSubmenu');
  toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  submenu.hidden = !expanded;
}
```

Parent is active for all Student Fee pages. Exactly one child is active. Student Fee routes open the submenu by default. Parent click toggles expansion without navigation.

- [ ] **Step 5: Add backward-compatible shared visual primitives**

Do not rename/remove current variables/classes. Add tokens such as:

```css
--ui-bg: #f5f6f8;
--ui-surface: #ffffff;
--ui-border: #e5e7eb;
--ui-text: #1f2430;
--ui-muted: #6b7280;
--ui-primary: #2f3b52;
--ui-radius-sm: 6px;
--ui-radius-md: 8px;
--ui-radius-lg: 10px;
--ui-shadow: 0 2px 8px rgba(20, 24, 32, .06);
```

Add `ui-page-head`, `ui-card`, `ui-stat-grid`, `ui-stat-card`, `ui-btn`, `ui-field`, `ui-toolbar`, `ui-table-wrap`, `ui-table`, `ui-badge`, `ui-bulk-bar`, `ui-pagination`, `ui-modal-overlay`, `ui-modal`, `ui-empty`, `ui-loading`, and `ui-toast`.

- [ ] **Step 6: Run focused tests**

```bash
node scripts/test-student-fee-frontend.js
```

Expected: route/navigation/helper assertions pass; missing page-file assertions may still fail.

- [ ] **Step 7: Commit**

```bash
git add src/000_server/Code.js src/100_common scripts/test-student-fee-frontend.js
git commit -m "feat: add student fee routes and shared ui primitives"
```

---

### Task 4: Implement Student Fee common frontend layer and summary page

**Files:**
- Create: `src/500_student_fee/common/Student_Fee_Styles.html`
- Create: `src/500_student_fee/common/student_fee_common_js.html`
- Create: `src/500_student_fee/500_home/Student_Fee_Home.html`
- Create: `src/500_student_fee/500_home/Student_Fee_Home_View.html`
- Create: `src/500_student_fee/500_home/student_fee_home_js.html`
- Modify: `scripts/test-student-fee-frontend.js`

**Interfaces:**
- Produces: `studentFeeApi`, `studentFeeSetBusy`, `studentFeeRunBusy`, `studentFeeShowToast`, `studentFeeHandleError`, `studentFeeOpenModal`, `studentFeeCloseModal`, `studentFeeEscapeHtml`, `studentFeeMoney`, `studentFeeDate`, `studentFeeBadge`, `studentFeePaginationHtml`, `studentFeeConfirm`.

- [ ] **Step 1: Add RED common-helper tests**

Verify `studentFeeApi('api_getStudentFeeSummary', {})` calls `google.script.run.api_getStudentFeeSummary({ request: {} })` through success/failure handlers.

Verify double-submit behavior:

```js
var button = { disabled: false, dataset: {} };
assert.strictEqual(context.studentFeeSetBusy(button, true), true);
assert.strictEqual(context.studentFeeSetBusy(button, true), false);
context.studentFeeSetBusy(button, false);
assert.strictEqual(button.disabled, false);
```

- [ ] **Step 2: Implement generic API/error/busy helpers**

`studentFeeApi` must send the existing request envelope:

```js
runner[functionName]({ request: request || {} });
```

`studentFeeSetBusy(element, true)` returns `false` if already busy; otherwise marks `dataset.busy='true'` and disables the element. Passing `false` clears both.

`studentFeeRunBusy(button, task)` always releases the busy state on Promise resolution or rejection.

- [ ] **Step 3: Implement formatting/modal/toast helpers**

Status mapping:

```text
승인, 완료 -> success
접수, 대기 -> warning
반려, 불일치, 실패 -> danger
other -> neutral
```

All rendered dynamic text is HTML-escaped.

- [ ] **Step 4: Add Student Fee-specific composition CSS**

Use `.sf-*` only for Student Fee dashboard grids, table column widths, evidence layouts, and modal field grouping. Base visual styles remain in shared `ui-*` classes.

- [ ] **Step 5: Create summary page shell**

Each Student Fee shell follows current app structure and includes:

```html
<?!= include('100_common/App_Styles'); ?>
<?!= include('500_student_fee/common/Student_Fee_Styles'); ?>
<?!= include('100_common/App_Header'); ?>
<?!= include('100_common/App_Sidebar'); ?>
<?!= include('100_common/app_shell_js'); ?>
<?!= include('500_student_fee/common/student_fee_common_js'); ?>
```

Inject `WEB_APP_URL`, `APP_USER_NAME`, `APP_USER_TITLE`, `APP_IS_ADMIN`, and `APP_CURRENT_PAGE` like current Event pages.

- [ ] **Step 6: Implement summary rendering**

Call only `api_getStudentFeeSummary`. Render payer/application/payment/refund-request/refund cards including completed amounts. Relevant cards navigate to child Student Fee routes via `buildAppPageUrl`.

- [ ] **Step 7: Test and commit**

```bash
node scripts/test-student-fee-frontend.js
git add src/500_student_fee/common src/500_student_fee/500_home scripts/test-student-fee-frontend.js
git commit -m "feat: add student fee summary frontend"
```

---

### Task 5: Implement payer list and create/update modals

**Files:**
- Create: `src/500_student_fee/510_payers/Student_Fee_Payers.html`
- Create: `src/500_student_fee/510_payers/Student_Fee_Payers_View.html`
- Create: `src/500_student_fee/510_payers/student_fee_payers_js.html`
- Modify: `scripts/test-student-fee-frontend.js`

**Interfaces:**
- Consumes: reference API, payer APIs, `studentIdKey`.

- [ ] **Step 1: Add RED payer tests**

Assert page source references `studentIdKey` for detail/update but never renders it as text. Assert `api_getStudentFeeReferenceData`, `api_getFeePayerList`, `api_getFeePayerDetail`, `api_createFeePayer`, `api_updateFeePayer`, and busy helper are present.

- [ ] **Step 2: Build payer view**

Include page header/new button, keyword search, affiliation filter, total count, table, pagination, and modal root.

Table columns:

```text
masked 학번 | 성명 | 소속 | 적용 시작 학기 | 수정일시 | 관리
```

- [ ] **Step 3: Load reference/list data**

At startup call reference data and payer list. Create modal shows active semesters. Edit modal shows active semesters plus the payer's currently referenced semester if inactive.

- [ ] **Step 4: Implement create modal**

Submit exactly:

```js
{
  studentId: form.elements.studentId.value.trim(),
  name: form.elements.name.value.trim(),
  affiliation: form.elements.affiliation.value.trim(),
  startSemesterId: form.elements.startSemesterId.value
}
```

On success close modal, show toast, reload list.

- [ ] **Step 5: Implement edit modal**

Use:

```js
studentFeeApi('api_getFeePayerDetail', { studentId: studentIdKey })
```

Update exactly:

```js
{
  studentId: studentIdKey,
  name: form.elements.name.value.trim(),
  affiliation: form.elements.affiliation.value.trim(),
  startSemesterId: form.elements.startSemesterId.value
}
```

Student ID is read-only in the modal.

- [ ] **Step 6: Test and commit**

```bash
node scripts/test-student-fee-frontend.js
git add src/500_student_fee/510_payers scripts/test-student-fee-frontend.js
git commit -m "feat: add student fee payer frontend"
```

---

### Task 6: Implement payment management and modal workflows

**Files:**
- Create: `src/500_student_fee/520_payments/Student_Fee_Payments.html`
- Create: `src/500_student_fee/520_payments/Student_Fee_Payments_View.html`
- Create: `src/500_student_fee/520_payments/student_fee_payments_js.html`
- Modify: `scripts/test-student-fee-frontend.js`

**Interfaces:**
- Consumes payment list/detail/process/calculate/confirm APIs.

- [ ] **Step 1: Add RED payment tests**

Verify approval logic contains `api_calculateFeeAmount` before `api_processFeeApplications`. Verify `api_confirmFeePayment`, checkbox selection, bulk bar, detail modal, confirmation modal, and busy protection.

- [ ] **Step 2: Build payment list view**

Include keyword search, application status filter (`접수/승인/반려`), checkbox column, hidden bulk bar, table, pagination, detail modal root, confirmation modal root.

- [ ] **Step 3: Implement list/filter/pagination/selection**

List request:

```js
{
  keyword: state.keyword,
  status: state.status,
  page: state.page,
  pageSize: 20
}
```

Reload clears selected IDs and hides bulk bar.

- [ ] **Step 4: Implement calculation-before-approval gate**

Single approval calls:

```js
studentFeeApi('api_calculateFeeAmount', { paymentDate: application.paymentDate })
```

Display returned amount, then after operator confirmation call:

```js
studentFeeApi('api_processFeeApplications', {
  ids: [application.id],
  action: 'APPROVE',
  reason: reason
})
```

Bulk approval loads selected details and calculates every selected payment amount first. If any calculation fails, no mutation call occurs. When all calculations succeed, submit one batch `APPROVE` request. Bulk reject submits one `REJECT` request after confirmation.

- [ ] **Step 5: Implement detail modal**

Call `api_getFeeApplicationDetail({ applicationId: id })`. Show application/evidence/payment fields. `접수` exposes approve/reject. Associated payment `대기` exposes receipt confirmation.

- [ ] **Step 6: Implement receipt confirmation modal**

Submit:

```js
{
  paymentId: payment.id,
  result: result,
  depositorName: form.elements.depositorName.value.trim(),
  reason: form.elements.reason.value.trim()
}
```

Allowed results: `DONE`, `MISMATCH` only. Success closes modal and reloads detail/list; failure leaves modal open and releases busy state.

- [ ] **Step 7: Test and commit**

```bash
node scripts/test-student-fee-frontend.js
git add src/500_student_fee/520_payments scripts/test-student-fee-frontend.js
git commit -m "feat: add student fee payment frontend"
```

---

### Task 7: Implement refund management and modal workflows

**Files:**
- Create: `src/500_student_fee/530_refunds/Student_Fee_Refunds.html`
- Create: `src/500_student_fee/530_refunds/Student_Fee_Refunds_View.html`
- Create: `src/500_student_fee/530_refunds/student_fee_refunds_js.html`
- Modify: `scripts/test-student-fee-frontend.js`

**Interfaces:**
- Consumes refund list/detail/process/calculate/confirm APIs.

- [ ] **Step 1: Add RED refund tests**

Verify `api_calculateFeeRefund` occurs before explicit single approval. Verify bulk approval sends selected IDs without a shared `approvedAmount`. Verify no `hasFullAccess`. Verify `api_confirmFeeRefund` and busy protection.

- [ ] **Step 2: Build refund list view**

Include keyword search, request status filter, checkbox column, hidden bulk bar, table, pagination, detail modal, approval modal, transfer confirmation modal.

List uses only server-masked student/account display values.

- [ ] **Step 3: Implement list/detail loading**

List request:

```js
{ keyword: state.keyword, status: state.status, page: state.page, pageSize: 20 }
```

Detail calls `api_getFeeRefundRequestDetail({ refundRequestId: id })`, then `api_calculateFeeRefund({ paymentId: detail.request.paymentId })`.

- [ ] **Step 4: Implement single approval**

Fresh calculation sets approved amount default and max. Submit:

```js
{
  ids: [requestId],
  action: 'APPROVE',
  approvedAmount: approvedAmount,
  reason: reason
}
```

Reject values `<= 0` or above fresh maximum client-side; server remains authoritative.

- [ ] **Step 5: Implement bulk approval/rejection**

Bulk approval may pre-calculate each selected request for operator summary, but mutation payload is exactly:

```js
{ ids: selectedIds, action: 'APPROVE', reason: reason }
```

No shared `approvedAmount` is sent. Bulk reject uses `action: 'REJECT'`.

- [ ] **Step 6: Implement transfer confirmation**

Submit:

```js
{
  refundId: refund.id,
  result: result,
  transferDate: form.elements.transferDate.value,
  transferEvidenceId: form.elements.transferEvidenceId.value.trim(),
  reason: form.elements.reason.value.trim()
}
```

Allowed results: `DONE`, `FAILED` only. Failure keeps modal input intact.

- [ ] **Step 7: Test and commit**

```bash
node scripts/test-student-fee-frontend.js
git add src/500_student_fee/530_refunds scripts/test-student-fee-frontend.js
git commit -m "feat: add student fee refund frontend"
```

---

### Task 8: Make frontend/server architecture verification GREEN

**Files:**
- Modify: `scripts/verify-student-fee-frontend.js`
- Modify: `scripts/verify-server-architecture.js`
- Modify: `scripts/test-student-fee-frontend.js` only if an approved behavior is not already asserted.

**Interfaces:**
- Produces final route/API/file ownership verification.

- [ ] **Step 1: Finalize frontend API allowlists**

```js
var API_ALLOWLIST = {
  '500_home/student_fee_home_js.html': ['api_getStudentFeeSummary'],
  '510_payers/student_fee_payers_js.html': [
    'api_getStudentFeeReferenceData', 'api_getFeePayerList', 'api_getFeePayerDetail',
    'api_createFeePayer', 'api_updateFeePayer'
  ],
  '520_payments/student_fee_payments_js.html': [
    'api_getFeeApplicationList', 'api_getFeeApplicationDetail', 'api_processFeeApplications',
    'api_calculateFeeAmount', 'api_confirmFeePayment'
  ],
  '530_refunds/student_fee_refunds_js.html': [
    'api_getFeeRefundRequestList', 'api_getFeeRefundRequestDetail', 'api_processFeeRefundRequests',
    'api_calculateFeeRefund', 'api_confirmFeeRefund'
  ]
};
```

Common JS stays API-name agnostic and receives the API name as an argument.

- [ ] **Step 2: Update server architecture verifier**

Add the four Student Fee route/template mappings to `REQUIRED_ROUTES` and `api_getStudentFeeReferenceData` to `REQUIRED_PUBLIC_FUNCTIONS`.

- [ ] **Step 3: Run integrated Student Fee checks**

```bash
node scripts/test-student-fee.js
node scripts/verify-student-fee-architecture.js
node scripts/test-student-fee-frontend.js
node scripts/verify-student-fee-frontend.js
node scripts/verify-server-architecture.js
```

Expected: every command exits 0 and prints its success message.

- [ ] **Step 4: Commit only if verifier/test files changed in this task**

```bash
git status --short
```

If files changed:

```bash
git add scripts/verify-student-fee-frontend.js scripts/verify-server-architecture.js scripts/test-student-fee-frontend.js
git commit -m "test: verify student fee frontend integration"
```

If no files changed, do not create a commit.

---

### Task 9: Full cross-domain regression and scope verification

**Files:**
- Modify only when verification reveals a real defect.

**Interfaces:**
- Produces completion evidence and phase-boundary proof.

- [ ] **Step 1: Capture execution base SHA**

```bash
BASE_SHA=$(git merge-base HEAD refactor/student-fee-server)
printf '%s\n' "$BASE_SHA"
```

Keep this shell variable for Steps 4, 5, and 7.

- [ ] **Step 2: Syntax-check changed GAS and embedded scripts**

Compile every changed `.gs` with `vm.Script` or `node --check` on a temporary `.js` copy. Strip outer `<script>` wrappers from each `src/500_student_fee/**/*_js.html` and compile with `new vm.Script(...)`.

Expected: zero syntax errors.

- [ ] **Step 3: Run all behavior tests**

```bash
node scripts/test-core.js
node scripts/test-auth-iam.js
node scripts/test-event.js
node scripts/test-accounting.js
node scripts/test-settings.js
node scripts/test-student-fee.js
node scripts/test-student-fee-frontend.js
```

Expected: every command exits 0.

- [ ] **Step 4: Run all architecture verifiers**

```bash
node scripts/verify-auth-iam-architecture.js
node scripts/verify-event-architecture.js
node scripts/verify-accounting-architecture.js
node scripts/verify-settings-architecture.js
node scripts/verify-student-fee-architecture.js
node scripts/verify-student-fee-frontend.js
node scripts/verify-server-architecture.js
```

Expected: every command exits 0.

- [ ] **Step 5: Verify schema immutability and phase boundary**

```bash
git diff --exit-code "$BASE_SHA" -- src/000_server/020_schema
git diff --name-only "$BASE_SHA"...HEAD
```

Allowed production paths:

```text
src/000_server/Code.js
src/000_server/080_student_fee/080_common/student_fee_reference_query_service.gs
src/000_server/080_student_fee/080_common/student_fee_reference_api.gs
src/000_server/080_student_fee/081_payers/fee_payers_query_service.gs
src/100_common/App_Styles.html
src/100_common/App_Sidebar.html
src/100_common/app_shell_js.html
src/500_student_fee/**
```

Test/verifier/docs files named in this plan are also allowed. No Main/Accounting/Event/Settings page markup changes are allowed.

- [ ] **Step 6: Scan forbidden artifacts**

```bash
grep -R "apiV1_\|hasFullAccess\|API_REGISTRY\|callApi_\|FormApp\|newTrigger\|적용종료학기\|보관여부" src/500_student_fee src/000_server/080_student_fee
```

Expected: no matches introduced by this phase. The frontend architecture verifier separately rejects `유형` as a Student Fee field label/name.

- [ ] **Step 7: Inspect final diff quality**

```bash
git diff --check
git status --short
git diff --stat "$BASE_SHA"...HEAD
```

Expected: no whitespace errors and scope matches Step 5.

- [ ] **Step 8: Commit only verified correction files when verification forced a fix**

If Step 2-7 required a correction, rerun the failed command until green, then stage only the implementation areas allowed by Step 5 plus the exact affected test/verifier files:

```bash
git add src/000_server/Code.js src/000_server/080_student_fee src/100_common src/500_student_fee scripts
git diff --cached --name-only
git commit -m "fix: correct student fee frontend regression"
```

Before committing, confirm `git diff --cached --name-only` contains no unrelated page files. If verification required no correction, do not create a final commit.

---

## Final Ownership and Data Flow

```text
Code.js
  route selection + login protection only

100_common/App_Styles.html
  shared tokens + reusable ui-* visual primitives

100_common/App_Sidebar.html
  navigation markup only

100_common/app_shell_js.html
  app URLs + navigation expansion/active state

500_student_fee/common/Student_Fee_Styles.html
  Student Fee-specific layout/composition only

500_student_fee/common/student_fee_common_js.html
  generic Student Fee presentation helpers only

500_home/student_fee_home_js.html
  summary presentation

510_payers/student_fee_payers_js.html
  payer page state + create/update modal orchestration

520_payments/student_fee_payments_js.html
  payment page state + application/receipt modal orchestration

530_refunds/student_fee_refunds_js.html
  refund page state + approval/transfer modal orchestration

080_common/student_fee_reference_api.gs
  authenticated read-only semester reference endpoint
```

```text
Student Fee page
  -> studentFeeApi(apiName, request)
  -> google.script.run[apiName]({ request })
  -> thin Student Fee API
  -> Query Service / mutation Service
  -> Sheet DAO / Core primitives
```

## Plan Self-Review

- **Spec coverage:** shared visual system, four routes, expandable submenu, summary, payer modals, payment/refund bulk and modal workflows, loading/toast/error handling, semester selector, tests, and phase-3 boundary are all covered.
- **Payer contract correction:** the current payer list masks the natural PK; `studentIdKey` provides a non-rendered authenticated lookup key without a schema change.
- **Reference contract correction:** `startSemesterId` is a foreign key; one authenticated read-only reference API exposes existing `semesters` instead of hard-coding options.
- **Type consistency:** frontend requests use the existing `{ request: ... }` envelope; payment/refund action/result strings match current server contracts.
- **Scope:** no FormSync, export, archive, schema changes, IAM redesign, or existing-page visual migration.
- **Placeholder scan:** no unresolved implementation placeholders remain; execution base SHA is resolved by an explicit shell command.
