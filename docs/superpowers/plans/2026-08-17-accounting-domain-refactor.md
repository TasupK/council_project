# Accounting Domain Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `src/000_server/060_accounting` into Ledger, Evidence, Reconciliation, and Audit Export boundaries while preserving the existing public Accounting API behavior and aligning persisted responsibilities with `학생회_DB명세서_2026`.

**Architecture:** Persisted features map directly to `FIN_01_LEDGER`, `FIN_02_EVIDENCE`, and `FIN_03_RECONCILIATION`. The first implementation phase is structural only: split the existing Ledger/Evidence/query code into explicit feature-owned files, keep `api_getSettlementSummary()` compatible as an Accounting-wide read endpoint, and do not invent Reconciliation or Audit Export behavior that does not exist yet. Accounting reads Event reference data through its own read-only adapter instead of depending on Event internal DAOs.

**Tech Stack:** Google Apps Script `.gs`, Node.js `assert`/`vm`/`fs` regression tests, existing operation-table helpers, Google Drive APIs used by Evidence.

## Global Constraints

- `학생회_DB명세서_2026` is the source of truth for persisted Accounting data structures.
- Preserve all existing public `api_*` names, input shapes, output shapes, default values, TODO behavior, Drive behavior, and error behavior during the structural refactor.
- Do not add a separate bank transaction table.
- Do not implement missing Reconciliation or Audit Export features during this structural refactor.
- Do not create empty files merely for architectural symmetry.
- `FIN_01_LEDGER` belongs to `061_ledger`.
- `FIN_02_EVIDENCE` belongs to `062_evidence`.
- `FIN_03_RECONCILIATION` belongs to `063_reconciliation` when concrete persistence behavior is implemented.
- Audit Export is stateless and has no DAO unless an export-history requirement is introduced later.
- Accounting must not call `050_event` internal DAOs; Event reference reads go through `accounting_event_read_dao.gs`.
- Query/Export code is read-only: no locks, insert/update/delete, Drive uploads, or hidden mutations.
- Avoid classes, dependency-injection containers, generic repositories, ORM abstractions, and framework-like indirection.

---

## File Structure Locked for This Refactor Phase

Only files justified by existing behavior are created now.

```text
src/000_server/060_accounting/
├─ 060_common/
│  ├─ accounting_common.gs
│  ├─ accounting_query_service.gs
│  └─ accounting_event_read_dao.gs
│
├─ 061_ledger/
│  ├─ ledger_api.gs
│  ├─ ledger_service.gs
│  └─ ledger_sheet_dao.gs
│
└─ 062_evidence/
   ├─ evidence_api.gs
   ├─ evidence_service.gs
   ├─ evidence_sheet_dao.gs
   └─ evidence_file_service.gs
```

`063_reconciliation/` and `064_audit_export/` remain conceptual target features until real functions exist. No empty Validator files are created in this phase because current validation is trivial and embedded in existing behavior.

Legacy root files removed after migration:

```text
src/000_server/060_accounting/accounting_common.gs
src/000_server/060_accounting/accounting_service.gs
src/000_server/060_accounting/accounting_sheet_dao.gs
src/000_server/060_accounting/ledger.gs
src/000_server/060_accounting/evidence.gs
src/000_server/060_accounting/settlement.gs
```

## Function Ownership Mapping

| Current function/value | Target owner |
|---|---|
| `LEDGER_EVIDENCE_FOLDER_PROPERTY_KEY` | `062_evidence/evidence_file_service.gs` |
| `makeId_` | `060_common/accounting_common.gs` |
| `getCurrentUserName_` | `060_common/accounting_common.gs` |
| `groupBy_` | `060_common/accounting_query_service.gs` |
| `getLedgerEntries_` | `060_common/accounting_query_service.gs` |
| `getLedgerEntryDto_` | `060_common/accounting_query_service.gs` |
| `getEvidenceDto_` | `060_common/accounting_query_service.gs` |
| `filterLedgerEntries_` | `060_common/accounting_query_service.gs` |
| `normalizeFilter_` | `060_common/accounting_query_service.gs` |
| `findLedgerEntryDtoById_` | `060_common/accounting_query_service.gs` |
| new `getLedgerDatabaseInfo_` extracted from API body | `060_common/accounting_query_service.gs` |
| new `getLedgerEventOptions_` extracted from API body | `060_common/accounting_query_service.gs` |
| new `getAccountingSummary_` extracted from `api_getSettlementSummary` | `060_common/accounting_query_service.gs` |
| `api_getSettlementSummary` | `060_common/accounting_query_service.gs` as thin compatibility API |
| `findAllAccountingEventRows_` | `060_common/accounting_event_read_dao.gs` |
| `api_getLedgerDatabaseInfo` | `061_ledger/ledger_api.gs` |
| `api_getLedgerList` | `061_ledger/ledger_api.gs` |
| `api_getLedgerDetail` | `061_ledger/ledger_api.gs` |
| `api_getLedgerEventOptions` | `061_ledger/ledger_api.gs` |
| `api_createLedgerEntry` | `061_ledger/ledger_api.gs` |
| `api_saveLedgerDraft` | `061_ledger/ledger_api.gs` |
| `api_processLedgerEntry` | `061_ledger/ledger_api.gs` |
| `saveLedgerEntry_` | `061_ledger/ledger_service.gs` |
| new `processLedgerEntry_` extracted from API body | `061_ledger/ledger_service.gs` |
| `findAllLedgerRows_` | `061_ledger/ledger_sheet_dao.gs` |
| `insertLedgerRow_` | `061_ledger/ledger_sheet_dao.gs` |
| `updateLedgerRowById_` | `061_ledger/ledger_sheet_dao.gs` |
| `api_getEvidenceFileContent` | `062_evidence/evidence_api.gs` |
| `saveEvidenceFiles_` | `062_evidence/evidence_service.gs` |
| `findAllLedgerEvidenceRows_` | `062_evidence/evidence_sheet_dao.gs` |
| `insertLedgerEvidenceRow_` | `062_evidence/evidence_sheet_dao.gs` |
| new `getEvidenceFileContent_` extracted from API body | `062_evidence/evidence_file_service.gs` |
| `sanitizeFileName_` | `062_evidence/evidence_file_service.gs` |
| `createEvidenceDriveFile_` | `062_evidence/evidence_file_service.gs` |
| `getEvidenceFolder_` | `062_evidence/evidence_file_service.gs` |

---

### Task 1: Add Accounting Characterization Tests and Start Architecture Verification

**Files:**
- Create: `scripts/test-accounting.js`
- Create: `scripts/verify-accounting-architecture.js`
- Read only: current `src/000_server/060_accounting/*.gs`

**Interfaces:**
- Consumes: current global Apps Script functions under `060_accounting`.
- Produces: executable regression tests that remain valid after files move, plus the architecture verifier used incrementally in later tasks.

- [ ] **Step 1: Write the Accounting behavior characterization test**

Create `scripts/test-accounting.js` so it recursively loads every `.gs` file under `src/000_server/060_accounting` instead of hard-coding current file paths. Stub external Apps Script dependencies after loading where needed.

The test must cover these existing behaviors:

```javascript
// 1. Ledger DTO mapping
assert.strictEqual(context.getLedgerEntryDto_({ expense: true }).transaction_type, '지출');
assert.strictEqual(context.getLedgerEntryDto_({ expense: false }).transaction_type, '수입');

// 2. Cross-feature Ledger composition
// eventId -> event_name
// transactionId -> evidence[]
// has_evidence derived from evidence length
// descending transaction_date sort

// 3. Ledger filtering
// keyword, transaction_type, event_name, status

// 4. Ledger save defaults
// transaction_id generation, source='수기등록', business_type='일반',
// match_status='미확인', manager from context.user.email,
// evidence_files forwarded to saveEvidenceFiles_

// 5. Evidence metadata mapping
// evidence_category default '추가증빙', evidence_type default '기타',
// file_id fallback when no base64 upload, timestamp preserved

// 6. Existing settlement-summary compatibility
assert.deepStrictEqual(summary, {
  totalIncome: 3000,
  totalExpense: 1200,
  balance: 1800,
  eventCount: 2,
  evidenceCount: 3
});
```

The loader should use this shape:

```javascript
function listGsFiles_(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).reduce(function (files, entry) {
    var target = path.join(directory, entry.name);
    if (entry.isDirectory()) return files.concat(listGsFiles_(target));
    if (/\.gs$/.test(entry.name)) files.push(target);
    return files;
  }, []).sort();
}
```

- [ ] **Step 2: Run the characterization test against the pre-refactor code**

Run:

```bash
node scripts/test-accounting.js
```

Expected:

```text
Accounting behavior regression tests passed.
```

If a characterization assertion does not match current behavior, adjust the test to the actual current contract rather than changing production code in this task.

- [ ] **Step 3: Write the first failing architecture assertions**

Create `scripts/verify-accounting-architecture.js` with recursive function ownership detection equivalent to the Event architecture verifier. Start by requiring the new common layer and forbidding the legacy root common/service files:

```javascript
requireFile_('060_common/accounting_common.gs');
requireFile_('060_common/accounting_query_service.gs');
requireFile_('060_common/accounting_event_read_dao.gs');

forbidFile_('accounting_common.gs');
forbidFile_('accounting_service.gs');
forbidFile_('accounting_sheet_dao.gs');
```

Require these ownerships in the first stage:

```javascript
var ownership = {
  makeId_: '060_common/accounting_common.gs',
  getCurrentUserName_: '060_common/accounting_common.gs',
  groupBy_: '060_common/accounting_query_service.gs',
  getLedgerEntries_: '060_common/accounting_query_service.gs',
  getLedgerEntryDto_: '060_common/accounting_query_service.gs',
  getEvidenceDto_: '060_common/accounting_query_service.gs',
  filterLedgerEntries_: '060_common/accounting_query_service.gs',
  normalizeFilter_: '060_common/accounting_query_service.gs',
  findLedgerEntryDtoById_: '060_common/accounting_query_service.gs',
  findAllAccountingEventRows_: '060_common/accounting_event_read_dao.gs'
};
```

- [ ] **Step 4: Run the architecture verifier and confirm RED**

Run:

```bash
node scripts/verify-accounting-architecture.js
```

Expected: FAIL because the `060_common/` target files do not yet exist and the root legacy files still exist.

- [ ] **Step 5: Commit the test harness**

```bash
git add scripts/test-accounting.js scripts/verify-accounting-architecture.js
git commit -m "test: add accounting refactor coverage"
```

---

### Task 2: Split Accounting Common Query and Read-Only Event Adapter

**Files:**
- Create: `src/000_server/060_accounting/060_common/accounting_common.gs`
- Create: `src/000_server/060_accounting/060_common/accounting_query_service.gs`
- Create: `src/000_server/060_accounting/060_common/accounting_event_read_dao.gs`
- Modify later/delete after migration: `src/000_server/060_accounting/accounting_service.gs`
- Modify later/delete after migration: `src/000_server/060_accounting/accounting_sheet_dao.gs`
- Delete: `src/000_server/060_accounting/accounting_common.gs`
- Test: `scripts/test-accounting.js`
- Test: `scripts/verify-accounting-architecture.js`

**Interfaces:**
- Consumes: `findAllLedgerRows_()`, `findAllLedgerEvidenceRows_()`, operation-table formatting helpers.
- Produces: `makeId_`, `getCurrentUserName_`, query/DTO/filter functions, and read-only `findAllAccountingEventRows_`.

- [ ] **Step 1: Move only genuinely shared helpers into `accounting_common.gs`**

Move without behavior changes:

```javascript
function makeId_(prefix) {
  return prefix + '-' + Utilities.getUuid();
}

function getCurrentUserName_() {
  try {
    return Session.getActiveUser().getEmail() || '운영자';
  } catch (error) {
    console.error('Failed to read accounting user email.', error);
    return '운영자';
  }
}
```

Do not move `LEDGER_EVIDENCE_FOLDER_PROPERTY_KEY`; it is Evidence-specific and moves in Task 4.

- [ ] **Step 2: Move read-only composition into `accounting_query_service.gs`**

Move these existing functions with unchanged bodies:

```text
getLedgerEntries_
getLedgerEntryDto_
getEvidenceDto_
filterLedgerEntries_
normalizeFilter_
groupBy_
findLedgerEntryDtoById_
```

No writes, locks, or Drive uploads are allowed in this file.

- [ ] **Step 3: Move Event reference access into `accounting_event_read_dao.gs`**

Use exactly:

```javascript
function findAllAccountingEventRows_() {
  return readOperationTableRows_('events');
}
```

This file must contain no append/update/delete calls.

- [ ] **Step 4: Delete the legacy root `accounting_common.gs` after its responsibilities are relocated**

Do not delete `accounting_service.gs` or `accounting_sheet_dao.gs` yet; Ledger/Evidence functions still live there until Tasks 3-4.

- [ ] **Step 5: Run common architecture verification**

Run:

```bash
node scripts/verify-accounting-architecture.js
```

Expected: the common ownership assertions PASS. If the verifier still reports legacy `accounting_service.gs` / `accounting_sheet_dao.gs`, temporarily narrow those two `forbidFile_` assertions until their final deletion in Task 4; do not weaken ownership assertions.

- [ ] **Step 6: Run behavior regression tests**

```bash
node scripts/test-accounting.js
```

Expected:

```text
Accounting behavior regression tests passed.
```

- [ ] **Step 7: Commit**

```bash
git add src/000_server/060_accounting/060_common src/000_server/060_accounting/accounting_common.gs scripts/verify-accounting-architecture.js
git commit -m "refactor: split accounting common reads"
```

---

### Task 3: Split Ledger API, Service, and DAO

**Files:**
- Create: `src/000_server/060_accounting/061_ledger/ledger_api.gs`
- Create: `src/000_server/060_accounting/061_ledger/ledger_service.gs`
- Create: `src/000_server/060_accounting/061_ledger/ledger_sheet_dao.gs`
- Modify: `src/000_server/060_accounting/060_common/accounting_query_service.gs`
- Delete after migration: `src/000_server/060_accounting/ledger.gs`
- Modify later/delete after migration: `src/000_server/060_accounting/accounting_service.gs`
- Modify later/delete after migration: `src/000_server/060_accounting/accounting_sheet_dao.gs`
- Test: `scripts/verify-accounting-architecture.js`
- Test: `scripts/test-accounting.js`

**Interfaces:**
- Consumes: `getLedgerEntries_()`, `filterLedgerEntries_()`, `findLedgerEntryDtoById_()`, operation-table DAO helpers.
- Produces: existing Ledger public API functions, `saveLedgerEntry_`, `processLedgerEntry_`, Ledger table DAO functions.

- [ ] **Step 1: Extend architecture verifier with Ledger ownership and confirm RED**

Add:

```javascript
requireFile_('061_ledger/ledger_api.gs');
requireFile_('061_ledger/ledger_service.gs');
requireFile_('061_ledger/ledger_sheet_dao.gs');
forbidFile_('ledger.gs');
```

Require:

```javascript
api_getLedgerDatabaseInfo: '061_ledger/ledger_api.gs',
api_getLedgerList: '061_ledger/ledger_api.gs',
api_getLedgerDetail: '061_ledger/ledger_api.gs',
api_getLedgerEventOptions: '061_ledger/ledger_api.gs',
api_createLedgerEntry: '061_ledger/ledger_api.gs',
api_saveLedgerDraft: '061_ledger/ledger_api.gs',
api_processLedgerEntry: '061_ledger/ledger_api.gs',
saveLedgerEntry_: '061_ledger/ledger_service.gs',
processLedgerEntry_: '061_ledger/ledger_service.gs',
findAllLedgerRows_: '061_ledger/ledger_sheet_dao.gs',
insertLedgerRow_: '061_ledger/ledger_sheet_dao.gs',
updateLedgerRowById_: '061_ledger/ledger_sheet_dao.gs'
```

Run:

```bash
node scripts/verify-accounting-architecture.js
```

Expected: FAIL on missing Ledger target files/functions.

- [ ] **Step 2: Move Ledger persistence functions without changing bodies**

`ledger_sheet_dao.gs`:

```javascript
function findAllLedgerRows_() {
  return readOperationTableRows_('ledger');
}

function insertLedgerRow_(ledger) {
  return appendOperationTableRow_('ledger', ledger);
}

function updateLedgerRowById_(transactionId, changes) {
  return updateOperationTableRow_('ledger', transactionId, changes);
}
```

- [ ] **Step 3: Move Ledger mutation logic into Service**

Move `saveLedgerEntry_()` unchanged.

Extract the mutation body from `api_processLedgerEntry()` into:

```javascript
function processLedgerEntry_(input) {
  var status;
  input = input || {};
  if (!input.transaction_id) throw new Error('transaction_id is required.');
  status = input.action === 'approve' ? '정상' : '확인필요';
  updateLedgerRowById_(input.transaction_id, {
    matchStatus: status,
    updatedAt: getCurrentIsoDateTime_()
  });
  return {
    ok: true,
    transaction_id: input.transaction_id,
    status: status,
    item: findLedgerEntryDtoById_(input.transaction_id)
  };
}
```

- [ ] **Step 4: Extract Ledger read orchestration from API bodies**

Add these read-only functions to `accounting_query_service.gs`.

```javascript
function getLedgerDatabaseInfo_() {
  var spreadsheet = openOperationSpreadsheet_();
  var table = getOperationDbTableSchema_('ledger');
  requireOperationTableSheet_('ledger');
  var sheet = spreadsheet.getSheetByName(table.sheetName);
  return {
    ok: true,
    spreadsheetId: spreadsheet.getId(),
    spreadsheetName: spreadsheet.getName(),
    spreadsheetUrl: spreadsheet.getUrl(),
    transactionRowCount: sheet ? Math.max(0, sheet.getLastRow() - 1) : 0
  };
}

function getLedgerEventOptions_() {
  var items = getLedgerEntries_();
  return findAllAccountingEventRows_().map(function (event) {
    var balance = items.reduce(function (sum, item) {
      if (String(item.event_id) !== String(event.id)) return sum;
      return sum + (item.transaction_type === '수입' ? Number(item.amount) : -Number(item.amount));
    }, 0);
    return { event_id: event.id, event_name: event.name, balance: balance };
  });
}
```

- [ ] **Step 5: Make `ledger_api.gs` thin while preserving public contracts**

Keep the existing `apiHandler_` operation names, login requirement, and response shapes. The service callbacks delegate only:

```javascript
service: function () { return getLedgerDatabaseInfo_(); }
service: function (request) {
  var items = filterLedgerEntries_(getLedgerEntries_(), request || {});
  return { items: items, page: { pageNo: 1, pageSize: items.length, totalCount: items.length } };
}
service: function (id) { return findLedgerEntryDtoById_(id); }
service: function () { return getLedgerEventOptions_(); }
service: function (input, context) { return saveLedgerEntry_(input || {}, context); }
service: function (input) { return processLedgerEntry_(input); }
```

`api_saveLedgerDraft()` continues delegating to `saveLedgerEntry_()` exactly as today; do not invent draft-state persistence.

- [ ] **Step 6: Delete root `ledger.gs` and remove migrated Ledger functions from old mixed files**

At this point no duplicate definitions may remain.

- [ ] **Step 7: Run verification**

```bash
node scripts/verify-accounting-architecture.js
node scripts/test-accounting.js
node scripts/verify-server-architecture.js
```

Expected: Ledger ownership passes; Accounting behavior remains unchanged; server-wide duplicate/syntax checks pass.

- [ ] **Step 8: Commit**

```bash
git add src/000_server/060_accounting scripts/verify-accounting-architecture.js
git commit -m "refactor: split accounting ledger domain"
```

---

### Task 4: Split Evidence Metadata, DAO, and Drive File Service

**Files:**
- Create: `src/000_server/060_accounting/062_evidence/evidence_api.gs`
- Create: `src/000_server/060_accounting/062_evidence/evidence_service.gs`
- Create: `src/000_server/060_accounting/062_evidence/evidence_sheet_dao.gs`
- Create: `src/000_server/060_accounting/062_evidence/evidence_file_service.gs`
- Delete after migration: `src/000_server/060_accounting/evidence.gs`
- Delete after migration: `src/000_server/060_accounting/accounting_service.gs`
- Delete after migration: `src/000_server/060_accounting/accounting_sheet_dao.gs`
- Test: `scripts/verify-accounting-architecture.js`
- Test: `scripts/test-accounting.js`

**Interfaces:**
- Consumes: Ledger transaction IDs, operation-table Evidence access, Google Drive/Properties/Utilities services.
- Produces: existing Evidence public API, Evidence metadata persistence, Evidence Drive I/O, `FIN_02_EVIDENCE` DAO functions.

- [ ] **Step 1: Extend architecture verifier with Evidence ownership and confirm RED**

Add:

```javascript
requireFile_('062_evidence/evidence_api.gs');
requireFile_('062_evidence/evidence_service.gs');
requireFile_('062_evidence/evidence_sheet_dao.gs');
requireFile_('062_evidence/evidence_file_service.gs');
forbidFile_('evidence.gs');
```

Ownership:

```javascript
api_getEvidenceFileContent: '062_evidence/evidence_api.gs',
saveEvidenceFiles_: '062_evidence/evidence_service.gs',
findAllLedgerEvidenceRows_: '062_evidence/evidence_sheet_dao.gs',
insertLedgerEvidenceRow_: '062_evidence/evidence_sheet_dao.gs',
getEvidenceFileContent_: '062_evidence/evidence_file_service.gs',
sanitizeFileName_: '062_evidence/evidence_file_service.gs',
createEvidenceDriveFile_: '062_evidence/evidence_file_service.gs',
getEvidenceFolder_: '062_evidence/evidence_file_service.gs'
```

Run and confirm FAIL before implementation.

- [ ] **Step 2: Move Evidence persistence functions**

`evidence_sheet_dao.gs`:

```javascript
function findAllLedgerEvidenceRows_() {
  return readOperationTableRows_('evidence');
}

function insertLedgerEvidenceRow_(evidence) {
  return appendOperationTableRow_('evidence', evidence);
}
```

- [ ] **Step 3: Move Evidence metadata orchestration into Service**

Move `saveEvidenceFiles_()` unchanged. It continues to:
- accept a Ledger `transactionId`
- create one Evidence row per supplied file descriptor
- default `evidence_category` to `추가증빙`
- default `evidence_type` to `기타`
- preserve current partial-error behavior for failed base64 file writes

Do not add new representative-evidence validation in this structural task.

- [ ] **Step 4: Move Evidence-specific Drive behavior into File Service**

Move the constant and file helpers together:

```javascript
var LEDGER_EVIDENCE_FOLDER_PROPERTY_KEY = 'COUNCIL_LEDGER_EVIDENCE_FOLDER_ID';
```

Move unchanged:

```text
sanitizeFileName_
createEvidenceDriveFile_
getEvidenceFolder_
```

Extract the file-reading body from `api_getEvidenceFileContent()` into:

```javascript
function getEvidenceFileContent_(input) {
  var fileId;
  var file;
  var blob;
  input = input || {};
  fileId = input.file_id || '';
  if (!fileId && input.evidence_id) {
    var evidence = findAllLedgerEvidenceRows_().filter(function (item) {
      return String(item.id) === String(input.evidence_id);
    })[0];
    fileId = evidence ? evidence.driveFileId : '';
  }
  if (!fileId) throw new Error('증빙 파일 ID가 없습니다.');
  file = DriveApp.getFileById(fileId);
  blob = file.getBlob();
  return {
    ok: true,
    file_id: fileId,
    file_name: file.getName(),
    mime_type: blob.getContentType(),
    content_base64: Utilities.base64Encode(blob.getBytes())
  };
}
```

- [ ] **Step 5: Make Evidence API thin**

`evidence_api.gs` keeps `api_getEvidenceFileContent(request)` and delegates:

```javascript
function api_getEvidenceFileContent(request) {
  return apiHandler_({
    operation: 'getEvidenceFileContent',
    input: request,
    requireLogin: true,
    service: function (input) {
      return getEvidenceFileContent_(input);
    }
  });
}
```

- [ ] **Step 6: Remove the now-empty mixed root files**

After all functions have migrated, delete:

```text
accounting_service.gs
accounting_sheet_dao.gs
evidence.gs
```

No function may be duplicated between old and new locations.

- [ ] **Step 7: Run verification**

```bash
node scripts/verify-accounting-architecture.js
node scripts/test-accounting.js
node scripts/verify-server-architecture.js
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add src/000_server/060_accounting scripts/verify-accounting-architecture.js
git commit -m "refactor: split accounting evidence domain"
```

---

### Task 5: Remove Settlement as an Internal Domain While Preserving API Compatibility

**Files:**
- Modify: `src/000_server/060_accounting/060_common/accounting_query_service.gs`
- Delete: `src/000_server/060_accounting/settlement.gs`
- Modify: `scripts/verify-accounting-architecture.js`
- Test: `scripts/test-accounting.js`

**Interfaces:**
- Consumes: Ledger query results, Accounting Event reference rows, Evidence rows.
- Produces: unchanged public `api_getSettlementSummary(filter)` contract backed by `getAccountingSummary_()`.

- [ ] **Step 1: Extend architecture verifier and confirm RED**

Add:

```javascript
forbidFile_('settlement.gs');
```

Require:

```javascript
api_getSettlementSummary: '060_common/accounting_query_service.gs',
getAccountingSummary_: '060_common/accounting_query_service.gs'
```

Run:

```bash
node scripts/verify-accounting-architecture.js
```

Expected: FAIL because `settlement.gs` still exists and `getAccountingSummary_` does not yet exist.

- [ ] **Step 2: Extract the existing summary calculation unchanged**

Add:

```javascript
function getAccountingSummary_(request) {
  var items = filterLedgerEntries_(getLedgerEntries_(), request || {});
  var income = items.reduce(function (sum, item) {
    return sum + (item.transaction_type === '수입' ? Number(item.amount) : 0);
  }, 0);
  var expense = items.reduce(function (sum, item) {
    return sum + (item.transaction_type === '지출' ? Number(item.amount) : 0);
  }, 0);
  return {
    totalIncome: income,
    totalExpense: expense,
    balance: income - expense,
    eventCount: findAllAccountingEventRows_().length,
    evidenceCount: findAllLedgerEvidenceRows_().length
  };
}
```

- [ ] **Step 3: Preserve the old public API as a thin compatibility wrapper**

Place in the same `accounting_query_service.gs` file because the agreed common structure does not introduce a separate common API file:

```javascript
function api_getSettlementSummary(filter) {
  return apiHandler_({
    operation: 'getSettlementSummary',
    input: filter,
    requireLogin: true,
    service: function (request) {
      return getAccountingSummary_(request);
    }
  });
}
```

Do not rename the public API in this phase.

- [ ] **Step 4: Delete root `settlement.gs`**

No internal Settlement feature remains after this step.

- [ ] **Step 5: Run all Accounting regression and architecture tests**

```bash
node scripts/verify-accounting-architecture.js
node scripts/test-accounting.js
node scripts/verify-server-architecture.js
node scripts/test-core.js
node scripts/verify-event-architecture.js
node scripts/test-event.js
```

Expected outputs include:

```text
Accounting architecture verification passed.
Accounting behavior regression tests passed.
Server architecture verification passed.
Core behavior tests passed.
Event architecture verification passed.
Event behavior regression tests passed.
```

- [ ] **Step 6: Commit**

```bash
git add src/000_server/060_accounting scripts/verify-accounting-architecture.js scripts/test-accounting.js
git commit -m "refactor: remove accounting settlement domain"
```

---

### Task 6: Final Source-of-Truth and Dependency Verification

**Files:**
- Verify: `src/000_server/060_accounting/**`
- Verify: `docs/superpowers/specs/2026-08-17-accounting-domain-refactoring-design.md`
- Verify: `scripts/verify-accounting-architecture.js`
- Verify: `scripts/test-accounting.js`

**Interfaces:**
- Consumes: all previous refactor tasks.
- Produces: a verified structural baseline for future Reconciliation and Audit Export implementation.

- [ ] **Step 1: Verify final Accounting tree**

Expected persisted implementation tree for this phase:

```text
060_accounting/
├─ 060_common/
│  ├─ accounting_common.gs
│  ├─ accounting_query_service.gs
│  └─ accounting_event_read_dao.gs
├─ 061_ledger/
│  ├─ ledger_api.gs
│  ├─ ledger_service.gs
│  └─ ledger_sheet_dao.gs
└─ 062_evidence/
   ├─ evidence_api.gs
   ├─ evidence_service.gs
   ├─ evidence_sheet_dao.gs
   └─ evidence_file_service.gs
```

There must be no root `accounting_service.gs`, `accounting_sheet_dao.gs`, `ledger.gs`, `evidence.gs`, or `settlement.gs`.

- [ ] **Step 2: Verify database ownership by source inspection**

Required write ownership:

```text
append/update 'ledger'   -> only 061_ledger/ledger_sheet_dao.gs
append 'evidence'        -> only 062_evidence/evidence_sheet_dao.gs
read 'events'            -> 060_common/accounting_event_read_dao.gs
```

No Accounting file may write to `events`.

- [ ] **Step 3: Verify no premature feature scaffolding**

Confirm there are no empty placeholder files under `063_reconciliation` or `064_audit_export` and no empty `*_validator.gs` files.

- [ ] **Step 4: Run the complete verification set fresh**

```bash
node scripts/test-core.js
node scripts/verify-server-architecture.js
node scripts/verify-event-architecture.js
node scripts/test-event.js
node scripts/verify-accounting-architecture.js
node scripts/test-accounting.js
```

Do not claim completion unless all commands were run against the final branch state and their fresh output is available.

- [ ] **Step 5: Review the final diff against the compatibility constraints**

Confirm the diff contains structural movement/extraction only and no intentional change to:
- public API names
- operation names passed to `apiHandler_`
- response field names
- Ledger defaults
- Evidence defaults
- status mapping
- Drive folder property key
- summary calculation

- [ ] **Step 6: Commit any verification-script corrections only if required**

```bash
git add scripts/verify-accounting-architecture.js scripts/test-accounting.js
git commit -m "test: finalize accounting architecture gates"
```
