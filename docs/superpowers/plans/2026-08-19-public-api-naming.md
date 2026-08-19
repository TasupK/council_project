# Public API Naming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the Apps Script public RPC surface to the approved REST-inspired resource-oriented naming contract without changing transport, behavior, request/response shapes, authorization, persistence, or business rules.

**Architecture:** Keep `google.script.run → api_* → apiHandler_ → domain service → DAO` unchanged. Rename only public RPC identifiers and every in-repository caller atomically. Collections use plural resource nouns, single resources use singular nouns, nested resources include their parent/domain context, ordinary lifecycle operations use CRUD verbs, and true business commands use the approved explicit command vocabulary.

**Tech Stack:** Google Apps Script JavaScript, HTML/JS frontend using `google.script.run`, Node.js behavior/architecture scripts, GitHub Actions for repository-local verification when needed.

**Spec:** `docs/superpowers/specs/2026-08-19-public-api-naming-design.md`

## Global Constraints

- Keep the current `google.script.run` RPC architecture; do not introduce HTTP REST routing.
- Do not change request/response shapes, authorization, locks, Sheet/Drive persistence, or business-state behavior.
- Do not add permanent compatibility aliases.
- Rename every server definition and every repository caller in the same migration batch.
- Collection reads use plural resource nouns; single-resource reads use singular nouns.
- Nested resources include parent/domain context in the global Apps Script namespace.
- Standard CRUD verbs: `get`, `create`, `update`, `delete`.
- Business command verbs: `process`, `confirm`, `apply`, `sync`, `calculate`, `export`.
- Generic public `List`, `Detail`, `Data`, `load`, `save`, `run`, and `generate` naming is removed where the approved semantic replacement exists.
- `api_checkLogin`, `api_checkUserDbIntegrity`, and `api_checkOperationDbIntegrity` remain explicit diagnostic/session exceptions in this migration; `check` is not generalized as a normal resource verb.
- `authorizeApp` remains a platform/external entry point.

---

### Task 1: Public API Inventory, Rename Map, and RED Guardrail

**Files:**
- Create: `docs/superpowers/specs/2026-08-19-public-api-rename-map.md`
- Create: `scripts/verify-public-api-naming.js`

**Interfaces:**
- Consumes: all public function declarations under `src/000_server/**/*.gs` and frontend/server references under `src/**/*`.
- Produces: one authoritative legacy→target map and an executable verifier that rejects old public identifiers.

- [ ] **Step 1: Freeze the explicit rename map**

Use the following target map unless repository inspection proves a symbol does not exist:

```text
Event
api_getEventList                       -> api_getEvents
api_getEventForEdit                    -> api_getEvent
api_getEventDetail                     -> api_getEventOverview
api_getApplicantList                   -> api_getEventApplicants
api_getApplicantDetail                 -> api_getEventApplicant
api_processApplicant                   -> api_processEventApplicant
api_syncApplicantsFromForms            -> api_syncEventApplicantsFromForms
api_getAttendanceList                  -> api_getEventAttendances
api_applyAttendanceChanges             -> api_applyEventAttendanceChanges
api_getEventRefundList                 -> api_getEventRefunds

Accounting / Ledger / Evidence
api_getLedgerList                      -> api_getLedgerEntries
api_getLedgerDetail                    -> api_getLedgerEntry
api_saveLedgerDraft                    -> api_createLedgerDraft
api_getEvidenceFileContent             -> api_getLedgerEvidenceFileContent
api_getEvidenceAuditList               -> api_getLedgerEvidenceAudits

Accounting / Reconciliation
api_uploadBankTransactions             -> api_processBankTransactionUpload
api_runReconciliation                  -> api_processReconciliation
api_getReconciliationList              -> api_getReconciliations
api_getReconciliationDetail            -> api_getReconciliation
api_linkReconciliation                 -> api_applyReconciliationLink
api_createLedgerFromReconciliation     -> api_createLedgerEntryFromReconciliation
api_getBankOcrLogs                     -> api_getBankOcrLogs

Accounting / Settlement
api_generateSettlementReport           -> api_createSettlementReport
api_getSettlementReportList            -> api_getSettlementReports

Student Fee
api_getStudentFeeReferenceData         -> api_getStudentFeeReference
api_getFeePayerList                    -> api_getStudentFeePayers
api_getFeePayerDetail                  -> api_getStudentFeePayer
api_createFeePayer                     -> api_createStudentFeePayer
api_updateFeePayer                     -> api_updateStudentFeePayer
api_getFeeApplicationList              -> api_getStudentFeeApplications
api_getFeeApplicationDetail            -> api_getStudentFeeApplication
api_processFeeApplications             -> api_processStudentFeeApplications
api_calculateFeeAmount                 -> api_calculateStudentFeeAmount
api_confirmFeePayment                  -> api_confirmStudentFeePayment
api_getFeeRefundRequestList            -> api_getStudentFeeRefundRequests
api_getFeeRefundRequestDetail          -> api_getStudentFeeRefundRequest
api_processFeeRefundRequests           -> api_processStudentFeeRefundRequests
api_calculateFeeRefund                 -> api_calculateStudentFeeRefund
api_confirmFeeRefund                   -> api_confirmStudentFeeRefund

Settings bridge
loadSettingsHomeData                   -> api_getSettingsHome
loadSettingsUsersData                  -> api_getSettingsUsers
saveSettingsUserDepartment             -> api_updateSettingsUserDepartment
loadSettingsRolesData                  -> api_getSettingsRoles
loadSettingsPermissionsData            -> api_getSettingsPermissions
loadSettingsDepartmentsData            -> api_getSettingsDepartments
```

Keep these already-conforming names unchanged: `api_createEvent`, `api_updateEvent`, `api_updateEventStatus`, `api_closeEvent`, `api_getLedgerSummary`, `api_getLedgerEventOptions`, `api_createLedgerEntry`, `api_updateLedgerEntry`, `api_deleteLedgerEntry`, `api_processLedgerEntry`, `api_getReconciliationCandidates`, `api_getSettlementSummary`, `api_getSettlementReport`, `api_exportSettlementReport`, `api_getStudentFeeSummary`, `api_getCurrentUser`, and `api_getMyPermissions`.

- [ ] **Step 2: Write the failing public naming verifier**

`verify-public-api-naming.js` must:

```js
// structural requirements
// 1. scan named functions in src/000_server/**/*.gs
// 2. reject every identifier in LEGACY_PUBLIC_SYMBOLS
// 3. reject api_* names containing List, Detail, or generic Data
// 4. reject api_(load|save|run|generate)*
// 5. allow explicit exceptions: api_checkLogin, api_checkUserDbIntegrity,
//    api_checkOperationDbIntegrity, api_getEventOverview, semantic nouns such as
//    Summary, Reference, Options, Content, Candidates, Audits, Logs
// 6. reject non-api public Settings bridge functions after migration
```

The verifier must inspect only code, not historical design/spec documents whose examples intentionally contain legacy identifiers.

- [ ] **Step 3: Run the verifier before migration**

Run:

```bash
node scripts/verify-public-api-naming.js
```

Expected: FAIL and report the legacy public symbols currently present.

- [ ] **Step 4: Commit rename map + RED verifier**

Commit only the rename map and verifier before changing production symbols.

---

### Task 2: Event Public API Resource Migration

**Files:**
- Modify: `src/000_server/050_event/**/*_api.gs`
- Modify: Event frontend callers under `src/100_frontend` / current frontend tree
- Modify: Event-related `scripts/test-*.js` and `scripts/verify-*.js`

**Interfaces:**
- Produces the Event RPC surface:

```text
api_getEvents
api_getEvent
api_getEventOverview
api_createEvent
api_updateEvent
api_updateEventStatus
api_closeEvent
api_getEventApplicants
api_getEventApplicant
api_processEventApplicant
api_syncEventApplicantsFromForms
api_getEventAttendances
api_applyEventAttendanceChanges
api_getEventRefunds
```

- [ ] **Step 1: Rename collection and single-resource queries**

Apply the Event query mappings from Task 1. `api_getEventForEdit` becomes the canonical singular `api_getEvent`; the composed detail/summary view becomes `api_getEventOverview` so both response shapes remain distinct and unchanged.

- [ ] **Step 2: Rename nested-resource commands**

Rename applicant, attendance, Forms sync, and refund APIs to include the `Event` parent context.

- [ ] **Step 3: Update every Event caller atomically**

Update `google.script.run.<name>`, direct server/test calls, string-based architecture expectations, and fixtures. Do not retain wrapper aliases.

- [ ] **Step 4: Run focused Event tests and verifiers**

Run every existing `scripts/test-event*.js` and Event architecture verifier plus `node scripts/verify-public-api-naming.js`. During this batch the global verifier may still fail only on later Accounting/Student Fee/Settings legacy symbols; Event legacy symbols must be absent.

- [ ] **Step 5: Commit Event migration**

---

### Task 3: Accounting Public API Resource and Command Migration

**Files:**
- Modify: `src/000_server/060_accounting/**/*_api.gs`
- Modify: Accounting frontend callers
- Modify: Accounting behavior tests and architecture verifiers

**Interfaces:**
- Produces the Accounting RPC surface including:

```text
api_getLedgerEntries
api_getLedgerEntry
api_getLedgerSummary
api_getLedgerEventOptions
api_createLedgerEntry
api_createLedgerDraft
api_updateLedgerEntry
api_deleteLedgerEntry
api_processLedgerEntry
api_getLedgerEvidenceFileContent
api_getLedgerEvidenceAudits
api_processBankTransactionUpload
api_getBankOcrLogs
api_processReconciliation
api_getReconciliations
api_getReconciliation
api_getReconciliationCandidates
api_applyReconciliationLink
api_createLedgerEntryFromReconciliation
api_getSettlementSummary
api_getSettlementReports
api_getSettlementReport
api_createSettlementReport
api_exportSettlementReport
```

- [ ] **Step 1: Normalize Ledger/Evidence resources**

Apply plural/singular Ledger names, `saveLedgerDraft → createLedgerDraft`, and parent-qualified Ledger Evidence names.

- [ ] **Step 2: Normalize Reconciliation resources and commands**

Use `processBankTransactionUpload` for the multi-step upload/OCR/import command, `processReconciliation` for reconciliation execution, `applyReconciliationLink` for explicit link changes, and `createLedgerEntryFromReconciliation` for persisted ledger creation.

- [ ] **Step 3: Normalize Settlement resources**

Use plural `api_getSettlementReports` for the collection and `api_createSettlementReport` for persisted report creation. Keep singular get/export unchanged.

- [ ] **Step 4: Update all Accounting callers/tests/verifiers atomically**

No legacy Accounting public identifier may remain in `src` or `scripts`.

- [ ] **Step 5: Run Accounting behavior tests, architecture verifiers, and public naming verifier**

Later-domain failures are acceptable before Tasks 4–5; Accounting legacy symbols are not.

- [ ] **Step 6: Commit Accounting migration**

---

### Task 4: Student Fee Public API Parent-Qualified Migration

**Files:**
- Modify: `src/000_server/080_student_fee/**/*_api.gs`
- Modify: Student Fee frontend callers
- Modify: Student Fee tests/verifiers

**Interfaces:**
- Produces:

```text
api_getStudentFeeReference
api_getStudentFeeSummary
api_getStudentFeePayers
api_getStudentFeePayer
api_createStudentFeePayer
api_updateStudentFeePayer
api_getStudentFeeApplications
api_getStudentFeeApplication
api_processStudentFeeApplications
api_calculateStudentFeeAmount
api_confirmStudentFeePayment
api_getStudentFeeRefundRequests
api_getStudentFeeRefundRequest
api_processStudentFeeRefundRequests
api_calculateStudentFeeRefund
api_confirmStudentFeeRefund
```

- [ ] **Step 1: Remove generic `Data` from Student Fee reference API**

Rename `api_getStudentFeeReferenceData` to `api_getStudentFeeReference` without changing its return value.

- [ ] **Step 2: Parent-qualify payer/application/refund resources**

Apply every Student Fee mapping from Task 1, preserving collection vs singular through plural/singular nouns.

- [ ] **Step 3: Update all Student Fee callers/tests/verifiers atomically**

- [ ] **Step 4: Run Student Fee behavior tests, architecture verifiers, and public naming verifier**

Only Settings bridge legacy failures may remain at this point.

- [ ] **Step 5: Commit Student Fee migration**

---

### Task 5: Settings Bridge Migration to Standard `api_*`

**Files:**
- Modify: `src/000_server/070_settings/**/*`
- Modify: Settings frontend callers
- Modify: `scripts/verify-internal-function-naming.js`
- Modify: Settings tests/verifiers

**Interfaces:**
- Produces:

```text
api_getSettingsHome
api_getSettingsUsers
api_updateSettingsUserDepartment
api_getSettingsRoles
api_getSettingsPermissions
api_getSettingsDepartments
```

- [ ] **Step 1: Rename the six public Settings bridge functions**

Replace `loadSettings*` / `saveSettings*` definitions with the target `api_*` names; keep function bodies and response shapes unchanged.

- [ ] **Step 2: Update every Settings frontend caller**

Update all `google.script.run` references and any function-name strings.

- [ ] **Step 3: Tighten internal naming verifier public allowlist**

Remove the six old Settings names from `PUBLIC_ALLOWLIST`; retain only actual platform/external exceptions such as `authorizeApp`.

- [ ] **Step 4: Run Settings tests/verifiers and public API naming verifier**

Expected: `node scripts/verify-public-api-naming.js` now PASSes globally.

- [ ] **Step 5: Commit Settings migration**

---

### Task 6: Full Regression, Public Surface Audit, and Cleanup

**Files:**
- Modify only if verification exposes stale symbol expectations.
- Temporary CI/workflow evidence may be created under `.github/workflows/` and `verification/`; remove it before final handoff.

**Interfaces:**
- Consumes the complete target public surface from Tasks 2–5.
- Produces final evidence that the rename is behavior-preserving and no permanent aliases remain.

- [ ] **Step 1: Compile every server `.gs` file**

Use Node `vm.Script` against all `src/000_server/**/*.gs` files.

- [ ] **Step 2: Run every behavior test**

```bash
for file in scripts/test-*.js; do node "$file"; done
```

Expected: all exit 0.

- [ ] **Step 3: Run every architecture verifier**

```bash
for file in scripts/verify-*.js; do node "$file"; done
```

Expected: all exit 0, including `verify-public-api-naming.js` and `verify-internal-function-naming.js`.

- [ ] **Step 4: Audit legacy public symbols**

Scan `src` and `scripts` for every old name in Task 1. Expected: zero references. Historical specs/docs may retain examples intentionally.

- [ ] **Step 5: Audit public server functions**

Enumerate named public server functions. Every application RPC must either start with `api_` or be an explicitly documented platform entry point. Confirm the six former Settings bridges are now standard `api_*` functions.

- [ ] **Step 6: Diff review**

Confirm code changes are limited to public symbol names/call sites, tests/verifiers, and naming documentation. No request/response, authorization, locking, persistence, or business logic changes are allowed.

- [ ] **Step 7: Remove temporary workflow/log files**

Keep the permanent spec, plan, rename map, and `verify-public-api-naming.js`.
