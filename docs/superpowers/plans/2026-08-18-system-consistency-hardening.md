# System Consistency Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply one declarative API authorization contract and one consistent mutation discipline across Event, Accounting, and Student Fee while preserving current public API/frontend contracts.

**Architecture:** `apiHandler_()` remains the single authenticated API entrypoint and gains declarative `access: {domain, action, screenId?}` enforcement through a new technical access dispatcher. Each domain resolves its own screen mapping and business rules. High-risk check-then-write mutations use lock-bound re-read/pre-validation; simple mutations may keep direct `withOperationWriteLock_()`.

**Tech Stack:** Google Apps Script JavaScript, Google Sheets/Drive/Form services, Node.js VM regression scripts, GitHub Actions verification.

**Spec:** `docs/superpowers/specs/2026-08-18-system-consistency-hardening-design.md`

## Global Constraints

- Preserve all current public `api_*` names and frontend response contracts.
- Do not add classes, DI containers, command buses, generic repositories, or a Core-owned business screen registry.
- Core may orchestrate access but must not know Event/Accounting/Student Fee screen IDs.
- API action semantics are fixed: read=`view`, ordinary mutation=`edit`, approval/rejection/confirmation/process=`approve`, export=`export`, admin=bypass.
- External Google I/O stays outside OperationDB write locks whenever possible.
- Multi-item mutations pre-validate all predictable failures before the first write.
- Keep existing domain error conventions and fail authorization closed with `FORBIDDEN`.

---

### Task 1: Common API Access Contract

**Files:**
- Create: `src/000_server/010_core/api_access.gs`
- Modify: `src/000_server/010_core/api_handler.gs`
- Test: `scripts/test-api-access-contract.js`

**Interfaces:**
- Consumes: existing `requirePermission_(context, permission)` IAM primitive.
- Produces: `resolveApiAccess_(context, access)`, `resolveDomainApiAccess_(access)`, and `apiHandler_()` support for `access` with legacy `permission` compatibility.

- [ ] **Step 1: Write the failing test** covering: access invokes resolver before service, admin is accepted through IAM primitive, invalid action fails closed, legacy `permission` still works, and declaring both `access` and `permission` fails configuration validation.
- [ ] **Step 2: Run `node scripts/test-api-access-contract.js` and verify RED** because `api_access.gs`/`access` handling does not exist.
- [ ] **Step 3: Implement `api_access.gs`** with supported action validation (`view/edit/approve/export`) and domain dispatch by function name only; do not place screen IDs in Core.
- [ ] **Step 4: Modify `apiHandler_()`** to reject dual declarations, enforce `access` after login and before parse/service, and retain legacy `permission` support.
- [ ] **Step 5: Re-run the focused test and commit when GREEN.**

### Task 2: Domain Access Resolvers

**Files:**
- Modify: `src/000_server/050_event/050_common/event_access.gs`
- Create: `src/000_server/060_accounting/060_common/accounting_access.gs`
- Create: `src/000_server/080_student_fee/080_common/student_fee_access.gs`
- Test: `scripts/test-domain-access-resolvers.js`

**Interfaces:**
- Consumes: `requirePermission_()`, permission metadata helpers, optional explicit `screenId`.
- Produces: `resolveEventAccess_(access)`, `resolveAccountingAccess_(access)`, `resolveStudentFeeAccess_(access)` returning `{screenId, action}`.

- [ ] **Step 1: Write RED tests** for default domain screen resolution, explicit screen validation, unknown action/domain failure, and admin bypass through the existing IAM check.
- [ ] **Step 2: Implement focused domain resolvers** using each domain's existing permission metadata/aliases; keep all business screen knowledge outside Core.
- [ ] **Step 3: Convert `requireEventEditContext_()` into a compatibility wrapper over the Event resolver or remove it after Task 3 migration.
- [ ] **Step 4: Run focused resolver tests and commit GREEN.**

### Task 3: Migrate Event APIs to the Common Contract

**Files:**
- Modify: `src/000_server/050_event/051_events/events_api.gs`
- Modify: `src/000_server/050_event/052_applicants/applicants_api.gs`
- Modify: `src/000_server/050_event/054_attendance/attendance_api.gs`
- Modify: `src/000_server/050_event/055_refunds/refunds_api.gs`
- Modify as needed: Event query/export APIs discovered during implementation
- Test: `scripts/test-event-api-access.js`

**Interfaces:**
- Event reads declare `access:{domain:'event',action:'view'}`.
- create/update/forms sync/attendance mutation declare `edit`.
- status close/applicant approve-reject-process declare `approve`.
- exports, if any, declare `export`.

- [ ] **Step 1: Add focused tests proving direct unauthorized API calls fail even when login context exists.**
- [ ] **Step 2: Migrate every Event business API from login-only/Forms-specific guards to declarative `access`.**
- [ ] **Step 3: Remove duplicate Forms-specific authorization from service callback once the common handler is authoritative.**
- [ ] **Step 4: Run existing Event regression plus focused access tests and commit GREEN.**

### Task 4: Migrate Accounting APIs to the Common Contract

**Files:**
- Modify: `src/000_server/060_accounting/061_ledger/ledger_api.gs`
- Modify: `src/000_server/060_accounting/062_evidence/evidence_api.gs`
- Modify: `src/000_server/060_accounting/063_reconciliation/reconciliation_api.gs`
- Modify: `src/000_server/060_accounting/064_settlement/settlement_api.gs`
- Test: `scripts/test-accounting-api-access.js`

**Interfaces:**
- reads=`view`; create/update/delete/import/upload/remove=`edit`; process/match/settlement generation=`approve`; export=`export`.

- [ ] **Step 1: Write RED tests for representative view/edit/approve/export Accounting endpoints.**
- [ ] **Step 2: Add declarative `access` to every Accounting API based on intent.**
- [ ] **Step 3: Verify no mutation endpoint remains `requireLogin`-only.**
- [ ] **Step 4: Run Accounting focused and existing regressions, then commit GREEN.**

### Task 5: Migrate Student Fee APIs to the Common Contract

**Files:**
- Modify: `src/000_server/080_student_fee/080_common/student_fee_reference_api.gs`
- Modify: `src/000_server/080_student_fee/081_payers/fee_payers_api.gs`
- Modify: `src/000_server/080_student_fee/082_payments/fee_payments_api.gs`
- Modify: `src/000_server/080_student_fee/083_refunds/fee_refunds_api.gs`
- Test: `scripts/test-student-fee-api-access.js`

**Interfaces:**
- reads/calculations=`view`; ordinary payer edits/imports=`edit`; application/refund approval/rejection and payment/refund confirmation=`approve`; exports=`export`.

- [ ] **Step 1: Write RED tests for direct unauthorized calls across view/edit/approve actions.**
- [ ] **Step 2: Migrate all Student Fee APIs to declarative `access`.**
- [ ] **Step 3: Run focused and existing Student Fee regressions; commit GREEN.**

### Task 6: Harden Student Fee Concurrency and Batch Atomicity-by-Prevalidation

**Files:**
- Modify: `src/000_server/080_student_fee/082_payments/fee_payments_service.gs`
- Modify: `src/000_server/080_student_fee/083_refunds/fee_refunds_service.gs`
- Create: `src/000_server/010_core/mutation_runner.gs` only if the common lifecycle removes duplication without obscuring domain logic.
- Test: `scripts/test-student-fee-mutation-consistency.js`

**Interfaces:**
- Produces lock-bound re-read for application/payment and refund/request pairs.
- Batch services derive a full mutation plan before writing any row.

- [ ] **Step 1: Write RED tests** for stale pre-lock reads, duplicate payment/refund insertion prevention, and a later invalid batch item causing zero writes.
- [ ] **Step 2: Refactor application approval** to enter one write lock, re-read every application/payment pair, validate all IDs/actions/rates, then perform writes/audits.
- [ ] **Step 3: Refactor refund approval** with the same two-phase pattern, including refundable-amount validation before writes.
- [ ] **Step 4: Keep confirmation operations state-authoritative after lock-bound re-read.**
- [ ] **Step 5: Run focused + Student Fee regressions and commit GREEN.**

### Task 7: Harden Event Forms Identity/Upsert and Event State Semantics

**Files:**
- Modify: `src/000_server/050_event/052_applicants/applicants_form_mapper.gs`
- Modify: `src/000_server/050_event/052_applicants/applicants_form_sync_service.gs`
- Modify: `src/000_server/050_event/052_applicants/applicants_service.gs`
- Test: `scripts/test-event-consistency-hardening.js`

**Interfaces:**
- Explicit source response ID remains first priority.
- Stable fallback: `responseSheetId + sheetId + sourceResponseAt + studentId`; if timestamp missing, use current full-row deterministic hash.
- `eventForms` upsert re-reads current form inside the write lock.
- rejection records `processedAt=now`.

- [ ] **Step 1: Write RED tests** for edited non-identity answers retaining fallback identity, concurrent first-sync form upsert behavior, and reject timestamp semantics.
- [ ] **Step 2: Implement identity fallback hierarchy.**
- [ ] **Step 3: Move `findEventFormByEventId_()` upsert decision inside the write lock.**
- [ ] **Step 4: Set `processedAt` for both approve and reject.**
- [ ] **Step 5: Run Event focused/existing regressions and commit GREEN.**

### Task 8: Harden Accounting Money and Transaction-Type Validation

**Files:**
- Modify: `src/000_server/060_accounting/061_ledger/ledger_service.gs`
- Modify or create focused validator under `src/000_server/060_accounting/060_common/` if reuse is warranted.
- Test: `scripts/test-accounting-money-validation.js`

**Interfaces:**
- `transaction_type` is normalized/trimmed then must equal `수입` or `지출`.
- ledger amount must be finite and strictly greater than zero.
- client `balance_after` is informational only and never used for aggregate/business decisions.

- [ ] **Step 1: Write RED tests** for trailing-space type normalization, unsupported types, negative/zero/NaN/Infinity amounts, and aggregate independence from `balance_after`.
- [ ] **Step 2: Add server validation before insert/update.**
- [ ] **Step 3: Preserve public DTO names while preventing invalid persistence.**
- [ ] **Step 4: Run Accounting regressions and commit GREEN.**

### Task 9: Correct IAM Menu Semantics

**Files:**
- Modify: `src/000_server/040_iam/043_permissions/permissions_query_service.gs`
- Test: `scripts/test-iam-menu-semantics.js`

**Interfaces:**
- A granted action no longer mutates the semantic `menu` bit to true automatically.
- `buildMenusFromPermissions_()` still exposes navigation whenever any usable grant (`view/edit/approve/export` or explicit menu) exists.

- [ ] **Step 1: Write RED tests** proving export-only/edit-only grants do not set `menu=true` but still produce navigation visibility.
- [ ] **Step 2: Remove unconditional `menu:true` initialization and keep navigation derivation based on usable grants.**
- [ ] **Step 3: Run IAM/Auth/sidebar regressions and commit GREEN.**

### Task 10: Business-Key Integrity and Architecture Guardrails

**Files:**
- Modify: `src/000_server/020_schema/operation_db_integrity.gs`
- Create: `scripts/verify-system-consistency-architecture.js`
- Test: `scripts/test-operation-business-key-integrity.js`

**Interfaces:**
- Integrity reports duplicates for `eventForms.eventId`, `feePayments.applicationId`, `feeRefunds.requestId`, and nonblank `eventApplications.sourceResponseId`.
- Architecture verifier fails on login-only business mutation APIs, Core screen IDs, sheet access from access resolvers, stale Event Form upsert decisions, and unlocked high-risk Student Fee check-then-insert flows.

- [ ] **Step 1: Write RED integrity tests with duplicate secondary business keys.**
- [ ] **Step 2: Extend OperationDB integrity reporting without changing schema ownership or auto-repairing data.**
- [ ] **Step 3: Add architecture verifier for the common API/mutation rules.**
- [ ] **Step 4: Run focused tests/verifier and commit GREEN.**

### Task 11: Full Regression and Cleanup

**Files:**
- Temporary GitHub Actions verification workflow/markers only if local execution is unavailable; remove them before completion.

**Interfaces:**
- Produces fresh verification evidence for final feature HEAD product code.

- [ ] **Step 1: Run syntax checks for modified `.gs` and inline JS plus all new focused tests.**
- [ ] **Step 2: Run existing Core/Auth/IAM/Event/Accounting/Student Fee/Settings/MyPage regressions and all architecture verifiers.**
- [ ] **Step 3: Fix failures at their owning layer and re-run until fresh `FINAL=PASS`.**
- [ ] **Step 4: Remove temporary workflows/verification markers.**
- [ ] **Step 5: Compare verified product SHA to cleanup HEAD and confirm only temporary verification files changed after PASS.**
- [ ] **Step 6: Compare `main` to `refactor/system-consistency-hardening` and confirm no unrelated product changes.**
