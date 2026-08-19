# Student Fee Form Source Provenance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move student-fee payment form ingestion to an external Google Form source, add provenance to `feeApplications`, prevent duplicate imports by Google Form Response ID, and retire the OperationDB `납부폼_응답` staging tab only after verification.

**Architecture:** Google Form is the canonical source and FormApp supplies `FormResponse.getId()` / `getTimestamp()`. The linked response Spreadsheet remains a read-only raw mirror and is not an OperationDB table. A focused student-fee import service maps Form item titles to a normalized application DTO, performs locked deduplication by `sourceResponseId`, inserts `feeApplications`, and writes canonical `IMPORT / feeApplications` audit records.

**Tech Stack:** Google Apps Script, FormApp, SpreadsheetApp, OperationDB schema/DAO helpers, Node-based contract tests, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-19-student-fee-form-source-provenance-design.md`

## Global Constraints

- Google Form is the canonical source; the response Spreadsheet is read-only raw mirror.
- Never derive source identity from Spreadsheet row number or `timestamp + studentId`.
- `sourceResponseId` comes from `FormResponse.getId()`.
- Existing legacy `feeApplications` rows may keep null provenance.
- New Form-imported rows must persist provenance.
- Existing `납부신청ID` generation and business workflow remain unchanged.
- Existing `납부폼_응답` tab is deleted only after code, source configuration, backup, and readback verification are complete.
- Frontend redesign and refund Form ingestion are out of scope.

---

### Task 1: Lock the provenance schema contract

**Files:**
- Modify: `src/000_server/020_schema/operation_db_schema.gs`
- Create: `scripts/test-student-fee-form-provenance.js`
- Modify: `.github/workflows/operation-user-fk-semester-normalization.yml` or add the new test to the existing student-fee regression workflow that already executes `scripts/test-student-fee.js`

**Interfaces:**
- Consumes: `getOperationDbSchema_()`
- Produces: `feeApplications.fields.sourceResponseId`, `sourceResponseAt`, `importedAt`

- [ ] **Step 1: Write the failing schema contract**

Create `scripts/test-student-fee-form-provenance.js` with assertions equivalent to:

```javascript
const schema = loadOperationSchema();
const fields = schema.feeApplications.fields;

assert.equal(fields.sourceResponseId, '원본응답ID');
assert.equal(fields.sourceResponseAt, '원본응답일시');
assert.equal(fields.importedAt, '가져온일시');
assert.equal(schema.feeApplications.primaryKey[0], 'id');
```

Also assert that no OperationDB schema entry owns sheet name `납부폼_응답`.

- [ ] **Step 2: Run the contract and verify RED**

Run the workflow or Node script.
Expected: FAIL because the provenance fields do not yet exist.

- [ ] **Step 3: Add provenance fields to `feeApplications`**

Update the schema fields to:

```javascript
fields: {
  id: '납부신청ID',
  sourceResponseId: '원본응답ID',
  sourceResponseAt: '원본응답일시',
  studentId: '학번',
  name: '성명',
  affiliation: '소속',
  paymentDate: '납입날짜',
  semesterNumber: '신청학기차수',
  appliedAt: '신청일시',
  status: '신청상태',
  importedAt: '가져온일시',
  managerEmail: '담당자이메일',
  processedAt: '처리일시',
  studentCardFileId: '학생카드캡쳐파일ID',
  depositFileId: '입금캡쳐파일ID'
}
```

Do not change the primary key from `id`.

- [ ] **Step 4: Run the provenance schema test**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/000_server/020_schema/operation_db_schema.gs scripts/test-student-fee-form-provenance.js .github/workflows
git commit -m "feat: add student fee application provenance schema"
```

---

### Task 2: Add source-response lookup to the application DAO

**Files:**
- Modify: `src/000_server/080_student_fee/082_payments/fee_applications_sheet_dao.gs`
- Modify: `scripts/test-student-fee-form-provenance.js`

**Interfaces:**
- Consumes: existing OperationDB row helpers and `OPERATION_TABLES.feeApplications`
- Produces:
  - `findFeeApplicationRowBySourceResponseId_(sourceResponseId)`
  - existing insert path capable of persisting provenance columns

- [ ] **Step 1: Add a failing DAO contract**

Add a VM test that seeds two fee-application rows, one legacy row with blank provenance and one row with `sourceResponseId: 'FORM-RESP-1'`, then asserts:

```javascript
const row = findFeeApplicationRowBySourceResponseId_('FORM-RESP-1');
assert.equal(row.id, 'PAYAPP-000002');
assert.equal(findFeeApplicationRowBySourceResponseId_('missing'), null);
```

- [ ] **Step 2: Verify RED**

Expected: FAIL because the lookup helper does not exist.

- [ ] **Step 3: Implement the DAO lookup**

Use the existing fee-application sheet row reader and compare the normalized `sourceResponseId` field. Blank legacy values must not match.

- [ ] **Step 4: Verify GREEN**

Run the provenance test and existing `scripts/test-student-fee.js`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/000_server/080_student_fee/082_payments/fee_applications_sheet_dao.gs scripts/test-student-fee-form-provenance.js
git commit -m "feat: lookup fee applications by source response"
```

---

### Task 3: Implement FormResponse parsing without Spreadsheet-row identity

**Files:**
- Create: `src/000_server/080_student_fee/082_payments/fee_application_form_parser.gs`
- Modify: `scripts/test-student-fee-form-provenance.js`

**Interfaces:**
- Consumes: a FormResponse-like object exposing `getId()`, `getTimestamp()`, `getItemResponses()`
- Produces: `parseFeeApplicationFormResponse_(formResponse)` returning:

```javascript
{
  sourceResponseId: string,
  sourceResponseAt: string,
  studentId: string,
  name: string,
  affiliation: string,
  paymentDate: string,
  semesterNumber: string,
  studentCardFileId: string,
  depositFileId: string
}
```

- [ ] **Step 1: Write parser RED tests**

Build a fake FormResponse whose item responses expose `getItem().getTitle()` and `getResponse()`.

Test at least:

```javascript
assert.equal(dto.sourceResponseId, 'FORM-RESP-001');
assert.equal(dto.studentId, '6022118');
assert.equal(dto.name, '이서연');
```

Also assert the parser source contains no dependency on Spreadsheet row number, `getRow()`, or `timestamp + studentId` key generation.

- [ ] **Step 2: Verify RED**

Expected: FAIL because the parser does not exist.

- [ ] **Step 3: Implement title-based parsing**

Map the exact payment-form question titles already used by the existing raw sample. Keep the title map in one constant object inside the parser file, e.g.:

```javascript
var FEE_PAYMENT_FORM_TITLES_ = {
  studentId: '학번',
  name: '성명',
  affiliation: '소속',
  paymentDate: '납입날짜',
  semesterNumber: '적용학기수',
  studentCardFileId: '학생카드캡쳐파일ID',
  depositFileId: '입금캡쳐파일ID'
};
```

File-upload answers may be arrays/URLs; normalize them to Drive file IDs in one helper inside this parser.

- [ ] **Step 4: Verify GREEN**

Expected: parser tests PASS and existing student-fee tests remain PASS.

- [ ] **Step 5: Commit**

```bash
git add src/000_server/080_student_fee/082_payments/fee_application_form_parser.gs scripts/test-student-fee-form-provenance.js
git commit -m "feat: parse student fee Google Form responses"
```

---

### Task 4: Implement source configuration and read-only Form access

**Files:**
- Modify: `src/000_server/070_settings/*` only through the existing settings accessor pattern; do not introduce a second settings store
- Create: `src/000_server/080_student_fee/082_payments/fee_application_form_source.gs`
- Modify: `scripts/test-student-fee-form-provenance.js`

**Interfaces:**
- Consumes `_설정` key `STUDENT_FEE_PAYMENT_FORM_ID`
- Produces:
  - `getStudentFeePaymentFormId_()`
  - `listStudentFeePaymentFormResponses_()`

- [ ] **Step 1: Write RED tests for configuration and FormApp access**

Assert missing form ID throws a clear configuration error.
Assert the source reader calls:

```javascript
FormApp.openById(formId).getResponses()
```

and never writes to the Form or response Spreadsheet.

- [ ] **Step 2: Verify RED**

Expected: FAIL because the source reader does not exist.

- [ ] **Step 3: Implement minimal read-only source adapter**

```javascript
function listStudentFeePaymentFormResponses_() {
  var formId = getStudentFeePaymentFormId_();
  return FormApp.openById(formId).getResponses();
}
```

No `setDestination`, `deleteResponse`, Spreadsheet writes, or response-sheet mutation is allowed.

- [ ] **Step 4: Verify GREEN**

Run provenance and student-fee tests.

- [ ] **Step 5: Commit**

```bash
git add src/000_server/070_settings src/000_server/080_student_fee/082_payments/fee_application_form_source.gs scripts/test-student-fee-form-provenance.js
git commit -m "feat: add read only student fee form source"
```

---

### Task 5: Implement locked, idempotent Form import

**Files:**
- Create: `src/000_server/080_student_fee/082_payments/fee_application_form_import_service.gs`
- Modify: `src/000_server/080_student_fee/082_payments/fee_payments_api.gs`
- Modify: `scripts/test-student-fee-form-provenance.js`
- Modify: `scripts/test-business-audit-taxonomy.js`

**Interfaces:**
- Consumes:
  - `listStudentFeePaymentFormResponses_()`
  - `parseFeeApplicationFormResponse_(formResponse)`
  - `findFeeApplicationRowBySourceResponseId_(sourceResponseId)`
  - existing fee-application ID generator / insert helper
  - `writeStudentFeeAudit_()`
- Produces:
  - `importStudentFeePaymentFormResponses_(context)`
  - public API wrapper following the repository's current API naming convention

Return shape:

```javascript
{
  imported: number,
  skipped: number,
  errors: Array<{ sourceResponseId: string, message: string }>
}
```

- [ ] **Step 1: Write RED import tests**

Test three responses:

- first new response → inserted
- second already exists by `sourceResponseId` → skipped
- third new response → inserted

Assert two rows are created and the duplicate does not create a second `PAYAPP-*` row.

Also test the authoritative duplicate check occurs inside the write lock by changing the seeded rows between the pre-read and locked reread in the harness.

- [ ] **Step 2: Verify RED**

Expected: FAIL because import service is absent.

- [ ] **Step 3: Implement import orchestration**

For each parsed response:

```javascript
var now = getCurrentIsoDateTime_();
var row = {
  id: nextFeeApplicationId_(),
  sourceResponseId: dto.sourceResponseId,
  sourceResponseAt: dto.sourceResponseAt,
  studentId: dto.studentId,
  name: dto.name,
  affiliation: dto.affiliation,
  paymentDate: dto.paymentDate,
  semesterNumber: dto.semesterNumber,
  appliedAt: dto.sourceResponseAt,
  status: DEFAULT_NEW_APPLICATION_STATUS,
  importedAt: now,
  managerEmail: actorEmail,
  processedAt: '',
  studentCardFileId: dto.studentCardFileId,
  depositFileId: dto.depositFileId
};
```

Inside the lock, reread by `sourceResponseId` before generating/inserting the row.

- [ ] **Step 4: Add canonical audit**

For each successful insert:

```javascript
writeStudentFeeAudit_(
  actorEmail,
  'IMPORT',
  'feeApplications',
  row.id,
  null,
  row,
  'Google Form 납부신청 가져오기'
);
```

Do not audit duplicate skips.

- [ ] **Step 5: Verify GREEN**

Run provenance, business-audit, and student-fee regression tests.

- [ ] **Step 6: Commit**

```bash
git add src/000_server/080_student_fee/082_payments scripts/test-student-fee-form-provenance.js scripts/test-business-audit-taxonomy.js
git commit -m "feat: import student fee applications from Google Form"
```

---

### Task 6: Strengthen integrity and architecture guards

**Files:**
- Modify: `src/000_server/020_schema/operation_db_integrity.gs`
- Modify: `scripts/verify-student-fee-architecture.js`
- Modify: `scripts/test-student-fee-form-provenance.js`

**Interfaces:**
- Consumes `feeApplications.sourceResponseId`
- Produces uniqueness diagnostics for nonblank provenance and architectural prohibition on production writes to `납부폼_응답`

- [ ] **Step 1: Write RED integrity tests**

Seed:

```text
PAYAPP-1 sourceResponseId=R1
PAYAPP-2 sourceResponseId=R1
PAYAPP-3 sourceResponseId=""
PAYAPP-4 sourceResponseId=""
```

Expected:
- duplicate `R1` is reported
- multiple blank legacy provenance values are allowed

- [ ] **Step 2: Write architecture guard RED test**

Update `verify-student-fee-architecture.js` so production Student Fee server files fail if they contain direct writes to sheet name `납부폼_응답` or use Spreadsheet row number as source identity.

- [ ] **Step 3: Implement integrity validation**

Add a business-key uniqueness pass for non-empty `feeApplications.sourceResponseId` values without turning it into the table primary key.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
node scripts/test-student-fee-form-provenance.js
node scripts/test-student-fee.js
node scripts/verify-student-fee-architecture.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/000_server/020_schema/operation_db_integrity.gs scripts/verify-student-fee-architecture.js scripts/test-student-fee-form-provenance.js
git commit -m "test: enforce student fee form provenance integrity"
```

---

### Task 7: Migrate the physical OperationDB safely

**Files / Data:**
- Google Sheet: OperationDB `학생회_운영_2026`
- Table: `납부신청`
- Legacy staging tab: `납부폼_응답`
- Settings tab: `_설정`

**Interfaces:**
- Consumes the verified code contract from Tasks 1-6
- Produces the physical `납부신청` provenance columns and configured Form ID

- [ ] **Step 1: Create a fresh spreadsheet backup**

Copy the entire OperationDB immediately before mutation. Record the backup URL in the PR body or migration note.

- [ ] **Step 2: Snapshot current DB state**

Record:

- `납부신청` header
- row count
- all `납부신청ID` values
- `납부폼_응답` row count

- [ ] **Step 3: Add physical provenance columns**

Modify `납부신청` to match the schema order:

```text
납부신청ID
원본응답ID
원본응답일시
학번
성명
소속
납입날짜
신청학기차수
신청일시
신청상태
가져온일시
담당자이메일
처리일시
학생카드캡쳐파일ID
입금캡쳐파일ID
```

Existing rows get blank provenance values; do not infer them.

- [ ] **Step 4: Configure the actual Form ID**

Add/update `_설정`:

```text
STUDENT_FEE_PAYMENT_FORM_ID = <actual Google Form ID>
```

If the actual Form cannot be identified with evidence, stop migration here and do not delete `납부폼_응답`.

- [ ] **Step 5: Read-only source verification**

Using the configured Form, read at least one `FormResponse` and verify:

- `getId()` returns nonblank ID
- `getTimestamp()` is readable
- parser produces required DTO fields
- no OperationDB rows are written during this verification

- [ ] **Step 6: Verify row/PK preservation**

Read back `납부신청` and confirm original row count and all original `납부신청ID` values are unchanged.

- [ ] **Step 7: Remove the legacy raw tab only if all gates pass**

Delete `납부폼_응답` from OperationDB only after Steps 1-6 succeed and production code search confirms zero references.

- [ ] **Step 8: Run OperationDB integrity**

Expected: no new PK, FK, provenance uniqueness, or schema errors.

---

### Task 8: Final regression, PR review, and merge readiness

**Files:**
- Potentially modify `.github/workflows/*` only if the new provenance test is not already exercised by an existing workflow

**Interfaces:**
- Consumes all prior tasks
- Produces a merge-ready branch; does not modify frontend

- [ ] **Step 1: Run the focused suite**

```bash
node scripts/test-student-fee-form-provenance.js
node scripts/test-student-fee.js
node scripts/test-business-audit-taxonomy.js
node scripts/verify-student-fee-architecture.js
```

Expected: all PASS.

- [ ] **Step 2: Run full repository regression**

Run all `scripts/test-*.js` and `scripts/verify-*.js` checks currently used in CI.
Expected: all PASS.

- [ ] **Step 3: Review the diff for scope**

Confirm:

- no frontend-wide changes
- no refund Form implementation
- no inferred legacy provenance backfill
- no production writes to the Google Form or its response Spreadsheet
- no remaining production references to OperationDB `납부폼_응답`

- [ ] **Step 4: Verify actual OperationDB readback**

Confirm physical header order, settings value, preserved existing PKs, and absence of the legacy tab only if migration gates passed.

- [ ] **Step 5: Commit final test/workflow adjustments**

```bash
git add .github/workflows scripts src docs
git commit -m "test: verify student fee form source migration"
```

- [ ] **Step 6: Mark PR ready only after fresh CI GREEN**

Do not merge on stale CI from a prior HEAD.
