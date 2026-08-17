# Event Domain Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or subagent-driven-development for future extensions. This document records the finalized structural refactor baseline.

**Goal:** Reorganize `src/000_server/050_event` into feature-owned API/Service/Query/DAO boundaries while preserving all existing public API behavior.

**Architecture:** `050_common` contains primitive Event utilities only. Each feature owns its read composition through a local Query Service, mutation logic through Service, and persistence through Sheet DAO. Payment is an independent `053_payment` feature, Attendance is `054`, Refunds is `055`, and Drive behavior is `056_files`.

**Tech Stack:** Google Apps Script JavaScript, Apps Script global functions, Node.js verification/regression scripts.

## Global Constraints

- Preserve public `api_*` names, input/output shapes, validation, errors, UUID, locking, Drive behavior, defaults, and TODO behavior.
- No client HTML/JavaScript changes in the structural refactor.
- No classes, DI containers, generic repositories, ORM, or query builders.
- No arrow functions.
- Query Services are read-only.
- No bidirectional feature Service dependencies.
- Do not create empty files solely for symmetry.

## Final File Structure

```text
src/000_server/050_event/
├─ 050_common/
│  ├─ event_constants.gs
│  ├─ event_error.gs
│  ├─ event_request.gs
│  └─ event_pagination.gs
├─ 051_events/
│  ├─ events_api.gs
│  ├─ events_service.gs
│  ├─ events_query_service.gs
│  ├─ events_validator.gs
│  └─ events_sheet_dao.gs
├─ 052_applicants/
│  ├─ applicants_api.gs
│  ├─ applicants_service.gs
│  ├─ applicants_query_service.gs
│  └─ applicants_sheet_dao.gs
├─ 053_payment/
│  ├─ payment_service.gs
│  └─ payment_sheet_dao.gs
├─ 054_attendance/
│  ├─ attendance_api.gs
│  ├─ attendance_service.gs
│  ├─ attendance_query_service.gs
│  └─ attendance_sheet_dao.gs
├─ 055_refunds/
│  ├─ refunds_api.gs
│  ├─ refunds_query_service.gs
│  └─ refunds_sheet_dao.gs
└─ 056_files/
   └─ event_file_service.gs
```

## Ownership Map

```text
Events Query:
  getEventData_
  getEventListData_
  getUniqueEventValues_
  getEventDetailData_

Events Service:
  createEventData_
  updateEventData_
  updateEventStatusData_
  closeEventData_

Applicants Query:
  getApplicantListData_
  getApplicantDetailData_

Applicants Service:
  processApplicantData_

Payment Service:
  getEventPaymentTotalsByApplicationId_

Attendance Query:
  getAttendanceListData_

Attendance Service:
  applyAttendanceChangesData_

Attendance DAO:
  findEventAttendanceByApplicationId_

Refunds Query:
  getEventRefundListData_
```

## Completed Structural Tasks

- [x] Move Payment from Common into `053_payment`.
- [x] Renumber Attendance/Refunds/Files to `054/055/056`.
- [x] Split Events API, mutation Service, Validator, and DAO.
- [x] Split Applicants API, mutation Service, and DAO.
- [x] Split Attendance API, mutation Service, and DAO.
- [x] Keep Refunds without an empty mutation Service.
- [x] Keep Attendance without an empty Validator.
- [x] Add Event behavior regression tests.
- [x] Replace central `050_common/event_query_service.gs` with feature-owned Query Services.
- [x] Move `getEventData_()` from Events Service to Events Query Service.
- [x] Move `findEventAttendanceByApplicationId_()` from Attendance Service to Attendance DAO.
- [x] Update architecture verifier to enforce final ownership and read-only Query boundaries.
- [x] Update `test-event.js` to load feature Query Services.
- [x] Align spec/plan documents with final architecture.

## Verification Commands

Run from a full repository checkout before merge:

```bash
node scripts/test-core.js
node scripts/verify-server-architecture.js
node scripts/verify-event-architecture.js
node scripts/test-event.js
node scripts/verify-accounting-architecture.js
node scripts/test-accounting.js
```

Expected Event-specific output:

```text
Event architecture verification passed.
Event behavior regression tests passed.
```

Do not claim repository-wide completion unless the full command set above has been executed against the final branch state.

## Deferred Work

The following are intentionally outside this structural refactor:

- optimize duplicate Event list reads
- implement unresolved Payment/Refund/Attendance sync business rules
- replace `currentBalance: null` before an authoritative accounting integration exists
- change public API contracts
- add new Payment public APIs
