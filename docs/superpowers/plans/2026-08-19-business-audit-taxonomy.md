# Business Audit Taxonomy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify Student Fee, Accounting, and Event audit writes behind one canonical `업무감사로그` contract without changing the existing 9-column sheet schema or rewriting legacy rows.

**Architecture:** Add a single core `writeBusinessAudit_()` service that validates canonical actions/targets and serializes before/after payloads as JSON. Migrate Student Fee and Accounting callers to the common service, then add audit coverage only to Event mutations that already exist. Preserve legacy sheet rows and defer frontend work.

**Tech Stack:** Google Apps Script, Google Sheets OperationDB, Node.js static/regression test scripts, GitHub Actions

**Spec:** `docs/superpowers/specs/2026-08-19-business-audit-taxonomy-design.md`

## Global Constraints

- Keep the existing `업무감사로그` 9-column physical schema unchanged.
- Do not rewrite or normalize existing legacy audit rows.
- All new audit writes must use canonical action codes.
- All new target codes must use OperationDB schema keys.
- `변경전값` and `변경후값` must always be valid JSON text.
- Do not add frontend work.
- Do not implement Event business features that are currently stubs or explicitly blocked by unresolved rules.

---

### Task 1: Add the common business audit contract

**Files:**
- Create: `src/000_server/010_core/business_audit.gs`
- Test: `scripts/test-business-audit-taxonomy.js`

**Interfaces:**
- Consumes: `getOperationDbSchema_()`, `appendOperationTableRow_()`, `getCurrentIsoDateTime_()`
- Produces:
  - `BUSINESS_AUDIT_ACTIONS_`
  - `serializeBusinessAuditValue_(value) -> string`
  - `assertBusinessAuditAction_(actionType) -> string`
  - `assertBusinessAuditTarget_(targetType) -> string`
  - `writeBusinessAudit_(event) -> appended row`

- [ ] **Step 1: Write the failing contract test**

Create `scripts/test-business-audit-taxonomy.js` that loads the new core file in a VM harness and asserts:

```javascript
assert.strictEqual(assertBusinessAuditAction_('CREATE'), 'CREATE');
assert.throws(() => assertBusinessAuditAction_('생성'), /지원하지 않는 감사 행위/);
assert.strictEqual(assertBusinessAuditTarget_('events'), 'events');
assert.throws(() => assertBusinessAuditTarget_('EVENT'), /지원하지 않는 감사 대상/);
assert.strictEqual(JSON.parse(serializeBusinessAuditValue_(undefined)), null);
assert.deepStrictEqual(JSON.parse(serializeBusinessAuditValue_({ status: '승인' })), { status: '승인' });
```

The harness must stub `getOperationDbSchema_()` with at least `businessAuditLogs`, `events`, `feePayers`, `ledger`, and `settlementReports`, and capture rows passed to `appendOperationTableRow_()`.

- [ ] **Step 2: Run the test and verify failure**

Run:

```bash
node scripts/test-business-audit-taxonomy.js
```

Expected: FAIL because `business_audit.gs` and its exported globals/functions do not exist.

- [ ] **Step 3: Implement the common service**

Create `src/000_server/010_core/business_audit.gs` with the exact action list:

```javascript
var BUSINESS_AUDIT_ACTIONS_ = [
  'CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'CONFIRM',
  'IMPORT', 'EXPORT', 'SYNC', 'VALIDATE', 'RECONCILE', 'SETTLE'
];
```

Implement target validation from `getOperationDbSchema_()` and reject `businessAuditLogs` itself as a target.

Implement `serializeBusinessAuditValue_()` so `undefined` becomes `null` and every result is valid JSON text.

Implement:

```javascript
function writeBusinessAudit_(event) {
  event = event || {};
  var actorEmail = String(event.actorEmail || '').trim();
  if (!actorEmail) throw new Error('감사로그 처리자 이메일이 필요합니다.');

  var actionType = assertBusinessAuditAction_(event.actionType);
  var targetType = assertBusinessAuditTarget_(event.targetType);
  var targetId = String(event.targetId == null ? '' : event.targetId).trim();

  return appendOperationTableRow_('businessAuditLogs', {
    id: Utilities.getUuid(),
    occurredAt: getCurrentIsoDateTime_(),
    actorEmail: actorEmail,
    actionType: actionType,
    targetType: targetType,
    targetId: targetId,
    beforeValue: serializeBusinessAuditValue_(event.beforeValue),
    afterValue: serializeBusinessAuditValue_(event.afterValue),
    reason: String(event.reason == null ? '' : event.reason)
  });
}
```

- [ ] **Step 4: Extend the test to verify the stored row contract**

Assert a write such as:

```javascript
writeBusinessAudit_({
  actorEmail: ' user@example.com ',
  actionType: 'UPDATE',
  targetType: 'events',
  targetId: 'EVT-001',
  beforeValue: { status: '준비' },
  afterValue: { status: '진행중' },
  reason: '상태 변경'
});
```

stores trimmed email, canonical codes, and JSON-parsable before/after fields.

- [ ] **Step 5: Run the test**

```bash
node scripts/test-business-audit-taxonomy.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/000_server/010_core/business_audit.gs scripts/test-business-audit-taxonomy.js
git commit -m "feat: add common business audit contract"
```

---

### Task 2: Migrate Student Fee audit writes to canonical taxonomy

**Files:**
- Modify: `src/000_server/080_student_fee/080_common/student_fee_audit_sheet_dao.gs`
- Modify: `src/000_server/080_student_fee/081_payers/fee_payers_service.gs`
- Modify: `src/000_server/080_student_fee/082_payments/fee_payments_service.gs`
- Modify: `src/000_server/080_student_fee/083_refunds/fee_refunds_service.gs`
- Modify: `scripts/test-business-audit-taxonomy.js`
- Regression: `scripts/test-student-fee.js`
- Regression: `scripts/test-student-fee-mutation-consistency.js`

**Interfaces:**
- Consumes: `writeBusinessAudit_(event)` from Task 1
- Produces: Student Fee writes using only canonical action/target codes and structured before/after values

- [ ] **Step 1: Add failing source-contract assertions**

Extend `scripts/test-business-audit-taxonomy.js` to scan Student Fee server files and fail if active audit calls contain legacy action literals:

```text
생성
수정
승인
반려
입금확인
송금확인
```

Also fail if Student Fee code directly calls `appendOperationTableRow_('businessAuditLogs', ...)` outside the core audit file.

- [ ] **Step 2: Run tests and verify failure**

```bash
node scripts/test-business-audit-taxonomy.js
```

Expected: FAIL on existing Student Fee literals/wrapper implementation.

- [ ] **Step 3: Collapse the Student Fee audit DAO into a compatibility wrapper or remove it**

If preserving call-site compatibility temporarily, implement:

```javascript
function writeStudentFeeAudit_(actorEmail, actionType, targetType, targetId, beforeValue, afterValue, reason) {
  return writeBusinessAudit_({
    actorEmail: actorEmail,
    actionType: actionType,
    targetType: targetType,
    targetId: targetId,
    beforeValue: beforeValue,
    afterValue: afterValue,
    reason: reason
  });
}
```

Do not keep a second direct append path.

- [ ] **Step 4: Update payer audit calls**

Change mappings:

```text
생성 -> CREATE / feePayers
수정 -> UPDATE / feePayers
```

Pass the actual object snapshots, not `JSON.stringify(...)` results.

- [ ] **Step 5: Update payment/application audit calls**

Use:

```text
승인 -> APPROVE / feeApplications
반려 -> REJECT / feeApplications
자동 납부내역 생성 -> CREATE / feePayments
입금확인 -> CONFIRM / feePayments
```

For status-only transitions pass:

```javascript
beforeValue: { status: String(plan.before.status || '') },
afterValue: { status: newStatus }
```

and for money confirmation use structured `moneyStatus` objects.

- [ ] **Step 6: Update refund audit calls**

Use:

```text
승인 -> APPROVE / feeRefundRequests
반려 -> REJECT / feeRefundRequests
자동 환불내역 생성 -> CREATE / feeRefunds
송금확인 -> CONFIRM / feeRefunds
```

Again pass objects rather than pre-serialized JSON strings.

- [ ] **Step 7: Run Student Fee and audit tests**

```bash
node scripts/test-business-audit-taxonomy.js
node scripts/test-student-fee.js
node scripts/test-student-fee-mutation-consistency.js
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/000_server/080_student_fee scripts/test-business-audit-taxonomy.js
git commit -m "refactor: standardize student fee audit events"
```

---

### Task 3: Migrate Accounting audit writes to canonical taxonomy

**Files:**
- Modify: `src/000_server/060_accounting/060_common/accounting_audit_sheet_dao.gs`
- Modify: `src/000_server/060_accounting/061_ledger/ledger_service.gs`
- Modify: `src/000_server/060_accounting/062_evidence/evidence_service.gs`
- Modify: `src/000_server/060_accounting/063_reconciliation/bank_transaction_import_service.gs`
- Modify: `src/000_server/060_accounting/063_reconciliation/reconciliation_service.gs`
- Modify: `src/000_server/060_accounting/064_settlement/settlement_service.gs`
- Modify: `scripts/test-business-audit-taxonomy.js`
- Regression: existing Accounting v2 tests

**Interfaces:**
- Consumes: `writeBusinessAudit_(event)`
- Produces: Accounting audit events using schema-key targets and canonical actions

- [ ] **Step 1: Add failing Accounting source-contract assertions**

Extend the audit test to reject these active literals in Accounting audit calls:

```text
'PROCESS'
'SETTLEMENT'
'LEDGER'
'EVIDENCE'
'BANK_TRANSACTION'
'RECONCILIATION'
'SETTLEMENT_REPORT'
```

- [ ] **Step 2: Run and verify failure**

```bash
node scripts/test-business-audit-taxonomy.js
```

Expected: FAIL on current Accounting calls.

- [ ] **Step 3: Collapse `writeAccountingAudit_()` into the common service**

Use the same thin-wrapper shape as Student Fee or replace call sites directly. There must be no direct append to `businessAuditLogs` outside the core service.

- [ ] **Step 4: Normalize ledger actions and targets**

Use:

```text
CREATE / ledger
UPDATE / ledger
DELETE / ledger
```

For the existing `PROCESS` path:
- if `input.action === 'approve'`, write `CONFIRM / ledger`
- otherwise write `UPDATE / ledger`

Pass objects instead of `JSON.stringify(...)` strings.

- [ ] **Step 5: Normalize evidence/import/reconciliation actions**

Use:

```text
VALIDATE / ledgerEvidence
IMPORT / bankTransactions
RECONCILE / reconciliations
```

For batch bank import, use a stable targetId such as `BATCH` and structured after payload:

```javascript
{ savedCount: result.savedCount, duplicateCount: result.duplicateCount }
```

- [ ] **Step 6: Normalize settlement actions**

Use:

```text
SETTLE / settlementReports
CONFIRM / settlementReports
```

Pass the settlement row/changes as objects.

- [ ] **Step 7: Run Accounting audit and regression tests**

```bash
node scripts/test-business-audit-taxonomy.js
node scripts/test-accounting-db-v2-schema.js
node scripts/test-ledger-bank-link-v2.js
node scripts/test-evidence-ocr-v2.js
node scripts/test-reconciliation-v2.js
node scripts/test-settlement-v2.js
node scripts/test-accounting-money-validation.js
node scripts/test-accounting.js
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/000_server/060_accounting scripts/test-business-audit-taxonomy.js
git commit -m "refactor: standardize accounting audit events"
```

---

### Task 4: Add Event audit coverage for event mutations

**Files:**
- Modify: `src/000_server/050_event/051_events/events_service.gs`
- Modify: `scripts/test-business-audit-taxonomy.js`
- Regression: `scripts/test-event.js`
- Regression: `scripts/test-event-consistency-hardening.js`

**Interfaces:**
- Consumes: `writeBusinessAudit_(event)`
- Produces: audit records for event create/update/status/closure mutations

- [ ] **Step 1: Add failing Event coverage assertions**

Add source assertions that `events_service.gs` contains audit writes for all four existing mutation functions:

```text
createEventData_
updateEventData_
updateEventStatusData_
updateEventClosureData_
```

- [ ] **Step 2: Run and verify failure**

```bash
node scripts/test-business-audit-taxonomy.js
```

Expected: FAIL because Event currently has no business audit calls.

- [ ] **Step 3: Audit event creation inside the existing write lock**

After `insertEventRow_(payload)`, write:

```javascript
writeBusinessAudit_({
  actorEmail: payload.managerEmail,
  actionType: 'CREATE',
  targetType: 'events',
  targetId: payload.id,
  beforeValue: null,
  afterValue: withoutInternalRowNumber_(payload),
  reason: '행사 생성'
});
```

- [ ] **Step 4: Audit event update with before/after snapshots**

Read `before` before updating. After update, read `after`, then write `UPDATE / events` with both structured snapshots and return `after`.

- [ ] **Step 5: Make status/closure mutations actor-aware and audited**

Change signatures to accept `context` if the API layer already provides it, or resolve the active user consistently with `createEventData_()`/`updateEventData_()`.

For `updateEventStatusData_()` and `updateEventClosureData_()`:
- capture `before`
- mutate
- capture `after`
- write `UPDATE / events`
- reason `행사 진행상태 변경` or `행사 종료`

- [ ] **Step 6: Run Event tests**

```bash
node scripts/test-business-audit-taxonomy.js
node scripts/test-event.js
node scripts/test-event-consistency-hardening.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/000_server/050_event/051_events/events_service.gs scripts/test-business-audit-taxonomy.js
git commit -m "feat: audit event mutations"
```

---

### Task 5: Add Event applicant and form-sync audit coverage

**Files:**
- Modify: `src/000_server/050_event/052_applicants/applicants_service.gs`
- Modify: `src/000_server/050_event/052_applicants/applicants_form_sync_service.gs`
- Modify: `scripts/test-business-audit-taxonomy.js`
- Regression: `scripts/test-event-form-sync-service.js`
- Regression: `scripts/test-event-form-sync-mapper.js`
- Regression: `scripts/test-event.js`

**Interfaces:**
- Consumes: `writeBusinessAudit_(event)`
- Produces: canonical applicant status and form-sync audit events

- [ ] **Step 1: Add failing source assertions for applicant/form mutation paths**

Require audit calls in:

```text
processApplicantData_
applyApplicantFormSyncData_
```

- [ ] **Step 2: Run and verify failure**

```bash
node scripts/test-business-audit-taxonomy.js
```

Expected: FAIL.

- [ ] **Step 3: Audit applicant approve/reject**

In `processApplicantData_()`:
- capture `before`
- keep `confirmDeposit` blocked exactly as it is today
- on `approve`, write `APPROVE / eventApplications`
- on `reject`, write `REJECT / eventApplications`
- use `{ status: before.status }` and `{ status: after.status, processedAt: after.processedAt }`
- actor email must come from authenticated/session context, not a fabricated value

- [ ] **Step 4: Audit form configuration upsert**

Inside `applyApplicantFormSyncData_()` after form upsert:
- if form existed, write `SYNC / eventForms` with old form snapshot and updated snapshot
- if form was newly created, write `CREATE / eventForms`

- [ ] **Step 5: Audit imported applications as one batch event**

Do not emit one audit row per imported applicant unless required by existing product behavior. Emit one `IMPORT / eventApplications` batch log with:

```javascript
beforeValue: null,
afterValue: {
  eventId: eventId,
  importedApplicationIds: imported.map(function (candidate) { return candidate.applicant.id; }),
  importedCount: imported.length,
  duplicateCount: duplicateCount,
  invalidCount: (candidates.invalidRows || []).length
}
```

Use a targetId such as the eventId for this event-scoped import.

- [ ] **Step 6: Run Event form/applicant regression tests**

```bash
node scripts/test-business-audit-taxonomy.js
node scripts/test-event-form-sync-service.js
node scripts/test-event-form-sync-mapper.js
node scripts/test-event.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/000_server/050_event/052_applicants scripts/test-business-audit-taxonomy.js
git commit -m "feat: audit event applicant workflows"
```

---

### Task 6: Add Event attendance audit coverage

**Files:**
- Modify: `src/000_server/050_event/054_attendance/attendance_service.gs`
- Modify: `scripts/test-business-audit-taxonomy.js`
- Regression: `scripts/test-event.js`

**Interfaces:**
- Consumes: `writeBusinessAudit_(event)`
- Produces: one canonical confirmation event per attendance row changed

- [ ] **Step 1: Add failing attendance coverage assertion**

Require `applyAttendanceChangesData_()` to call the common audit service.

- [ ] **Step 2: Run and verify failure**

```bash
node scripts/test-business-audit-taxonomy.js
```

Expected: FAIL.

- [ ] **Step 3: Capture before/after state per attendance item**

For each item inside the existing write lock:
- resolve actor email once
- if an attendance row exists, preserve its snapshot before update
- if no row exists, use `null` beforeValue
- create/update the row
- read/build final row

- [ ] **Step 4: Write canonical attendance audit event**

Use:

```text
CONFIRM / eventAttendance
```

with `targetId` equal to attendance row ID, structured before/after snapshots, and reason `행사 출석 확인`.

- [ ] **Step 5: Run tests**

```bash
node scripts/test-business-audit-taxonomy.js
node scripts/test-event.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/000_server/050_event/054_attendance/attendance_service.gs scripts/test-business-audit-taxonomy.js
git commit -m "feat: audit event attendance changes"
```

---

### Task 7: Enforce architecture and run the complete regression suite

**Files:**
- Modify: `scripts/test-business-audit-taxonomy.js`
- Optional create: `.github/workflows/business-audit-taxonomy.yml`
- Verify: all touched source files

**Interfaces:**
- Consumes: all previous tasks
- Produces: automated prevention of taxonomy drift and direct audit-table writes

- [ ] **Step 1: Add repository-wide direct-write guard**

The audit test must recursively scan `src/000_server` and fail when this appears outside `010_core/business_audit.gs`:

```javascript
appendOperationTableRow_('businessAuditLogs'
```

Compatibility wrappers may call `writeBusinessAudit_()` only.

- [ ] **Step 2: Add canonical literal guard**

Scan audit call sites and fail if known legacy literals remain in active server audit writes, including:

```text
수기등록
폼접수
폼접수실패
생성
수정
승인
반려
입금확인
송금확인
PROCESS
SETTLEMENT
LEDGER
EVIDENCE
BANK_TRANSACTION
RECONCILIATION
SETTLEMENT_REPORT
```

Do not scan documentation or existing Google Sheet data as if they were executable call sites.

- [ ] **Step 3: Add a workflow if no suitable workflow already runs the new test**

Create `.github/workflows/business-audit-taxonomy.yml` with Node setup and:

```yaml
- run: node scripts/test-business-audit-taxonomy.js
```

Keep it limited to repository checkout + Node execution; no external secrets are needed.

- [ ] **Step 4: Run the audit contract test**

```bash
node scripts/test-business-audit-taxonomy.js
```

Expected: PASS.

- [ ] **Step 5: Run all directly affected domain tests**

```bash
node scripts/test-student-fee.js
node scripts/test-student-fee-mutation-consistency.js
node scripts/test-accounting-db-v2-schema.js
node scripts/test-ledger-bank-link-v2.js
node scripts/test-evidence-ocr-v2.js
node scripts/test-reconciliation-v2.js
node scripts/test-settlement-v2.js
node scripts/test-accounting-money-validation.js
node scripts/test-accounting.js
node scripts/test-event.js
node scripts/test-event-consistency-hardening.js
node scripts/test-event-form-sync-service.js
node scripts/test-event-form-sync-mapper.js
```

Expected: all PASS.

- [ ] **Step 6: Run architecture verification scripts**

```bash
node scripts/verify-accounting-architecture.js
node scripts/verify-event-architecture.js
node scripts/verify-event-form-sync-architecture.js
node scripts/verify-student-fee-architecture.js
node scripts/verify-system-consistency-architecture.js
```

Expected: all PASS.

- [ ] **Step 7: Verify no OperationDB migration is necessary**

Confirm `getOperationDbSchema_().businessAuditLogs.fields` still maps exactly to the existing 9 columns and that implementation contains no code rewriting existing audit rows.

- [ ] **Step 8: Commit final guards/workflow**

```bash
git add scripts/test-business-audit-taxonomy.js .github/workflows/business-audit-taxonomy.yml
git commit -m "test: enforce business audit taxonomy"
```

---

## Self-review checklist

- Spec coverage: common service, Student Fee migration, Accounting migration, Event existing mutations, JSON contract, immutable legacy data, no physical schema migration, no frontend work are all mapped to tasks.
- Placeholder scan: no implementation TODO/TBD placeholders are used.
- Interface consistency: every domain consumes `writeBusinessAudit_(event)` and canonical target names come from OperationDB schema keys.
- Event scope: only implemented mutations are audited; blocked `confirmDeposit` and currently stubbed payment/refund services are not implemented as part of this plan.
