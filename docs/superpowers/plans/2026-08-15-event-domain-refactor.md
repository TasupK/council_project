# Event Domain Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize `src/000_server/050_event` into responsibility-based feature modules while preserving all existing public API behavior.

**Architecture:** Keep public API contracts unchanged. Separate feature mutation logic into Services, validation into Validators, table access into Sheet DAOs, cross-feature read composition into `event_query_service.gs`, and promote Payment to the independent `053_payment` feature.

**Tech Stack:** Google Apps Script JavaScript, clasp-style source layout, Node.js verification scripts.

## Global Constraints

- Preserve every existing public `api_*` function name, input shape, return shape, validation result, error code, UUID behavior, lock behavior, and Drive policy.
- Do not change client HTML/JavaScript.
- Do not implement currently-unimplemented payment/refund/forms/attendance-sync behavior.
- Do not introduce classes, DI, repository interfaces, ORM, or query builders.
- No arrow functions.

---

### Task 1: Promote Payment to `053_payment`

**Files:**
- Create: `src/000_server/050_event/053_payment/payment_service.gs`
- Create: `src/000_server/050_event/053_payment/payment_sheet_dao.gs`
- Delete: `src/000_server/050_event/050_common/event_payments.gs`
- Delete: `src/000_server/050_event/050_common/event_payment_sheet_dao.gs`
- Test: `scripts/verify-server-architecture.js`

**Interfaces:**
- Produces: `getEventPaymentTotalsByApplicationId_()`, `findAllEventPaymentClientRows_()` with unchanged signatures.

- [ ] Add a structural test that requires `053_payment/payment_service.gs` and `053_payment/payment_sheet_dao.gs` and rejects the old Common payment files.
- [ ] Run the structural test and confirm failure before moving files.
- [ ] Move the two functions without changing implementation.
- [ ] Run `node scripts/verify-server-architecture.js` and the structural test.
- [ ] Commit the payment promotion.

### Task 2: Renumber Attendance, Refunds, and Files

**Files:**
- Move: `053_attendance` -> `054_attendance`
- Move: `054_refunds` -> `055_refunds`
- Move: `055_files` -> `056_files`

**Interfaces:**
- All existing function names remain unchanged.

- [ ] Extend the structural test with required target folders and forbidden legacy folders.
- [ ] Run it and confirm failure.
- [ ] Recreate files under new paths and remove legacy paths without changing contents.
- [ ] Run `node scripts/verify-server-architecture.js` and structural test.
- [ ] Commit directory renumbering.

### Task 3: Make API File Roles Explicit

**Files:**
- Rename: `051_events/events.gs` -> `051_events/events_api.gs`
- Rename: `052_applicants/applicants.gs` -> `052_applicants/applicants_api.gs`
- Rename: `054_attendance/attendance.gs` -> `054_attendance/attendance_api.gs`
- Rename: `055_refunds/refunds.gs` -> `055_refunds/refunds_api.gs`

**Interfaces:**
- Preserve all public `api_*` functions exactly.

- [ ] Extend structural test with new API filenames and forbidden legacy filenames.
- [ ] Confirm failing test.
- [ ] Move files unchanged.
- [ ] Run both verification scripts.
- [ ] Commit API file renames.

### Task 4: Split Events Validation and Mutation Service

**Files:**
- Create: `051_events/events_validator.gs`
- Create: `051_events/events_service.gs`
- Modify/Delete: `051_events/event_events.gs`

**Interfaces:**
- Validator produces unchanged `buildEventPayload_(payload, requireAll)`.
- Service produces unchanged `createEventData_`, `updateEventData_`, `updateEventStatusData_`, `closeEventData_`, `getEventData_`.

- [ ] Add structural assertions for required functions in the new files and absence from `event_events.gs`.
- [ ] Confirm failing test.
- [ ] Move functions verbatim.
- [ ] Run verification.
- [ ] Commit Events split.

### Task 5: Split Applicant and Attendance Mutation Services

**Files:**
- Create: `052_applicants/applicants_service.gs`
- Create: `054_attendance/attendance_service.gs`
- Modify/Delete: `052_applicants/event_applicants.gs`
- Modify/Delete: `054_attendance/event_attendance.gs`

**Interfaces:**
- Applicants Service: `processApplicantData_()`.
- Attendance Service: `applyAttendanceChangesData_()`, `findEventAttendanceByApplicationId_()`.

- [ ] Add structural assertions and confirm failure.
- [ ] Move mutation functions verbatim.
- [ ] Run verification.
- [ ] Commit feature service split.

### Task 6: Create Event Query Service

**Files:**
- Create: `050_common/event_query_service.gs`
- Remove query functions from legacy `event_events.gs`, `event_applicants.gs`, `event_attendance.gs`, `event_refunds.gs`.

**Interfaces:**
- Produces unchanged `getEventListData_`, `getUniqueEventValues_`, `getEventDetailData_`, `getApplicantListData_`, `getApplicantDetailData_`, `getAttendanceListData_`, `getEventRefundListData_`.

- [ ] Add structural assertions that these functions exist exactly once and are located in `event_query_service.gs`.
- [ ] Confirm failure.
- [ ] Move query functions verbatim.
- [ ] Remove empty legacy feature implementation files.
- [ ] Run verification.
- [ ] Commit Query Service extraction.

### Task 7: Rename File Integration Boundary

**Files:**
- Rename: `056_files/event_files.gs` -> `056_files/event_file_service.gs`

**Interfaces:**
- Preserve `uploadEventRelatedMaterial_`, `getEventMaterialFolder_`, `sanitizeEventDriveFileName_` and constants unchanged.

- [ ] Extend structural test and confirm failure.
- [ ] Rename file without changing behavior.
- [ ] Run verification.
- [ ] Commit File Service rename.

### Task 8: Final Architecture Verification

**Files:**
- Modify: `scripts/verify-server-architecture.js` only if needed to encode stable Event architecture rules.
- Test: all server sources.

- [ ] Run `node scripts/test-core.js`.
- [ ] Run `node scripts/verify-server-architecture.js`.
- [ ] Run the Event structural verification.
- [ ] Search for duplicate function definitions and references to removed Event paths.
- [ ] Compare `login_and_setting...refactor/event-domain` and confirm the diff is structural only.
- [ ] Commit verification updates.