# Student Fee Form Source Separation Design

## Status
Approved design for implementation planning.

## Goal
Separate Student Fee Google Form responses from OperationDB business tables, and import them into `납부신청` with explicit provenance and duplicate protection.

## Current State
- `학생회_운영_2026` currently contains a `납부폼_응답` sheet with raw-like Form fields such as timestamp, student ID, name, affiliation, type, payment date, semester count/start semester, and file IDs.
- `납부폼_응답` is not part of `getOperationDbSchema_()` and is therefore already outside the formal OperationDB schema contract.
- `납부신청` is the actual business table and contains workflow fields such as `납부신청ID`, `신청상태`, `담당자이메일`, and `처리일시`.
- `납부신청` currently lacks a canonical source-response identifier, so Form re-import cannot be made idempotent by schema contract alone.

## Decision
Treat the actual Google Form response store as an external source system, not as an OperationDB table.

The canonical flow is:

```text
Google Form
  -> Google Form Response / linked response spreadsheet
  -> Student Fee Form Import Service (read-only source access)
  -> OperationDB.납부신청
  -> normal Student Fee approval/payment workflow
```

OperationDB will contain normalized business records only. The existing `납부폼_응답` tab is transitional and should be removed only after import-source configuration and migration/readback checks are complete.

## Canonical Source Key
Use the Google Form `FormResponse.getId()` response ID as `원본응답ID`.

Do not synthesize uniqueness from timestamp, student ID, or answer content. The source response ID is the authoritative identity for import idempotency.

## `납부신청` Provenance Fields
Extend `feeApplications` / `납부신청` with:

- `sourceResponseId` -> `원본응답ID`
- `sourceResponseAt` -> `원본응답일시`
- `importedAt` -> `가져온일시`

Existing workflow fields remain unchanged.

`sourceResponseId` must be unique among non-legacy Form-imported rows. The service must reject or skip a duplicate source response instead of creating another `PAYAPP-*` row.

Legacy/manual applications may have blank provenance fields. Blank provenance must not be treated as a duplicate key.

## Source Configuration
The Student Fee Form source must be configured outside the OperationDB business table schema. Configuration should identify the Google Form or source response store required to resolve Form response IDs and answers.

The import path is read-only with respect to the source. Server code must never edit or delete source Form responses as part of normal Student Fee operations.

## Import Responsibilities
The import service must:

1. Read source responses.
2. Resolve the canonical Google Form response ID and timestamp.
3. Map configured questions to normalized Student Fee application fields.
4. Validate required business fields before insertion.
5. Check `sourceResponseId` idempotency.
6. Create one `납부신청` row with a generated business ID and provenance fields.
7. Record a canonical business audit event (`IMPORT / feeApplications`).

The import service must not:

- approve applications automatically,
- create payment records automatically unless an existing explicitly approved workflow requires it,
- modify the source response,
- infer missing source IDs,
- overwrite an existing application on duplicate import.

## Data Mapping Boundary
Raw Form question titles/answer layout belong to the source adapter/mapper. Business services consume a normalized application DTO and must not depend directly on Form column positions or human-readable question titles.

This preserves the boundary:

```text
Google Form specifics -> source adapter/mapper -> normalized DTO -> Student Fee service
```

## Duplicate Handling
Import is idempotent by `sourceResponseId`.

- First import: create `납부신청`.
- Re-import of the same Form response: return/record an already-imported result and do not append a second row.
- A student may submit multiple distinct Form responses; distinct response IDs are distinct source records and may create separate applications subject to normal business rules.

## Legacy `납부폼_응답` Sheet
Do not delete it at the start of implementation.

Safe removal sequence:

1. Confirm no production code references it.
2. Confirm the external Form/source configuration is valid.
3. Add provenance fields and import logic.
4. Decide how the existing transitional rows map to real Form response IDs. Do not invent IDs when no authoritative ID exists.
5. Preserve or export transitional rows if necessary for audit/debugging.
6. Back up OperationDB.
7. Remove `납부폼_응답` only after readback and regression checks pass.

If current transitional rows cannot be matched to authoritative Google Form response IDs, keep them as legacy/test data or archive them separately; do not fabricate provenance.

## OperationDB Migration
Expected physical DB change:

- Add three columns to `납부신청`: `원본응답ID`, `원본응답일시`, `가져온일시`.
- Preserve all existing `납부신청` rows and business IDs.
- Existing rows receive blank provenance unless a source mapping can be proven.
- Remove `납부폼_응답` only as the final migration step after backup and verification.

## Integrity Rules
Add verification for:

- duplicate non-blank `feeApplications.sourceResponseId` = 0,
- Form-imported application has non-blank `sourceResponseId`, `sourceResponseAt`, `importedAt`,
- existing `feeApplications` PK uniqueness remains intact,
- no OperationDB formal schema entry is created for the external Form source,
- no Student Fee mutation path writes to the source Form response store.

## Audit
Successful new imports write:

```text
actionType = IMPORT
targetType = feeApplications
targetId = generated application ID
beforeValue = null
afterValue = normalized saved application snapshot
```

Duplicate/no-op re-imports should not create misleading CREATE/IMPORT mutations for a row that was not created.

## Testing
Implementation must include tests for:

- schema provenance fields,
- source response ID uniqueness/idempotency,
- source mapper normalization,
- first import success,
- duplicate import no-op,
- distinct response IDs for same student remain distinguishable,
- malformed/missing response ID rejection,
- audit event on successful import,
- architecture boundary preventing direct Form/source writes from business services,
- existing Student Fee regression suite.

## Out of Scope
- Student Fee frontend redesign.
- Changing approval/payment/refund business rules unrelated to Form import.
- Rewriting historical applications with guessed Form response IDs.
- Changing Event Form source architecture except where shared reusable patterns are extracted without changing behavior.

## Success Criteria
The change is complete when:

1. `납부신청` carries authoritative source provenance for new Form imports.
2. Re-importing the same Google Form response cannot create a duplicate application.
3. Google Form responses are treated as a read-only external source.
4. OperationDB no longer depends on `납부폼_응답` as an internal raw/staging table.
5. Existing Student Fee workflows and IDs remain intact.
6. Tests, architecture verifiers, and DB readback are GREEN.
