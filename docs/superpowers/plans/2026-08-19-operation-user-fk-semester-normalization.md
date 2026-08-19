# OperationDB User FK and Semester Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the `학기기준` reference table and normalize OperationDB user references so all manager columns store valid UserDB Google emails under the physical name `담당자이메일`.

**Architecture:** Keep UserDB `사용자.Google이메일` as the only user-reference source of truth. Change OperationDB schema keys from `managerId` to `managerEmail`, migrate the corresponding Google Sheet headers and invalid existing values, and strengthen integrity checks so dangling user and semester references are reported deterministically. Semester data is limited to regular semesters (`1학기`, `2학기`), with `20261` and `20262` seeded; start/end dates remain blank because no approved source dates exist.

**Tech Stack:** Google Apps Script, Google Sheets, Node.js contract/regression scripts, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-19-operation-user-fk-semester-normalization-design.md`

## Global Constraints

- User references in OperationDB use UserDB `사용자.Google이메일` as the source of truth.
- Physical manager columns are named `담당자이메일`; internal schema field names are `managerEmail`.
- Role-specific fields such as `처리자이메일` and `등록자이메일` keep their role-specific names.
- Invalid historical manager values are backfilled to `mihy5012@mju.ac.kr` for this migration.
- Audit-log `처리자이메일` values are not reassigned to another user; invalid historical actors are reported as integrity errors.
- Semester types are limited to `1학기` and `2학기`; seasonal semesters are not managed.
- Seed `20261` and `20262`; do not invent semester start/end dates.
- Do not delete existing business records during migration.
- Preserve existing business-record PK sets and row counts.
- Frontend-wide changes, audit taxonomy redesign, and general OperationDB type/validation cleanup remain out of scope.

---

### Task 1: Lock the normalized schema contract with regression tests

**Files:**
- Create: `scripts/test-operation-user-fk-semester-normalization.js`
- Modify: `.github/workflows/accounting-db-v2.yml` only if needed to run the new script on this branch; otherwise add the script to an existing general verification workflow.

**Interfaces:**
- Consumes: `getOperationDbSchema_()` from `src/000_server/020_schema/operation_db_schema.gs`.
- Produces: a Node regression contract that later tasks must satisfy.

- [ ] **Step 1: Write the failing schema-contract test**

Create a VM-based test that loads `operation_db_schema.gs` and asserts:

```js
const managerTables = [
  'feePayers', 'feeApplications', 'feePayments', 'feeRefundRequests',
  'feeRefunds', 'events', 'eventApplications', 'eventPayments',
  'eventAttendance', 'eventSettlements', 'eventRefunds', 'ledger',
  'evidence', 'reconciliation', 'settlementReports'
];

managerTables.forEach((tableKey) => {
  const table = schema[tableKey];
  assert.strictEqual(table.fields.managerEmail, '담당자이메일');
  assert.ok(!Object.prototype.hasOwnProperty.call(table.fields, 'managerId'));
  assert.ok(table.foreignKeys.some((fk) =>
    fk.field === 'managerEmail' &&
    fk.refDatabase === 'user' &&
    fk.refTable === 'users' &&
    fk.refField === 'email'
  ));
});

assert.strictEqual(schema.businessAuditLogs.fields.actorEmail, '처리자이메일');
assert.deepStrictEqual(schema.semesters.allowedTypes, ['1학기', '2학기']);
```

The test must also statically scan `operation_db_schema.gs` and fail if the physical string `담당자ID` remains in any schema field definition.

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
node scripts/test-operation-user-fk-semester-normalization.js
```

Expected: FAIL because the current schema still exposes `managerId: '담당자ID'` and has no `allowedTypes` semester contract.

- [ ] **Step 3: Add the test to CI**

Add a workflow step:

```yaml
- name: Operation user FK and semester normalization contract
  run: node scripts/test-operation-user-fk-semester-normalization.js
```

- [ ] **Step 4: Commit the RED test**

```bash
git add scripts/test-operation-user-fk-semester-normalization.js .github/workflows
git commit -m "test: lock operation user FK and semester contract"
```

---

### Task 2: Normalize OperationDB schema field names and semester type contract

**Files:**
- Modify: `src/000_server/020_schema/operation_db_schema.gs`
- Test: `scripts/test-operation-user-fk-semester-normalization.js`

**Interfaces:**
- Consumes: existing table schema structure and UserDB `users.email` FK definitions.
- Produces: `managerEmail -> 담당자이메일` for all manager-bearing tables and `semesters.allowedTypes = ['1학기', '2학기']`.

- [ ] **Step 1: Change all manager schema fields**

For every manager-bearing table, replace:

```js
managerId: '담당자ID'
```

with:

```js
managerEmail: '담당자이메일'
```

- [ ] **Step 2: Change all manager foreign keys**

Replace each FK shape:

```js
{ field: 'managerId', refDatabase: 'user', refTable: 'users', refField: 'email' }
```

with:

```js
{ field: 'managerEmail', refDatabase: 'user', refTable: 'users', refField: 'email' }
```

Do not rename `businessAuditLogs.actorEmail` or other role-specific email fields.

- [ ] **Step 3: Add the semester type contract**

Extend `semesters` with:

```js
allowedTypes: ['1학기', '2학기']
```

Keep the existing physical fields:

```js
id: '학기ID',
year: '학년도',
type: '학기구분',
startDate: '시작일',
endDate: '종료일',
active: '활성여부'
```

- [ ] **Step 4: Run the schema contract**

Run:

```bash
node scripts/test-operation-user-fk-semester-normalization.js
```

Expected: PASS for the schema assertions.

- [ ] **Step 5: Run naming verifiers**

Run:

```bash
node scripts/verify-public-api-naming.js
node scripts/verify-internal-function-naming.js
```

Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add src/000_server/020_schema/operation_db_schema.gs scripts/test-operation-user-fk-semester-normalization.js
git commit -m "refactor: normalize operation user reference schema"
```

---

### Task 3: Update server services and DAOs to use `managerEmail`

**Files:**
- Modify: all server files under `src/000_server/050_event`, `src/000_server/060_accounting`, and `src/000_server/080_student_fee` that read/write schema field `managerId`.
- Modify only if referenced: shared audit/query helpers under `src/000_server/010_core` or domain shared files.
- Test: extend `scripts/test-operation-user-fk-semester-normalization.js`.

**Interfaces:**
- Consumes: `schema.<table>.fields.managerEmail` from Task 2 and authenticated request context email.
- Produces: all new/updated OperationDB records persist manager ownership under `managerEmail` and never under `managerId`.

- [ ] **Step 1: Add static regression assertions for stale code references**

Extend the test to recursively scan server `.gs` files and fail on code-level schema access patterns such as:

```js
fields.managerId
row[fields.managerId]
managerId:
```

Exclude documentation/spec files and frontend files from this task. The static test should report exact paths containing stale server references.

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
node scripts/test-operation-user-fk-semester-normalization.js
```

Expected: FAIL listing the remaining server files that reference `managerId`.

- [ ] **Step 3: Update each server read/write path**

For each reported server file:

```js
fields.managerId
```

becomes:

```js
fields.managerEmail
```

and object properties used internally become `managerEmail` where they represent the persisted manager FK.

Mutation code must derive new manager values from authenticated context, for example:

```js
managerEmail: String(context && context.userEmail || '').trim()
```

or the repository's existing equivalent authenticated-email field. Do not trust an arbitrary request `managerEmail` as authoritative when the current flow already has authenticated context.

- [ ] **Step 4: Keep temporary frontend DTO compatibility only where necessary**

If a server response currently exposes `manager_id` or a similarly named frontend-only DTO field, do not redesign the frontend in this task. It may remain as a compatibility alias, but the underlying sheet/schema source must be `managerEmail`.

Example:

```js
manager_id: row[fields.managerEmail] || ''
```

- [ ] **Step 5: Run domain regression tests**

Run all existing relevant scripts present in the repository, including at minimum:

```bash
node scripts/test-accounting.js
node scripts/test-accounting-db-v2-schema.js
node scripts/test-ledger-bank-link-v2.js
node scripts/test-reconciliation-v2.js
node scripts/test-settlement-v2.js
```

Also run existing student-fee/event test scripts discovered in `scripts/`; do not skip a domain merely because no file was changed manually if the shared schema key changed.

Expected: all PASS.

- [ ] **Step 6: Run the normalization contract again**

```bash
node scripts/test-operation-user-fk-semester-normalization.js
```

Expected: PASS with zero stale server `managerId` references.

- [ ] **Step 7: Commit**

```bash
git add src/000_server scripts/test-operation-user-fk-semester-normalization.js
git commit -m "refactor: use manager email across operation services"
```

---

### Task 4: Strengthen OperationDB integrity for user and semester references

**Files:**
- Modify: `src/000_server/020_schema/operation_db_integrity.gs`
- Test: extend `scripts/test-operation-user-fk-semester-normalization.js`

**Interfaces:**
- Consumes: normalized schema from Task 2 and UserDB `users.email` table.
- Produces: deterministic integrity errors for invalid manager email, invalid audit actor email, dangling semester FK, duplicate semester IDs, and invalid semester types.

- [ ] **Step 1: Write failing integrity unit cases**

Add VM/stub tests covering these fixtures:

```js
const userEmails = ['mihy5012@mju.ac.kr'];
const semesters = [
  { id: '20261', year: 2026, type: '1학기', active: true },
  { id: '20262', year: 2026, type: '2학기', active: true }
];
```

Assertions must cover:

```text
managerEmail = mihy5012@mju.ac.kr -> valid
managerEmail = admin@test.com -> invalid user FK
businessAuditLogs.actorEmail = ghost@example.com -> invalid user FK, not auto-fixed
feePayers.startSemesterId = 20261 -> valid
feePayers.startSemesterId = 20991 -> dangling semester FK
semester type = 여름계절 -> invalid semester type
duplicate semester id = 20261 -> duplicate PK error
```

- [ ] **Step 2: Run and verify RED**

```bash
node scripts/test-operation-user-fk-semester-normalization.js
```

Expected: FAIL because current integrity logic does not enforce all explicit cases above.

- [ ] **Step 3: Implement semester semantic validation**

Add an integrity pass that reads `schema.semesters.allowedTypes` and emits an error whenever a non-empty semester row has a type outside `['1학기', '2학기']`.

The error record/message must identify at least:

```text
table: semesters
field: type
value: offending value
row/index or primary key when available
```

- [ ] **Step 4: Make user-FK validation explicit for audit actors**

Add `businessAuditLogs.actorEmail -> user.users.email` to the integrity validation path even though it is not a generic `managerEmail` field. Blank actor values may follow the existing optional/required policy, but non-empty unknown emails must be reported.

- [ ] **Step 5: Verify manager and semester FKs use the normalized schema keys**

Ensure generic FK traversal resolves:

```js
feePayers.startSemesterId -> semesters.id
*.managerEmail -> user.users.email
```

and reports table/field/value details for dangling references.

- [ ] **Step 6: Run the normalization and existing integrity tests**

```bash
node scripts/test-operation-user-fk-semester-normalization.js
node scripts/test-operation-db-integrity.js
```

If the repository has no standalone `test-operation-db-integrity.js`, run the existing script that exercises `operation_db_integrity.gs` and record its exact filename in the commit/PR description.

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/000_server/020_schema/operation_db_integrity.gs scripts/test-operation-user-fk-semester-normalization.js
git commit -m "feat: validate operation user and semester references"
```

---

### Task 5: Prepare and verify the real Google Sheet migration safely

**Files:**
- No repository production code required unless a reusable migration helper is explicitly needed by the existing project pattern.
- Actual data target: OperationDB spreadsheet `1EI8MbFx2HSuizl0QFygRAZydYiv77W-6pQO10mRN55E`.
- Reference database: UserDB spreadsheet `1ofZ0M6lclOZudKp_36WCUk1_7ZjBCS8ACQ0x0dshe7g`.

**Interfaces:**
- Consumes: normalized schema contract and current live spreadsheet data.
- Produces: migrated sheet headers/data with preserved PKs/row counts.

- [ ] **Step 1: Create a fresh pre-migration backup**

Create a Drive copy of the current OperationDB immediately before writes, named with a timestamp such as:

```text
학생회_운영_2026_backup_before_user_fk_semester_20260819
```

Record the backup file URL/ID in the execution notes.

- [ ] **Step 2: Capture pre-migration snapshots**

For all 15 manager-bearing tables, read:

```text
header row
primary-key column
담당자ID column
all non-empty business rows
```

Also read full non-empty rows from:

```text
학기기준
업무감사로그
```

Compute and record per table:

```text
business row count
PK set
current distinct 담당자ID values
```

- [ ] **Step 3: Validate the migration target user exists and is active**

Read UserDB `사용자` and require an active row where:

```text
Google이메일 = mihy5012@mju.ac.kr
활성여부 = TRUE
```

Abort all writes if this precondition fails.

- [ ] **Step 4: Seed `학기기준`**

Write exactly these logical rows if they do not already exist:

```text
학기ID | 학년도 | 학기구분 | 시작일 | 종료일 | 활성여부
20261  | 2026   | 1학기    |        |        | TRUE
20262  | 2026   | 2학기    |        |        | TRUE
```

Do not invent dates. Keep `시작일` and `종료일` blank until an approved source exists.

- [ ] **Step 5: Rename manager headers in all target tables**

For each of the 15 target sheets, change only the header cell:

```text
담당자ID -> 담당자이메일
```

Do not insert a second manager column and do not reorder business columns.

- [ ] **Step 6: Backfill invalid manager values**

For each non-empty business row in the 15 target tables:

- If the existing manager value is a valid UserDB email, preserve it.
- If blank and the domain allows blank ownership, keep blank unless the record is part of the specifically approved existing-data backfill set.
- If the value is invalid, including `admin@test.com` or `김은수`, replace it with:

```text
mihy5012@mju.ac.kr
```

Do not change `업무감사로그.처리자이메일` using this rule.

- [ ] **Step 7: Apply semester data validation**

Set `학기기준.학기구분` validation to the explicit list:

```text
1학기
2학기
```

Remove seasonal-semester options if currently present.

- [ ] **Step 8: Preserve email values as text**

Set manager-email columns to plain-text-compatible formatting where necessary. Do not transform email casing or synthesize addresses.

- [ ] **Step 9: Re-read every migrated table**

After writes, recalculate:

```text
business row count
PK set
distinct 담당자이메일 values
```

Require:

```text
post row count == pre row count
post PK set == pre PK set
담당자ID header count == 0
all non-empty 담당자이메일 values exist in UserDB users.email
```

- [ ] **Step 10: Verify semester references**

Require:

```text
20261 exists exactly once
20262 exists exactly once
all non-empty 회비납부자.적용시작학기ID values exist in 학기기준.학기ID
all 학기구분 values are 1학기 or 2학기
```

- [ ] **Step 11: Report audit actor exceptions without mutation**

Compare non-empty `업무감사로그.처리자이메일` values to UserDB. If any are invalid, report exact rows/values as unresolved historical integrity exceptions. Do not rewrite them.

---

### Task 6: Run final verification and prepare integration

**Files:**
- Modify only if required by verification findings: test/workflow files from prior tasks.
- No frontend changes.

**Interfaces:**
- Consumes: completed code and live-sheet migration.
- Produces: fresh verification evidence suitable for PR/merge decision.

- [ ] **Step 1: Run the full normalization contract**

```bash
node scripts/test-operation-user-fk-semester-normalization.js
```

Expected: PASS.

- [ ] **Step 2: Run all project architecture/naming verifiers**

```bash
node scripts/verify-public-api-naming.js
node scripts/verify-internal-function-naming.js
```

Expected: PASS.

- [ ] **Step 3: Run all existing domain regression scripts**

Enumerate `scripts/test-*.js` and run all tests that do not require unavailable external credentials. At minimum include Accounting, Event, Student Fee, User/Settings, schema/integrity, and money-validation suites.

Expected: zero failures. Any intentionally skipped external-integration test must be named and explained; do not silently omit it.

- [ ] **Step 4: Re-run live DB integrity checks**

Verify against the real spreadsheets:

```text
invalid manager email FK = 0
feePayers dangling semester FK = 0
semester duplicate PK = 0
invalid semester type = 0
business row-count drift = 0
business PK-set drift = 0
```

Audit actor exceptions, if any, are reported separately and do not get silently backfilled.

- [ ] **Step 5: Verify no out-of-scope frontend rewrite entered the branch**

Compare against `main` and ensure no broad frontend files under `100_common` through `600_event` were modified merely to rename manager fields. Server-side compatibility aliases are acceptable where required.

- [ ] **Step 6: Request code review**

Review the branch against the spec and this plan. Fix every Critical/Important finding before integration.

- [ ] **Step 7: Fresh CI verification**

Push the final branch head and wait for all required GitHub Actions checks on that exact SHA. Do not rely on an earlier green commit.

- [ ] **Step 8: Use the finishing-a-development-branch workflow**

After fresh verification is green, present/execute the approved integration option. Do not delete the branch or backup automatically.
