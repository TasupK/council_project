# Student Fee Server Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port Student Fee payer/payment/refund server behavior into a new `080_student_fee` domain using the current `020_schema`, Core Sheet primitives, Auth context, and current API conventions.

**Architecture:** Add thin APIs, mutation Services, read-only Query Services, and single-table Sheet DAOs. The current schema is authoritative; feature-branch persistence, `Db.gs`, `Schema.gs`, `apiV1_*`, FormSync, frontend, export, archive, and extra fields are not ported.

**Tech Stack:** Google Apps Script V8, JavaScript function declarations, Google Sheets operation DB, Node.js `assert`/`vm` tests, repository architecture verifier scripts.

## Global Constraints

- `src/000_server/020_schema/operation_db_schema.gs` MUST remain unchanged.
- Public APIs use `api_*` names and `apiHandler_`.
- Every Student Fee public API sets `requireLogin: true`.
- No Student Fee code calls `Session.getActiveUser()` directly.
- No new Student Fee IAM permission IDs in this phase.
- API files perform no Sheet access.
- Query Services perform no writes.
- Each Sheet DAO owns one operation table only.
- Mutation Services own state transitions, duplicate prevention, validation, and audit orchestration.
- Generated IDs use `Utilities.getUuid()`.
- Application statuses: `접수`, `승인`, `반려`.
- Payment statuses: `대기`, `완료`, `불일치`.
- Refund statuses: `대기`, `완료`, `실패`.
- Fee-rate resolution requires exactly one active effective `feeRates` row; zero or multiple matches fail closed.
- Refundable balance = payment amount - related refunds in `대기` or `완료`, floored at zero.
- This phase processes existing `feeApplications` and `feeRefundRequests`; it does not create them.
- No empty placeholder files.

---

## Target Files

```text
src/000_server/080_student_fee/
├─ 080_common/
│  ├─ student_fee_request.gs
│  ├─ student_fee_reference_query_service.gs
│  └─ student_fee_audit_sheet_dao.gs
├─ 081_payers/
│  ├─ fee_payers_api.gs
│  ├─ fee_payers_service.gs
│  ├─ fee_payers_query_service.gs
│  └─ fee_payers_sheet_dao.gs
├─ 082_payments/
│  ├─ fee_payments_api.gs
│  ├─ fee_payments_service.gs
│  ├─ fee_payments_query_service.gs
│  ├─ fee_applications_sheet_dao.gs
│  └─ fee_payments_sheet_dao.gs
└─ 083_refunds/
   ├─ fee_refunds_api.gs
   ├─ fee_refunds_service.gs
   ├─ fee_refunds_query_service.gs
   ├─ fee_refund_requests_sheet_dao.gs
   └─ fee_refunds_sheet_dao.gs
```

Also create/modify:

```text
scripts/test-student-fee.js
scripts/verify-student-fee-architecture.js
scripts/verify-server-architecture.js
```

Do not create `084_forms` or frontend files.

---

### Task 1: Add RED behavior tests and architecture verifier

**Files:**
- Create: `scripts/test-student-fee.js`
- Create: `scripts/verify-student-fee-architecture.js`

**Interfaces:**
- Produces `Student Fee behavior regression tests passed.` when behavior is complete.
- Produces `Student Fee architecture verification passed.` when structure is complete.

- [ ] **Step 1: Create the Node VM test harness**

```js
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var ROOT = path.resolve(__dirname, '..');

function load_(context, relativePath) {
  var file = path.join(ROOT, relativePath);
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
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
    Utilities: { getUuid: function () { return 'uuid-test'; } }
  });
}
```

- [ ] **Step 2: Add concrete RED tests**

Fee rate:

```js
function testFeeRateResolution_() {
  var context = createContext_();
  context.isTruthyValue_ = function (v) { return !!v; };
  context.formatDateValue_ = function (v) { return String(v).slice(0, 10); };
  context.readOperationTableClientRows_ = function (table) {
    assert.strictEqual(table, 'feeRates');
    return [
      { id: 'old', startDate: '2026-01-01', endDate: '2026-06-30', amountPerSemester: 10000, active: true },
      { id: 'current', startDate: '2026-07-01', endDate: '2026-12-31', amountPerSemester: 20000, active: true }
    ];
  };
  load_(context, 'src/000_server/080_student_fee/080_common/student_fee_reference_query_service.gs');
  assert.strictEqual(context.resolveStudentFeeRate_('2026-08-17').id, 'current');
}
```

Refundable balance must follow the actual schema relationship `feeRefundRequests.paymentId` + `feeRefunds.requestId`:

```js
function testRefundableBalance_() {
  var context = createContext_();
  context.findFeePaymentRowById_ = function () { return { id: 'pay-1', amount: 20000 }; };
  context.findAllFeeRefundRequestRows_ = function () {
    return [
      { id: 'req-1', paymentId: 'pay-1' },
      { id: 'req-2', paymentId: 'pay-1' },
      { id: 'req-other', paymentId: 'pay-2' }
    ];
  };
  context.findAllFeeRefundRows_ = function () {
    return [
      { requestId: 'req-1', approvedAmount: 5000, moneyStatus: '대기' },
      { requestId: 'req-2', approvedAmount: 3000, moneyStatus: '완료' },
      { requestId: 'req-2', approvedAmount: 9999, moneyStatus: '실패' }
    ];
  };
  load_(context, 'src/000_server/080_student_fee/083_refunds/fee_refunds_query_service.gs');
  assert.strictEqual(context.calculateRefundableAmount_('pay-1'), 12000);
}
```

Also define concrete tests for payer create/update, payment approve/reject/confirm, refund approve/reject/confirm, audit actor attribution, list masking, summary, and API login requirement using current-schema fixtures only.

- [ ] **Step 3: Run behavior tests and confirm RED**

```bash
node scripts/test-student-fee.js
```

Expected: FAIL because `080_student_fee` does not exist.

- [ ] **Step 4: Create architecture verifier**

Require all 17 target `.gs` files and verify they are non-empty. Enforce:

```text
API -> apiHandler_ + requireLogin:true
API -> no Sheet primitives
Query Service -> no write primitives
DAO -> exactly one owned table
080_student_fee -> no Session.getActiveUser()
080_student_fee -> no apiV1_, API_REGISTRY, callApi_, SCHEMA, readAll_, insertRow_, updateRow_
080_student_fee -> no FormApp / trigger creation
no duplicate functions
no 084_forms
```

DAO table map:

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

- [ ] **Step 5: Run architecture verifier and confirm RED**

```bash
node scripts/verify-student-fee-architecture.js
```

Expected: missing-file failures.

- [ ] **Step 6: Commit**

```bash
git add scripts/test-student-fee.js scripts/verify-student-fee-architecture.js
git commit -m "test: characterize student fee server behavior"
```

---

### Task 2: Implement common request, fee-rate, semester, and audit functions

**Files:**
- Create: `080_common/student_fee_request.gs`
- Create: `080_common/student_fee_reference_query_service.gs`
- Create: `080_common/student_fee_audit_sheet_dao.gs`
- Modify: `scripts/test-student-fee.js`

**Produces:**

```text
parseStudentFeeRequest_
requireStudentFeeId_
requireStudentFeeText_
parseStudentFeeAmount_
findAllFeeRateRows_
findStudentFeeSemesterById_
assertValidStudentFeeSemester_
formatStudentFeeDateKey_
resolveStudentFeeRate_
insertStudentFeeAuditRow_
writeStudentFeeAudit_
```

- [ ] **Step 1: Add tests for overlapping/no fee rate and audit attribution**

```js
assert.throws(function () { context.resolveStudentFeeRate_('2027-01-01'); }, /회비금액기준/);
assert.throws(function () { overlappingContext.resolveStudentFeeRate_('2026-08-17'); }, /여러 건/);
```

Audit must write `businessAuditLogs`, UUID, current timestamp, and `actorEmail` passed from Auth context.

- [ ] **Step 2: Implement request helpers**

```js
function parseStudentFeeRequest_(input) {
  var source = input && typeof input === 'object' ? input : {};
  return { request: source.request && typeof source.request === 'object' ? source.request : source };
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

`requireStudentFeeId_` scans explicit candidate keys such as `['id','studentId']` and throws if all are blank.

- [ ] **Step 3: Implement reference queries**

```js
function findAllFeeRateRows_() { return readOperationTableClientRows_('feeRates'); }
function findStudentFeeSemesterById_(id) { return findOperationTableRowById_('semesters', id); }
function assertValidStudentFeeSemester_(id) {
  var row = findStudentFeeSemesterById_(id);
  if (!row) throw new Error('학기기준을 찾을 수 없습니다: ' + id);
  return row;
}
```

`resolveStudentFeeRate_` keeps active rows whose inclusive date range contains the target. Require exactly one match and a positive numeric `amountPerSemester`; otherwise throw.

- [ ] **Step 4: Implement audit DAO**

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

- [ ] **Step 5: Run focused test and commit**

```bash
node scripts/test-student-fee.js
git add src/000_server/080_student_fee/080_common scripts/test-student-fee.js
git commit -m "feat: add student fee common services"
```

---

### Task 3: Implement payer domain

**Files:**
- Create: `081_payers/fee_payers_sheet_dao.gs`
- Create: `081_payers/fee_payers_query_service.gs`
- Create: `081_payers/fee_payers_service.gs`
- Create: `081_payers/fee_payers_api.gs`
- Modify: `scripts/test-student-fee.js`

**Produces:**

```text
findAllFeePayerRows_
findFeePayerRowById_
insertFeePayerRow_
updateFeePayerRowById_
maskStudentFeeStudentId_
getFeePayerListData_
getFeePayerDetailData_
createFeePayerData_
updateFeePayerData_
api_getFeePayerList
api_getFeePayerDetail
api_createFeePayer
api_updateFeePayer
```

- [ ] **Step 1: Add payer RED tests**

Use only:

```js
{ studentId, name, affiliation, startSemesterId, managerId, updatedAt }
```

Assert duplicate student ID rejection, semester validation, Auth email attribution, immutable primary key, audit write, and list masking `60201234 -> 60****34`.

- [ ] **Step 2: Implement single-table DAO**

```js
function findAllFeePayerRows_() { return readOperationTableClientRows_('feePayers'); }
function findFeePayerRowById_(id) { return findOperationTableRowById_('feePayers', id); }
function insertFeePayerRow_(row) { return appendOperationTableRow_('feePayers', row); }
function updateFeePayerRowById_(id, changes) { return updateOperationTableRow_('feePayers', id, changes); }
```

- [ ] **Step 3: Implement payer queries**

List supports `keyword`, `affiliation`, `page`, `pageSize`, deterministic sorting, and student-ID masking. Detail uses unmasked current-schema data and throws if absent.

- [ ] **Step 4: Implement create/update Services**

Create requires `studentId`, `name`, `affiliation`, `startSemesterId`; validates semester; sets `managerId=context.email`, `updatedAt=getCurrentIsoDateTime_()`, writes row and audit.

Update accepts mutable `name`, `affiliation`, `startSemesterId` only; service owns `managerId` and `updatedAt`; it audits JSON before/after.

- [ ] **Step 5: Implement four payer APIs**

Example:

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

- [ ] **Step 6: Test and commit**

```bash
node scripts/test-student-fee.js
node scripts/verify-student-fee-architecture.js
git add src/000_server/080_student_fee/081_payers scripts/test-student-fee.js
git commit -m "feat: add student fee payer management"
```

Architecture may remain RED only because later required files do not exist yet.

---

### Task 4: Implement payment reads and DAOs

**Files:**
- Create: `082_payments/fee_applications_sheet_dao.gs`
- Create: `082_payments/fee_payments_sheet_dao.gs`
- Create: `082_payments/fee_payments_query_service.gs`
- Modify: `scripts/test-student-fee.js`

**Produces:**

```text
findAllFeeApplicationRows_
findFeeApplicationRowById_
updateFeeApplicationRowById_
findAllFeePaymentRows_
findFeePaymentRowById_
findFeePaymentRowByApplicationId_
insertFeePaymentRow_
updateFeePaymentRowById_
getFeeApplicationListData_
getFeeApplicationDetailData_
calculateFeeAmountData_
```

- [ ] **Step 1: Add payment read tests**

Use current fields only. Assert application/payment in-memory composition, descending `appliedAt` sort, list masking, and fee calculation equal to the resolved one-semester rate—not `semesterNumber * rate`.

- [ ] **Step 2: Implement application DAO**

```js
function findAllFeeApplicationRows_() { return readOperationTableClientRows_('feeApplications'); }
function findFeeApplicationRowById_(id) { return findOperationTableRowById_('feeApplications', id); }
function updateFeeApplicationRowById_(id, changes) { return updateOperationTableRow_('feeApplications', id, changes); }
```

No insert function.

- [ ] **Step 3: Implement payment DAO**

```js
function findAllFeePaymentRows_() { return readOperationTableClientRows_('feePayments'); }
function findFeePaymentRowById_(id) { return findOperationTableRowById_('feePayments', id); }
function insertFeePaymentRow_(row) { return appendOperationTableRow_('feePayments', row); }
function updateFeePaymentRowById_(id, changes) { return updateOperationTableRow_('feePayments', id, changes); }
```

`findFeePaymentRowByApplicationId_` scans only `findAllFeePaymentRows_()`.

- [ ] **Step 4: Implement payment queries**

`calculateFeeAmountData_({paymentDate})` resolves fee rate and returns:

```js
{ paymentDate: targetDate, feeRateId: rate.id, amount: Number(rate.amountPerSemester) }
```

List/detail join in memory through DAO outputs.

- [ ] **Step 5: Test and commit**

```bash
node scripts/test-student-fee.js
git add src/000_server/080_student_fee/082_payments scripts/test-student-fee.js
git commit -m "feat: add student fee payment queries"
```

---

### Task 5: Implement payment state machine and APIs

**Files:**
- Create: `082_payments/fee_payments_service.gs`
- Create: `082_payments/fee_payments_api.gs`
- Modify: `scripts/test-student-fee.js`

**Produces:**

```text
processFeeApplicationsData_
confirmFeePaymentData_
api_getFeeApplicationList
api_getFeeApplicationDetail
api_processFeeApplications
api_calculateFeeAmount
api_confirmFeePayment
```

- [ ] **Step 1: Add mutation RED tests**

Approval requirements:

```text
접수 only
APPROVE -> 신청 승인 + exactly one feePayments row
REJECT -> 신청 반려 + no payment
payment amount from fee rate at application.paymentDate
payment starts 대기
second payment for same application rejected
actor = context.email
audit application and payment creation
```

Confirmation requirements:

```text
input result DONE|MISMATCH
대기 only
DONE -> 완료
MISMATCH -> 불일치
writes depositorName when supplied, managerId, confirmedAt, audit
```

- [ ] **Step 2: Implement processing Service**

Input:

```js
{ ids: ['app-1'], action: 'APPROVE'|'REJECT', reason: '' }
```

Per ID, load existing application, enforce `status === '접수'`, prevent duplicate payment, update application processing fields, and on approval create:

```js
{
  id: Utilities.getUuid(),
  applicationId: id,
  amount: Number(resolveStudentFeeRate_(before.paymentDate).amountPerSemester),
  paymentDate: before.paymentDate,
  depositorName: '',
  moneyStatus: '대기',
  managerId: context.email,
  confirmedAt: ''
}
```

- [ ] **Step 3: Implement confirmation Service**

Only `대기` rows may transition. Reject unknown `result` values instead of defaulting.

- [ ] **Step 4: Implement five payment APIs using `apiHandler_` and `requireLogin:true`**

Mutation APIs pass Auth context to Services; read APIs do not.

- [ ] **Step 5: Test and commit**

```bash
node scripts/test-student-fee.js
git add src/000_server/080_student_fee/082_payments scripts/test-student-fee.js
git commit -m "feat: add student fee payment workflow"
```

---

### Task 6: Implement refund reads and DAOs

**Files:**
- Create: `083_refunds/fee_refund_requests_sheet_dao.gs`
- Create: `083_refunds/fee_refunds_sheet_dao.gs`
- Create: `083_refunds/fee_refunds_query_service.gs`
- Modify: `scripts/test-student-fee.js`

**Produces:**

```text
findAllFeeRefundRequestRows_
findFeeRefundRequestRowById_
updateFeeRefundRequestRowById_
findAllFeeRefundRows_
findFeeRefundRowById_
findFeeRefundRowByRequestId_
insertFeeRefundRow_
updateFeeRefundRowById_
maskStudentFeeAccountNumber_
calculateRefundableAmount_
calculateFeeRefundData_
getFeeRefundRequestListData_
getFeeRefundRequestDetailData_
```

- [ ] **Step 1: Add refund read tests**

List masks `studentId` and account number. Detail never accepts a client `hasFullAccess` switch. Refundable calculation must resolve relationships through requests because `feeRefunds` has no `paymentId`.

- [ ] **Step 2: Implement refund request DAO**

```js
function findAllFeeRefundRequestRows_() { return readOperationTableClientRows_('feeRefundRequests'); }
function findFeeRefundRequestRowById_(id) { return findOperationTableRowById_('feeRefundRequests', id); }
function updateFeeRefundRequestRowById_(id, changes) { return updateOperationTableRow_('feeRefundRequests', id, changes); }
```

- [ ] **Step 3: Implement refund DAO**

```js
function findAllFeeRefundRows_() { return readOperationTableClientRows_('feeRefunds'); }
function findFeeRefundRowById_(id) { return findOperationTableRowById_('feeRefunds', id); }
function insertFeeRefundRow_(row) { return appendOperationTableRow_('feeRefunds', row); }
function updateFeeRefundRowById_(id, changes) { return updateOperationTableRow_('feeRefunds', id, changes); }
```

`findFeeRefundRowByRequestId_` scans `findAllFeeRefundRows_()`. Do NOT create a fake `paymentId` accessor on the refund DAO.

- [ ] **Step 4: Implement refund queries**

```js
function calculateRefundableAmount_(paymentId) {
  var payment = findFeePaymentRowById_(paymentId);
  if (!payment) throw new Error('납부내역을 찾을 수 없습니다: ' + paymentId);
  var requestIds = findAllFeeRefundRequestRows_().filter(function (r) {
    return String(r.paymentId) === String(paymentId);
  }).map(function (r) { return String(r.id); });
  var used = findAllFeeRefundRows_().filter(function (r) {
    return requestIds.indexOf(String(r.requestId)) >= 0 && ['대기', '완료'].indexOf(r.moneyStatus) >= 0;
  }).reduce(function (sum, r) { return sum + (Number(r.approvedAmount) || 0); }, 0);
  return Math.max((Number(payment.amount) || 0) - used, 0);
}
```

`calculateFeeRefundData_` returns payment amount and refundable amount. List sorts descending by `appliedAt` and masks sensitive fields.

- [ ] **Step 5: Test and commit**

```bash
node scripts/test-student-fee.js
git add src/000_server/080_student_fee/083_refunds scripts/test-student-fee.js
git commit -m "feat: add student fee refund queries"
```

---

### Task 7: Implement refund state machine and APIs

**Files:**
- Create: `083_refunds/fee_refunds_service.gs`
- Create: `083_refunds/fee_refunds_api.gs`
- Modify: `scripts/test-student-fee.js`

**Produces:**

```text
processFeeRefundRequestsData_
confirmFeeRefundData_
api_getFeeRefundRequestList
api_getFeeRefundRequestDetail
api_processFeeRefundRequests
api_calculateFeeRefund
api_confirmFeeRefund
```

- [ ] **Step 1: Add refund mutation RED tests**

Approval:

```text
접수 only
duplicate refund row rejected
approvedAmount defaults to current maximum when omitted
approvedAmount must be >0 and <= maximum
one feeRefunds row created in 대기
actor = context.email
audit request transition and refund creation
```

Batch approve with an explicit single `approvedAmount` and more than one ID must be rejected; per-request maximums may differ.

Confirmation:

```text
대기 only
DONE -> 완료
FAILED -> 실패
writes transferDate, managerId, transferEvidenceId when supplied, audit
```

- [ ] **Step 2: Implement refund processing Service**

Create approved refund row using only current fields:

```js
{
  id: Utilities.getUuid(),
  requestId: requestId,
  approvedAmount: approvedAmount,
  transferDate: '',
  moneyStatus: '대기',
  managerId: context.email,
  transferEvidenceId: '',
  createdAt: getCurrentIsoDateTime_()
}
```

Update request `status`, `managerId`, `processedAt` and audit.

- [ ] **Step 3: Implement confirmation Service**

Input:

```js
{ refundId, result: 'DONE'|'FAILED', transferDate, transferEvidenceId, reason }
```

Reject unknown result or non-`대기` current state.

- [ ] **Step 4: Implement five refund APIs using current API pattern**

- [ ] **Step 5: Test and commit**

```bash
node scripts/test-student-fee.js
git add src/000_server/080_student_fee/083_refunds scripts/test-student-fee.js
git commit -m "feat: add student fee refund workflow"
```

Expected after Task 7: `Student Fee behavior regression tests passed.` except summary/API-contract checks completed in Task 8.

---

### Task 8: Add summary API and make architecture GREEN

**Files:**
- Modify: `082_payments/fee_payments_query_service.gs`
- Modify: `082_payments/fee_payments_api.gs`
- Modify: `scripts/test-student-fee.js`
- Modify: `scripts/verify-student-fee-architecture.js`
- Modify: `scripts/verify-server-architecture.js`

**Produces:**

```text
getStudentFeeSummaryData_
api_getStudentFeeSummary
```

- [ ] **Step 1: Add summary test**

Expected shape:

```js
{
  payers: { total: 2 },
  applications: { total: 3, pending: 1, approved: 1, rejected: 1 },
  payments: { total: 2, pending: 1, completed: 1, mismatch: 0, completedAmount: 20000 },
  refundRequests: { total: 2, pending: 1, approved: 1, rejected: 0 },
  refunds: { total: 1, pending: 1, completed: 0, failed: 0, completedAmount: 0 }
}
```

- [ ] **Step 2: Implement summary as read-only in-memory composition**

Use existing DAO functions only; no new summary DAO. Count by approved status contract and sum completed monetary rows only.

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

- [ ] **Step 4: Update `verify-server-architecture.js` public functions**

Add exactly:

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

Do not add frontend routes.

- [ ] **Step 5: Run Student Fee tests/verifier**

```bash
node scripts/test-student-fee.js
node scripts/verify-student-fee-architecture.js
```

Expected:

```text
Student Fee behavior regression tests passed.
Student Fee architecture verification passed.
```

Fix real code/ownership problems rather than weakening verifier rules.

- [ ] **Step 6: Commit**

```bash
git add src/000_server/080_student_fee scripts/test-student-fee.js scripts/verify-student-fee-architecture.js scripts/verify-server-architecture.js
git commit -m "feat: complete student fee server domain"
```

---

### Task 9: Full cross-domain regression verification

**Files:**
- Modify only if verification finds a real defect.

- [ ] **Step 1: Syntax-check every `080_student_fee/**/*.gs` file**

Use `vm.Script` or temporary `.js` copies with `node --check`. Expected: zero syntax errors.

- [ ] **Step 2: Run all behavior tests**

```bash
node scripts/test-core.js
node scripts/test-auth-iam.js
node scripts/test-event.js
node scripts/test-accounting.js
node scripts/test-settings.js
node scripts/test-student-fee.js
```

Expected: all exit 0.

- [ ] **Step 3: Run all architecture verifiers**

```bash
node scripts/verify-auth-iam-architecture.js
node scripts/verify-event-architecture.js
node scripts/verify-accounting-architecture.js
node scripts/verify-settings-architecture.js
node scripts/verify-student-fee-architecture.js
node scripts/verify-server-architecture.js
```

Expected: all exit 0.

- [ ] **Step 4: Verify schema immutability**

```bash
git diff --exit-code 511b8822fd1b2aa53c201f84cd7813538ea60be6 -- src/000_server/020_schema
```

Expected: no diff.

- [ ] **Step 5: Verify feature artifacts were not reintroduced**

```bash
grep -R "apiV1_\|API_REGISTRY\|callApi_\|Session.getActiveUser\|FormApp\|newTrigger" src/000_server/080_student_fee
```

Expected: no matches.

- [ ] **Step 6: Inspect final diff**

```bash
git diff --check
git status --short
git diff --stat 511b8822fd1b2aa53c201f84cd7813538ea60be6...HEAD
```

Expected scope: Student Fee server files, Student Fee tests/verifier, server verifier public-function list, and implementation documentation only.

- [ ] **Step 7: Commit only if verification required a correction**

```bash
git add <exact-fixed-files>
git commit -m "fix: correct student fee server regression"
```

Do not make an empty verification commit.

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

- Spec coverage: current-schema payer/payment/refund reads, mutations, status transitions, rate resolution, refund balance, audit, login, masking, summary, tests, and architecture checks are covered.
- Non-goals have no implementation tasks: schema changes, FormSync, frontend, export, archive, legacy wrappers, generic DB layer, new IAM permission IDs.
- Type consistency: refund-to-payment traversal uses `feeRefundRequests.paymentId` and `feeRefunds.requestId` everywhere; no nonexistent `feeRefunds.paymentId` or fake payment-index DAO function is used.
- Placeholder scan: no TBD/TODO placeholders are used as instructions.
- Scope: server domain only; UI and Form integration stay separate future work.
