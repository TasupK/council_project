# Student Fee Form Source Separation Design

## Status
Approved design for implementation planning.

## Goal
Separate Student Fee Google Form responses from OperationDB business tables, import them into `납부신청` with authoritative provenance, and make each application carry an explicit fee-coverage range that can support both normal remaining-term payment and the broad-admission exception.

## Current State
- `학생회_운영_2026` contains a transitional `납부폼_응답` sheet, but it is not part of `getOperationDbSchema_()`.
- `납부신청` is the formal business table and currently lacks Form provenance.
- `납부신청.신청학기차수` is semantically ambiguous. The business meaning required by the fee policy is the number of semesters covered by that application.
- Approval currently creates `납부내역.amount` from one semester's fee rate only.
- A separate real Google Form response spreadsheet exists for Event and must not be reused as the Student Fee source.

## Source Architecture
Student Fee uses one long-lived Google Form configured centrally.

```text
Single Student Fee Google Form
  -> FormResponse.getId() / getTimestamp() / item responses
  -> Student Fee Form Adapter + Mapper
  -> Student Fee Coverage Policy
  -> OperationDB.납부신청
  -> approval
  -> OperationDB.납부내역
```

The linked Google response spreadsheet is a read-only raw mirror for operators. The canonical source identity is the Google Form response itself.

The source Form is external to OperationDB. Student Fee code must never edit or delete source Form responses during normal operations.

## Single Form Configuration
Store the configured source in `_설정` rather than creating a `회비폼` business table.

Canonical keys:
- `학생회비GoogleFormID`
- `학생회비Form연동활성여부`
- `학생회비Form마지막동기화일시`
- `학생회비현재학기ID`

`학생회비현재학기ID` is an operator-managed semester reference used by the import policy. It must point to `학기기준.학기ID`.

This explicit current-semester setting is required because the existing `학기기준` rows do not yet contain reliable date ranges and both 2026 semesters are currently marked active.

## Canonical Source Key
Use Google Form `FormResponse.getId()` as `원본응답ID`.

Do not synthesize uniqueness from timestamp, student ID, spreadsheet row, or answer content.

## Fee Application Model
Extend `feeApplications` / `납부신청` with provenance and explicit coverage fields.

Canonical fields:
- `id` -> `납부신청ID`
- `sourceResponseId` -> `원본응답ID`
- `sourceResponseAt` -> `원본응답일시`
- `importedAt` -> `가져온일시`
- `studentId` -> `학번`
- `name` -> `성명`
- `affiliation` -> `소속`
- `paymentDate` -> `납입날짜`
- `startSemesterId` -> `적용시작학기ID`
- `semesterCount` -> `적용학기수`
- `appliedAt` -> `신청일시`
- `status` -> `신청상태`
- `managerEmail` -> `담당자이메일`
- `processedAt` -> `처리일시`
- `studentCardFileId` -> `학생카드캡쳐파일ID`
- `depositFileId` -> `입금캡쳐파일ID`

Rename physical header `신청학기차수` to `적용학기수`; preserve existing row values in place.

`startSemesterId` is an FK to `semesters.id`.

Legacy/manual applications may have blank provenance. New Form-imported applications require non-blank provenance and coverage fields.

## Business Meaning of One Application
One Google Form response creates at most one `납부신청`.

One student may have multiple applications over time. This is required for the broad-admission exception.

Each application is an immutable statement of the fee coverage requested at that time:

```text
coverage = startSemesterId + semesterCount
```

Workflow status may change, but approval or later payment confirmation must not rewrite the historical requested coverage.

## Standard Coverage Policy
The normal rule is to pay all remaining semesters through 4-2.

Academic term ordinal:
- 1-1 = 1
- 1-2 = 2
- 2-1 = 3
- 2-2 = 4
- 3-1 = 5
- 3-2 = 6
- 4-1 = 7
- 4-2 = 8

For a standard application:

```text
semesterCount = 9 - academicTermOrdinal
```

Examples:
- 1-1 -> 8 semesters
- 1-2 -> 7 semesters
- 2-1 -> 6 semesters
- 4-2 -> 1 semester

`startSemesterId` is the configured `학생회비현재학기ID` at import time.

## Broad-Admission Exception
Broad-admission students do not have a final department during first year.

The supported lifecycle is:

```text
First-year provisional payment
  -> pay 2 semesters to the chosen/provisional department
  -> later department is finalized
  -> submit another Form response
  -> pay the remaining semesters to the finalized department
```

Therefore:
- the first broad-admission application may cover exactly 2 semesters,
- a later broad-admission additional application is a distinct application with a distinct source response ID,
- the later application uses the standard remaining-term calculation from its academic term,
- previous applications are not overwritten.

The Form mapper must expose a normalized coverage mode rather than letting the applicant enter an arbitrary numeric semester count.

Canonical normalized coverage modes:
- `STANDARD_REMAINING`
- `BROAD_FIRST_YEAR`
- `BROAD_AFTER_ASSIGNMENT`

Rules:
- `STANDARD_REMAINING` -> `9 - academicTermOrdinal`
- `BROAD_FIRST_YEAR` -> `2`
- `BROAD_AFTER_ASSIGNMENT` -> `9 - academicTermOrdinal`

A Form response must provide the applicant's current academic year (1-4), current semester within year (1-2), and enough answer data to map to one of these normalized modes.

The mapper must reject unsupported academic year/semester values instead of guessing.

## Amount Calculation
Approval creates the payment amount from the application coverage, not from one semester only.

```text
payment.amount = feeRate.amountPerSemester * feeApplication.semesterCount
```

`resolveStudentFeeRate_()` continues to resolve the per-semester rate by `paymentDate`.

The approval flow must reject applications whose `semesterCount` is missing, non-integer, or outside 1..8.

## Form Mapping Boundary
Raw question titles belong only to the source adapter/mapper.

Normalized import DTO:

```text
sourceResponseId
sourceResponseAt
studentId
name
affiliation
paymentDate
academicYearLevel
semesterWithinYear
coverageMode
studentCardFileId
depositFileId
```

The coverage policy converts the normalized academic stage + coverage mode into:

```text
startSemesterId
semesterCount
```

The business application row does not need to persist `academicYearLevel`, `semesterWithinYear`, or `coverageMode` after the derived coverage has been stored.

## Import Responsibilities
The import service must:
1. Read the configured single Google Form.
2. Resolve `FormResponse.getId()` and timestamp.
3. Normalize Form answers through aliases/mapping.
4. Validate student identity, payment date, academic stage, and coverage mode.
5. Resolve `학생회비현재학기ID` and validate the semester FK.
6. Calculate `semesterCount` through the coverage policy.
7. Enforce source-response idempotency.
8. Insert one `납부신청` row.
9. Write `IMPORT / feeApplications` to `업무감사로그`.
10. Update `학생회비Form마지막동기화일시` only after the sync completes successfully.

The import service must not auto-approve applications, auto-create payments, edit source responses, or fabricate a response ID.

## Duplicate Handling
`sourceResponseId` is unique among non-blank values.

- first import -> create application,
- same response imported again -> no-op/already-imported result,
- same student with a different response ID -> may create another application,
- blank legacy provenance -> not a duplicate key.

## Legacy `납부폼_응답`
Do not delete it at the start.

Safe removal order:
1. Confirm production code reference count is zero.
2. Configure the actual Student Fee Form ID.
3. Add the formal application provenance/coverage schema.
4. Implement and verify Form import.
5. Preserve transitional rows that cannot be matched to authoritative Form response IDs; do not invent IDs.
6. Back up OperationDB.
7. Remove `납부폼_응답` only after DB readback and regression checks pass.

## OperationDB Migration
Expected physical changes:
- add `원본응답ID`, `원본응답일시`, `가져온일시`, `적용시작학기ID` to `납부신청`,
- rename `신청학기차수` to `적용학기수`, preserving cell values,
- preserve all existing `납부신청ID` and row counts,
- leave new provenance/coverage-start fields blank on legacy rows unless mapping is authoritative,
- add the four Student Fee Form keys to `_설정`, initially blank/disabled unless an authoritative Form ID/current semester is supplied,
- remove `납부폼_응답` only as the final migration step after backup and verification.

## Integrity Rules
Verification must enforce:
- duplicate non-blank `feeApplications.sourceResponseId` = 0,
- `feeApplications.startSemesterId` is blank for legacy rows or references `semesters.id`,
- `feeApplications.semesterCount` is blank for legacy rows or integer 1..8,
- Form-imported applications have non-blank `sourceResponseId`, `sourceResponseAt`, `importedAt`, `startSemesterId`, and `semesterCount`,
- existing fee application PK uniqueness remains intact,
- no formal OperationDB table is created for the external Form source,
- Student Fee source access is read-only.

## Audit
Successful new imports write:

```text
actionType = IMPORT
targetType = feeApplications
targetId = generated application ID
beforeValue = null
afterValue = normalized saved application snapshot
```

Duplicate/no-op imports do not emit misleading mutation audit rows.

## Testing
Implementation must cover:
- provenance and coverage schema fields,
- `신청학기차수` -> `적용학기수` contract,
- standard counts 1-1=8, 2-1=6, 4-2=1,
- broad first-year count = 2,
- broad after-assignment uses remaining-term count,
- invalid academic stage rejection,
- amount = per-semester rate * semesterCount,
- source-response idempotency,
- first import success,
- duplicate import no-op,
- distinct response IDs for one student remain distinguishable,
- missing response ID rejection,
- successful import audit,
- source write boundary,
- existing Student Fee regression suite.

## Out of Scope
- Student Fee frontend redesign.
- Automatically changing `회비납부자` master coverage after payment confirmation; that lifecycle will be designed separately.
- Guessing historical Form response IDs.
- Changing Event Form architecture.
- Supporting more than one Student Fee Form.

## Success Criteria
Complete when:
1. Student Fee has one configured external Google Form source.
2. New `납부신청` rows carry authoritative provenance and explicit coverage.
3. Standard remaining-term and broad-admission split-payment rules are encoded in one policy service.
4. Approval calculates the full application amount from `학기당금액 * 적용학기수`.
5. Re-importing one Form response cannot duplicate an application.
6. OperationDB no longer depends on `납부폼_응답`.
7. Tests, architecture verifiers, Actions, and DB readback are GREEN.
