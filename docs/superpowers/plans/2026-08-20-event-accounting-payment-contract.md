# Event–Accounting Payment Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved Event ↔ Accounting payment boundary so Event records operational payment facts, Accounting reconciliation matches them to bank transactions, and ledger rows trace back to Event payments without cross-domain coupling.

**Architecture:** `eventApplications.appliedFee` remains the only expected-fee source of truth. `eventPayments` stores only operationally confirmed deposits; Accounting reads normalized Event payment facts through a narrow query boundary, performs reconciliation against `bankTransactions`, and creates/links `ledger` rows with `businessType = EVENT_PAYMENT` and `businessId = eventPayment.id`. Event never reads or mutates Accounting internals.

**Tech Stack:** Google Apps Script (`.gs`), OperationDB/Spreadsheet-backed DAO layer, Node.js contract/regression tests, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-20-event-accounting-payment-contract-design.md`

## Global Constraints

- `eventApplications.appliedFee` is the sole expected-fee source of truth.
- `eventPayments` must not contain bank transaction, ledger, or reconciliation foreign keys.
- Event mutation code must not call Accounting ledger/reconciliation services.
- Accounting may consume Event payment facts only through an explicit read boundary.
- One `eventPayment.id` may be claimed by at most one active ledger row.
- One bank transaction may be claimed by at most one active ledger row.
- Event and Accounting audits remain separate.
- Code/schema contract must be GREEN before any physical OperationDB migration.
- Physical OperationDB migration requires a fresh backup first.

---

## File Structure

### Event payment
- `src/000_server/050_event/053_payment/payment_api.gs` — new public Event payment API entry points.
- `src/000_server/050_event/053_payment/payment_service.gs` — payment mutation validation and business rules.
- `src/000_server/050_event/053_payment/payment_query_service.gs` — Event read models and Accounting-safe normalized payment facts.
- `src/000_server/050_event/053_payment/payment_sheet_dao.gs` — `eventPayments` table access only.

### Accounting
- `src/000_server/060_accounting/063_reconciliation/reconciliation_query_service.gs` — candidate building using bank rows and normalized Event payment facts.
- `src/000_server/060_accounting/063_reconciliation/reconciliation_service.gs` — match/application workflow and Event-payment ledger creation path.
- `src/000_server/060_accounting/061_ledger/ledger_service.gs` — duplicate business-source claim invariant.

### Schema / verification / tests
- `src/000_server/010_core/operation_schema.gs` — remove `expectedAmount` from canonical `eventPayments` schema contract.
- `scripts/test-event-payment-contract.js` — Event mutation/read-boundary behavior.
- `scripts/test-event-accounting-payment-integration.js` — reconciliation + ledger source-link behavior.
- `scripts/verify-event-architecture.js` — Event ownership and read-only query rules.
- `scripts/verify-accounting-architecture.js` — Accounting ownership/dependency rules.
- `scripts/test-operation-business-key-integrity.js` or dedicated schema contract test — assert the final `eventPayments` physical contract has no redundant expected amount.

---

### Task 1: Lock the Event Payment Runtime Contract

**Files:**
- Create: `scripts/test-event-payment-contract.js`
- Modify: `src/000_server/050_event/053_payment/payment_service.gs`
- Modify: `src/000_server/050_event/053_payment/payment_query_service.gs`
- Modify: `src/000_server/050_event/053_payment/payment_sheet_dao.gs`

**Interfaces:**
- Consumes: `findEventApplicationRowById_(applicationId)`, `generateEventId_` or the repository's existing Event ID generator, `getCurrentIsoDateTime_()`, Event audit helper, Event actor/context helper.
- Produces: `createEventPaymentData_(request, context)`, `updateEventPaymentData_(request, context)`, `buildEventPaymentTotalsByApplicationId_()`, `buildEventPaymentAccountingFacts_()`.

- [ ] **Step 1: Write failing tests for payment creation validation**

Test these cases in `scripts/test-event-payment-contract.js`:

```js
assert.throws(function () {
  context.createEventPaymentData_({ applicationId: '' }, { user: { email: 'staff@example.com' } });
});

var created = context.createEventPaymentData_({
  applicationId: 'APP-1',
  paidAmount: 12000,
  paymentDate: '2026-08-20',
  depositorName: '김학생'
}, { user: { email: 'staff@example.com' } });

assert.strictEqual(created.applicationId, 'APP-1');
assert.strictEqual(created.paidAmount, 12000);
assert.strictEqual(created.depositorName, '김학생');
assert.ok(created.confirmedAt);
```

Also assert that payment creation payload contains no `expectedAmount`, `bankTransactionId`, `ledgerId`, or `reconciliationId`.

- [ ] **Step 2: Run the new test and verify RED**

Run:

```bash
node scripts/test-event-payment-contract.js
```

Expected: FAIL because `createEventPaymentData_` / `buildEventPaymentAccountingFacts_` are not implemented.

- [ ] **Step 3: Implement minimal Event payment mutation rules**

`createEventPaymentData_(request, context)` must:

```js
// required
applicationId
paidAmount > 0
paymentDate
// optional but normalized
depositorName
moneyStatus default '확인'
```

Behavior:
- application must exist;
- create one `eventPayments` row only when payment is operationally confirmed;
- manager email comes from Event actor/context, never the request body;
- confirmed timestamp comes from the server clock;
- no Accounting IDs are accepted or persisted;
- write Event business audit after successful insert.

`updateEventPaymentData_` may change only Event-owned payment fields and must write Event audit.

- [ ] **Step 4: Add normalized Accounting read boundary**

Implement:

```js
function buildEventPaymentAccountingFacts_() {
  // return normalized immutable read-model rows:
  // paymentId, applicationId, eventId, paidAmount, paymentDate,
  // depositorName, moneyStatus, confirmedAt
}
```

It must join `eventPayments.applicationId` to `eventApplications` for `eventId`; it must not expose sheet row numbers or Accounting IDs.

- [ ] **Step 5: Run focused tests**

```bash
node scripts/test-event-payment-contract.js
node scripts/test-event.js
node scripts/test-event-payment-boundary.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/test-event-payment-contract.js src/000_server/050_event/053_payment
git commit -m "feat: add event payment mutation contract"
```

---

### Task 2: Add Public Event Payment APIs Without Accounting Coupling

**Files:**
- Create: `src/000_server/050_event/053_payment/payment_api.gs`
- Modify: `scripts/test-event-payment-contract.js`
- Modify: `scripts/verify-event-architecture.js`

**Interfaces:**
- Consumes: `apiHandler_`, `eventApiAccess_('edit')`, Event request parser conventions, `createEventPaymentData_`, `updateEventPaymentData_`.
- Produces: `api_createEventPayment(input)`, `api_updateEventPayment(input)`.

- [ ] **Step 1: Extend tests for API contract**

Assert that both API functions:
- use `apiHandler_`;
- require login;
- use Event edit access;
- delegate to Event payment service;
- contain no Accounting service symbol references.

- [ ] **Step 2: Verify RED**

```bash
node scripts/test-event-payment-contract.js
```

Expected: FAIL because `payment_api.gs` does not exist.

- [ ] **Step 3: Implement minimal APIs**

Use the same API wrapper pattern already used by Event applicant/attendance APIs. Do not add bank matching or ledger behavior.

- [ ] **Step 4: Update Event architecture verifier**

Require:
- `053_payment/payment_api.gs`
- mutation ownership in `payment_service.gs`
- Accounting-safe read function ownership in `payment_query_service.gs`

Forbid references from `050_event/**` to:
- `bankTransactions`
- `findBankTransaction*`
- `createLedgerEntryData_`
- `linkLedgerBankTransactionData_`
- `reconciliation*` mutation functions

- [ ] **Step 5: Run focused verification**

```bash
node scripts/test-event-payment-contract.js
node scripts/verify-event-architecture.js
node scripts/verify-internal-function-naming.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/000_server/050_event/053_payment/payment_api.gs scripts/test-event-payment-contract.js scripts/verify-event-architecture.js
git commit -m "feat: expose event payment mutations"
```

---

### Task 3: Make Accounting Reconciliation Consume Event Payment Facts

**Files:**
- Create: `scripts/test-event-accounting-payment-integration.js`
- Modify: `src/000_server/060_accounting/063_reconciliation/reconciliation_query_service.gs`
- Modify: `scripts/verify-accounting-architecture.js`

**Interfaces:**
- Consumes: `buildEventPaymentAccountingFacts_()`, `listBankTransactionRows_()`.
- Produces: `buildEventPaymentReconciliationCandidates_(request)` returning bank/Event-payment candidate pairs with deterministic match evidence.

- [ ] **Step 1: Write failing candidate tests**

Cover at minimum:

```js
// exact amount + same date + same depositor -> strongest candidate
// exact amount + near date + different depositor -> weaker candidate
// mismatched amount -> must not be auto-normal
// already-ledger-claimed eventPayment -> excluded from available source candidates
```

Candidate records should expose:

```js
{
  bankTransactionId,
  eventPaymentId,
  eventId,
  applicationId,
  bankAmount,
  paidAmount,
  amountMatches,
  dateDistanceDays,
  depositorMatches,
  score,
  result
}
```

Do not silently auto-link based on name alone.

- [ ] **Step 2: Verify RED**

```bash
node scripts/test-event-accounting-payment-integration.js
```

Expected: FAIL because the Event-payment reconciliation candidate builder does not exist.

- [ ] **Step 3: Implement candidate builder**

Rules:
- Accounting calls only `buildEventPaymentAccountingFacts_()` for Event payment data;
- exact amount is mandatory for a `정상` candidate;
- date/depositor contribute evidence/ranking;
- ambiguous multiple equal candidates remain `확인필요`;
- do not mutate Event rows.

- [ ] **Step 4: Add architecture checks**

Accounting may reference `buildEventPaymentAccountingFacts_`, but Accounting files must not call `listEventPaymentClientRows_`, `insertEventPaymentRow_`, or `updateEventPaymentRowById_` directly.

- [ ] **Step 5: Run focused tests**

```bash
node scripts/test-event-accounting-payment-integration.js
node scripts/test-reconciliation-v2.js
node scripts/verify-accounting-architecture.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/test-event-accounting-payment-integration.js src/000_server/060_accounting/063_reconciliation/reconciliation_query_service.gs scripts/verify-accounting-architecture.js
git commit -m "feat: add event payment reconciliation candidates"
```

---

### Task 4: Enforce Ledger Business-Source Idempotency

**Files:**
- Modify: `src/000_server/060_accounting/061_ledger/ledger_service.gs`
- Modify: `scripts/test-event-accounting-payment-integration.js`

**Interfaces:**
- Consumes: `listLedgerRows_()`.
- Produces: invariant inside ledger creation/update that rejects duplicate active `(businessType, businessId)` claims for `EVENT_PAYMENT`.

- [ ] **Step 1: Write failing duplicate-claim tests**

Required behaviors:

```js
// first active ledger claim for EVENT_PAYMENT/PAY-1 succeeds
// second active ledger claim for EVENT_PAYMENT/PAY-1 throws
// a voided prior ledger does not block a new active claim
// bank transaction duplicate invariant remains unchanged
```

- [ ] **Step 2: Verify RED**

```bash
node scripts/test-event-accounting-payment-integration.js
```

Expected: FAIL on duplicate business source claim.

- [ ] **Step 3: Implement source-claim validation**

Add a helper such as:

```js
function assertLedgerBusinessSourceAvailable_(businessType, businessId, currentLedgerId) {}
```

Invoke it from both create and update paths when `businessType === 'EVENT_PAYMENT'` and `businessId` is present.

- [ ] **Step 4: Run ledger and integration tests**

```bash
node scripts/test-event-accounting-payment-integration.js
node scripts/test-accounting.js
node scripts/test-ledger-bank-link-v2.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/000_server/060_accounting/061_ledger/ledger_service.gs scripts/test-event-accounting-payment-integration.js
git commit -m "feat: guard event payment ledger claims"
```

---

### Task 5: Create Ledger from a Confirmed Reconciliation Match

**Files:**
- Modify: `src/000_server/060_accounting/063_reconciliation/reconciliation_service.gs`
- Modify: `scripts/test-event-accounting-payment-integration.js`

**Interfaces:**
- Consumes: selected `eventPaymentId`, selected `bankTransactionId`, normalized Event payment fact, bank row, `createLedgerEntryData_`.
- Produces: `createLedgerFromEventPaymentReconciliationData_(request, context)`.

- [ ] **Step 1: Write failing ledger-creation integration test**

Expected ledger request:

```js
{
  bank_transaction_id: 'BANK-1',
  transaction_type: '수입',
  transaction_date: '<bank transaction date>',
  amount: 12000,
  counterparty: '<depositor/bank description>',
  event_id: 'EVENT-1',
  source: 'BANK',
  business_type: 'EVENT_PAYMENT',
  business_id: 'PAY-1'
}
```

Also assert:
- bank amount must be positive income and equal to payment amount for a normal confirmed link;
- Event payment must exist;
- Event payment is not mutated;
- duplicate source claim is rejected by ledger service.

- [ ] **Step 2: Verify RED**

```bash
node scripts/test-event-accounting-payment-integration.js
```

- [ ] **Step 3: Implement reconciliation mutation**

The function must:
1. resolve selected bank transaction;
2. resolve Event payment through the read boundary;
3. validate amount and source availability;
4. call `createLedgerEntryData_` with the canonical Event-payment linkage;
5. write Accounting audit through the existing ledger/reconciliation audit paths;
6. return the created ledger plus refreshed reconciliation result/snapshot as appropriate.

- [ ] **Step 4: Run reconciliation/ledger tests**

```bash
node scripts/test-event-accounting-payment-integration.js
node scripts/test-reconciliation-v2.js
node scripts/test-accounting.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/000_server/060_accounting/063_reconciliation/reconciliation_service.gs scripts/test-event-accounting-payment-integration.js
git commit -m "feat: create ledger from event payment reconciliation"
```

---

### Task 6: Remove `expectedAmount` from the Canonical Runtime Schema

**Files:**
- Modify: `src/000_server/010_core/operation_schema.gs`
- Modify: any Event payment mapper/query tests that still mention `expectedAmount`
- Modify/Create: schema contract test as appropriate

**Interfaces:**
- Consumes: canonical OperationDB schema declaration.
- Produces: `eventPayments` runtime schema with no expected-amount field.

- [ ] **Step 1: Write failing schema assertion**

Assert that canonical `eventPayments` fields contain:

```text
id, applicationId, paidAmount, paymentDate, depositorName, moneyStatus, managerEmail, confirmedAt
```

and do not contain `expectedAmount`.

- [ ] **Step 2: Verify RED**

Run the dedicated schema test or the repository's OperationDB schema contract test.

- [ ] **Step 3: Remove runtime `expectedAmount` references**

Do not replace them with a second derived storage field. Views needing expected fee must join to `eventApplications.appliedFee`.

- [ ] **Step 4: Run all Event/Accounting/schema tests**

```bash
node scripts/test-event-payment-contract.js
node scripts/test-event-accounting-payment-integration.js
node scripts/test-event.js
node scripts/test-accounting.js
node scripts/test-operation-business-key-integrity.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/000_server/010_core/operation_schema.gs scripts
git commit -m "refactor: remove redundant event payment expected amount"
```

---

### Task 7: Full Architecture and Regression Gate

**Files:**
- Modify only if a verifier legitimately encodes an old approved contract.

- [ ] **Step 1: Run complete Node regression suite**

```bash
set -euo pipefail
for test_file in scripts/test-*.js; do node "$test_file"; done
```

Expected: all PASS.

- [ ] **Step 2: Run every architecture/naming verifier**

```bash
set -euo pipefail
for verify_file in scripts/verify-*.js; do node "$verify_file"; done
```

Expected: all PASS.

- [ ] **Step 3: Verify cross-domain forbidden references**

Search `src/000_server/050_event` and confirm no direct references to Accounting bank/ledger/reconciliation mutation internals.

Search Accounting reconciliation and confirm it does not call Event sheet DAO primitives directly.

- [ ] **Step 4: Open/update draft PR and verify GitHub Actions**

Require all repository workflows triggered by the PR to be successful before declaring code ready for DB migration.

- [ ] **Step 5: Commit any verifier-only alignment**

```bash
git add scripts/verify-*.js
git commit -m "test: enforce event accounting payment boundary"
```

Skip this commit if no verifier change is needed.

---

### Task 8: Physical OperationDB Migration — Only After Code Is GREEN

**Files:**
- No repository code unless a migration log/doc is intentionally added.
- Physical target: actual OperationDB `eventPayments` sheet.

**Interfaces:**
- Consumes: GREEN canonical schema from Task 6 and successful CI from Task 7.
- Produces: physical `eventPayments` sheet without `expectedAmount`, with all existing other payment data preserved.

- [ ] **Step 1: Re-read live OperationDB metadata and exact `eventPayments` header**

Do not rely on old screenshots or remembered column positions.

- [ ] **Step 2: Create a fresh Drive-native backup**

Use a timestamped title such as:

```text
학생회_운영_2026_BACKUP_before_event_payment_contract_YYYYMMDD_HHmm
```

Verify the copy exists before mutation.

- [ ] **Step 3: Confirm `expectedAmount` is not used as unique surviving source data**

Compare live `eventPayments.expectedAmount` with joined `eventApplications.appliedFee` where possible. If material conflicting legacy values exist, stop the migration and report them instead of discarding information.

- [ ] **Step 4: Remove only the redundant physical column**

Preserve all existing rows, formatting, validations, filters, and unrelated columns. Do not create bank/ledger references in Event data.

- [ ] **Step 5: Verify final header and sample rows**

Required final fields:

```text
행사입금ID, 신청ID, 실제입금액, 입금일, 입금자명, 금전처리상태, 담당자이메일, 확인일시
```

Use the actual established Korean header names from `operation_schema.gs` if they differ in wording; semantic field set must match the canonical runtime schema exactly.

- [ ] **Step 6: Report migration evidence**

Record:
- backup file ID/title;
- pre/post header;
- preserved row count;
- whether any legacy conflicts were detected.

Do not claim production Apps Script deployment was updated unless deployment/version is independently verified.

---

## Final Verification Checklist

- [ ] Event payment creation occurs only for actual operationally confirmed payments.
- [ ] Event payment rows contain no Accounting foreign keys.
- [ ] Expected fee is derived only from `eventApplications.appliedFee`.
- [ ] Partial/multiple payments continue to sum by application.
- [ ] Accounting reads Event payment facts only through the explicit query boundary.
- [ ] Reconciliation can compare Event payment facts to bank transactions.
- [ ] Ledger creation uses `businessType = EVENT_PAYMENT` and `businessId = eventPayment.id`.
- [ ] Duplicate active ledger source claims are rejected.
- [ ] Event audit and Accounting audit remain separate.
- [ ] Full tests/verifiers/CI are GREEN before physical migration.
- [ ] OperationDB backup exists before column removal.
- [ ] Final live `eventPayments` schema has no redundant expected amount.
