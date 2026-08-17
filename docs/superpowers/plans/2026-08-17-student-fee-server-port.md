# Student Fee Server Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the approved Student Fee payer/payment/refund server behavior into `080_student_fee` using the current `020_schema`, Core Sheet primitives, Auth context, and existing project API conventions.

**Architecture:** Add a new `080_student_fee` domain with thin API files, mutation Services, read-only Query Services, and single-table Sheet DAOs. The port does not copy the feature branch's `Schema.gs`, `Db.gs`, `apiV1_*`, standalone web entrypoints, FormSync, frontend, export, archive, or extra fields. All public APIs require login and all mutation attribution comes from the Auth context.

**Tech Stack:** Google Apps Script V8, JavaScript ES5-style function declarations, Google Sheets operation DB, Node.js `assert`/`vm` test harness, repository architecture verifier scripts.

## Global Constraints

- `src/000_server/020_schema/operation_db_schema.gs` is the persistent-data source of truth and MUST NOT be modified in this phase.
- Do not create persistent fields that are absent from the current operation schema.
- Do not copy or recreate the source branch `Schema.gs`, `Db.gs`, `API_REGISTRY`, `callApi_`, `doPost`, `onOpen`, FormSync, frontend, export, or archive implementation.
- Public APIs use current project `api_*` naming and `apiHandler_`.
- Every Student Fee public API sets `requireLogin: true`.
- Student Fee code MUST NOT call `Session.getActiveUser()` directly.
- No new Student Fee IAM permission IDs are introduced in this phase.
- API files perform no direct Sheet reads/writes.
- Query Services are read-only.
- Each Sheet DAO accesses exactly one owned operation table.
- Mutation Services own state transitions, duplicate prevention, fee/refund validation, and audit orchestration.
- New generated IDs use `Utilities.getUuid()`.
- Fee applications use statuses `접수`, `승인`, `반려`.
- Fee payments use money statuses `대기`, `완료`, `불일치`.
- Fee refunds use money statuses `대기`, `완료`, `실패`.
- Fee-rate resolution uses one active effective `feeRates` row; zero or multiple matches fail closed.
- Refundable balance is `payment.amount - sum(related refund approvedAmount where moneyStatus is 대기 or 완료)`, floored at zero.
- This phase does not create `feeApplications` or `feeRefundRequests`; it processes request rows already present in the operation DB.
- No empty placeholder files.

---

## Target File Map

```text
src/000_server/080_student_fee/
├─ 080_common/
│  ├─ student_fee_request.gs
│  ├─ student_fee_reference_query_service.gs
│  └─ student_fee_audit_sheet_dao.gs
│
├─ 081_payers/
│  ├─ fee_payers_api.gs
│  ├─ fee_payers_service.gs
│  ├─ fee_payers_query_service.gs
│  └─ fee_payers_sheet_dao.gs
│
├─ 082_payments/
│  ├─ fee_payments_api.gs
│  ├─ fee_payments_service.gs
│  ├─ fee_payments_query_service.gs
│  ├─ fee_applications_sheet_dao.gs
│  └─ fee_payments_sheet_dao.gs
│
└─ 083_refunds/
   ├─ fee_refunds_api.gs
   ├─ fee_refunds_service.gs
   ├─ fee_refunds_query_service.gs
   ├─ fee_refund_requests_sheet_dao.gs
   └─ fee_refunds_sheet_dao.gs
```

Other files:

```text
scripts/test-student-fee.js
scripts/verify-student-fee-architecture.js
scripts/verify-server-architecture.js
```

Do not add a `084_forms` directory in this phase.

---

### Task 1: Add Student Fee architecture verifier and behavior test harness

**Files:**
- Create: `scripts/test-student-fee.js`
- Create: `scripts/verify-student-fee-architecture.js`

**Interfaces:**
- Consumes: current repository filesystem and Node.js `assert`, `fs`, `path`, `vm`.
- Produces: a behavior test entrypoint ending with `Student Fee behavior regression tests passed.` and an architecture verifier ending with `Student Fee architecture verification passed.`.

- [ ] **Step 1: Create the behavior test harness with failing ownership-independent tests**

Create `scripts/test-student-fee.js` with the same `vm` loading pattern used by `scripts/test-event.js`.

Use these helpers at the top:

```js
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');

function load_(context, relativePath) {
  var file = path.join(ROOT, relativePath);
  var source = fs.readFileSync(file, 'utf8');
  vm.runInContext(source, context, { filename: file });
}

function createContext_() {
  return vm.createContext({
    console: console,
    Object: Object,
    Array: Array,
    String: String,
    Number: Number,
    Boolean: Boolean,
    Math: Math,
    Date: Date,
    JSON: JSON,
    isFinite: isFinite,
    Utilities: {
      getUuid: function () { return 'uuid-test'; }
    }
  });
}
```

Add tests that will become GREEN as later tasks land:

```js
function testFeeRateResolution_() {
  var context = createContext_();
  context.findAllFeeRateRows_ = function () {
    return [
      { id: 'rate-old', startDate: '2026-01-01', endDate: '2026-06-30', amountPerSemester: 10000, active: true },
      { id: 'rate-now', startDate: '2026-07-01', endDate: '2026-12-31', amountPerSemester: 20000, active: true }
    ];
  };
  load_(context, 'src/000_server/080_student_fee/080_common/student_fee_reference_query_service.gs');
  assert.strictEqual(context.resolveStudentFeeRate_('2026-08-17').amountPerSemester, 20000);
  assert.throws(function () { context.resolveStudentFeeRate_('2027-01-01'); }, /회비금액기준/);
}

function testRefundableBalance_() {
  var context = createContext_();
  context.findFeePaymentRowById_ = function () { return { id: 'pay-1', amount: 20000 }; };
  context.findFeeRefundRowsByPaymentId_ = function () {
    return [
      { approvedAmount: 5000, moneyStatus: '대기' },
      { approvedAmount: 3000, moneyStatus: '완료' },
      { approvedAmount: 9999, moneyStatus: '실패' }
    ];
  };
  load_(context, 'src/000_server/080_student_fee/083_refunds/fee_refunds_query_service.gs');
  assert.strictEqual(context.calculateRefundableAmount_('pay-1'), 12000);
}
```

Also add later-exercised named tests for:

```text
testPayerCreateAndUpdate_
testPaymentApprovalAndDuplicatePrevention_
testPaymentReject_
testPaymentConfirmation_
testRefundApprovalAndDuplicatePrevention_
testRefundReject_
testRefundConfirmation_
testAuditAttribution_
testMaskedPayerList_
testMaskedRefundList_
testStudentFeeSummary_
testApiRequiresLogin_
```

The tests must use concrete fixture objects containing only current-schema field keys.

- [ ] **Step 2: Run the behavior test to verify RED**

Run:

```bash
node scripts/test-student-fee.js
```

Expected: FAIL because `080_student_fee` files/functions do not exist yet.

- [ ] **Step 3: Create the architecture verifier**

Create `scripts/verify-student-fee-architecture.js`.

Required files:

```js
var REQUIRED_FILES = [
  '080_common/student_fee_request.gs',
  '080_common/student_fee_reference_query_service.gs',
  '080_common/student_fee_audit_sheet_dao.gs',
  '081_payers/fee_payers_api.gs',
  '081_payers/fee_payers_service.gs',
  '081_payers/fee_payers_query_service.gs',
  '081_payers/fee_payers_sheet_dao.gs',
  '082_payments/fee_payments_api.gs',
  '082_payments/fee_payments_service.gs',
  '082_payments/fee_payments_query_service.gs',
  '082_payments/fee_applications_sheet_dao.gs',
  '082_payments/fee_payments_sheet_dao.gs',
  '083_refunds/fee_refunds_api.gs',
  '083_refunds/fee_refunds_service.gs',
  '083_refunds/fee_refunds_query_service.gs',
  '083_refunds/fee_refund_requests_sheet_dao.gs',
  '083_refunds/fee_refunds_sheet_dao.gs'
];
```

The verifier must check:

```text
- all required files exist
- required files are non-empty
- no duplicate function declarations inside 080_student_fee
- API functions exist in their expected API files
- Sheet DAO functions exist in their expected DAO files
- API files contain apiHandler_ and requireLogin: true
- API files do not contain readOperationTableRows_, findOperationTableRowById_, appendOperationTableRow_, updateOperationTableRow_
- Query Service files do not contain appendOperationTableRow_, updateOperationTableRow_, sheetInsert_, sheetUpdateById_
- every DAO contains only its expected table-key literal and no other Student Fee table key
- no Session.getActiveUser inside 080_student_fee
- no apiV1_, API_REGISTRY, callApi_, SCHEMA, readAll_, insertRow_, updateRow_, FormApp, ScriptApp.newTrigger
- no 084_forms directory and no frontend path
```

Expected table ownership:

```js
var DAO_TABLES = {
  '080_common/student_fee_audit_sheet_dao.gs': 'businessAuditLogs',
  '081_payers/fee_payers_sheet_dao.gs': 'feePayers',
  '082_payments/fee_applications_sheet_dao.gs': 'feeApplications',
  '082_payments/fee_payments_sheet_dao.gs': 'feePayments',
  '083_refunds/fee_refund_requests_sheet_dao.gs': 'feeRefundRequests',
  '083_refunds/fee_refunds_sheet_dao.gs': 'feeRefunds'
};
```

`student_fee_reference_query_service.gs` is the deliberate cross-table read owner for `feeRates` and `semesters`; it is not a DAO and performs no writes.

- [ ] **Step 4: Run the architecture verifier to verify RED**

Run:

```bash
node scripts/verify-student-fee-architecture.js
```

Expected: FAIL with missing `080_student_fee` files.

- [ ] **Step 5: Commit the RED test assets**

```bash
git add scripts/test-student-fee.js scripts/verify-student-fee-architecture.js
git commit -m "test: characterize student fee server behavior"
```

---

### Task 2: Add Student Fee request normalization, reference queries, and audit DAO

**Files:**
- Create: `src/000_server/080_student_fee/080_common/student_fee_request.gs`
- Create: `src/000_server/080_student_fee/080_common/student_fee_reference_query_service.gs`
- Create: `src/000_server/080_student_fee/080_common/student_fee_audit_sheet_dao.gs`
- Test: `scripts/test-student-fee.js`

**Interfaces:**
- Consumes: `readOperationTableRows_`, `findOperationTableRowById_`, `appendOperationTableRow_`, `Utilities.getUuid()`, `getCurrentIsoDateTime_`.
- Produces:
  - `parseStudentFeeRequest_(input) -> { request: Object }`
  - `requireStudentFeeId_(request, keys) -> String`
  - `requireStudentFeeText_(value, fieldName) -> String`
  - `parseStudentFeeAmount_(value, fieldName, minimum) -> Number`
  - `resolveStudentFeeRate_(targetDate) -> feeRates row`
  - `findStudentFeeSemesterById_(semesterId) -> semester row|null`
  - `assertValidStudentFeeSemester_(semesterId) -> semester row`
  - `insertStudentFeeAuditRow_(row) -> row`
  - `writeStudentFeeAudit_(actorEmail, actionType, targetType, targetId, beforeValue, afterValue, reason) -> row`

- [ ] **Step 1: Extend tests for common behavior**

Add:

```js
function testOverlappingFeeRatesFailClosed_() {
  var context = createContext_();
  context.findAllFeeRateRows_ = function () {
    return [
      { id: 'a', startDate: '2026-01-01', endDate: '2026-12-31', amountPerSemester: 10000, active: true },
      { id: 'b', startDate: '2026-08-01', endDate: '2026-08-31', amountPerSemester: 20000, active: true }
    ];
  };
  load_(context, 'src/000_server/080_student_fee/080_common/student_fee_reference_query_service.gs');
  assert.throws(function () { context.resolveStudentFeeRate_('2026-08-17'); }, /여러 건/);
}

function testAuditAttribution_() {
  var context = createContext_();
  var inserted = null;
  context.appendOperationTableRow_ = function (table, row) { inserted = { table: table, row: row }; return row; };
  context.getCurrentIsoDateTime_ = function () { return '2026-08-17T21:00:00+09:00'; };
  load_(context, 'src/000_server/080_student_fee/080_common/student_fee_audit_sheet_dao.gs');
  context.writeStudentFeeAudit_('staff@example.com', '승인', 'feeApplications', 'app-1', '접수', '승인', 'ok');
  assert.strictEqual(inserted.table, 'businessAuditLogs');
  assert.strictEqual(inserted.row.actorEmail, 'staff@example.com');
  assert.strictEqual(inserted.row.actionType, '승인');
  assert.strictEqual(inserted.row.targetId, 'app-1');
}
```

- [ ] **Step 2: Implement request helpers**

`student_fee_request.gs`:

```js
function parseStudentFeeRequest_(input) {
  var source = input && typeof input === 'object' ? input : {};
  return {
    request: source.request && typeof source.request === 'object' ? source.request : source
  };
}

function requireStudentFeeId_(request, keys) {
  var candidates = keys || ['id'];
  for (var i = 0; i < candidates.length; i += 1) {
    var value = request && request[candidates[i]];
    var text = String(value == null ? '' : value).trim();
    if (text) return text;
  }
  throw new Error('id가 필요합니다.');
}

function requireStudentFeeText_(value, fieldName) {
  var text = String(value == null ? '' : value).trim();
  if (!text) throw new Error(fieldName + ' 값이 필요합니다.');
  return text;
}

function parseStudentFeeAmount_(value, fieldName, minimum) {
  var amount = Number(String(value == null ? '' : value).replace(/,/g, ''));
  if (!isFinite(amount) || amount < minimum) throw new Error(fieldName + ' 값이 올바르지 않습니다.');
  return amount;
}
```

- [ ] **Step 3: Implement reference queries**

`student_fee_reference_query_service.gs` must read current-schema rows directly through Core read primitives:

```js
function findAllFeeRateRows_() {
  return readOperationTableClientRows_('feeRates');
}

function findStudentFeeSemesterById_(semesterId) {
  return findOperationTableRowById_('semesters', semesterId);
}

function assertValidStudentFeeSemester_(semesterId) {
  var semester = findStudentFeeSemesterById_(semesterId);
  if (!semester) throw new Error('학기기준을 찾을 수 없습니다: ' + semesterId);
  return semester;
}
```

For `resolveStudentFeeRate_`, normalize the target to a date comparable as `yyyy-MM-dd`, retain rows with `isTruthyValue_(row.active)`, and require exactly one matching inclusive date range:

```js
function resolveStudentFeeRate_(targetDate) {
  var target = formatStudentFeeDateKey_(targetDate);
  var matches = findAllFeeRateRows_().filter(function (row) {
    if (!isTruthyValue_(row.active)) return false;
    return formatStudentFeeDateKey_(row.startDate) <= target && target <= formatStudentFeeDateKey_(row.endDate);
  });
  if (!matches.length) throw new Error('유효한 회비금액기준을 찾을 수 없습니다.');
  if (matches.length > 1) throw new Error('유효한 회비금액기준이 여러 건입니다.');
  return matches[0];
}
```

`formatStudentFeeDateKey_` must accept Date or string values and return the first 10 characters of an ISO-like value, using `formatDateValue_` for Date values.

- [ ] **Step 4: Implement audit DAO**

`student_fee_audit_sheet_dao.gs`:

```js
function insertStudentFeeAuditRow_(row) {
  return appendOperationTableRow_('businessAuditLogs', row);
}

function writeStudentFeeAudit_(actorEmail, actionType, targetType, targetId, beforeValue, afterValue, reason) {
  return insertStudentFeeAuditRow_({
    id: Utilities.getUuid(),
    occurredAt: getCurrentIsoDateTime_(),
    actorEmail: actorEmail,
    actionType: actionType,
    targetType: targetType,
    targetId: String(targetId || ''),
    beforeValue: beforeValue == null ? '' : String(beforeValue),
    afterValue: afterValue == null ? '' : String(afterValue),
    reason: reason == null ? '' : String(reason)
  });
}
```

- [ ] **Step 5: Run focused tests**

```bash
node scripts/test-student-fee.js
```

Expected: common tests pass; later feature tests may still fail because payer/payment/refund files do not exist.

- [ ] **Step 6: Commit**

```bash
git add src/000_server/080_student_fee/080_common scripts/test-student-fee.js
git commit -m "feat: add student fee common services"
```

---

### Task 3: Implement payer DAO, Query Service, Service, and APIs

**Files:**
- Create: `src/000_server/080_student_fee/081_payers/fee_payers_sheet_dao.gs`
- Create: `src/000_server/080_student_fee/081_payers/fee_payers_query_service.gs`
- Create: `src/000_server/080_student_fee/081_payers/fee_payers_service.gs`
- Create: `src/000_server/080_student_fee/081_payers/fee_payers_api.gs`
- Modify: `scripts/test-student-fee.js`

**Interfaces:**
- Consumes: common request helpers, `assertValidStudentFeeSemester_`, Auth `context.email`, Core operation-table primitives, audit writer.
- Produces:
  - DAO: `findAllFeePayerRows_`, `findFeePayerRowById_`, `insertFeePayerRow_`, `updateFeePayerRowById_`
  - Query: `getFeePayerListData_`, `getFeePayerDetailData_`, `maskStudentFeeStudentId_`
  - Service: `createFeePayerData_(request, context)`, `updateFeePayerData_(request, context)`
  - API: `api_getFeePayerList`, `api_getFeePayerDetail`, `api_createFeePayer`, `api_updateFeePayer`

- [ ] **Step 1: Write payer tests**

Use fixture rows with only current fields:

```js
{
  studentId: '60201234',
  name: '김학생',
  affiliation: '경영정보학과',
  startSemesterId: 'SEM-2026-1',
  managerId: 'staff@example.com',
  updatedAt: '2026-08-17T21:00:00+09:00'
}
```

Test list masking:

```js
assert.strictEqual(result.items[0].studentId, '60****34');
```

Test create rejects duplicate student ID, validates semester, writes `managerId` from `context.email`, and audits.

Test update does not change `studentId`; only `name`, `affiliation`, and `startSemesterId` are accepted mutable business fields, while `managerId`/`updatedAt` are service-owned.

- [ ] **Step 2: Implement payer DAO**

```js
function findAllFeePayerRows_() {
  return readOperationTableClientRows_('feePayers');
}

function findFeePayerRowById_(studentId) {
  return findOperationTableRowById_('feePayers', studentId);
}

function insertFeePayerRow_(row) {
  return appendOperationTableRow_('feePayers', row);
}

function updateFeePayerRowById_(studentId, changes) {
  return updateOperationTableRow_('feePayers', studentId, changes);
}
```

- [ ] **Step 3: Implement payer Query Service**

`getFeePayerListData_` supports `keyword`, `affiliation`, `page`, `pageSize`, sorts by name/student ID deterministically, masks student IDs in list DTOs, and returns:

```js
{
  items: [...],
  page: 1,
  pageSize: 20,
  total: 1
}
```

`getFeePayerDetailData_` requires `studentId`/`id` and returns the unmasked internal operator detail or throws if missing.

Masking:

```js
function maskStudentFeeStudentId_(value) {
  var text = String(value || '');
  if (text.length <= 4) return text;
  return text.slice(0, 2) + '****' + text.slice(-2);
}
```

- [ ] **Step 4: Implement payer Service**

Create:

```js
function createFeePayerData_(request, context) {
  var source = request && request.payload && typeof request.payload === 'object' ? request.payload : request || {};
  var studentId = requireStudentFeeText_(source.studentId, 'studentId');
  var startSemesterId = requireStudentFeeText_(source.startSemesterId, 'startSemesterId');
  if (findFeePayerRowById_(studentId)) throw new Error('이미 등록된 학번입니다: ' + studentId);
  assertValidStudentFeeSemester_(startSemesterId);
  var row = {
    studentId: studentId,
    name: requireStudentFeeText_(source.name, 'name'),
    affiliation: requireStudentFeeText_(source.affiliation, 'affiliation'),
    startSemesterId: startSemesterId,
    managerId: context.email,
    updatedAt: getCurrentIsoDateTime_()
  };
  return withOperationWriteLock_(function () {
    insertFeePayerRow_(row);
    writeStudentFeeAudit_(context.email, '수기등록', 'feePayers', studentId, '', JSON.stringify(row), source.reason || '');
    return row;
  });
}
```

For update, load `before`, validate replacement semester when supplied, construct a patch from mutable fields only, set `managerId`/`updatedAt`, update under the operation lock, reload `after`, and audit before/after JSON.

- [ ] **Step 5: Implement payer APIs**

Every API follows this exact shape:

```js
function api_getFeePayerList(input) {
  return apiHandler_({
    operation: 'getFeePayerList',
    input: input,
    requireLogin: true,
    parse: parseStudentFeeRequest_,
    service: function (parsed) { return getFeePayerListData_(parsed.request); }
  });
}
```

Mutation API example:

```js
function api_createFeePayer(input) {
  return apiHandler_({
    operation: 'createFeePayer',
    input: input,
    requireLogin: true,
    parse: parseStudentFeeRequest_,
    service: function (parsed, context) { return createFeePayerData_(parsed.request, context); }
  });
}
```

Implement all four payer APIs with no permission declaration yet.

- [ ] **Step 6: Run tests**

```bash
node scripts/test-student-fee.js
node scripts/verify-student-fee-architecture.js
```

Expected: payer/common tests pass; architecture verifier remains RED until payment/refund files exist.

- [ ] **Step 7: Commit**

```bash
git add src/000_server/080_student_fee/081_payers scripts/test-student-fee.js
git commit -m "feat: add student fee payer management"
```

---

### Task 4: Implement payment DAOs and read models

**Files:**
- Create: `src/000_server/080_student_fee/082_payments/fee_applications_sheet_dao.gs`
- Create: `src/000_server/080_student_fee/082_payments/fee_payments_sheet_dao.gs`
- Create: `src/000_server/080_student_fee/082_payments/fee_payments_query_service.gs`
- Modify: `scripts/test-student-fee.js`

**Interfaces:**
- Produces:
  - application DAO: `findAllFeeApplicationRows_`, `findFeeApplicationRowById_`, `updateFeeApplicationRowById_`
  - payment DAO: `findAllFeePaymentRows_`, `findFeePaymentRowById_`, `findFeePaymentRowByApplicationId_`, `insertFeePaymentRow_`, `updateFeePaymentRowById_`
  - Query: `getFeeApplicationListData_`, `getFeeApplicationDetailData_`, `calculateFeeAmountData_`, `getStudentFeeSummaryData_`

- [ ] **Step 1: Add payment read tests**

Fixtures:

```js
var applications = [
  { id: 'app-1', studentId: '60201234', name: '김학생', affiliation: '경영정보학과', paymentDate: '2026-08-17', semesterNumber: 1, appliedAt: '2026-08-17T10:00:00+09:00', status: '접수', managerId: '', processedAt: '', studentCardFileId: 'f1', depositFileId: 'f2' }
];
var payments = [
  { id: 'pay-1', applicationId: 'app-1', amount: 20000, paymentDate: '2026-08-17', depositorName: '김학생', moneyStatus: '대기', managerId: 'staff@example.com', confirmedAt: '' }
];
```

Test list combines application and matching payment without a multi-table DAO. Test detail returns `{ application, payment }`. Test amount calculation returns the resolved `feeRates.amountPerSemester` and not `semesterNumber * amount`.

- [ ] **Step 2: Implement application DAO**

```js
function findAllFeeApplicationRows_() {
  return readOperationTableClientRows_('feeApplications');
}
function findFeeApplicationRowById_(id) {
  return findOperationTableRowById_('feeApplications', id);
}
function updateFeeApplicationRowById_(id, changes) {
  return updateOperationTableRow_('feeApplications', id, changes);
}
```

Do not add an insert function because this phase does not ingest/create application requests.

- [ ] **Step 3: Implement payment DAO**

```js
function findAllFeePaymentRows_() {
  return readOperationTableClientRows_('feePayments');
}
function findFeePaymentRowById_(id) {
  return findOperationTableRowById_('feePayments', id);
}
function findFeePaymentRowByApplicationId_(applicationId) {
  var rows = findAllFeePaymentRows_();
  for (var i = 0; i < rows.length; i += 1) {
    if (String(rows[i].applicationId) === String(applicationId)) return rows[i];
  }
  return null;
}
function insertFeePaymentRow_(row) {
  return appendOperationTableRow_('feePayments', row);
}
function updateFeePaymentRowById_(id, changes) {
  return updateOperationTableRow_('feePayments', id, changes);
}
```

- [ ] **Step 4: Implement payment Query Service**

`calculateFeeAmountData_`:

```js
function calculateFeeAmountData_(request) {
  var targetDate = request.paymentDate || getCurrentIsoDateTime_().slice(0, 10);
  var rate = resolveStudentFeeRate_(targetDate);
  return {
    paymentDate: targetDate,
    feeRateId: rate.id,
    amount: Number(rate.amountPerSemester) || 0
  };
}
```

Reject zero/non-number rate amounts instead of silently returning zero.

`getFeeApplicationListData_` supports status/keyword/page/pageSize and composes payment fields in memory. Student ID is masked in list DTOs. Sort descending by `appliedAt`.

`getFeeApplicationDetailData_` returns:

```js
{ application: application, payment: paymentOrNull }
```

`getStudentFeeSummaryData_` may initially be implemented here because summary is a composed read over payer/payment/refund tables; however do not create a one-file `080_common` summary abstraction. The final summary function must remain read-only and can call read functions from payer/payment/refund DAOs once Task 6 exists.

- [ ] **Step 5: Run focused tests**

```bash
node scripts/test-student-fee.js
```

Expected: payment read tests GREEN; mutation tests remain pending.

- [ ] **Step 6: Commit**

```bash
git add src/000_server/080_student_fee/082_payments scripts/test-student-fee.js
git commit -m "feat: add student fee payment queries"
```

---

### Task 5: Implement payment state machine and APIs

**Files:**
- Create: `src/000_server/080_student_fee/082_payments/fee_payments_service.gs`
- Create: `src/000_server/080_student_fee/082_payments/fee_payments_api.gs`
- Modify: `scripts/test-student-fee.js`

**Interfaces:**
- Produces:
  - `processFeeApplicationsData_(request, context)`
  - `confirmFeePaymentData_(request, context)`
  - `api_getFeeApplicationList`
  - `api_getFeeApplicationDetail`
  - `api_processFeeApplications`
  - `api_calculateFeeAmount`
  - `api_confirmFeePayment`

- [ ] **Step 1: Add payment mutation tests**

Approval test must assert:

```text
- only 접수 can approve
- application becomes 승인
- processedAt is written
- managerId is context.email
- exactly one payment is created
- payment amount comes from resolveStudentFeeRate_(application.paymentDate)
- new payment moneyStatus is 대기
- second approval/duplicate payment attempt throws
- audit is written for application state transition and payment creation
```

Reject test must assert no payment creation.

Confirmation test must accept only `DONE`/`MISMATCH` request actions and map them to `완료`/`불일치`; existing payment must be `대기`.

- [ ] **Step 2: Implement application processing**

Use batch input:

```js
{ ids: ['app-1'], action: 'APPROVE' | 'REJECT', reason: '' }
```

Core implementation:

```js
function processFeeApplicationsData_(request, context) {
  var ids = request && request.ids instanceof Array ? request.ids : [];
  var action = requireStudentFeeText_(request && request.action, 'action');
  if (['APPROVE', 'REJECT'].indexOf(action) < 0) throw new Error('지원하지 않는 납부신청 처리 action입니다: ' + action);
  if (!ids.length) throw new Error('처리할 납부신청 ID가 필요합니다.');

  return withOperationWriteLock_(function () {
    return ids.map(function (id) {
      var before = findFeeApplicationRowById_(id);
      if (!before) throw new Error('납부신청을 찾을 수 없습니다: ' + id);
      if (before.status !== '접수') throw new Error('접수 상태의 납부신청만 처리할 수 있습니다: ' + id);
      if (action === 'APPROVE' && findFeePaymentRowByApplicationId_(id)) {
        throw new Error('이미 생성된 납부내역이 있습니다: ' + id);
      }
      var nextStatus = action === 'APPROVE' ? '승인' : '반려';
      updateFeeApplicationRowById_(id, {
        status: nextStatus,
        managerId: context.email,
        processedAt: getCurrentIsoDateTime_()
      });
      writeStudentFeeAudit_(context.email, nextStatus, 'feeApplications', id, before.status, nextStatus, request.reason || '');

      var payment = null;
      if (action === 'APPROVE') {
        var rate = resolveStudentFeeRate_(before.paymentDate);
        var amount = Number(rate.amountPerSemester);
        if (!isFinite(amount) || amount <= 0) throw new Error('유효한 회비금액을 계산할 수 없습니다.');
        payment = {
          id: Utilities.getUuid(),
          applicationId: id,
          amount: amount,
          paymentDate: before.paymentDate,
          depositorName: '',
          moneyStatus: '대기',
          managerId: context.email,
          confirmedAt: ''
        };
        insertFeePaymentRow_(payment);
        writeStudentFeeAudit_(context.email, '생성', 'feePayments', payment.id, '', JSON.stringify(payment), '납부신청 승인에 따른 생성');
      }
      return { applicationId: id, status: nextStatus, payment: payment };
    });
  });
}
```

- [ ] **Step 3: Implement payment confirmation**

Input:

```js
{ paymentId: 'pay-1', result: 'DONE' | 'MISMATCH', depositorName: '김학생', reason: '' }
```

Rules:

```js
var nextStatus = request.result === 'DONE' ? '완료'
  : request.result === 'MISMATCH' ? '불일치'
  : null;
if (!nextStatus) throw new Error('지원하지 않는 입금확인 result입니다.');
if (before.moneyStatus !== '대기') throw new Error('대기 상태의 납부내역만 확정할 수 있습니다.');
```

Write `moneyStatus`, optional `depositorName`, `managerId`, `confirmedAt`, then audit.

- [ ] **Step 4: Implement payment APIs**

All five APIs use `apiHandler_`, `parseStudentFeeRequest_`, and `requireLogin: true`. Query APIs ignore context; mutation APIs pass `(parsed.request, context)` to Services.

- [ ] **Step 5: Run tests**

```bash
node scripts/test-student-fee.js
```

Expected: common+payer+payment tests GREEN; refund tests pending.

- [ ] **Step 6: Commit**

```bash
git add src/000_server/080_student_fee/082_payments scripts/test-student-fee.js
git commit -m "feat: add student fee payment workflow"
```

---

### Task 6: Implement refund DAOs and read models

**Files:**
- Create: `src/000_server/080_student_fee/083_refunds/fee_refund_requests_sheet_dao.gs`
- Create: `src/000_server/080_student_fee/083_refunds/fee_refunds_sheet_dao.gs`
- Create: `src/000_server/080_student_fee/083_refunds/fee_refunds_query_service.gs`
- Modify: `scripts/test-student-fee.js`

**Interfaces:**
- Produces:
  - request DAO: `findAllFeeRefundRequestRows_`, `findFeeRefundRequestRowById_`, `updateFeeRefundRequestRowById_`
  - refund DAO: `findAllFeeRefundRows_`, `findFeeRefundRowById_`, `findFeeRefundRowByRequestId_`, `findFeeRefundRowsByPaymentId_`, `insertFeeRefundRow_`, `updateFeeRefundRowById_`
  - Query: `calculateRefundableAmount_`, `calculateFeeRefundData_`, `getFeeRefundRequestListData_`, `getFeeRefundRequestDetailData_`, `maskStudentFeeAccountNumber_`

- [ ] **Step 1: Add refund read tests**

Use request fixture:

```js
{
  id: 'refreq-1', studentId: '60201234', bankName: '은행', accountNumber: '1234567890', accountHolder: '김학생',
  reason: '휴학', paymentId: 'pay-1', semesterNumber: 1, appliedAt: '2026-08-17T12:00:00+09:00',
  status: '접수', managerId: '', processedAt: '', studentCardFileId: 'f1', enrollmentChangeFileId: 'f2', otherEvidenceFileId: ''
}
```

List test must mask account number. Detail API may return current-schema detail but must not accept/use a client `hasFullAccess` flag.

Refundable balance test must ignore refunds with moneyStatus `실패` and count `대기`/`완료` only.

- [ ] **Step 2: Implement refund-request DAO**

```js
function findAllFeeRefundRequestRows_() {
  return readOperationTableClientRows_('feeRefundRequests');
}
function findFeeRefundRequestRowById_(id) {
  return findOperationTableRowById_('feeRefundRequests', id);
}
function updateFeeRefundRequestRowById_(id, changes) {
  return updateOperationTableRow_('feeRefundRequests', id, changes);
}
```

- [ ] **Step 3: Implement refund DAO**

Use `feeRefunds` only. Implement scans by `requestId` and by the payment relationship. Because `feeRefunds` has no direct `paymentId`, `findFeeRefundRowsByPaymentId_` must NOT pretend otherwise; instead the Query Service resolves related request IDs from `feeRefundRequests` and filters refunds by those request IDs.

Therefore the DAO interfaces are:

```js
findAllFeeRefundRows_()
findFeeRefundRowById_(id)
findFeeRefundRowByRequestId_(requestId)
insertFeeRefundRow_(row)
updateFeeRefundRowById_(id, changes)
```

Do not add a fake paymentId lookup to the DAO.

- [ ] **Step 4: Implement refund Query Service**

Relationship-safe refundable amount:

```js
function calculateRefundableAmount_(paymentId) {
  var payment = findFeePaymentRowById_(paymentId);
  if (!payment) throw new Error('납부내역을 찾을 수 없습니다: ' + paymentId);
  var requestIds = findAllFeeRefundRequestRows_().filter(function (row) {
    return String(row.paymentId) === String(paymentId);
  }).map(function (row) { return String(row.id); });
  var used = findAllFeeRefundRows_().filter(function (row) {
    return requestIds.indexOf(String(row.requestId)) >= 0 && ['대기', '완료'].indexOf(row.moneyStatus) >= 0;
  }).reduce(function (sum, row) {
    return sum + (Number(row.approvedAmount) || 0);
  }, 0);
  return Math.max((Number(payment.amount) || 0) - used, 0);
}
```

`calculateFeeRefundData_` requires `paymentId` or resolves it from `refundRequestId`, and returns:

```js
{
  paymentId: payment.id,
  paymentAmount: Number(payment.amount),
  refundableAmount: calculateRefundableAmount_(payment.id)
}
```

List returns masked student ID and account number. Account masking:

```js
function maskStudentFeeAccountNumber_(value) {
  var text = String(value || '');
  if (text.length <= 6) return text;
  return text.slice(0, 3) + '****' + text.slice(-3);
}
```

- [ ] **Step 5: Run tests**

```bash
node scripts/test-student-fee.js
```

Expected: refund read/calculation tests GREEN; refund mutations pending.

- [ ] **Step 6: Commit**

```bash
git add src/000_server/080_student_fee/083_refunds scripts/test-student-fee.js
git commit -m "feat: add student fee refund queries"
```

---

### Task 7: Implement refund state machine and APIs

**Files:**
- Create: `src/000_server/080_student_fee/083_refunds/fee_refunds_service.gs`
- Create: `src/000_server/080_student_fee/083_refunds/fee_refunds_api.gs`
- Modify: `scripts/test-student-fee.js`

**Interfaces:**
- Produces:
  - `processFeeRefundRequestsData_(request, context)`
  - `confirmFeeRefundData_(request, context)`
  - `api_getFeeRefundRequestList`
  - `api_getFeeRefundRequestDetail`
  - `api_processFeeRefundRequests`
  - `api_calculateFeeRefund`
  - `api_confirmFeeRefund`

- [ ] **Step 1: Add refund mutation tests**

Approval test must assert:

```text
- only 접수 request can approve/reject
- approval fails if refund row already exists for request
- approval amount is request.approvedAmount when supplied, otherwise the calculated maximum
- approval amount must be > 0 and <= calculated refundable balance
- approved request becomes 승인
- one feeRefunds row is created with 대기
- actor is context.email
- audits are written
```

Reject must not create a refund row.

Confirmation must only transition `대기 → 완료|실패`.

- [ ] **Step 2: Implement refund request processing**

Batch input:

```js
{ ids: ['refreq-1'], action: 'APPROVE' | 'REJECT', approvedAmount: 15000, reason: '' }
```

When approving multiple IDs with one `approvedAmount`, reject the request because one amount cannot safely represent multiple independent refundable balances. Batch approve is allowed only when `approvedAmount` is omitted, in which case each request uses its own current maximum refundable amount.

Core logic per request:

```js
var before = findFeeRefundRequestRowById_(id);
if (!before) throw new Error('환불신청을 찾을 수 없습니다: ' + id);
if (before.status !== '접수') throw new Error('접수 상태의 환불신청만 처리할 수 있습니다: ' + id);
if (action === 'APPROVE' && findFeeRefundRowByRequestId_(id)) throw new Error('이미 생성된 환불내역이 있습니다: ' + id);

var maximum = calculateRefundableAmount_(before.paymentId);
var approvedAmount = request.approvedAmount == null || request.approvedAmount === ''
  ? maximum
  : parseStudentFeeAmount_(request.approvedAmount, 'approvedAmount', 1);
if (approvedAmount > maximum) throw new Error('승인금액이 최대 환불가능금액을 초과합니다.');
if (approvedAmount <= 0) throw new Error('환불 가능한 금액이 없습니다.');
```

On approval create:

```js
{
  id: Utilities.getUuid(),
  requestId: id,
  approvedAmount: approvedAmount,
  transferDate: '',
  moneyStatus: '대기',
  managerId: context.email,
  transferEvidenceId: '',
  createdAt: getCurrentIsoDateTime_()
}
```

Update request `status`, `managerId`, `processedAt`; audit both records.

- [ ] **Step 3: Implement refund confirmation**

Input:

```js
{ refundId: 'refund-1', result: 'DONE' | 'FAILED', transferDate: '2026-08-17', transferEvidenceId: 'drive-file-id', reason: '' }
```

Rules:

```js
var nextStatus = request.result === 'DONE' ? '완료'
  : request.result === 'FAILED' ? '실패'
  : null;
if (!nextStatus) throw new Error('지원하지 않는 환불확정 result입니다.');
if (before.moneyStatus !== '대기') throw new Error('대기 상태의 환불내역만 확정할 수 있습니다.');
```

Update only current-schema fields: `transferDate`, `moneyStatus`, `managerId`, `transferEvidenceId`; audit the transition.

- [ ] **Step 4: Implement refund APIs**

Use the same `apiHandler_`/`requireLogin: true` pattern as payer/payment APIs.

- [ ] **Step 5: Run tests**

```bash
node scripts/test-student-fee.js
```

Expected:

```text
Student Fee behavior regression tests passed.
```

- [ ] **Step 6: Commit**

```bash
git add src/000_server/080_student_fee/083_refunds scripts/test-student-fee.js
git commit -m "feat: add student fee refund workflow"
```

---

### Task 8: Finish Student Fee summary API and architecture boundary

**Files:**
- Modify: `src/000_server/080_student_fee/082_payments/fee_payments_query_service.gs`
- Modify: `src/000_server/080_student_fee/082_payments/fee_payments_api.gs`
- Modify: `scripts/test-student-fee.js`
- Modify: `scripts/verify-student-fee-architecture.js`
- Modify: `scripts/verify-server-architecture.js`

**Interfaces:**
- Produces: `api_getStudentFeeSummary` and a fully GREEN Student Fee architecture verifier.

- [ ] **Step 1: Add summary test using all current tables**

Fixture expected shape:

```js
{
  payers: { total: 2 },
  applications: { total: 3, pending: 1, approved: 1, rejected: 1 },
  payments: { total: 2, pending: 1, completed: 1, mismatch: 0, completedAmount: 20000 },
  refundRequests: { total: 2, pending: 1, approved: 1, rejected: 0 },
  refunds: { total: 1, pending: 1, completed: 0, failed: 0, completedAmount: 0 }
}
```

Do not include source-only `정식/임시`, archive, or missing-field statistics.

- [ ] **Step 2: Implement summary composition**

Keep `getStudentFeeSummaryData_()` in `fee_payments_query_service.gs` for this phase rather than creating a one-function common file. It may read through existing Student Fee DAO functions:

```js
function getStudentFeeSummaryData_() {
  var payers = findAllFeePayerRows_();
  var applications = findAllFeeApplicationRows_();
  var payments = findAllFeePaymentRows_();
  var requests = findAllFeeRefundRequestRows_();
  var refunds = findAllFeeRefundRows_();
  function count_(rows, field, value) {
    return rows.filter(function (row) { return row[field] === value; }).length;
  }
  function sum_(rows, field) {
    return rows.reduce(function (sum, row) { return sum + (Number(row[field]) || 0); }, 0);
  }
  return {
    payers: { total: payers.length },
    applications: {
      total: applications.length,
      pending: count_(applications, 'status', '접수'),
      approved: count_(applications, 'status', '승인'),
      rejected: count_(applications, 'status', '반려')
    },
    payments: {
      total: payments.length,
      pending: count_(payments, 'moneyStatus', '대기'),
      completed: count_(payments, 'moneyStatus', '완료'),
      mismatch: count_(payments, 'moneyStatus', '불일치'),
      completedAmount: sum_(payments.filter(function (row) { return row.moneyStatus === '완료'; }), 'amount')
    },
    refundRequests: {
      total: requests.length,
      pending: count_(requests, 'status', '접수'),
      approved: count_(requests, 'status', '승인'),
      rejected: count_(requests, 'status', '반려')
    },
    refunds: {
      total: refunds.length,
      pending: count_(refunds, 'moneyStatus', '대기'),
      completed: count_(refunds, 'moneyStatus', '완료'),
      failed: count_(refunds, 'moneyStatus', '실패'),
      completedAmount: sum_(refunds.filter(function (row) { return row.moneyStatus === '완료'; }), 'approvedAmount')
    }
  };
}
```

- [ ] **Step 3: Add summary API**

```js
function api_getStudentFeeSummary(input) {
  return apiHandler_({
    operation: 'getStudentFeeSummary',
    input: input,
    requireLogin: true,
    parse: parseStudentFeeRequest_,
    service: function () { return getStudentFeeSummaryData_(); }
  });
}
```

- [ ] **Step 4: Update server verifier public contract**

Add these exact names to `REQUIRED_PUBLIC_FUNCTIONS` in `scripts/verify-server-architecture.js`:

```text
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

Do not add any route requirement because frontend is out of scope.

- [ ] **Step 5: Make Student Fee architecture verifier GREEN**

Run:

```bash
node scripts/verify-student-fee-architecture.js
```

Expected:

```text
Student Fee architecture verification passed.
```

If it fails, fix ownership/boundary violations rather than weakening the verifier.

- [ ] **Step 6: Run behavior tests**

```bash
node scripts/test-student-fee.js
```

Expected:

```text
Student Fee behavior regression tests passed.
```

- [ ] **Step 7: Commit**

```bash
git add src/000_server/080_student_fee scripts/test-student-fee.js scripts/verify-student-fee-architecture.js scripts/verify-server-architecture.js
git commit -m "feat: complete student fee server domain"
```

---

### Task 9: Cross-domain regression verification

**Files:**
- Modify only if a genuine regression is found. Do not refactor unrelated domains.

**Interfaces:**
- Consumes: completed Student Fee implementation and all existing test/verifier scripts.
- Produces: fresh verification evidence for the final branch state.

- [ ] **Step 1: Syntax-check Student Fee server files**

Because `.gs` files are JavaScript, copy each changed Student Fee `.gs` file to a temporary `.js` path and run `node --check`, or use `vm.Script` over every `080_student_fee/**/*.gs` file.

Expected: zero syntax errors.

- [ ] **Step 2: Run all behavior tests**

```bash
node scripts/test-core.js
node scripts/test-auth-iam.js
node scripts/test-event.js
node scripts/test-accounting.js
node scripts/test-settings.js
node scripts/test-student-fee.js
```

Expected: every command exits 0.

- [ ] **Step 3: Run all architecture verifiers**

```bash
node scripts/verify-auth-iam-architecture.js
node scripts/verify-event-architecture.js
node scripts/verify-accounting-architecture.js
node scripts/verify-settings-architecture.js
node scripts/verify-student-fee-architecture.js
node scripts/verify-server-architecture.js
```

Expected: every command exits 0.

- [ ] **Step 4: Verify schema was not changed**

```bash
git diff --exit-code 511b8822fd1b2aa53c201f84cd7813538ea60be6 -- src/000_server/020_schema
```

Expected: no diff.

If the execution base differs, compare against the spec-approval commit containing `511b8822` or the implementation-plan parent commit.

- [ ] **Step 5: Verify source-feature artifacts were not ported**

```bash
grep -R "apiV1_\|API_REGISTRY\|callApi_\|Session.getActiveUser\|FormApp\|newTrigger" src/000_server/080_student_fee
```

Expected: no matches.

Also verify no root-level `Api.gs`, `Db.gs`, `Schema.gs`, `FormSync.gs`, or Student Fee `index.html` was added by this work.

- [ ] **Step 6: Inspect final diff**

```bash
git diff --check
git status --short
git diff --stat 511b8822fd1b2aa53c201f84cd7813538ea60be6...HEAD
```

Expected: changes are limited to Student Fee server files, its tests/verifier, and the server verifier public-function list.

- [ ] **Step 7: Commit any verification-only correction**

Only if a real defect was fixed during verification:

```bash
git add <exact-fixed-files>
git commit -m "fix: correct student fee server regression"
```

Do not create an empty verification commit.

---

## Final Function Ownership

```text
080_common/student_fee_request.gs
  parseStudentFeeRequest_
  requireStudentFeeId_
  requireStudentFeeText_
  parseStudentFeeAmount_

080_common/student_fee_reference_query_service.gs
  findAllFeeRateRows_
  findStudentFeeSemesterById_
  assertValidStudentFeeSemester_
  formatStudentFeeDateKey_
  resolveStudentFeeRate_

080_common/student_fee_audit_sheet_dao.gs
  insertStudentFeeAuditRow_
  writeStudentFeeAudit_

081_payers/fee_payers_sheet_dao.gs
  findAllFeePayerRows_
  findFeePayerRowById_
  insertFeePayerRow_
  updateFeePayerRowById_

081_payers/fee_payers_query_service.gs
  maskStudentFeeStudentId_
  getFeePayerListData_
  getFeePayerDetailData_

081_payers/fee_payers_service.gs
  createFeePayerData_
  updateFeePayerData_

081_payers/fee_payers_api.gs
  api_getFeePayerList
  api_getFeePayerDetail
  api_createFeePayer
  api_updateFeePayer

082_payments/fee_applications_sheet_dao.gs
  findAllFeeApplicationRows_
  findFeeApplicationRowById_
  updateFeeApplicationRowById_

082_payments/fee_payments_sheet_dao.gs
  findAllFeePaymentRows_
  findFeePaymentRowById_
  findFeePaymentRowByApplicationId_
  insertFeePaymentRow_
  updateFeePaymentRowById_

082_payments/fee_payments_query_service.gs
  getFeeApplicationListData_
  getFeeApplicationDetailData_
  calculateFeeAmountData_
  getStudentFeeSummaryData_

082_payments/fee_payments_service.gs
  processFeeApplicationsData_
  confirmFeePaymentData_

082_payments/fee_payments_api.gs
  api_getStudentFeeSummary
  api_getFeeApplicationList
  api_getFeeApplicationDetail
  api_processFeeApplications
  api_calculateFeeAmount
  api_confirmFeePayment

083_refunds/fee_refund_requests_sheet_dao.gs
  findAllFeeRefundRequestRows_
  findFeeRefundRequestRowById_
  updateFeeRefundRequestRowById_

083_refunds/fee_refunds_sheet_dao.gs
  findAllFeeRefundRows_
  findFeeRefundRowById_
  findFeeRefundRowByRequestId_
  insertFeeRefundRow_
  updateFeeRefundRowById_

083_refunds/fee_refunds_query_service.gs
  maskStudentFeeAccountNumber_
  calculateRefundableAmount_
  calculateFeeRefundData_
  getFeeRefundRequestListData_
  getFeeRefundRequestDetailData_

083_refunds/fee_refunds_service.gs
  processFeeRefundRequestsData_
  confirmFeeRefundData_

083_refunds/fee_refunds_api.gs
  api_getFeeRefundRequestList
  api_getFeeRefundRequestDetail
  api_processFeeRefundRequests
  api_calculateFeeRefund
  api_confirmFeeRefund
```

## Plan Self-Review

- Spec coverage: payer/payment/refund reads, mutations, status transitions, rate resolution, refund balance, audit, login requirement, masking, summary, tests, and architecture verification all map to explicit tasks.
- Non-goals: FormSync, frontend, export, archive, legacy API wrappers, source generic DB layer, new IAM permissions, and schema changes have no implementation task.
- Placeholder scan: no TBD/TODO/"implement later" placeholders are used as implementation instructions.
- Interface consistency: the refund calculation intentionally resolves payment relationships through `feeRefundRequests` because `feeRefunds` has no `paymentId`; no DAO is assigned a field/table relationship that does not exist in the current schema.
- Scope: one server domain only; frontend and Form integration remain separate future specs/plans.
