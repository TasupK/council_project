# Accounting Domain Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `src/000_server/060_accounting` into explicit Ledger, Evidence, Reconciliation, and Audit Export boundaries while preserving existing Accounting API behavior and aligning persistence with `학생회_DB명세서_2026`.

**Architecture:** Persisted responsibilities map to `FIN_01_LEDGER`, `FIN_02_EVIDENCE`, and `FIN_03_RECONCILIATION`. This phase is structural only: split current Ledger/Evidence/read code into feature-owned files, preserve `api_getSettlementSummary()` as a compatibility endpoint backed by Accounting-wide read composition, and do not invent Reconciliation or Audit Export behavior that does not yet exist. Accounting reads Event reference data through its own read-only adapter rather than Event internal DAOs.

**Tech Stack:** Google Apps Script `.gs`, Node.js `assert`/`vm`/`fs` regression tests, existing operation-table helpers, Google Drive APIs used by Evidence.

## Global Constraints

- `학생회_DB명세서_2026` is the source of truth for persisted Accounting data structures.
- Preserve existing public `api_*` names, input/output shapes, operation names, default values, deferred-behavior comments, Drive behavior, ID generation, and error behavior during the structural refactor.
- Do not add a separate bank transaction table.
- Do not add Reconciliation or Audit Export behavior during this structural refactor.
- Do not create empty files for architectural symmetry.
- `FIN_01_LEDGER` belongs to `061_ledger`.
- `FIN_02_EVIDENCE` belongs to `062_evidence`.
- `FIN_03_RECONCILIATION` belongs to `063_reconciliation` when concrete persistence behavior exists.
- Audit Export is stateless and has no DAO until an export-history requirement exists.
- Accounting must not call `050_event` internal DAOs; Event reference reads go through `accounting_event_read_dao.gs`.
- Query/Export code is read-only: no locks, writes, Drive uploads, or hidden mutation side effects.
- Avoid classes, dependency-injection containers, generic repositories, ORM abstractions, and framework-like indirection.

---

## File Structure Locked for This Refactor Phase

Only files justified by current behavior are created now.

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

`063_reconciliation/` and `064_audit_export/` remain conceptual target features until real functions exist. No empty Validator files are created because current validation is trivial.

Legacy root files removed by the end of this phase:

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
| `api_getSettlementSummary` | `060_common/accounting_query_service.gs` as a thin compatibility wrapper |
| `findAllAccountingEventRows_` | `060_common/accounting_event_read_dao.gs` |
| all seven existing Ledger `api_*` functions | `061_ledger/ledger_api.gs` |
| `saveLedgerEntry_` | `061_ledger/ledger_service.gs` |
| new `processLedgerEntry_` extracted from API body | `061_ledger/ledger_service.gs` |
| `findAllLedgerRows_`, `insertLedgerRow_`, `updateLedgerRowById_` | `061_ledger/ledger_sheet_dao.gs` |
| `api_getEvidenceFileContent` | `062_evidence/evidence_api.gs` |
| `saveEvidenceFiles_` | `062_evidence/evidence_service.gs` |
| `findAllLedgerEvidenceRows_`, `insertLedgerEvidenceRow_` | `062_evidence/evidence_sheet_dao.gs` |
| new `getEvidenceFileContent_` extracted from API body | `062_evidence/evidence_file_service.gs` |
| `sanitizeFileName_`, `createEvidenceDriveFile_`, `getEvidenceFolder_` | `062_evidence/evidence_file_service.gs` |

---

### Task 1: Add Accounting Characterization Tests and Initial Architecture Gate

**Files:**
- Create: `scripts/test-accounting.js`
- Create: `scripts/verify-accounting-architecture.js`
- Read only: current `src/000_server/060_accounting/*.gs`

**Interfaces:**
- Consumes: current global Apps Script functions under `060_accounting`.
- Produces: regression coverage that survives file moves and an architecture verifier extended incrementally in later tasks.

- [ ] **Step 1: Write the Accounting behavior characterization test**

Create `scripts/test-accounting.js` and recursively load all Accounting `.gs` files so the test is path-independent across the refactor:

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

Cover these current contracts:

```javascript
assert.strictEqual(context.getLedgerEntryDto_({ expense: true }).transaction_type, '지출');
assert.strictEqual(context.getLedgerEntryDto_({ expense: false }).transaction_type, '수입');
```

Also assert:
- Ledger composition adds `event_name`, `evidence`, and `has_evidence`, then sorts descending by `transaction_date`.
- `filterLedgerEntries_()` preserves keyword/type/event/status behavior.
- `saveLedgerEntry_()` preserves ID generation, `source='수기등록'`, `businessType='일반'`, `matchStatus='미확인'`, manager selection, and Evidence forwarding.
- `saveEvidenceFiles_()` preserves category/type defaults, supplied file ID fallback, timestamp, and partial file-write error behavior.
- `api_getSettlementSummary()` still returns the same income/expense/balance/event/evidence summary.

Use a concrete summary fixture:

```javascript
assert.deepStrictEqual(summary, {
  totalIncome: 3000,
  totalExpense: 1200,
  balance: 1800,
  eventCount: 2,
  evidenceCount: 3
});
```

- [ ] **Step 2: Run characterization tests on the pre-refactor code**

```bash
node scripts/test-accounting.js
```

Expected:

```text
Accounting behavior regression tests passed.
```

If a characterization assertion disagrees with the current implementation, correct the fixture to represent the current contract; do not change production behavior in this task.

- [ ] **Step 3: Write the first failing architecture assertions**

Create `scripts/verify-accounting-architecture.js` using the Event verifier's recursive function-ownership pattern. Require only the first migration slice:

```javascript
requireFile_('060_common/accounting_common.gs');
requireFile_('060_common/accounting_query_service.gs');
requireFile_('060_common/accounting_event_read_dao.gs');
forbidFile_('accounting_common.gs');
```

Initial ownership:

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

- [ ] **Step 4: Run architecture verification and confirm RED**

```bash
node scripts/verify-accounting-architecture.js
```

Expected: FAIL because the `060_common/` target files do not yet exist and root `accounting_common.gs` still exists.

- [ ] **Step 5: Commit tests**

```bash
git add scripts/test-accounting.js scripts/verify-accounting-architecture.js
git commit -m "test: add accounting refactor coverage"
```

---

### Task 2: Split Common Read Composition and Event Read Adapter

**Files:**
- Create: `src/000_server/060_accounting/060_common/accounting_common.gs`
- Create: `src/000_server/060_accounting/060_common/accounting_query_service.gs`
- Create: `src/000_server/060_accounting/060_common/accounting_event_read_dao.gs`
- Modify: `src/000_server/060_accounting/accounting_service.gs`
- Modify: `src/000_server/060_accounting/accounting_sheet_dao.gs`
- Delete: `src/000_server/060_accounting/accounting_common.gs`
- Test: `scripts/test-accounting.js`
- Test: `scripts/verify-accounting-architecture.js`

**Interfaces:**
- Consumes: Ledger/Evidence DAO functions that still live in the mixed DAO until later tasks.
- Produces: shared ID/user helpers, read-only DTO/filter/composition functions, and Accounting-owned Event reference reads.

- [ ] **Step 1: Move only genuinely shared helpers**

`060_common/accounting_common.gs`:

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

Do not move `LEDGER_EVIDENCE_FOLDER_PROPERTY_KEY`; it is Evidence-specific.

- [ ] **Step 2: Move read-only composition unchanged**

Move from `accounting_service.gs` into `060_common/accounting_query_service.gs`:

```text
getLedgerEntries_
getLedgerEntryDto_
getEvidenceDto_
filterLedgerEntries_
normalizeFilter_
groupBy_
```

Move `findLedgerEntryDtoById_()` from `ledger.gs` into this Query Service.

- [ ] **Step 3: Move Event reference access**

`060_common/accounting_event_read_dao.gs`:

```javascript
function findAllAccountingEventRows_() {
  return readOperationTableRows_('events');
}
```

Remove the old definition from `accounting_sheet_dao.gs`. The new file must contain no append/update/delete calls.

- [ ] **Step 4: Delete root `accounting_common.gs`**

Its Evidence constant remains temporarily in the old Evidence file until Task 4 so there is exactly one definition.

- [ ] **Step 5: Run architecture and behavior tests**

```bash
node scripts/verify-accounting-architecture.js
node scripts/test-accounting.js
```

Expected: both PASS for the common slice.

- [ ] **Step 6: Commit**

```bash
git add src/000_server/060_accounting scripts/verify-accounting-architecture.js scripts/test-accounting.js
git commit -m "refactor: split accounting common reads"
```

---

### Task 3: Split Ledger API, Service, and DAO

**Files:**
- Create: `src/000_server/060_accounting/061_ledger/ledger_api.gs`
- Create: `src/000_server/060_accounting/061_ledger/ledger_service.gs`
- Create: `src/000_server/060_accounting/061_ledger/ledger_sheet_dao.gs`
- Modify: `src/000_server/060_accounting/060_common/accounting_query_service.gs`
- Modify: `src/000_server/060_accounting/accounting_service.gs`
- Modify: `src/000_server/060_accounting/accounting_sheet_dao.gs`
- Delete: `src/000_server/060_accounting/ledger.gs`
- Test: `scripts/verify-accounting-architecture.js`
- Test: `scripts/test-accounting.js`

**Interfaces:**
- Consumes: Accounting Query Service and operation-table persistence helpers.
- Produces: all existing Ledger public APIs, `saveLedgerEntry_`, `processLedgerEntry_`, and Ledger DAO functions.

- [ ] **Step 1: Extend architecture verifier for Ledger and confirm RED**

Add:

```javascript
requireFile_('061_ledger/ledger_api.gs');
requireFile_('061_ledger/ledger_service.gs');
requireFile_('061_ledger/ledger_sheet_dao.gs');
forbidFile_('ledger.gs');
```

Add ownership:

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
updateLedgerRowById_: '061_ledger/ledger_sheet_dao.gs',
getLedgerDatabaseInfo_: '060_common/accounting_query_service.gs',
getLedgerEventOptions_: '060_common/accounting_query_service.gs'
```

Run and confirm FAIL before moving code.

- [ ] **Step 2: Move Ledger persistence unchanged**

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

Remove these definitions from `accounting_sheet_dao.gs`.

- [ ] **Step 3: Move Ledger mutation behavior**

Move `saveLedgerEntry_()` unchanged from `accounting_service.gs` to `ledger_service.gs`.

Extract the body of `api_processLedgerEntry()` into:

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

Add to `accounting_query_service.gs`:

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

- [ ] **Step 5: Make Ledger API thin**

Keep existing `apiHandler_` operation names and login requirements. Delegate to:

```javascript
getLedgerDatabaseInfo_();
filterLedgerEntries_(getLedgerEntries_(), request || {});
findLedgerEntryDtoById_(id);
getLedgerEventOptions_();
saveLedgerEntry_(input || {}, context);
processLedgerEntry_(input);
```

`api_saveLedgerDraft()` continues calling `saveLedgerEntry_()` exactly as today; do not add a new persisted draft state.

- [ ] **Step 6: Delete root `ledger.gs` and remove migrated Ledger definitions from mixed files**

There must be no duplicate function definitions.

- [ ] **Step 7: Run verification**

```bash
node scripts/verify-accounting-architecture.js
node scripts/test-accounting.js
node scripts/verify-server-architecture.js
```

Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add src/000_server/060_accounting scripts/verify-accounting-architecture.js scripts/test-accounting.js
git commit -m "refactor: split accounting ledger domain"
```

---

### Task 4: Split Evidence Metadata, DAO, and Drive File Service

**Files:**
- Create: `src/000_server/060_accounting/062_evidence/evidence_api.gs`
- Create: `src/000_server/060_accounting/062_evidence/evidence_service.gs`
- Create: `src/000_server/060_accounting/062_evidence/evidence_sheet_dao.gs`
- Create: `src/000_server/060_accounting/062_evidence/evidence_file_service.gs`
- Delete: `src/000_server/060_accounting/evidence.gs`
- Delete after all migrated definitions are removed: `src/000_server/060_accounting/accounting_service.gs`
- Delete after all migrated definitions are removed: `src/000_server/060_accounting/accounting_sheet_dao.gs`
- Test: `scripts/verify-accounting-architecture.js`
- Test: `scripts/test-accounting.js`

**Interfaces:**
- Consumes: Ledger transaction IDs, Evidence operation-table persistence, Google Drive/Properties/Utilities services.
- Produces: existing Evidence public API, Evidence metadata persistence, and Evidence Drive I/O.

- [ ] **Step 1: Extend architecture verifier for Evidence and final mixed-file removal; confirm RED**

Add:

```javascript
requireFile_('062_evidence/evidence_api.gs');
requireFile_('062_evidence/evidence_service.gs');
requireFile_('062_evidence/evidence_sheet_dao.gs');
requireFile_('062_evidence/evidence_file_service.gs');
forbidFile_('evidence.gs');
forbidFile_('accounting_service.gs');
forbidFile_('accounting_sheet_dao.gs');
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

Run and confirm FAIL before moving code.

- [ ] **Step 2: Move Evidence persistence**

```javascript
function findAllLedgerEvidenceRows_() {
  return readOperationTableRows_('evidence');
}

function insertLedgerEvidenceRow_(evidence) {
  return appendOperationTableRow_('evidence', evidence);
}
```

- [ ] **Step 3: Move Evidence metadata orchestration unchanged**

Move `saveEvidenceFiles_()` to `evidence_service.gs`. Preserve:
- one Evidence row per supplied descriptor
- default category `추가증빙`
- default type `기타`
- current partial-error behavior for failed base64 file writes
- current manager/timestamp behavior

Do not add new representative-evidence validation in this phase.

- [ ] **Step 4: Move Evidence Drive behavior**

Move the Evidence-only constant and helpers into `evidence_file_service.gs`:

```javascript
var LEDGER_EVIDENCE_FOLDER_PROPERTY_KEY = 'COUNCIL_LEDGER_EVIDENCE_FOLDER_ID';
```

Move unchanged:

```text
sanitizeFileName_
createEvidenceDriveFile_
getEvidenceFolder_
```

Extract the public API body into:

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

- [ ] **Step 6: Delete migrated mixed root files**

Delete `evidence.gs`, `accounting_service.gs`, and `accounting_sheet_dao.gs` only after every function they contained has exactly one new owner.

- [ ] **Step 7: Run verification**

```bash
node scripts/verify-accounting-architecture.js
node scripts/test-accounting.js
node scripts/verify-server-architecture.js
```

Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add src/000_server/060_accounting scripts/verify-accounting-architecture.js scripts/test-accounting.js
git commit -m "refactor: split accounting evidence domain"
```

---

### Task 5: Remove Settlement as an Internal Domain While Preserving Compatibility

**Files:**
- Modify: `src/000_server/060_accounting/060_common/accounting_query_service.gs`
- Delete: `src/000_server/060_accounting/settlement.gs`
- Modify: `scripts/verify-accounting-architecture.js`
- Test: `scripts/test-accounting.js`

**Interfaces:**
- Consumes: Ledger query results, Event reference rows, Evidence rows.
- Produces: unchanged `api_getSettlementSummary(filter)` behavior backed by `getAccountingSummary_()`.

- [ ] **Step 1: Extend architecture verifier and confirm RED**

```javascript
forbidFile_('settlement.gs');
```

Ownership:

```javascript
api_getSettlementSummary: '060_common/accounting_query_service.gs',
getAccountingSummary_: '060_common/accounting_query_service.gs'
```

Run and confirm FAIL before moving the endpoint.

- [ ] **Step 2: Extract summary calculation unchanged**

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

- [ ] **Step 3: Keep the public compatibility wrapper thin**

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

The public name and response remain unchanged.

- [ ] **Step 4: Delete root `settlement.gs`**

No internal Settlement feature remains.

- [ ] **Step 5: Run full regression set**

```bash
node scripts/verify-accounting-architecture.js
node scripts/test-accounting.js
node scripts/verify-server-architecture.js
node scripts/test-core.js
node scripts/verify-event-architecture.js
node scripts/test-event.js
```

Expected outputs:

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

### Task 6: Final Dependency and Source-of-Truth Verification

**Files:**
- Verify: `src/000_server/060_accounting/**`
- Verify: `docs/superpowers/specs/2026-08-17-accounting-domain-refactoring-design.md`
- Verify: `scripts/verify-accounting-architecture.js`
- Verify: `scripts/test-accounting.js`

**Interfaces:**
- Consumes: final output of Tasks 1-5.
- Produces: a verified structural baseline for future Reconciliation and Audit Export work.

- [ ] **Step 1: Verify final Accounting tree**

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

There must be no root `accounting_common.gs`, `accounting_service.gs`, `accounting_sheet_dao.gs`, `ledger.gs`, `evidence.gs`, or `settlement.gs`.

- [ ] **Step 2: Verify DB ownership by source inspection**

Required ownership:

```text
read/append/update 'ledger' -> 061_ledger/ledger_sheet_dao.gs
read/append 'evidence'      -> 062_evidence/evidence_sheet_dao.gs
read 'events'               -> 060_common/accounting_event_read_dao.gs
```

No Accounting file may write to `events`.

- [ ] **Step 3: Verify no premature scaffolding**

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

- [ ] **Step 5: Review the final diff against compatibility constraints**

Confirm there is no intentional change to:
- public API names
- `apiHandler_` operation names
- response field names
- Ledger default values
- Evidence default values
- Ledger status mapping
- Drive folder property key
- Accounting summary calculation

- [ ] **Step 6: Commit verification-script corrections only if the final verification required them**

```bash
git add scripts/verify-accounting-architecture.js scripts/test-accounting.js
git commit -m "test: finalize accounting architecture gates"
```
