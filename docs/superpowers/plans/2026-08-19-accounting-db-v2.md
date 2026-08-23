# Accounting DB v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate Accounting to a six-table v2 model where Toss Excel rows are immutable bank facts, the ledger owns the 1:1 bank link, evidence belongs to ledger entries, reconciliation is a period snapshot, and settlement is an immutable reporting snapshot.

**Architecture:** Keep `수입지출원장` as the accounting source of truth and add `계좌거래ID` as the nullable+unique relationship to immutable `계좌거래`. Replace the current OCR-driven bank ingestion with Toss Excel row ingestion and transaction-level hashing. Reconciliation reads the ledger-owned relationship rather than owning links in `감사대사상세`; settlement persists period snapshots without locking ledger rows.

**Tech Stack:** Google Apps Script, Google Sheets OperationDB, Google Drive evidence storage, Node-based static/unit test scripts under `scripts/`.

**Spec:** `docs/superpowers/specs/2026-08-19-accounting-db-v2-design.md`

## Global Constraints

- Do not destructively rewrite existing Accounting data before an explicit migration rule succeeds.
- `계좌거래` source fields are immutable after insertion; invalid rows are marked `무효` rather than physically deleted.
- `수입지출원장.계좌거래ID` is the source of truth for the final bank↔ledger relationship.
- One non-null `계좌거래ID` may appear on at most one ledger row.
- Manual-first ledger rows may temporarily have no `계좌거래ID`.
- Evidence references ledger rows only; transaction-detail screenshots are evidence, not bank-import sources.
- OCR is evidence-assistance only; Drive file remains authoritative.
- Reconciliation and settlement are historical snapshots and must not silently mutate older snapshots.
- Public APIs preserve the established `api_<Verb><Resource>` naming contract and access rules.
- Apply TDD: add failing tests first, confirm RED, then change production code.

---

### Task 1: Lock the v2 schema contract and integrity rules

**Files:**
- Modify: `src/000_server/020_schema/operation_db_schema.gs`
- Modify: `src/000_server/020_schema/operation_db_integrity.gs`
- Create: `scripts/test-accounting-db-v2-schema.js`
- Modify as needed: the file defining `OPERATION_TABLES` only to remove the obsolete `bankOcrLogs` key if it exists and keep `bankTransactions`, `reconciliationItems`, `settlementReports` mapped to `계좌거래`, `감사대사상세`, `결산보고서`.

**Interfaces:**
- Produces schema keys: `ledger`, `evidence`, `bankTransactions`, `reconciliation`, `reconciliationItems`, `settlementReports`.
- Produces business-key rules for `bankTransactions.sourceHash` and `ledger.bankTransactionId`.

- [ ] **Step 1: Write the failing schema-contract test**

Create `scripts/test-accounting-db-v2-schema.js` that loads `operation_db_schema.gs` in `vm` and asserts:

```js
assert.deepStrictEqual(schema.bankTransactions.fields, {
  id: '계좌거래ID',
  transactionAt: '거래일시',
  description: '적요',
  bankType: '거래유형',
  institution: '거래기관',
  counterpartyAccountNumber: '상대계좌번호',
  amount: '거래금액',
  balanceAfter: '거래후잔액',
  memo: '메모',
  sourceHash: '원본해시',
  recordStatus: '레코드상태',
  createdAt: '등록일시'
});
assert.strictEqual(schema.bankOcrLogs, undefined);
assert.strictEqual(schema.ledger.fields.bankTransactionId, '계좌거래ID');
assert.strictEqual(schema.ledger.fields.balanceAfter, undefined);
assert.strictEqual(schema.ledger.fields.transactionType, '거래구분');
assert.strictEqual(schema.evidence.fields.ocrStatus, 'OCR상태');
assert.strictEqual(schema.evidence.fields.ocrValidationResult, 'OCR검증결과');
```

Also assert the reconciliation and settlement target columns exactly match the design spec.

- [ ] **Step 2: Run the test and confirm RED**

Run:

```bash
node scripts/test-accounting-db-v2-schema.js
```

Expected: FAIL because the current schema still models bank OCR, ledger balance, boolean-style ledger expense semantics, and old reconciliation/settlement columns.

- [ ] **Step 3: Change `operation_db_schema.gs` to the v2 contract**

Use these semantic field keys:

```js
ledger.fields = {
  id: '거래ID',
  bankTransactionId: '계좌거래ID',
  transactionAt: '거래일시',
  description: '거래내용',
  transactionType: '거래구분',
  amount: '거래금액',
  counterparty: '거래상대명',
  source: '유입경로',
  eventId: '행사ID',
  businessType: '업무구분',
  businessId: '업무ID',
  matchStatus: '일치상태',
  recordStatus: '레코드상태',
  managerId: '담당자ID',
  createdAt: '등록일시',
  updatedAt: '수정일시'
};
```

Add FK `ledger.bankTransactionId -> bankTransactions.id` with `optional: true`. Keep event/UserDB FKs.

Define evidence fields with `ocrStatus` and `ocrValidationResult`. Remove `bankOcrLogs`. Define `reconciliationItems` with only `id`, `reconciliationId`, `bankTransactionId`, `ledgerId`, `result`, `differenceAmount`, `validationNote`, `createdAt`. Define settlement fields exactly as the spec.

- [ ] **Step 4: Extend integrity business-key checks**

In `validateOperationDbBusinessKeys_`, add:

```js
{ tableKey: 'bankTransactions', fields: ['sourceHash'] },
{ tableKey: 'ledger', fields: ['bankTransactionId'] }
```

Blank `ledger.bankTransactionId` values remain allowed because current business-key validation skips blanks.

- [ ] **Step 5: Run schema/integrity tests**

Run:

```bash
node scripts/test-accounting-db-v2-schema.js
node scripts/test-accounting.js
node scripts/test-accounting-money-validation.js
node scripts/verify-public-api-naming.js
node scripts/verify-internal-function-naming.js
```

Expected: schema contract PASS; existing Accounting tests may expose behavior assumptions that Task 2-5 will update, but naming verifiers must remain PASS.

- [ ] **Step 6: Commit**

```bash
git add src/000_server/020_schema scripts/test-accounting-db-v2-schema.js
git commit -m "refactor: define Accounting DB v2 schema"
```

---

### Task 2: Replace OCR bank ingestion with Toss Excel transaction ingestion

**Files:**
- Delete after replacement: `src/000_server/060_accounting/063_reconciliation/bank_ocr_service.gs`
- Delete after replacement: `src/000_server/060_accounting/063_reconciliation/bank_ocr_file_service.gs`
- Delete after replacement: `src/000_server/060_accounting/063_reconciliation/bank_ocr_sheet_dao.gs`
- Replace responsibility of: `src/000_server/060_accounting/063_reconciliation/bank_transaction_parser.gs`
- Modify: `src/000_server/060_accounting/063_reconciliation/bank_transaction_sheet_dao.gs`
- Modify: `src/000_server/060_accounting/063_reconciliation/reconciliation_api.gs`
- Create: `scripts/test-bank-transaction-v2.js`

**Interfaces:**
- Produces `parseTossBankTransactionRows_(rows)` where `rows` are normalized records with the Toss headers `거래 일시`, `적요`, `거래 유형`, `거래 기관`, `계좌번호`, `거래 금액`, `거래 후 잔액`, `메모`.
- Produces `buildBankTransactionSourceHash_(item)`.
- Produces `applyBankTransactions_(items, context)` returning `{savedCount, duplicateCount, items}`.
- Public upload endpoint remains resource-oriented; rename only if required by naming verifier, preferring `api_processBankTransactionUpload` if retained.

- [ ] **Step 1: Write failing parser/hash tests**

Test at least:

```js
const input = {
  '거래 일시': '2026-05-16 14:31:42',
  '적요': '노브랜드스타필드고양점',
  '거래 유형': '체크카드결제',
  '거래 기관': '',
  '계좌번호': '',
  '거래 금액': -8800,
  '거래 후 잔액': 4108043,
  '메모': ''
};
```

Expected normalized bank row preserves signed `amount`, original `bankType`, nullable institution/account/balance/memo, and maps Toss `계좌번호` to internal `counterpartyAccountNumber`.

Hash tests must prove identical source rows produce identical hashes and a change to any one source field changes the hash.

- [ ] **Step 2: Confirm RED**

```bash
node scripts/test-bank-transaction-v2.js
```

Expected: FAIL because the current parser consumes OCR text and converts transactions into `expense/counterparty/description/amount`.

- [ ] **Step 3: Implement Toss row parser and source hash**

Use a deterministic normalized string over:

```text
거래일시|적요|거래유형|거래기관|상대계좌번호|거래금액|거래후잔액|메모
```

Use Apps Script `Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, normalized, Utilities.Charset.UTF_8)` in production and expose a pure normalization helper so Node tests can verify deterministic input construction.

The inserted row shape must be:

```js
{
  id: generateAccountingId_('BNK'),
  transactionAt,
  description,
  bankType,
  institution,
  counterpartyAccountNumber,
  amount,          // signed
  balanceAfter,    // nullable
  memo,
  sourceHash,
  recordStatus: '정상',
  createdAt: getCurrentIsoDateTime_()
}
```

- [ ] **Step 4: Enforce immutability and duplicate prevention**

Keep DAO methods `list`, `find`, `insert`; do not add a generic update method for source fields. Duplicate checking happens under script lock by `sourceHash`. If an invalidation API is added, it may only change `recordStatus` from `정상` to `무효`.

- [ ] **Step 5: Remove bank OCR APIs/services**

Remove `api_getBankOcrLogs` and all `bankOcrLogs` DAO/service calls. `api_processBankTransactionUpload` must no longer accept image/PDF OCR input; it accepts parsed workbook rows or the existing frontend upload representation converted to those rows before service invocation.

- [ ] **Step 6: Run tests and commit**

```bash
node scripts/test-bank-transaction-v2.js
node scripts/test-accounting.js
node scripts/verify-public-api-naming.js
node scripts/verify-internal-function-naming.js
git add src/000_server/060_accounting scripts/test-bank-transaction-v2.js
git commit -m "refactor: ingest Toss bank transactions as immutable rows"
```

---

### Task 3: Make ledger own the bank relationship and normalize ledger lifecycle

**Files:**
- Modify: `src/000_server/060_accounting/061_ledger/ledger_service.gs`
- Modify: `src/000_server/060_accounting/061_ledger/ledger_sheet_dao.gs`
- Modify: `src/000_server/060_accounting/060_common/accounting_query_service.gs`
- Modify: `src/000_server/060_accounting/061_ledger/ledger_api.gs` only if a dedicated bank-link API is needed
- Create: `scripts/test-ledger-bank-link-v2.js`

**Interfaces:**
- Ledger row stores `bankTransactionId` directly.
- `transactionType` persists `수입`/`지출`; do not store boolean `expense` in v2 rows.
- `source` persists `BANK` or `MANUAL`.
- `recordStatus` persists `활성` or `무효`.
- `matchStatus` persists `미확인`, `정상`, or `확인필요`.
- Produces `linkLedgerBankTransactionData_(request, context)` or folds equivalent validation into update service.

- [ ] **Step 1: Write failing lifecycle/link tests**

Cover:

```text
manual create -> source MANUAL, bankTransactionId blank, matchStatus 미확인
bank-first create -> source BANK, bankTransactionId populated
same bankTransactionId cannot be claimed by second active ledger row
linked bank amount/direction mismatch -> 확인필요 or explicit validation failure according to mutation path
ledger amount must remain positive
soft delete -> 레코드상태 무효, not DELETED
```

- [ ] **Step 2: Confirm RED**

```bash
node scripts/test-ledger-bank-link-v2.js
```

Expected: FAIL because current code writes boolean `expense`, informational `balanceAfter`, source `수기등록`, and `ACTIVE/DRAFT/DELETED`.

- [ ] **Step 3: Remove informational ledger balance and boolean persistence**

Delete `parseLedgerInformationalBalance_` usage. Persist `transactionType` directly as `수입` or `지출`. Keep `parseLedgerPositiveAmount_`.

Creation defaults:

```js
source: request.source || 'MANUAL',
matchStatus: request.bank_transaction_id ? '정상' : '미확인',
recordStatus: '활성'
```

Draft behavior must not overload `recordStatus`; if draft UI behavior is still required, keep it as a separate workflow concept outside the v2 Accounting record-status column or defer draft persistence until a later explicit design.

- [ ] **Step 4: Add 1:1 bank-link validation**

Before writing a non-null `bankTransactionId`, authoritative reread under lock must verify no other non-`무효` ledger row already references it. Validate referenced bank row exists and is not `무효`.

Direction comparison uses signed bank amount:

```js
var expectedType = Number(bank.amount) < 0 ? '지출' : '수입';
```

Amount comparison uses `Math.abs(bank.amount) === ledger.amount`.

- [ ] **Step 5: Update DTO/query filters**

Replace checks for `ACTIVE/DELETED` and `expense` with `활성/무효` and `transactionType`. Ensure summaries/settlement calculations still use positive ledger `amount` plus `transaction_type`.

- [ ] **Step 6: Run tests and commit**

```bash
node scripts/test-ledger-bank-link-v2.js
node scripts/test-accounting-money-validation.js
node scripts/test-accounting.js
git add src/000_server/060_accounting scripts/test-ledger-bank-link-v2.js
git commit -m "refactor: move bank linkage into ledger"
```

---

### Task 4: Move screenshot OCR into evidence validation

**Files:**
- Modify: `src/000_server/060_accounting/062_evidence/evidence_service.gs`
- Modify: `src/000_server/060_accounting/062_evidence/evidence_file_service.gs`
- Modify: `src/000_server/060_accounting/062_evidence/evidence_api.gs`
- Create: `src/000_server/060_accounting/062_evidence/evidence_ocr_service.gs`
- Create: `scripts/test-evidence-ocr-v2.js`

**Interfaces:**
- Evidence row adds `ocrStatus`, `ocrValidationResult` only; full OCR text is not persisted in the relational table.
- Drive file remains mandatory authoritative source.
- OCR service consumes a stored evidence file and returns transient extracted values used to compare against ledger.

- [ ] **Step 1: Write failing evidence OCR contract tests**

Assert evidence metadata persists the Drive ID and optional OCR state/result but not bank-transaction fields or full OCR text.

- [ ] **Step 2: Confirm RED**

```bash
node scripts/test-evidence-ocr-v2.js
```

- [ ] **Step 3: Reuse the existing Drive/OCR mechanism inside evidence**

Move only the generic OCR extraction capability from the removed bank OCR file service into `evidence_ocr_service.gs`. The OCR result may contain transient `{transactionAt, amount, description, transactionType}` candidates; persist only status/result such as `정상`, `금액불일치`, `일자불일치`, `확인필요`, `추출실패`.

- [ ] **Step 4: Add evidence validation API/service path**

Use an access level consistent with evidence mutation (`edit`). The operation validates a stored evidence image against its owning ledger row and updates only `OCR상태`/`OCR검증결과`.

- [ ] **Step 5: Run tests and commit**

```bash
node scripts/test-evidence-ocr-v2.js
node scripts/test-accounting.js
node scripts/verify-public-api-naming.js
git add src/000_server/060_accounting/062_evidence scripts/test-evidence-ocr-v2.js
git commit -m "refactor: move transaction screenshot OCR to evidence"
```

---

### Task 5: Rebuild reconciliation as a read-only relationship snapshot

**Files:**
- Modify: `src/000_server/060_accounting/063_reconciliation/reconciliation_query_service.gs`
- Modify: `src/000_server/060_accounting/063_reconciliation/reconciliation_service.gs`
- Modify: `src/000_server/060_accounting/063_reconciliation/reconciliation_sheet_dao.gs`
- Modify: `src/000_server/060_accounting/063_reconciliation/reconciliation_api.gs`
- Create: `scripts/test-reconciliation-v2.js`

**Interfaces:**
- `processReconciliationData_({startDate,endDate}, context)` creates one summary snapshot and N item snapshots.
- Reconciliation never owns or mutates the bank↔ledger link.
- Any manual linking action updates `ledger.bankTransactionId`; reconciliation item rows are regenerated only by a new reconciliation run.

- [ ] **Step 1: Write failing snapshot tests**

Cover the four results:

```text
정상       bank exists + ledger owns bank ID + amount/type agree
원장누락   bank exists + no ledger owns bank ID
계좌미확인 active ledger in period + bankTransactionId blank
확인필요   linked bank/ledger exist but important values disagree
```

Assert a reconciliation item does not contain mutable `matchMethod`, `updatedAt`, or linkage ownership behavior.

- [ ] **Step 2: Confirm RED**

```bash
node scripts/test-reconciliation-v2.js
```

Expected: FAIL because current reconciliation scores candidates and stores/changes the link inside `감사대사상세`.

- [ ] **Step 3: Rewrite reconciliation result construction around current ledger links**

Build maps:

```js
bankById
ledgerByBankTransactionId
```

Create bank-side rows first, then append active ledger rows with blank `bankTransactionId` as `계좌미확인`.

- [ ] **Step 4: Rewrite reconciliation summary fields**

Persist exactly:

```text
대사ID, 감사시작일, 감사종료일,
계좌기초잔액, 계좌기말잔액,
계좌거래건수, 원장거래건수,
정상건수, 원장누락건수, 계좌미확인건수, 확인필요건수,
대사상태, 담당자ID, 실행일시, 확인일시, 확인내용
```

Do not persist `원장기초잔액`, `원장기말잔액`, `누락건수`, `초과건수`, `불일치건수`, `증빙미비건수` under the old semantics.

- [ ] **Step 5: Remove reconciliation-owned link mutations**

`applyReconciliationLinkData_` must delegate to ledger bank-link mutation and must not modify an old snapshot item. `createLedgerFromReconciliationData_` may create a ledger from a bank row, but the new ledger must be born with `bankTransactionId` and `source = BANK`; the historical reconciliation snapshot remains unchanged.

- [ ] **Step 6: Run tests and commit**

```bash
node scripts/test-reconciliation-v2.js
node scripts/test-accounting.js
node scripts/verify-public-api-naming.js
git add src/000_server/060_accounting/063_reconciliation scripts/test-reconciliation-v2.js
git commit -m "refactor: make reconciliation a period snapshot"
```

---

### Task 6: Expand settlement into immutable report snapshots

**Files:**
- Modify: `src/000_server/060_accounting/064_settlement/settlement_query_service.gs`
- Modify: `src/000_server/060_accounting/064_settlement/settlement_service.gs`
- Modify: `src/000_server/060_accounting/064_settlement/settlement_sheet_dao.gs`
- Modify: `src/000_server/060_accounting/064_settlement/settlement_api.gs`
- Create: `scripts/test-settlement-v2.js`

**Interfaces:**
- Settlement report statuses: `작성중`, `확정`.
- A confirmed report is never recalculated in place.
- Export references the stored snapshot and may attach `보고서Drive파일ID` without changing accounting totals.

- [ ] **Step 1: Write failing settlement snapshot tests**

Assert the report contains `결산명`, `기초잔액`, `총수입`, `총지출`, `기말잔액`, counts, `미대사건수`, `증빙미비건수`, status, Drive file ID, timestamps, and note.

- [ ] **Step 2: Confirm RED**

```bash
node scripts/test-settlement-v2.js
```

Expected: FAIL because current service stores only totals/counts/evidenceCount and status `생성완료`.

- [ ] **Step 3: Compute snapshot metrics**

Use only `활성` ledger entries in range. `미대사건수` is active ledger rows whose `matchStatus !== '정상'` or whose final bank link is absent. `증빙미비건수` counts eligible ledger rows with zero evidence rows.

Opening/closing balance must be derived explicitly from the agreed system balance policy; do not reintroduce per-ledger `거래후잔액`. If bank opening balance is needed, derive it from bank source rows around the report boundary rather than copying a ledger balance field.

- [ ] **Step 4: Persist draft/confirm lifecycle**

Creation produces `작성중`; confirmation writes `확정일시` and freezes the report row. A later ledger change creates a new report rather than updating the confirmed report.

- [ ] **Step 5: Keep export snapshot-safe**

Export must use the stored report totals and the report's period. If a Drive export is generated, only `보고서Drive파일ID` may be added to a `작성중` report or via a narrowly scoped metadata update that does not rewrite confirmed financial metrics.

- [ ] **Step 6: Run tests and commit**

```bash
node scripts/test-settlement-v2.js
node scripts/test-accounting.js
node scripts/verify-public-api-naming.js
git add src/000_server/060_accounting/064_settlement scripts/test-settlement-v2.js
git commit -m "refactor: persist settlement report snapshots"
```

---

### Task 7: Migrate the real OperationDB additively, then retire obsolete structure

**Files / Data:**
- Real spreadsheet: `학생회_운영_2026`
- Add sheets: `계좌거래`, `감사대사상세`, `결산보고서`
- Modify existing sheets: `수입지출원장`, `거래증빙`, `감사대사`
- Obsolete target after verification: `계좌OCR로그` if it exists
- Create: `docs/superpowers/plans/2026-08-19-accounting-db-v2-migration-runbook.md` during execution to record exact before/after headers, row counts, and migration results.

**Interfaces:**
- Sheet headers must exactly match Task 1 schema.
- No historical row deletion during the additive phase.

- [ ] **Step 1: Capture pre-migration state**

Record sheet names, headers, row counts, and a backup/export of the three existing Accounting sheets (`수입지출원장`, `거래증빙`, `감사대사`). Do not proceed if backup cannot be confirmed.

- [ ] **Step 2: Add target sheets/columns only**

Create empty `계좌거래`, `감사대사상세`, `결산보고서` sheets with final headers. Add `계좌거래ID` and `레코드상태` to `수입지출원장`. Add `OCR상태` and `OCR검증결과` to `거래증빙`. Add the new summary columns to `감사대사` while keeping old columns temporarily.

- [ ] **Step 3: Backfill existing ledger semantics explicitly**

For each existing ledger row:

```text
계좌거래ID = blank
유입경로: map existing manual values to MANUAL unless an explicit historical bank source can be proven
일치상태: preserve semantically compatible Korean value; otherwise 미확인
레코드상태: existing valid row -> 활성; historical soft-deleted row -> 무효
거래구분: convert boolean/legacy values to 수입 or 지출
거래금액: absolute positive value
```

Do not manufacture bank transaction rows from ledger rows; bank rows come from actual Toss Excel source.

- [ ] **Step 4: Import actual Toss Excel transactions**

Run the v2 bank import against the real Toss workbook source. Verify row count, signed amounts, nullable balances, original transaction types, and duplicate source hashes before linking anything to ledger.

- [ ] **Step 5: Link only deterministic matches**

For historical rows, automatically set `수입지출원장.계좌거래ID` only when a bank row and ledger row are unambiguous under exact amount/direction and sufficiently exact date/text rules. Leave ambiguous rows blank for manual review. Never create N:1 or 1:N links.

- [ ] **Step 6: Run integrity and semantic checks**

Run `api_checkOperationDbIntegrity()` and confirm no Accounting header/PK/FK/business-key violations. Additionally verify:

```text
no duplicate nonblank ledger 계좌거래ID
no duplicate bank 원본해시
all bank source rows retain signed amount
all ledger amounts are positive
all active ledger transaction types are 수입/지출
all active ledger record statuses are 활성/무효 only
```

- [ ] **Step 7: Retire obsolete columns/tables only after verification**

Remove ledger `거래후잔액`; remove old reconciliation summary columns; remove `계좌OCR로그`. Preserve any historical OCR evidence files in Drive, attaching them to ledger evidence where a safe mapping exists rather than deleting source files.

- [ ] **Step 8: Re-run full verification**

```bash
node scripts/test-accounting-db-v2-schema.js
node scripts/test-bank-transaction-v2.js
node scripts/test-ledger-bank-link-v2.js
node scripts/test-evidence-ocr-v2.js
node scripts/test-reconciliation-v2.js
node scripts/test-settlement-v2.js
node scripts/test-accounting.js
node scripts/test-accounting-money-validation.js
for f in scripts/verify-*.js; do node "$f"; done
```

Then run both live integrity APIs:

```text
api_checkUserDbIntegrity()
api_checkOperationDbIntegrity()
```

Expected: both report `valid: true` after unrelated known UserDB/OperationDB data issues are separately resolved; Accounting-specific issues must be zero at this point.

- [ ] **Step 9: Commit migration documentation**

```bash
git add docs/superpowers/plans/2026-08-19-accounting-db-v2-migration-runbook.md
git commit -m "docs: record Accounting DB v2 migration"
```

---

## Execution Order and Checkpoints

1. **Schema contract first.** Do not edit the real Sheet yet.
2. **Bank ingestion + ledger relationship next.** This establishes the new source-of-truth relationship.
3. **Evidence OCR relocation.** Remove bank-OCR responsibility only after evidence OCR path works.
4. **Reconciliation snapshot rewrite.** Do not migrate old reconciliation data into new semantics by guesswork.
5. **Settlement snapshot expansion.** Keep reports independent of later ledger edits.
6. **Real Sheet additive migration.** Backup, add, backfill, import, link, verify.
7. **Destructive cleanup last.** Remove obsolete columns/table only after integrity and behavior checks pass.

## Current-Code Risks Explicitly Addressed

- `ledger_service.gs` currently persists boolean `expense`, `balanceAfter`, and `ACTIVE/DRAFT/DELETED`; Task 3 replaces these with v2 semantics.
- `bank_ocr_service.gs` currently imports bank rows from OCR and deduplicates partly by source filename; Task 2 replaces this with actual Toss Excel row semantics and `원본해시`.
- `reconciliation_service.gs` currently treats `감사대사상세` as the owner of manual links; Task 5 moves ownership to `수입지출원장.계좌거래ID`.
- `settlement_service.gs` currently stores status `생성완료` and a narrow snapshot; Task 6 implements the full `작성중/확정` report snapshot.
- `operation_db_integrity.gs` currently lacks Accounting v2 secondary-key rules; Task 1 adds source-hash uniqueness and ledger bank-link uniqueness.
