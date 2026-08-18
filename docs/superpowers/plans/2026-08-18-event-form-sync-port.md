# Event Google Forms Sync Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit Google Forms response synchronization into the current Event applicant domain without importing the legacy EventWelfare stack.

**Architecture:** Keep the feature inside `050_event/052_applicants`. Separate external Google Form/Spreadsheet reading from response mapping and OperationDB persistence. Reuse current Event APIs, OperationDB schema/helpers, IAM permission model, and Event Detail UI.

**Tech Stack:** Google Apps Script, Google Forms `FormApp`, Google Sheets `SpreadsheetApp`, existing OperationDB Sheet CRUD helpers, existing IAM/Auth helpers, HTML/vanilla JS, Node contract/regression scripts.

**Spec:** `docs/superpowers/specs/2026-08-18-event-form-sync-port-design.md`

## Global Constraints

- Sync only `eventForms`, `eventApplications`, and `eventExtraAnswers`.
- Never write `eventPayments` during Forms sync.
- No attendance, accounting, refund, background-trigger, or automatic payment matching work.
- Do not copy legacy `apiV1_*`, `EventWelfare_*`, hard-coded Spreadsheet IDs, `.clasp.json`, or `appsscript.json` changes.
- `sourceResponseId` is the idempotency key; fallback identity must not depend on row number.
- External source reads happen before the OperationDB write lock; internal persistence happens under the existing write lock.
- Per-row missing student ID/name is partial success; missing required columns/source access is hard failure.
- Sync mutation requires current Event edit permission; view-only users may only read sync state.

---

### Task 1: Form response reader and mapper

**Files:**
- Create: `src/000_server/050_event/052_applicants/applicants_form_reader.gs`
- Create: `src/000_server/050_event/052_applicants/applicants_form_mapper.gs`
- Test: `scripts/test-event-form-sync-mapper.js`

**Interfaces:**
- Produces `resolveEventFormResponseSource_(googleFormId, responseSheetId)` returning `{googleFormId,responseSheetId,sheet}`.
- Produces `buildEventFormCandidates_(source,event)` returning `{items,invalidRows}` where each item is `{applicant,extraAnswers}`.
- Produces stable `sourceResponseId` from explicit response ID or deterministic source/content fingerprint, never row number.

- [ ] Write a failing Node VM contract test proving header aliases, required student/name validation, partial-invalid rows, fee mapping, extra-answer mapping, and stable fallback ID.
- [ ] Run the focused test and verify RED because reader/mapper functions do not exist.
- [ ] Implement ID extraction, response Spreadsheet resolution, best-sheet selection, header normalization/aliases, applicant-type normalization, fee mapping, stable fingerprinting, and extra-answer mapping.
- [ ] Run the focused test and verify GREEN.

### Task 2: Applicant/Form DAO and sync service

**Files:**
- Modify: `src/000_server/050_event/052_applicants/applicants_sheet_dao.gs`
- Create: `src/000_server/050_event/052_applicants/applicants_form_sync_service.gs`
- Test: `scripts/test-event-form-sync-service.js`

**Interfaces:**
- Add domain DAO helpers for reading existing source IDs, appending applications/extra answers, and finding/upserting `eventForms` through current OperationDB helpers.
- Produce `syncApplicantsFromFormsData_(request,current)` returning `{importedCount,duplicateCount,invalidCount,invalidRows,sourceSheetName,formSync}`.

- [ ] Write failing service tests for duplicate filtering, batch duplicates, write-lock recheck, UUID assignment, eventForms upsert, partial success, and absence of `eventPayments` writes.
- [ ] Run RED.
- [ ] Implement minimal domain DAO helpers and orchestration: validate event, merge source config, external read/map, lock, re-read duplicate IDs, insert applications then their extra answers, upsert form metadata.
- [ ] Run GREEN.

### Task 3: API authorization and Event detail read model

**Files:**
- Modify: `src/000_server/050_event/052_applicants/applicants_api.gs`
- Modify: `src/000_server/050_event/051_events/events_query_service.gs`
- Test: `scripts/test-event-form-sync-api.js`

**Interfaces:**
- Add `api_syncApplicantsFromForms(input)` using current `apiHandler_`/`parseEventRequest_` conventions.
- Server checks Event edit authorization before mutation.
- `getEventDetailData_()` adds additive `formSync` state from `eventForms`.

- [ ] Write failing contract test for endpoint existence, login/auth integration, Event edit enforcement, and additive detail `formSync`.
- [ ] Run RED.
- [ ] Implement endpoint and permission helper using current IAM effective permissions/admin bypass; do not create a second permission system.
- [ ] Add form-sync read composition to event detail without changing existing summary fields.
- [ ] Run GREEN and existing Event regression tests.

### Task 4: Enable Event Detail Forms controls

**Files:**
- Modify: `src/600_event/620_detail/event_detail_js.html`
- Test: `scripts/test-event-form-sync-frontend.js`

**Interfaces:**
- Render current form connection state in Basic and Applicants tabs.
- Provide Form ID/URL and response Sheet ID/URL inputs plus explicit sync action.
- Call `api_syncApplicantsFromForms`, show imported/duplicate/invalid counts, then reload event detail/applicant data.

- [ ] Write failing frontend contract test checking disabled legacy placeholders are replaced by active controls/API call/result rendering.
- [ ] Run RED.
- [ ] Implement minimal UI using existing Event styles/helpers; no new page and no separate browser data store.
- [ ] Run GREEN and current Event frontend syntax/regression checks.

### Task 5: Architecture guardrail and full regression

**Files:**
- Create: `scripts/verify-event-form-sync-architecture.js`
- Existing regression scripts remain unchanged unless an additive contract requires an explicit compatibility update.

**Interfaces:**
- Verifier ensures reader has no OperationDB writes, mapper has no Google service access or DB writes, sync service owns orchestration, legacy `apiV1_`/`EventWelfare_` identifiers are not introduced, and no `eventPayments` writes appear in sync files.

- [ ] Add the architecture verifier and syntax checks for new `.gs` and inline JS.
- [ ] Run focused tests plus `test-event.js`, server/Event architecture verifiers, Auth/IAM regression, shared UI verifier, and other existing domain regressions.
- [ ] Fix only observed failures while preserving existing contracts.
- [ ] Record one fresh full-suite PASS on the feature SHA, remove any temporary verification workflow/result files, and confirm the cleanup commits change verification-only files.
