# Student Fee Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the four-route Student Fee frontend inside the current Apps Script shell, establish Student Fee-derived shared UI primitives, and connect modal-centered payer/payment/refund workflows to the existing `080_student_fee` server APIs.

**Architecture:** Extend `100_common` with backward-compatible design tokens and semantic UI primitives, then compose four focused pages under `500_student_fee`. Frontend page JS owns only presentation and interaction state; server APIs remain authoritative for fee calculations, refund limits, state transitions, actor identity, and persistence. One read-only semester reference API and one payer-list lookup-key DTO field are added because the approved UI cannot function correctly without them.

**Tech Stack:** Google Apps Script V8, Apps Script HTML templates, plain HTML/CSS/JavaScript, `google.script.run`, Node.js `assert`/`vm`/static architecture tests.

## Global Constraints

- Base implementation branch at execution start: `refactor/student-fee-server`.
- Create an isolated execution branch/workspace before production changes; recommended branch name: `refactor/student-fee-frontend`.
- `src/000_server/020_schema/operation_db_schema.gs` MUST remain unchanged.
- No Google Form integration, export, archive, `apiV1_*`, `API_REGISTRY`, `callApi_`, client `hasFullAccess`, or new IAM permission IDs.
- No feature-only UI fields: `유형`, `적용종료학기`, `보관여부`.
- Existing Main, Accounting, Event, and Settings page markup is not visually migrated in this phase.
- Shared CSS changes must preserve existing class behavior used by current pages.
- Student Fee routes are real Apps Script routes, not client-side tabs.
- Payer/payment/refund operational actions are modal-centered.
- Mutation buttons must use busy/double-submit protection.
- Payment/refund calculations shown in the UI come from server APIs immediately before mutation; client values are never authoritative.
- Student Fee page JS may call only approved `api_*` functions listed in this plan.
- No empty placeholder files.

---

## Target Files

### Server contract additions

```text
src/000_server/080_student_fee/080_common/
├─ student_fee_reference_query_service.gs   (modify)
└─ student_fee_reference_api.gs             (create)

src/000_server/080_student_fee/081_payers/
└─ fee_payers_query_service.gs              (modify)
```

### Shared shell/design system

```text
src/000_server/Code.js                      (modify)
src/100_common/App_Styles.html              (modify)
src/100_common/App_Sidebar.html             (modify)
src/100_common/app_shell_js.html            (modify)
```

### Student Fee frontend

```text
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
```

### Tests/verifiers

```text
scripts/test-student-fee.js                 (modify)
scripts/test-student-fee-frontend.js        (create)
scripts/verify-student-fee-architecture.js  (modify)
scripts/verify-student-fee-frontend.js      (create)
scripts/verify-server-architecture.js       (modify)
```

---

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

No other Student Fee API is introduced in this phase.

---

### Task 1: Add RED frontend and contract tests

**Files:**
- Create: `scripts/test-student-fee-frontend.js`
- Create: `scripts/verify-student-fee-frontend.js`
- Modify: `scripts/test-student-fee.js`

**Interfaces:**
- Consumes: existing `080_student_fee` APIs and current shell files.
- Produces: regression commands that later tasks must turn GREEN.

- [ ] **Step 1: Add RED server-contract tests for semester references and payer lookup keys**

Extend `scripts/test-student-fee.js` with concrete tests:

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
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(context.getStudentFeeReferenceData_())),
    {
      semesters: [
        { id: '2026-1', year: 2026, type: '1학기', startDate: '2026-03-01', endDate: '2026-06-30', active: true, label: '2026학년도 1학기' },
        { id: '2025-2', year: 2025, type: '2학기', startDate: '2025-09-01', endDate: '2025-12-31', active: false, label: '2025학년도 2학기' }
      ]
    }
  );
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

`studentIdKey` is an authenticated operator lookup key and must never be rendered in list cells or toast/error text.

- [ ] **Step 2: Run server behavior test and verify RED**

Run:

```bash
node scripts/test-student-fee.js
```

Expected: FAIL because `getStudentFeeReferenceData_` and `studentIdKey` do not exist yet.

- [ ] **Step 3: Create the frontend behavior harness**

Create `scripts/test-student-fee-frontend.js` using `assert`, `fs`, `path`, and `vm`. Strip outer `<script>` tags before evaluation.

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
  return read_(relativePath).replace(/^\s*<script[^>]*>/, '').replace(/<\/script>\s*$/, '');
}

function createFrontendContext_() {
  return vm.createContext({
    console: console,
    Promise: Promise,
    Object: Object,
    Array: Array,
    String: String,
    Number: Number,
    Boolean: Boolean,
    JSON: JSON,
    Math: Math,
    Date: Date,
    isFinite: isFinite,
    setTimeout: function (fn) { fn(); return 1; },
    clearTimeout: function () {},
    window: { confirm: function () { return true; } },
    document: { getElementById: function () { return null; } }
  });
}
```

Add named tests that become GREEN as tasks land:

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

- [ ] **Step 4: Create the frontend architecture verifier**

Create `scripts/verify-student-fee-frontend.js` with exact required files and static invariants.

Required route templates:

```js
var ROUTES = {
  student_fee: '500_student_fee/500_home/Student_Fee_Home',
  student_fee_payers: '500_student_fee/510_payers/Student_Fee_Payers',
  student_fee_payments: '500_student_fee/520_payments/Student_Fee_Payments',
  student_fee_refunds: '500_student_fee/530_refunds/Student_Fee_Refunds'
};
```

Required checks:

```text
- all 14 Student Fee frontend files exist and are non-empty
- Code.js maps all four routes
- Code.js login guard covers page.indexOf('student_fee') === 0
- each page shell includes 100_common/App_Styles, App_Header, App_Sidebar
- each page shell includes Student_Fee_Styles and student_fee_common_js
- submenu contains four real route links
- app_shell_js handles parent and child active state
- page scripts contain only approved Student Fee api_* names
- no apiV1_, hasFullAccess, FormApp, newTrigger
- no UI labels for 유형, 적용종료학기, 보관여부
- no copied `.topbar`, `.shell > .sidebar`, or standalone source-feature navigation block under 500_student_fee
- payment and refund views contain checkbox/bulk-action structure
- payer/payment/refund views contain modal roots or modal markup
- mutation page JS references busy-guard helper
```

- [ ] **Step 5: Run frontend tests/verifier and confirm RED**

Run:

```bash
node scripts/test-student-fee-frontend.js
node scripts/verify-student-fee-frontend.js
```

Expected: FAIL because `500_student_fee` and the four routes do not exist.

- [ ] **Step 6: Commit RED tests**

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
- Produces: `findAllStudentFeeSemesterRows_()`, `getStudentFeeReferenceData_()`, `api_getStudentFeeReferenceData(input)`, payer list field `studentIdKey`.

- [ ] **Step 1: Implement semester reference query**

Add:

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
    if (a.year !== b.year) return Number(b.year) - Number(a.year);
    return String(b.type || '').localeCompare(String(a.type || ''), 'ko');
  });
  return { semesters: semesters };
}
```

Do not filter inactive semesters server-side; the edit UI needs to represent an existing inactive reference. The create UI filters to active options client-side.

- [ ] **Step 2: Add reference API**

Create:

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

- [ ] **Step 3: Add payer lookup key without changing rendered masking**

Change payer list DTO to:

```js
return {
  studentId: maskStudentFeeStudentId_(row.studentId),
  studentIdKey: String(row.studentId || ''),
  name: row.name,
  affiliation: row.affiliation,
  startSemesterId: row.startSemesterId,
  managerId: row.managerId,
  updatedAt: row.updatedAt
};
```

Do not change payer detail/create/update semantics.

- [ ] **Step 4: Extend Student Fee server architecture verifier**

Require `080_common/student_fee_reference_api.gs`, require ownership of `api_getStudentFeeReferenceData`, `findAllStudentFeeSemesterRows_`, and `getStudentFeeReferenceData_`, and keep the reference query service read-only.

- [ ] **Step 5: Run server tests/verifier**

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

### Task 3: Establish shared design primitives, routes, and expandable navigation

**Files:**
- Modify: `src/000_server/Code.js`
- Modify: `src/100_common/App_Styles.html`
- Modify: `src/100_common/App_Sidebar.html`
- Modify: `src/100_common/app_shell_js.html`
- Modify: `scripts/test-student-fee-frontend.js`

**Interfaces:**
- Produces routes `student_fee`, `student_fee_payers`, `student_fee_payments`, `student_fee_refunds`.
- Produces reusable CSS classes prefixed with `ui-` for new primitives while retaining existing legacy classes.
- Produces shell elements `appNavStudentFee`, `appStudentFeeSubmenu`, and child route IDs.

- [ ] **Step 1: Add failing route/navigation tests**

Assert `Code.js` contains exact mappings and login protection:

```js
assert.match(code, /student_fee\s*:\s*['"]500_student_fee\/500_home\/Student_Fee_Home['"]/);
assert.match(code, /page\.indexOf\(['"]student_fee['"]\)\s*===\s*0/);
```

Assert sidebar/app-shell source contains:

```text
appNavStudentFee
appStudentFeeSubmenu
appNavStudentFeeHome
appNavStudentFeePayers
appNavStudentFeePayments
appNavStudentFeeRefunds
```

- [ ] **Step 2: Add four route mappings and login protection**

Extend `routes` in `Code.js` with the four exact templates. Extend the authenticated-page conditional with:

```js
page.indexOf('student_fee') === 0
```

No detail routes are added.

- [ ] **Step 3: Convert Student Fee sidebar entry into an expandable group**

Use real anchors for children:

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

- [ ] **Step 4: Extend shell navigation JS**

Assign URLs via `buildAppPageUrl` and implement:

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

`setAppActiveNavigation` must activate the parent on every Student Fee route, activate exactly one child, and expand Student Fee by default on Student Fee routes. Clicking the parent toggles expansion without navigation.

- [ ] **Step 5: Add backward-compatible shared tokens/primitives**

Do not rename/remove existing variables or classes. Add/normalize variables such as:

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

Add semantic `ui-*` primitives for `ui-page-head`, `ui-card`, `ui-stat-grid`, `ui-stat-card`, `ui-btn`, `ui-field`, `ui-toolbar`, `ui-table-wrap`, `ui-table`, `ui-badge`, `ui-bulk-bar`, `ui-pagination`, `ui-modal-overlay`, `ui-modal`, `ui-empty`, `ui-loading`, and `ui-toast`.

Keep current `.btn`, `.table-wrap`, `.nav-item`, Event classes, Settings classes, and existing tokens functional.

- [ ] **Step 6: Run focused frontend tests**

```bash
node scripts/test-student-fee-frontend.js
```

Expected: route/navigation/common-style assertions pass; page-file assertions may remain RED until later tasks.

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
- Produces `studentFeeApi`, `studentFeeSetBusy`, `studentFeeRunBusy`, `studentFeeShowToast`, `studentFeeHandleError`, `studentFeeOpenModal`, `studentFeeCloseModal`, `studentFeeEscapeHtml`, `studentFeeMoney`, `studentFeeDate`, `studentFeeBadge`, `studentFeePaginationHtml`, `studentFeeConfirm`.

- [ ] **Step 1: Add RED common-helper tests**

Use a fake `google.script.run` chain and assert the wrapper sends the current server envelope:

```js
context.google = { script: { run: runner } };
return context.studentFeeApi('api_getStudentFeeSummary', {}).then(function () {
  assert.deepStrictEqual(lastCall, {
    name: 'api_getStudentFeeSummary',
    input: { request: {} }
  });
});
```

Add a double-submit test:

```js
var button = { disabled: false, dataset: {} };
var first = context.studentFeeSetBusy(button, true);
var second = context.studentFeeSetBusy(button, true);
assert.strictEqual(first, true);
assert.strictEqual(second, false);
context.studentFeeSetBusy(button, false);
assert.strictEqual(button.disabled, false);
```

- [ ] **Step 2: Implement common API/error/busy helpers**

`studentFeeApi(functionName, request)` must call:

```js
runner[functionName]({ request: request || {} });
```

`studentFeeSetBusy(element, true)` returns `false` when `element.dataset.busy === 'true'`; otherwise sets `dataset.busy='true'` and `disabled=true`. Passing `false` clears the marker and re-enables the element.

`studentFeeRunBusy(button, task)` wraps a Promise and always releases busy state in both success and failure paths.

- [ ] **Step 3: Implement presentation helpers**

Map statuses:

```text
승인, 완료 -> success
접수, 대기 -> warning
반려, 불일치, 실패 -> danger
other -> neutral
```

`studentFeeBadge(value)` emits only escaped label text and `ui-badge ui-badge-*` classes.

- [ ] **Step 4: Add Student Fee-only composition CSS**

Keep only domain composition in `Student_Fee_Styles.html`, using `.sf-*` names for page grids, metric grouping, evidence layouts, modal field grids, and table column widths. Do not redefine base button/table/modal visual rules already in `ui-*`.

- [ ] **Step 5: Create the summary page shell**

`Student_Fee_Home.html` follows the current Event shell pattern:

```html
<?!= include('100_common/App_Styles'); ?>
<?!= include('500_student_fee/common/Student_Fee_Styles'); ?>
...
<?!= include('100_common/App_Header'); ?>
<?!= include('100_common/App_Sidebar'); ?>
...
<?!= include('100_common/app_shell_js'); ?>
<?!= include('500_student_fee/common/student_fee_common_js'); ?>
<?!= include('500_student_fee/500_home/student_fee_home_js'); ?>
```

Inject `WEB_APP_URL`, `APP_USER_NAME`, `APP_USER_TITLE`, `APP_IS_ADMIN`, and `APP_CURRENT_PAGE` exactly like other application pages.

- [ ] **Step 6: Implement summary view and loader**

`Student_Fee_Home_View.html` contains grouped stat-card containers for payers, applications, payments, refund requests, and refunds plus a loading/error region.

`student_fee_home_js.html` calls only `api_getStudentFeeSummary`, renders all approved counts/amounts, and makes relevant cards navigate with `buildAppPageUrl('student_fee_*')`.

- [ ] **Step 7: Run behavior test**

```bash
node scripts/test-student-fee-frontend.js
```

Expected: common helper and summary tests pass.

- [ ] **Step 8: Commit**

```bash
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
- Consumes: `api_getStudentFeeReferenceData`, payer APIs, `studentIdKey` list DTO field.
- Produces: list/search/filter/pagination and modal create/update flow.

- [ ] **Step 1: Add payer interaction RED tests**

Assert list rendering displays `studentId` but stores lookup key only in a data attribute or JS state:

```js
assert.match(source, /studentIdKey/);
assert.match(source, /api_getFeePayerDetail/);
assert.doesNotMatch(source, /textContent\s*=\s*[^;]*studentIdKey/);
```

Assert create/update page uses `api_getStudentFeeReferenceData`, `api_createFeePayer`, `api_updateFeePayer`, and busy guard.

- [ ] **Step 2: Build payer page shell/view**

View contains:

```text
page header + 신규 등록
keyword search
소속 filter
count
payer table
pagination
modal root
toast/loading supplied by common page markup
```

Table columns: masked 학번, 성명, 소속, 적용 시작 학기, 수정일시, 관리.

- [ ] **Step 3: Load references and list data**

On page start, call `api_getStudentFeeReferenceData` and `api_getFeePayerList`.

Create modal semester options: active semesters only.

Edit modal semester options: active semesters plus the payer's currently referenced semester even if inactive.

- [ ] **Step 4: Implement create modal**

Submit payload:

```js
{
  studentId: form.elements.studentId.value.trim(),
  name: form.elements.name.value.trim(),
  affiliation: form.elements.affiliation.value.trim(),
  startSemesterId: form.elements.startSemesterId.value
}
```

Validate all four fields locally, then call `api_createFeePayer`. On success: close modal, toast, reload current list page.

- [ ] **Step 5: Implement edit modal using `studentIdKey`**

Clicking Edit reads the non-rendered key and calls:

```js
studentFeeApi('api_getFeePayerDetail', { studentId: studentIdKey })
```

Update payload:

```js
{
  studentId: studentIdKey,
  name: form.elements.name.value.trim(),
  affiliation: form.elements.affiliation.value.trim(),
  startSemesterId: form.elements.startSemesterId.value
}
```

Student ID is shown read-only in the modal and is never editable.

- [ ] **Step 6: Run focused tests and commit**

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
- Consumes payment APIs exactly as listed in Approved Frontend API Surface.
- Produces list/detail/bulk process/receipt confirmation interactions.

- [ ] **Step 1: Add payment RED tests**

Static/VM tests must prove approval order. The approval function must call `api_calculateFeeAmount` before `api_processFeeApplications`.

```js
var calculateIndex = source.indexOf("'api_calculateFeeAmount'");
var processIndex = source.indexOf("'api_processFeeApplications'");
assert.ok(calculateIndex >= 0 && processIndex > calculateIndex);
```

Also assert `api_confirmFeePayment`, checkbox selection state, bulk bar, and busy guard are present.

- [ ] **Step 2: Build payment list view**

View contains keyword search, application status filter (`접수/승인/반려`), checkbox column, table, hidden bulk bar, pagination, detail modal root, and confirmation modal root.

Table renders application fields and joined `payment.moneyStatus` when present.

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

Selected IDs live only in page state. Reload clears selection and hides the bulk bar.

- [ ] **Step 4: Implement approval calculation gate**

For single approval, call:

```js
studentFeeApi('api_calculateFeeAmount', { paymentDate: application.paymentDate })
```

Display returned `amount` in the confirmation modal, then after operator confirmation call:

```js
studentFeeApi('api_processFeeApplications', {
  ids: [application.id],
  action: 'APPROVE',
  reason: reason
})
```

For bulk approval, load each selected application detail, calculate each amount before submitting the batch, show a summary, then call one `api_processFeeApplications` with the selected IDs. If any calculation fails, do not mutate any selected application.

Bulk reject may call `api_processFeeApplications` directly after confirmation with `action: 'REJECT'`.

- [ ] **Step 5: Implement application detail modal**

Call `api_getFeeApplicationDetail({ applicationId: id })`. Show application fields, evidence file IDs, calculated amount when applicable, and existing payment state.

For `접수`, show approve/reject actions. For associated payment `moneyStatus === '대기'`, show `입금 확인` action.

- [ ] **Step 6: Implement payment confirmation modal**

Payload:

```js
{
  paymentId: payment.id,
  result: result,
  depositorName: form.elements.depositorName.value.trim(),
  reason: form.elements.reason.value.trim()
}
```

Allowed result values are exactly `DONE` and `MISMATCH`. Mutation is busy-guarded. On success, close confirmation modal and reload detail/list.

- [ ] **Step 7: Run focused tests and commit**

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
- Consumes refund APIs exactly as listed in Approved Frontend API Surface.
- Produces list/detail/bulk approve/reject/transfer-confirmation interactions.

- [ ] **Step 1: Add refund RED tests**

Assert source order `api_calculateFeeRefund` before `api_processFeeRefundRequests` for explicit single approval.

Assert bulk approval does not send a shared `approvedAmount`:

```js
assert.match(source, /action:\s*['"]APPROVE['"]/);
assert.match(source, /ids:\s*selectedIds/);
assert.doesNotMatch(source, /ids:\s*selectedIds[\s\S]{0,160}approvedAmount:/);
```

Assert no `hasFullAccess` and confirmation uses `api_confirmFeeRefund`.

- [ ] **Step 2: Build refund list view**

View contains keyword search, request status filter, checkbox column, hidden bulk bar, table, pagination, detail modal root, approval modal root, and transfer-confirmation modal root.

List renders server-masked student ID/account number only.

- [ ] **Step 3: Implement list/detail loading**

Call `api_getFeeRefundRequestList` with `{ keyword, status, page, pageSize: 20 }`.

Detail calls `api_getFeeRefundRequestDetail({ refundRequestId: id })`, then calls `api_calculateFeeRefund({ paymentId: detail.request.paymentId })` to show payment amount and current refundable maximum.

- [ ] **Step 4: Implement single approval modal**

After fresh calculation, default approved amount input to `refundableAmount`, set `min="1"` and `max` to the fresh maximum, validate numeric bounds, then submit:

```js
{
  ids: [requestId],
  action: 'APPROVE',
  approvedAmount: approvedAmount,
  reason: reason
}
```

- [ ] **Step 5: Implement bulk approval/rejection**

For bulk approve, calculate every selected request first for operator summary, but submit no shared explicit amount:

```js
{
  ids: selectedIds,
  action: 'APPROVE',
  reason: reason
}
```

This intentionally lets the server apply each request's current maximum independently.

Bulk reject submits `{ ids: selectedIds, action: 'REJECT', reason }`.

- [ ] **Step 6: Implement transfer confirmation modal**

Payload:

```js
{
  refundId: refund.id,
  result: result,
  transferDate: form.elements.transferDate.value,
  transferEvidenceId: form.elements.transferEvidenceId.value.trim(),
  reason: form.elements.reason.value.trim()
}
```

Allowed result values are exactly `DONE` and `FAILED`. On failure keep the modal open; on success close and refresh.

- [ ] **Step 7: Run focused tests and commit**

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
- Modify: `scripts/test-student-fee-frontend.js` only if a missing approved behavior assertion is discovered.

**Interfaces:**
- Produces: complete structure enforcement and current server route registration.

- [ ] **Step 1: Finalize required-file and forbidden-pattern rules**

Require all Student Fee frontend files listed in Target Files. The verifier must report all failures before setting exit code 1.

Approved page-specific API allowlists:

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

Common JS must not hard-code domain API names except through its generic `studentFeeApi(functionName, request)` argument.

- [ ] **Step 2: Update server architecture verifier routes/functions**

Add four route/template mappings to `REQUIRED_ROUTES` and `api_getStudentFeeReferenceData` to `REQUIRED_PUBLIC_FUNCTIONS`.

Do not add frontend detail routes.

- [ ] **Step 3: Run Student Fee frontend/server verification**

```bash
node scripts/test-student-fee.js
node scripts/verify-student-fee-architecture.js
node scripts/test-student-fee-frontend.js
node scripts/verify-student-fee-frontend.js
node scripts/verify-server-architecture.js
```

Expected:

```text
Student Fee behavior regression tests passed.
Student Fee architecture verification passed.
Student Fee frontend regression tests passed.
Student Fee frontend architecture verification passed.
Server architecture verification passed.
```

- [ ] **Step 4: Commit**

```bash
git add scripts src/000_server/Code.js
git commit -m "test: verify student fee frontend integration"
```

Do not make this commit if no files changed after prior task commits.

---

### Task 9: Full cross-domain regression and scope verification

**Files:**
- Modify only if verification identifies a real defect.

**Interfaces:**
- Produces: evidence that the frontend integration did not alter schema or unrelated business behavior.

- [ ] **Step 1: Syntax-check server and embedded frontend scripts**

For every changed `.gs` file use `vm.Script` or temporary `.js` copy. For each Student Fee `*_js.html`, strip `<script>` wrappers and compile with `new vm.Script(...)`.

Expected: zero syntax errors.

- [ ] **Step 2: Run all behavior tests available in the repository**

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

- [ ] **Step 3: Run all architecture verifiers**

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

- [ ] **Step 4: Verify schema immutability**

Compare execution branch against its `refactor/student-fee-server` fork point:

```bash
git diff --exit-code <STUDENT_FEE_FRONTEND_BASE_SHA> -- src/000_server/020_schema
```

Expected: no diff. Resolve `<STUDENT_FEE_FRONTEND_BASE_SHA>` at execution start with `git merge-base HEAD refactor/student-fee-server` and substitute the resulting SHA in the actual command; do not hard-code an older server commit.

- [ ] **Step 5: Verify phase boundary**

Inspect changed filenames:

```bash
git diff --name-only <STUDENT_FEE_FRONTEND_BASE_SHA>...HEAD
```

Allowed production scope:

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

Plus the test/verifier and documentation files named in this plan. No Main/Accounting/Event/Settings page markup may be changed.

- [ ] **Step 6: Forbidden-artifact scan**

Run:

```bash
grep -R "apiV1_\|hasFullAccess\|API_REGISTRY\|callApi_\|FormApp\|newTrigger\|적용종료학기\|보관여부" src/500_student_fee src/000_server/080_student_fee
```

Expected: no matches introduced by this frontend phase. `유형` must also be absent from Student Fee frontend form labels/field names; verify with the frontend architecture verifier rather than broad server grep because unrelated historical server/schema text may contain that word.

- [ ] **Step 7: Inspect final diff quality**

```bash
git diff --check
git status --short
git diff --stat <STUDENT_FEE_FRONTEND_BASE_SHA>...HEAD
```

Expected: no whitespace errors; changed scope matches Step 5.

- [ ] **Step 8: Commit only real verification fixes**

```bash
git add <exact-fixed-files>
git commit -m "fix: correct student fee frontend regression"
```

Do not create an empty verification commit.

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

Data flow:

```text
Student Fee page
  -> studentFeeApi(apiName, request)
  -> google.script.run[apiName]({ request })
  -> existing thin Student Fee API
  -> Query Service / mutation Service
  -> Sheet DAO / Core primitives
```

The frontend never directly reads Sheets or Drive and never determines authoritative monetary/state values.

## Plan Self-Review

- **Spec coverage:** shared visual system, four routes, expandable submenu, summary, payer modals, payment/refund bulk + modal workflows, loading/toast/error behavior, reference semester selector, tests, and phase-3 boundary all have explicit tasks.
- **Contract correction:** current payer list masks the natural primary key, so the plan adds `studentIdKey` solely as a non-rendered authenticated lookup key. This is required for detail/update without a schema change.
- **Reference correction:** payer `startSemesterId` is a foreign key; the plan exposes current `semesters` through one read-only authenticated API rather than hard-coding semester choices.
- **Type consistency:** frontend calls use the existing `{ request: ... }` envelope expected by `parseStudentFeeRequest_`; payment/refund action/result strings match current server contracts.
- **Scope:** no FormSync, export, archive, schema changes, IAM redesign, or existing-page visual migration.
- **Placeholder scan:** implementation steps contain concrete function/file/contracts; the only command-time variable is `<STUDENT_FEE_FRONTEND_BASE_SHA>`, with an exact command for resolving it before use.
