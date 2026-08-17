# Accounting Standalone Feature Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the approved Accounting functionality from `codex/apps-script-수입-지출-관리` into the current domain-layered `main` architecture without merging the standalone app or changing unrelated business domains.

**Architecture:** Keep `061_ledger` and `062_evidence` as the existing source of truth, add focused `063_reconciliation` and `064_settlement` feature areas, and persist all new data in OperationDB. APIs remain thin `apiHandler_` wrappers; mutations live in services, reads/composition in query services, physical Sheet access in DAOs, and Drive/OCR work in file services.

**Tech Stack:** Google Apps Script V8, Google Sheets OperationDB, Google Drive / Drive Advanced Service OCR, vanilla HTML/JS frontend, Node.js VM-based regression tests, repository architecture verifier scripts.

## Global Constraints

- Do not merge the standalone branch or copy its monolithic `Code.gs` / `index.html` structure.
- Preserve current `main` API conventions and `apiHandler_({ requireLogin: true })` behavior.
- Do not create a separate Accounting Spreadsheet or standalone `PROCESS_LOG`.
- Use existing `businessAuditLogs` for Accounting mutation/process audit records.
- Do not add `departmentId` to `ledger`; department-based filters and settlement are out of scope.
- Settlement supports period-based overall settlement only; event settlement is out of scope.
- Only `ledger.matchStatus === '정상'` and non-deleted active ledger entries are eligible for settlement.
- OCR supports image/PDF inputs only; CSV/Excel parsing is out of scope.
- Do not persist raw OCR text in OperationDB.
- Automatic reconciliation covers both income and expense, but only same-direction ledger candidates.
- Reconciliation item statuses are exactly `정상`, `확인필요`, `원장누락의심`; connection origin belongs in `matchMethod`.
- Keep OCR upload separate from official reconciliation execution.
- `reconciliation` remains the period-level reconciliation header; `reconciliationItems` stores row-level matching results.
- If account opening/closing balance cannot be derived from source data, store it as blank rather than fabricating `0`.
- No actual XLSX/PDF settlement file generation in this phase; export returns structured export data.
- No unrelated refactors, generic repositories, classes, dependency-injection framework, or placeholder scaffolding.

---

## File Structure

### Existing files to modify

- `src/000_server/010_core/config.gs` — add OperationDB table names for new Accounting tables.
- `src/000_server/020_schema/operation_db_schema.gs` — add `ledger.recordStatus` and schemas/FKs for the four new tables.
- `src/000_server/060_accounting/060_common/accounting_query_service.gs` — keep cross-feature read composition only; adjust active-ledger filtering and common summary behavior where appropriate.
- `src/000_server/060_accounting/061_ledger/ledger_api.gs` — add summary/update/delete APIs and explicit draft creation contract.
- `src/000_server/060_accounting/061_ledger/ledger_service.gs` — implement create/draft/update/soft-delete/process mutations with `recordStatus`.
- `src/000_server/060_accounting/061_ledger/ledger_sheet_dao.gs` — ledger-only Sheet persistence helpers.
- `src/000_server/060_accounting/062_evidence/evidence_api.gs` — expose evidence audit list.
- `src/000_server/060_accounting/062_evidence/evidence_service.gs` — preserve evidence save behavior and add audit composition only if mutation behavior is required.
- `src/400_accounting/410_ledger/accounting_ledger_js.html` — wire summary/update/delete/draft behavior while preserving current UI system.
- `src/400_accounting/420_reconciliation/Accounting_Reconciliation_View.html` — enable upload/run/detail/manual-action controls already represented by the current view.
- `src/400_accounting/420_reconciliation/accounting_reconciliation_js.html` — replace TODO/empty state with real APIs.
- `src/400_accounting/430_settlement/Accounting_Settlement_View.html` — support period-based overall settlement and history controls only.
- `src/400_accounting/430_settlement/accounting_settlement_js.html` — enable settlement generation/history/export-data flow.
- `scripts/test-accounting.js` — behavior regression tests for every new Accounting rule.
- `scripts/verify-accounting-architecture.js` — enforce ownership for new Accounting feature files and OperationDB tables.

### New server files

`src/000_server/060_accounting/063_reconciliation/`

- `reconciliation_api.gs` — public APIs only.
- `reconciliation_service.gs` — official run creation, manual linking, create-ledger-and-link mutations.
- `reconciliation_query_service.gs` — list/detail/candidate/preview composition and matching algorithm.
- `reconciliation_sheet_dao.gs` — `reconciliation` header and `reconciliationItems` physical persistence.
- `bank_transaction_sheet_dao.gs` — `bankTransactions` physical persistence and duplicate lookup.
- `bank_ocr_sheet_dao.gs` — `bankOcrLogs` persistence.
- `bank_ocr_service.gs` — file validation, OCR, parser orchestration, dedupe/save, preview generation.
- `bank_ocr_file_service.gs` — Drive Advanced Service OCR and temporary-document cleanup.
- `bank_transaction_parser.gs` — income/expense direction, date, amount, counterparty and description parsing.

`src/000_server/060_accounting/064_settlement/`

- `settlement_api.gs` — public APIs only.
- `settlement_service.gs` — immutable settlement snapshot creation and audit logging.
- `settlement_query_service.gs` — live summary, report list/detail, export-data composition.
- `settlement_sheet_dao.gs` — `settlementReports` physical persistence.

---

### Task 1: Extend OperationDB for Accounting lifecycle and new tables

**Files:**
- Modify: `src/000_server/010_core/config.gs`
- Modify: `src/000_server/020_schema/operation_db_schema.gs`
- Modify: `scripts/test-accounting.js`
- Modify: `scripts/verify-accounting-architecture.js`

**Interfaces:**
- Produces `OPERATION_TABLES.bankTransactions`, `OPERATION_TABLES.bankOcrLogs`, `OPERATION_TABLES.reconciliationItems`, `OPERATION_TABLES.settlementReports`.
- Produces `ledger.recordStatus` with values `ACTIVE`, `DRAFT`, `DELETED`.
- Produces schema keys `bankTransactions`, `bankOcrLogs`, `reconciliationItems`, `settlementReports` for use by DAOs in later tasks.

- [ ] **Step 1: Write failing schema assertions in `scripts/test-accounting.js`**

Add a schema-loading test that evaluates `config.gs` and `operation_db_schema.gs` in a VM and asserts:

```js
assert.strictEqual(context.OPERATION_TABLES.bankTransactions, '계좌거래');
assert.strictEqual(context.OPERATION_TABLES.bankOcrLogs, '계좌OCR로그');
assert.strictEqual(context.OPERATION_TABLES.reconciliationItems, '감사대사상세');
assert.strictEqual(context.OPERATION_TABLES.settlementReports, '결산보고서');

var schema = context.getOperationDbSchema_();
assert.strictEqual(schema.ledger.fields.recordStatus, '레코드상태');
assert.deepStrictEqual(schema.reconciliationItems.foreignKeys, [
  { field: 'reconciliationId', refDatabase: 'operation', refTable: 'reconciliation', refField: 'id' },
  { field: 'bankTransactionId', refDatabase: 'operation', refTable: 'bankTransactions', refField: 'id' },
  { field: 'ledgerId', refDatabase: 'operation', refTable: 'ledger', refField: 'id', optional: true }
]);
```

The exact new table fields must match the approved spec:

```text
bankTransactions: id, transactionAt, expense, counterparty, description, amount, sourceFileName, createdAt
bankOcrLogs: id, fileName, status, extractedCount, errorMessage, createdAt
reconciliationItems: id, reconciliationId, bankTransactionId, ledgerId, status, differenceAmount, matchMethod, note, createdAt, updatedAt
settlementReports: id, startDate, endDate, totalIncome, totalExpense, balance, incomeCount, expenseCount, evidenceCount, status, managerId, createdAt
```

- [ ] **Step 2: Run the accounting test to verify failure**

Run:

```bash
node scripts/test-accounting.js
```

Expected: FAIL because the new table constants/schema fields do not exist yet.

- [ ] **Step 3: Add OperationDB constants and schema entries**

Update `config.gs`:

```js
var OPERATION_TABLES = {
  // existing keys unchanged
  ledger: '수입지출원장',
  evidence: '거래증빙',
  reconciliation: '감사대사',
  bankTransactions: '계좌거래',
  bankOcrLogs: '계좌OCR로그',
  reconciliationItems: '감사대사상세',
  settlementReports: '결산보고서'
};
```

Add `recordStatus: '레코드상태'` to `ledger.fields` and add the four schema blocks with the exact fields above. `reconciliationItems.ledgerId` is logically optional; FK validation must allow blank values for unmatched rows rather than requiring a ledger row.

- [ ] **Step 4: Extend architecture verification for table ownership targets**

Teach `verify-accounting-architecture.js` that later source files must exclusively own the new table access:

```text
bankTransactions     -> 063_reconciliation/bank_transaction_sheet_dao.gs
bankOcrLogs          -> 063_reconciliation/bank_ocr_sheet_dao.gs
reconciliation       -> 063_reconciliation/reconciliation_sheet_dao.gs
reconciliationItems  -> 063_reconciliation/reconciliation_sheet_dao.gs
settlementReports    -> 064_settlement/settlement_sheet_dao.gs
```

At this task, gate ownership checks behind `exists_(...)` so the schema commit can pass before new feature files are created. Task 4 removes that temporary conditional when the files exist.

- [ ] **Step 5: Run schema tests and architecture verifier**

Run:

```bash
node scripts/test-accounting.js
node scripts/verify-accounting-architecture.js
```

Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add src/000_server/010_core/config.gs \
  src/000_server/020_schema/operation_db_schema.gs \
  scripts/test-accounting.js scripts/verify-accounting-architecture.js
git commit -m "feat: extend accounting operation schema"
```

---

### Task 2: Complete ledger lifecycle and mutation APIs

**Files:**
- Modify: `src/000_server/060_accounting/060_common/accounting_query_service.gs`
- Modify: `src/000_server/060_accounting/061_ledger/ledger_api.gs`
- Modify: `src/000_server/060_accounting/061_ledger/ledger_service.gs`
- Modify: `src/000_server/060_accounting/061_ledger/ledger_sheet_dao.gs`
- Modify: `scripts/test-accounting.js`
- Modify: `scripts/verify-accounting-architecture.js`

**Interfaces:**
- Produces `api_getLedgerSummary(filter)`.
- Produces `api_updateLedgerEntry(request)`.
- Produces `api_deleteLedgerEntry(request)`.
- Refines `api_saveLedgerDraft(request)` to persist `recordStatus: 'DRAFT'`.
- Produces internal `updateLedgerEntry_(input, context)`, `softDeleteLedgerEntry_(input, context)`.
- All ordinary creates persist `recordStatus: 'ACTIVE'`.
- Query composition excludes `recordStatus === 'DELETED'` from normal ledger lists; draft visibility is preserved where the current ledger page expects drafts.

- [ ] **Step 1: Add failing lifecycle tests**

Add tests that assert:

```js
// create
assert.strictEqual(inserted.recordStatus, 'ACTIVE');

// draft
context.saveLedgerDraft_({ amount: 1000 }, { user: { email: 'm@example.com' } });
assert.strictEqual(inserted.recordStatus, 'DRAFT');

// update preserves createdAt/id and changes mutable business fields
// delete updates recordStatus only; it does not physically remove a row
// normal query excludes DELETED
// settlement eligibility helper excludes DRAFT and DELETED
```

Also test `api_getLedgerSummary` with one income, one expense, one draft, one deleted row and require summary values to ignore deleted rows while reporting pending/confirmation counts using the current UI-compatible statuses.

- [ ] **Step 2: Run tests to verify failure**

```bash
node scripts/test-accounting.js
```

Expected: FAIL on missing lifecycle fields/functions.

- [ ] **Step 3: Implement DAO mutation helpers**

Keep all `ledger` physical access in `ledger_sheet_dao.gs`:

```js
function findAllLedgerRows_() {
  return readOperationTableRows_('ledger');
}

function insertLedgerRow_(row) {
  return appendOperationTableRow_('ledger', row);
}

function updateLedgerRowById_(id, changes) {
  return updateOperationTableRow_('ledger', id, changes);
}
```

Do not add delete-row primitives.

- [ ] **Step 4: Implement service lifecycle**

Refactor the existing save helper to receive an explicit record status:

```js
function saveLedgerEntry_(request, context, recordStatus) {
  // existing mapping preserved
  // matchStatus default remains '미확인'
  // recordStatus defaults to 'ACTIVE'
}
```

Add:

```js
function updateLedgerEntry_(input, context) { /* validate id, update mutable fields */ }
function softDeleteLedgerEntry_(input, context) { /* recordStatus: 'DELETED', updatedAt */ }
```

Both mutations must write `businessAuditLogs` with the acting email and before/after JSON summaries using the existing audit helper/pattern rather than creating an Accounting-specific log table.

- [ ] **Step 5: Add thin APIs**

`ledger_api.gs` must expose:

```js
api_getLedgerSummary(filter)
api_updateLedgerEntry(request)
api_deleteLedgerEntry(request)
```

Each must use `apiHandler_`, `requireLogin: true`, and pass authenticated context to mutation services.

- [ ] **Step 6: Update query composition**

Ensure `getLedgerEntries_()` maps `recordStatus` and filters deleted rows. Add a small helper used later by reconciliation/settlement:

```js
function isActiveLedgerEntry_(item) {
  return item && item.recordStatus !== 'DELETED';
}

function isSettlementEligibleLedgerEntry_(item) {
  return isActiveLedgerEntry_(item) && item.recordStatus !== 'DRAFT' && item.status === '정상';
}
```

- [ ] **Step 7: Verify behavior and ownership**

```bash
node scripts/test-accounting.js
node scripts/verify-accounting-architecture.js
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/000_server/060_accounting/060_common/accounting_query_service.gs \
  src/000_server/060_accounting/061_ledger \
  scripts/test-accounting.js scripts/verify-accounting-architecture.js
git commit -m "feat: complete accounting ledger lifecycle"
```

---

### Task 3: Complete evidence read/audit contract

**Files:**
- Modify: `src/000_server/060_accounting/062_evidence/evidence_api.gs`
- Modify: `src/000_server/060_accounting/062_evidence/evidence_service.gs`
- Modify: `src/000_server/060_accounting/062_evidence/evidence_sheet_dao.gs`
- Modify: `scripts/test-accounting.js`
- Modify: `scripts/verify-accounting-architecture.js`

**Interfaces:**
- Produces `api_getEvidenceAuditList(filter)`.
- Produces internal `getEvidenceAuditList_(filter)`.
- Reuses existing Drive content API and does not add standalone preview/download URL persistence fields.

- [ ] **Step 1: Add failing evidence audit tests**

Create fixture ledger/evidence rows and assert that audit list items contain:

```js
{
  evidence_id: 'evd-1',
  transaction_id: 'trx-1',
  transaction_date: '2026-08-01',
  transaction_type: '지출',
  amount: 12000,
  file_name: 'receipt.pdf',
  file_id: 'drive-1'
}
```

Filtering by date range, transaction type and keyword must work without direct Sheet reads from the API file.

- [ ] **Step 2: Run failure**

```bash
node scripts/test-accounting.js
```

Expected: FAIL because audit API/query does not exist.

- [ ] **Step 3: Implement evidence audit composition**

Use `findAllLedgerEvidenceRows_()` plus ledger query data. Keep Drive handling in `evidence_file_service.gs`; do not duplicate file content logic.

- [ ] **Step 4: Expose thin API and architecture ownership**

Add `api_getEvidenceAuditList` to `evidence_api.gs` and verifier ownership mapping.

- [ ] **Step 5: Verify and commit**

```bash
node scripts/test-accounting.js
node scripts/verify-accounting-architecture.js
git add src/000_server/060_accounting/062_evidence scripts/test-accounting.js scripts/verify-accounting-architecture.js
git commit -m "feat: add accounting evidence audit query"
```

---

### Task 4: Add bank transaction storage, OCR logging and bidirectional parser

**Files:**
- Create: `src/000_server/060_accounting/063_reconciliation/bank_transaction_sheet_dao.gs`
- Create: `src/000_server/060_accounting/063_reconciliation/bank_ocr_sheet_dao.gs`
- Create: `src/000_server/060_accounting/063_reconciliation/bank_ocr_file_service.gs`
- Create: `src/000_server/060_accounting/063_reconciliation/bank_transaction_parser.gs`
- Create: `src/000_server/060_accounting/063_reconciliation/bank_ocr_service.gs`
- Modify: `scripts/test-accounting.js`
- Modify: `scripts/verify-accounting-architecture.js`

**Interfaces:**
- Produces `parseBankOcrTransactions_(ocrText, fileName, baseYear)` returning `{ items, reviewRequiredItems, extractedCount }`.
- Each parsed item uses OperationDB shape: `{ transactionAt, expense, counterparty, description, amount, sourceFileName }`, with `amount` always positive.
- Produces `uploadBankTransactions_(request, context)` returning `{ uploadedFileCount, processedFileCount, failedFileCount, extractedCount, savedCount, duplicateCount, reviewRequiredItems, previewItems }`.
- Produces DAO functions `findAllBankTransactionRows_`, `insertBankTransactionRow_`, `findAllBankOcrLogRows_`, `insertBankOcrLogRow_`.

- [ ] **Step 1: Add parser tests before implementation**

Use deterministic OCR text fixtures for both directions:

```text
2026-08-01
출금 12,000원
스타문구
적요 문구 구매

2026-08-02
입금 50,000원
김학생
적요 회비 입금
```

Assertions:

```js
assert.deepStrictEqual(parsed.items[0], {
  transactionAt: '2026-08-01', expense: true, counterparty: '스타문구',
  description: '문구 구매', amount: 12000, sourceFileName: 'bank.png'
});
assert.strictEqual(parsed.items[1].expense, false);
assert.strictEqual(parsed.items[1].amount, 50000);
```

Also test invalid date, missing amount and ambiguous direction go to `reviewRequiredItems`, not normal items.

- [ ] **Step 2: Add dedupe and OCR-log tests**

Test duplicate key equality on normalized file name/date/direction/amount/counterparty-description and verify a repeated upload does not call `insertBankTransactionRow_` twice. Verify `bankOcrLogs` contains only summary fields and never a `rawText`/`raw_text` property.

- [ ] **Step 3: Run tests to verify failure**

```bash
node scripts/test-accounting.js
```

Expected: FAIL on missing parser/service functions.

- [ ] **Step 4: Implement parser as a pure file**

Port only the standalone parsing primitives needed for image/PDF OCR, generalized so direction can be income or expense. Keep parsing pure: no Sheet, Drive, Session or API calls in `bank_transaction_parser.gs`.

- [ ] **Step 5: Implement Drive OCR file service**

`bank_ocr_file_service.gs` owns:

```js
function validateBankOcrFile_(file) { /* image/pdf only */ }
function extractBankOcrText_(file) { /* Drive.Files.create OCR document */ }
```

Always delete/trash temporary OCR documents in `finally`. Do not persist OCR text.

- [ ] **Step 6: Implement DAOs and upload orchestration**

`bank_ocr_service.gs` validates files, extracts text, parses, deduplicates, writes `bankTransactions`, writes one summary `bankOcrLogs` row per file, and returns preview candidates. Use `LockService.getScriptLock()` around duplicate-check-and-insert for bank transactions.

- [ ] **Step 7: Make architecture ownership strict**

Now require the new files in `verify-accounting-architecture.js` and enforce:

```text
bankTransactions -> bank_transaction_sheet_dao.gs only
bankOcrLogs      -> bank_ocr_sheet_dao.gs only
Drive.Files / DocumentApp OCR -> bank_ocr_file_service.gs only
```

- [ ] **Step 8: Verify and commit**

```bash
node scripts/test-accounting.js
node scripts/verify-accounting-architecture.js
git add src/000_server/060_accounting/063_reconciliation scripts/test-accounting.js scripts/verify-accounting-architecture.js
git commit -m "feat: add bank ocr transaction ingestion"
```

---

### Task 5: Add reconciliation matching, official runs and manual resolution

**Files:**
- Create: `src/000_server/060_accounting/063_reconciliation/reconciliation_api.gs`
- Create: `src/000_server/060_accounting/063_reconciliation/reconciliation_service.gs`
- Create: `src/000_server/060_accounting/063_reconciliation/reconciliation_query_service.gs`
- Create: `src/000_server/060_accounting/063_reconciliation/reconciliation_sheet_dao.gs`
- Modify: `src/000_server/060_accounting/063_reconciliation/bank_ocr_service.gs`
- Modify: `scripts/test-accounting.js`
- Modify: `scripts/verify-accounting-architecture.js`

**Interfaces:**
- Produces `api_uploadBankTransactions(request)`.
- Produces `api_runReconciliation(request)`.
- Produces `api_getReconciliationList(filter)`.
- Produces `api_getReconciliationDetail(reconciliationId)`.
- Produces `api_getReconciliationCandidates(request)`.
- Produces `api_linkReconciliation(request)`.
- Produces `api_createLedgerFromReconciliation(request)`.
- Produces `api_getBankOcrLogs(request)`.
- Produces pure `scoreReconciliationCandidate_(bank, ledger)` and `buildReconciliationResults_(banks, ledgers)`.

- [ ] **Step 1: Add failing matching tests**

Cover all required rules:

```js
// income only matches income
// expense only matches expense
// amount must match
// date may differ by at most 1 day
// exact counterparty outranks token-only match
// unique supported best candidate -> 정상 / auto
// tied or weak candidate -> 확인필요
// no candidate -> 원장누락의심
// two bank rows cannot auto-claim the same ledger row
```

For `differenceAmount`, use signed-independent positive amount difference:

```js
differenceAmount = Math.abs(Number(bank.amount) - Number(ledger.amount));
```

Matched equal-amount rows therefore store `0`.

- [ ] **Step 2: Add failing official-run tests**

Stub DAOs and assert `runReconciliation_(request, context)`:

```text
1. validates startDate/endDate
2. reads bank transactions and active ledger rows in range
3. creates one reconciliation header
4. inserts all reconciliationItems with that header ID
5. calculates header transaction/missing/mismatch counts from item results
6. leaves account opening/closing balance blank when unavailable
7. writes businessAuditLogs
```

Header count mapping for this phase:

```text
missingCount  = count(status === '원장누락의심')
mismatchCount = count(status === '확인필요')
excessCount   = active eligible ledger rows in range not claimed by any 정상 reconciliation item
missingEvidenceCount = claimed 정상 ledger rows with no evidence
```

- [ ] **Step 3: Add failing manual-resolution tests**

Assert manual linking rejects direction mismatch, amount mismatch, and ledger already claimed by another resolved item in the same run. Successful manual link sets:

```js
{ status: '정상', matchMethod: 'manual', ledgerId: selectedLedgerId }
```

`createLedgerFromReconciliation_` must call `saveLedgerEntry_` from `061_ledger`; it must not call `appendOperationTableRow_('ledger', ...)` from reconciliation code. Created ledger direction/date/amount/counterparty/description come from the bank transaction and the resulting item becomes `정상`, `matchMethod: 'created'`.

- [ ] **Step 4: Run tests to verify failure**

```bash
node scripts/test-accounting.js
```

Expected: FAIL on missing reconciliation functions.

- [ ] **Step 5: Implement pure matching/query layer**

Port standalone normalization/scoring ideas but use current DTO names and positive amounts plus `expense` direction. Keep query service read-only. Candidate return objects must include enough UI information to choose a row:

```js
{
  ledgerId, transactionAt, expense, amount, counterparty, description,
  score, dateDifference, matchDetail
}
```

- [ ] **Step 6: Implement reconciliation DAO ownership**

`reconciliation_sheet_dao.gs` exclusively accesses both `reconciliation` and `reconciliationItems` and exposes focused helpers for insert/list/find/update.

- [ ] **Step 7: Implement official-run and resolution services**

Mutations use authenticated context and business audit logs. Re-running the same period creates a new reconciliation header/history; it does not overwrite a prior run.

- [ ] **Step 8: Expose thin APIs**

Every API uses `apiHandler_` and `requireLogin: true`. `api_uploadBankTransactions` delegates to OCR service, while all official run/manual mutation APIs delegate to reconciliation service.

- [ ] **Step 9: Tighten architecture verifier**

Require all `063_reconciliation` files and add function ownership expectations for public APIs, matching functions, DAOs and OCR file functions. Forbid direct `ledger` table writes from `063_reconciliation`.

- [ ] **Step 10: Verify and commit**

```bash
node scripts/test-accounting.js
node scripts/verify-accounting-architecture.js
git add src/000_server/060_accounting/063_reconciliation scripts/test-accounting.js scripts/verify-accounting-architecture.js
git commit -m "feat: add accounting reconciliation workflow"
```

---

### Task 6: Add immutable overall settlement history and export data

**Files:**
- Create: `src/000_server/060_accounting/064_settlement/settlement_api.gs`
- Create: `src/000_server/060_accounting/064_settlement/settlement_service.gs`
- Create: `src/000_server/060_accounting/064_settlement/settlement_query_service.gs`
- Create: `src/000_server/060_accounting/064_settlement/settlement_sheet_dao.gs`
- Remove ownership of `api_getSettlementSummary` from `060_common/accounting_query_service.gs` by moving its public API/query implementation into `064_settlement` while preserving the public API name.
- Modify: `scripts/test-accounting.js`
- Modify: `scripts/verify-accounting-architecture.js`

**Interfaces:**
- Produces `api_getSettlementSummary(filter)`.
- Produces `api_generateSettlementReport(request)`.
- Produces `api_getSettlementReportList(filter)`.
- Produces `api_getSettlementReport(reportId)`.
- Produces `api_exportSettlementReport(request)`.
- Settlement includes only active, non-draft ledger entries whose UI/status DTO value is `정상` and whose transaction date falls inside the requested range.

- [ ] **Step 1: Replace compatibility-only settlement test with eligibility tests**

Use fixtures containing:

```text
normal income ACTIVE       -> include
normal expense ACTIVE      -> include
확인필요 ACTIVE            -> exclude
정상 DRAFT                 -> exclude
정상 DELETED               -> exclude
정상 outside period        -> exclude
```

Assert exact totals, counts and evidence count for the included ledger IDs only.

- [ ] **Step 2: Add immutable snapshot tests**

Stub `insertSettlementReportRow_` and assert generation stores:

```js
{
  id: 'SET-...', startDate, endDate,
  totalIncome, totalExpense, balance,
  incomeCount, expenseCount, evidenceCount,
  status: '생성완료', managerId, createdAt
}
```

After generation, mutate the ledger fixture and verify `api_getSettlementReport(reportId)` returns the persisted snapshot rather than recalculating it.

- [ ] **Step 3: Add export contract test**

Assert export returns structured data only:

```js
{
  fileName: '결산보고서_2026-08-01_2026-08-31',
  report: persistedReport,
  ledgerItems: eligibleRowsAtExportQuery
}
```

No Drive file creation and no XLSX/PDF MIME output.

- [ ] **Step 4: Run tests to verify failure**

```bash
node scripts/test-accounting.js
```

Expected: FAIL until settlement feature files exist.

- [ ] **Step 5: Implement settlement DAO/query/service/API**

Keep `settlementReports` access only in DAO. Query service composes eligible ledgers/evidence. Service persists a new snapshot for every generation and writes `businessAuditLogs`.

- [ ] **Step 6: Update architecture verifier and remove old ownership**

Require all `064_settlement` files. Move `api_getSettlementSummary` ownership from `060_common` to `064_settlement/settlement_api.gs`. Ensure query service has no Sheet mutation or Drive calls.

- [ ] **Step 7: Verify and commit**

```bash
node scripts/test-accounting.js
node scripts/verify-accounting-architecture.js
git add src/000_server/060_accounting/060_common/accounting_query_service.gs \
  src/000_server/060_accounting/064_settlement \
  scripts/test-accounting.js scripts/verify-accounting-architecture.js
git commit -m "feat: add accounting settlement history"
```

---

### Task 7: Wire ledger frontend to completed server lifecycle

**Files:**
- Modify: `src/400_accounting/410_ledger/accounting_ledger_js.html`
- Modify only if required by existing markup IDs: `src/400_accounting/410_ledger/Accounting_Ledger_View.html`
- Modify: `scripts/test-accounting.js` only for server behavior; use existing frontend regression script for client contract.
- Modify: `scripts/verify-ui-system-migration.js` only if current structural assertions require explicit preservation checks.

**Interfaces:**
- Consumes `api_getLedgerSummary`, `api_getLedgerList`, `api_updateLedgerEntry`, `api_deleteLedgerEntry`, `api_saveLedgerDraft`.
- Preserves existing Accounting page layout, shared UI classes, routes and navigation.

- [ ] **Step 1: Extend existing frontend regression assertions**

In the appropriate existing frontend/static verifier, assert the ledger client contains calls to the completed public APIs and no `apiV1_` calls.

- [ ] **Step 2: Run the frontend verifier to verify failure**

Run the existing relevant command(s), including:

```bash
node scripts/verify-ui-system-migration.js
```

Expected: FAIL on the newly required ledger server calls until wiring is implemented.

- [ ] **Step 3: Wire create/draft/update/delete/summary**

Reuse existing modals and state. Do not introduce a standalone-derived parallel component system. After successful mutations, refresh list/summary/detail state from server rather than manually inventing divergent client state.

- [ ] **Step 4: Keep soft-delete semantics user-visible**

The delete action calls `api_deleteLedgerEntry`; it must not imply permanent physical deletion in client copy or call any direct Sheet operation.

- [ ] **Step 5: Run frontend and server regressions**

```bash
node scripts/test-accounting.js
node scripts/verify-accounting-architecture.js
node scripts/verify-ui-system-migration.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/400_accounting/410_ledger scripts/verify-ui-system-migration.js
git commit -m "feat: wire accounting ledger lifecycle ui"
```

---

### Task 8: Wire reconciliation frontend to OCR and official-run APIs

**Files:**
- Modify: `src/400_accounting/420_reconciliation/Accounting_Reconciliation_View.html`
- Modify: `src/400_accounting/420_reconciliation/accounting_reconciliation_js.html`
- Modify current Accounting/shared frontend test/verifier file that covers server call contracts.

**Interfaces:**
- Consumes all Task 5 reconciliation APIs.
- Upload step shows OCR/save/preview result but does not create official reconciliation history.
- Run step creates an official reconciliation for selected dates.

- [ ] **Step 1: Add failing frontend contract checks**

Assert current TODO markers/disabled fake flows are removed and the client references:

```text
api_uploadBankTransactions
api_runReconciliation
api_getReconciliationList
api_getReconciliationDetail
api_getReconciliationCandidates
api_linkReconciliation
api_createLedgerFromReconciliation
api_getBankOcrLogs
```

Also assert there are no `apiV1_` names.

- [ ] **Step 2: Run verifier to confirm failure**

Use the repository's Accounting/UI verifier command and expect failure on missing calls.

- [ ] **Step 3: Wire file upload**

Use existing dropzone/input elements. Convert image/PDF files to `{ file_name, file_type, file_size, content_base64 }`, call `api_uploadBankTransactions`, show success/failure counts and preview results, and leave official history unchanged.

- [ ] **Step 4: Wire official reconciliation execution**

Use selected start/end dates to call `api_runReconciliation`. After success, refresh run list/detail and display the newly persisted `reconciliationItems`.

- [ ] **Step 5: Wire manual resolution actions**

For `확인필요`, fetch candidates and let the existing interaction surface choose one, then call `api_linkReconciliation`. For `원장누락의심`, call `api_createLedgerFromReconciliation` with user-editable ledger defaults where the current view supports them. Refresh the run detail after either action.

- [ ] **Step 6: Keep status rendering canonical**

UI status mapping must use only:

```text
정상
확인필요
원장누락의심
```

Do not reintroduce standalone status values such as `수동연결` or `불일치`; show connection origin separately if needed.

- [ ] **Step 7: Verify and commit**

```bash
node scripts/test-accounting.js
node scripts/verify-accounting-architecture.js
node scripts/verify-ui-system-migration.js
git add src/400_accounting/420_reconciliation scripts
git commit -m "feat: wire accounting reconciliation ui"
```

---

### Task 9: Wire settlement frontend to overall snapshot workflow

**Files:**
- Modify: `src/400_accounting/430_settlement/Accounting_Settlement_View.html`
- Modify: `src/400_accounting/430_settlement/accounting_settlement_js.html`
- Modify current Accounting/UI frontend verifier.

**Interfaces:**
- Consumes `api_getSettlementSummary`, `api_generateSettlementReport`, `api_getSettlementReportList`, `api_getSettlementReport`, `api_exportSettlementReport`.
- Supports period-based overall settlement only.

- [ ] **Step 1: Add failing static/frontend checks**

Assert the generate button is no longer forcibly disabled and client calls all five settlement APIs. Assert no department/event settlement controls are wired into server requests.

- [ ] **Step 2: Run verifier and confirm failure**

Run the current UI verifier and expect failure before implementation.

- [ ] **Step 3: Wire live period summary**

Changing start/end dates requests `api_getSettlementSummary({ startDate, endDate })` and renders total income, expense, balance, income count, expense count and evidence count.

- [ ] **Step 4: Wire snapshot generation and history**

Generate calls `api_generateSettlementReport`. Refresh `api_getSettlementReportList` after success. Selecting history calls `api_getSettlementReport` and displays the persisted snapshot values.

- [ ] **Step 5: Wire export-data action without file fabrication**

`api_exportSettlementReport` returns structured data. The UI may prepare/display/download client-side textual data only if an existing generic export helper supports it; it must not claim that a server-generated XLSX/PDF exists.

- [ ] **Step 6: Verify and commit**

```bash
node scripts/test-accounting.js
node scripts/verify-accounting-architecture.js
node scripts/verify-ui-system-migration.js
git add src/400_accounting/430_settlement scripts
git commit -m "feat: wire accounting settlement ui"
```

---

### Task 10: Full Accounting and repository regression verification

**Files:**
- Modify only if a genuine test gap is discovered: `scripts/test-accounting.js`, `scripts/verify-accounting-architecture.js`, existing frontend verifier.
- No product behavior changes during this task unless a failing regression proves an implementation defect; fix defects in the owning feature file and add a regression test first.

**Interfaces:**
- Produces a verified branch ready for review/PR, not a direct merge to `main`.

- [ ] **Step 1: Static syntax verification**

Run:

```bash
node --check scripts/*.js
find src -name '*.js' -print0 | xargs -0 -n1 node --check
for file in $(find src -name '*.gs'); do cp "$file" /tmp/__gas_check.js && node --check /tmp/__gas_check.js || exit 1; done
```

Expected: all commands exit `0`.

- [ ] **Step 2: Run Accounting behavior and architecture tests**

```bash
node scripts/test-accounting.js
node scripts/verify-accounting-architecture.js
```

Expected:

```text
Accounting behavior regression tests passed.
Accounting architecture verification passed.
```

- [ ] **Step 3: Run all repository functional tests**

Run each existing functional suite:

```bash
node scripts/test-core.js
node scripts/test-auth-iam.js
node scripts/test-settings.js
node scripts/test-accounting.js
node scripts/test-event.js
node scripts/test-student-fee.js
node scripts/test-student-fee-frontend.js
```

Expected: every suite exits `0`.

- [ ] **Step 4: Run all architecture/UI verifiers**

```bash
node scripts/verify-server-architecture.js
node scripts/verify-auth-iam-architecture.js
node scripts/verify-settings-architecture.js
node scripts/verify-accounting-architecture.js
node scripts/verify-event-architecture.js
node scripts/verify-student-fee-architecture.js
node scripts/verify-student-fee-frontend.js
node scripts/verify-ui-system-migration.js
```

Expected: every verifier exits `0`.

- [ ] **Step 5: Verify standalone artifacts were not integrated**

Run:

```bash
git diff main...HEAD -- apps-script-standalone
```

Expected: no output.

Also search for forbidden public API naming:

```bash
grep -R "apiV1_" src/000_server/060_accounting src/400_accounting && exit 1 || true
```

Expected: no `apiV1_` references in integrated Accounting code.

- [ ] **Step 6: Review branch diff for scope**

```bash
git diff --stat main...HEAD
git diff --name-only main...HEAD
```

Expected: changes are limited to Accounting, OperationDB schema/config, Accounting tests/verifiers, and approved design/plan docs.

- [ ] **Step 7: Commit any verification-only test fixes**

If and only if tests/verifiers were improved without product behavior changes:

```bash
git add scripts
git commit -m "test: complete accounting port regression coverage"
```

If no files changed, do not create an empty commit.

## Self-Review Notes

- Spec coverage: ledger summary/update/soft-delete/draft, evidence audit, image/PDF OCR, income+expense parsing, dedupe, OCR summary log without raw text, preview matching, official period reconciliation, detailed results, manual linking, create-ledger-and-link, overall settlement snapshots/history/export data, audit logs, frontend wiring and full regression are each assigned to a task.
- Out-of-scope checks are explicit: no department/event settlement, no CSV/Excel parser, no raw OCR storage, no actual XLSX/PDF server export, no standalone Spreadsheet/PROCESS_LOG/API names.
- Type consistency: ledger physical rows use `expense` boolean and positive `amount`; UI DTOs may expose `transaction_type`. Bank rows use the same `expense`+positive-amount convention. Reconciliation statuses are fixed to three values and origin is stored in `matchMethod`.
- Ownership consistency: only DAOs touch OperationDB tables; query services are read-only; Drive OCR belongs only to `bank_ocr_file_service.gs`; reconciliation creates missing ledger entries through `061_ledger` service rather than writing the ledger table.
