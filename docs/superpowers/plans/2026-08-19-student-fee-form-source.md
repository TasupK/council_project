# Student Fee Form Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import one external Student Fee Google Form into `납부신청` with authoritative provenance, explicit semester coverage, idempotency, and full remaining-term fee calculation including the broad-admission split-payment exception.

**Architecture:** A read-only Form adapter maps raw `FormResponse` objects into a normalized DTO. A Student Fee coverage policy derives `적용시작학기ID` and `적용학기수`, and the import service inserts an idempotent `feeApplications` row plus an `IMPORT` audit event. Approval then creates `feePayments.amount` as per-semester rate multiplied by the saved coverage count.

**Tech Stack:** Google Apps Script V8, `FormApp`, `SpreadsheetApp`, Node.js VM-based contract tests, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-19-student-fee-form-source-design.md`

## Global Constraints

- One configured Student Fee Google Form only.
- The source Form is read-only from Student Fee business code.
- `FormResponse.getId()` is the only canonical source identity.
- Existing application IDs and legacy rows are preserved.
- Legacy rows may keep blank provenance/start-semester values.
- One student may have multiple applications when source response IDs differ.
- `STANDARD_REMAINING` and `BROAD_AFTER_ASSIGNMENT` pay all remaining semesters through 4-2.
- `BROAD_FIRST_YEAR` covers exactly 2 semesters.
- No Student Fee frontend redesign in this plan.
- Do not update `회비납부자` master coverage in this plan.

---

### Task 1: Schema and policy contract

**Files:**
- Modify: `src/000_server/020_schema/operation_db_schema.gs`
- Create: `src/000_server/080_student_fee/080_common/student_fee_coverage_policy.gs`
- Create: `scripts/test-student-fee-form-source.js`

**Interfaces:**
- Produces: `calculateStudentFeeCoverage_(input)` returning `{ startSemesterId, semesterCount }`.
- Consumes: `findStudentFeeSemesterById_()` / semester lookup helper where available.

- [ ] **Step 1: Write failing tests**

Test that `feeApplications` defines `sourceResponseId`, `sourceResponseAt`, `importedAt`, `startSemesterId`, and `semesterCount: '적용학기수'`, and no longer maps the physical header `신청학기차수`.

Test policy examples:

```js
assert.deepStrictEqual(calculateStudentFeeCoverage_({
  currentSemesterId: '20261', academicYearLevel: 1, semesterWithinYear: 1,
  coverageMode: 'STANDARD_REMAINING'
}), { startSemesterId: '20261', semesterCount: 8 });

assert.equal(calculateStudentFeeCoverage_({
  currentSemesterId: '20271', academicYearLevel: 2, semesterWithinYear: 1,
  coverageMode: 'STANDARD_REMAINING'
}).semesterCount, 6);

assert.equal(calculateStudentFeeCoverage_({
  currentSemesterId: '20261', academicYearLevel: 1, semesterWithinYear: 1,
  coverageMode: 'BROAD_FIRST_YEAR'
}).semesterCount, 2);
```

Also reject year outside 1..4, semester outside 1..2, unknown mode, and broad-first-year outside year 1.

- [ ] **Step 2: Run test to verify RED**

Run `node scripts/test-student-fee-form-source.js` in CI/runner. Expected failure: missing schema fields and missing `calculateStudentFeeCoverage_`.

- [ ] **Step 3: Implement minimal schema/policy**

Add the five schema fields and FK for `startSemesterId`; rename `semesterNumber` mapping to `semesterCount: '적용학기수'`.

Implement ordinal formula:

```js
var ordinal = (academicYearLevel - 1) * 2 + semesterWithinYear;
var count = 9 - ordinal;
```

Return fixed `2` only for `BROAD_FIRST_YEAR` with year 1.

- [ ] **Step 4: Verify GREEN**

Run the focused script plus `test-operation-user-fk-semester-normalization.js` and `test-student-fee.js`.

- [ ] **Step 5: Commit**

Commit schema + policy + focused tests.

### Task 2: Approval amount uses application coverage

**Files:**
- Modify: `src/000_server/080_student_fee/082_payments/fee_payments_service.gs`
- Modify: `src/000_server/080_student_fee/082_payments/fee_payments_query_service.gs`
- Modify: `scripts/test-student-fee-form-source.js`

**Interfaces:**
- Consumes: `feeApplication.semesterCount`.
- Produces: approval-created `feePayment.amount = rate.amountPerSemester * semesterCount`.

- [ ] **Step 1: Write failing test**

Add a test with a 20,000 per-semester rate and application `semesterCount: 6`; expected payment amount is 120,000. Add rejection for blank, fractional, 0, and >8 semester counts.

- [ ] **Step 2: Verify RED**

Expected current code to return/create one-semester amount only.

- [ ] **Step 3: Implement minimal change**

Validate `semesterCount` before approval and multiply the resolved rate by the count. Update calculation DTO to expose per-semester rate, semester count, and total when an application context is supplied; preserve legacy `paymentDate` calculation compatibility where needed by current frontend tests.

- [ ] **Step 4: Verify GREEN**

Run focused test, `test-student-fee.js`, `test-student-fee-mutation-consistency.js`, and frontend contract tests.

- [ ] **Step 5: Commit**

Commit approval amount behavior.

### Task 3: Single-Form source adapter and normalized mapper

**Files:**
- Create: `src/000_server/080_student_fee/082_payments/fee_form_reader.gs`
- Create: `src/000_server/080_student_fee/082_payments/fee_form_mapper.gs`
- Modify: `scripts/test-student-fee-form-source.js`

**Interfaces:**
- Produces: `readStudentFeeFormResponses_(formId)` and `mapStudentFeeFormResponse_(formResponse)`.
- Mapper DTO fields: `sourceResponseId`, `sourceResponseAt`, `studentId`, `name`, `affiliation`, `paymentDate`, `academicYearLevel`, `semesterWithinYear`, `coverageMode`, `studentCardFileId`, `depositFileId`.

- [ ] **Step 1: Write failing mapper tests**

Use fake FormResponse/item-response objects to prove aliases normalize Korean question titles and that missing response ID, student ID, name, academic stage, or coverage mode is rejected.

- [ ] **Step 2: Verify RED**

Expected missing reader/mapper functions.

- [ ] **Step 3: Implement minimal adapter/mapper**

`readStudentFeeFormResponses_` opens the configured Form and reads responses only. Mapper uses item titles and response values, never spreadsheet column positions. Normalize coverage answers into the three canonical modes and parse file-upload responses to Drive file IDs when possible.

- [ ] **Step 4: Verify GREEN**

Run focused tests and architecture verifier.

- [ ] **Step 5: Commit**

Commit source adapter/mapper.

### Task 4: Idempotent import service and API

**Files:**
- Modify: `src/000_server/080_student_fee/082_payments/fee_applications_sheet_dao.gs`
- Create: `src/000_server/080_student_fee/082_payments/fee_form_import_service.gs`
- Modify: `src/000_server/080_student_fee/082_payments/fee_payments_api.gs`
- Modify: `scripts/test-student-fee-form-source.js`
- Modify: `scripts/verify-student-fee-architecture.js`

**Interfaces:**
- Produces: `findFeeApplicationRowBySourceResponseId_(sourceResponseId)`, `insertFeeApplicationRow_(row)`, `syncStudentFeeFormApplicationsData_(request, context)`, `api_syncStudentFeeFormApplications(input)`.

- [ ] **Step 1: Write failing service tests**

Test first import creates one row with provenance/coverage and one `IMPORT / feeApplications` audit. Test duplicate response ID is a no-op. Test same student with two response IDs creates two applications.

- [ ] **Step 2: Verify RED**

Expected missing DAO/import/API functions.

- [ ] **Step 3: Implement minimal import**

Read `학생회비GoogleFormID`, `학생회비Form연동활성여부`, and `학생회비현재학기ID` from settings. Reject disabled/missing configuration. For each response: map -> policy -> duplicate check -> insert -> audit. Update `학생회비Form마지막동기화일시` after successful completion.

- [ ] **Step 4: Verify GREEN**

Run focused test, Student Fee suite, API access contracts, audit taxonomy/target tests, and architecture verifier.

- [ ] **Step 5: Commit**

Commit import path.

### Task 5: OperationDB migration

**Files / Data:**
- Modify Google Sheet `학생회_운영_2026` only after code tests are GREEN.
- Update `납부신청` physical headers/data.
- Update `_설정` rows.
- Remove `납부폼_응답` only after backup/readback.

**Interfaces:**
- Physical `납부신청` header must match `getOperationDbSchema_().feeApplications`.

- [ ] **Step 1: Back up OperationDB**

Create a Drive copy immediately before migration.

- [ ] **Step 2: Add/rename columns without changing existing PKs or row count**

Target header order:

```text
납부신청ID, 원본응답ID, 원본응답일시, 가져온일시, 학번, 성명, 소속,
납입날짜, 적용시작학기ID, 적용학기수, 신청일시, 신청상태,
담당자이메일, 처리일시, 학생카드캡쳐파일ID, 입금캡쳐파일ID
```

Existing `신청학기차수` values move with the rename to `적용학기수`; do not infer missing provenance or start semester for legacy rows.

- [ ] **Step 3: Add settings keys**

Add the four canonical Student Fee Form settings. Leave Form ID blank and link disabled unless the authoritative real Student Fee Form is available; set `학생회비현재학기ID` only to a valid semester ID.

- [ ] **Step 4: Read back and verify**

Verify PK count/uniqueness, row count preservation, header equality, FK validity of non-blank start semester, integer/range validity of non-blank semester counts, and duplicate non-blank source response IDs = 0.

- [ ] **Step 5: Remove transitional `납부폼_응답`**

Only after backup and readback pass. Preserve unmatched transitional contents in the backup; do not fabricate Form IDs.

### Task 6: Final regression and PR readiness

**Files:**
- Modify tests/verifiers only if failures reveal stale assumptions; do not weaken business contracts.

- [ ] **Step 1: Run all test scripts**

Run every `scripts/test-*.js`.

- [ ] **Step 2: Run all architecture verifiers**

Run every relevant `scripts/verify-*.js`, especially Student Fee, Server, naming, audit, and operation integrity.

- [ ] **Step 3: Verify latest GitHub Actions on branch HEAD**

Require all current workflows GREEN; historical runs are not sufficient.

- [ ] **Step 4: Review diff vs `main`**

Confirm no frontend redesign, no Event behavior change, no payer-master lifecycle addition, and no source Form writes.

- [ ] **Step 5: Mark PR merge-ready**

Do not merge until latest HEAD checks and DB readback are GREEN.
