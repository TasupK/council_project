# Student Fee Server Port Design

## 1. Goal

Port the business behavior from `feature/student-fee-management` into the current server architecture without merging the feature branch structure or database model.

The current branch architecture remains authoritative:

- `020_schema` is the single source of truth for persistent data.
- `010_core` owns common API/response/Sheet primitives.
- `030_auth` owns authentication and login context.
- `040_iam` owns identity/role/permission semantics.
- Student Fee becomes a new server domain under `080_student_fee`.

This phase implements the server domain only. Frontend and Google Form synchronization are explicitly out of scope.

## 2. Non-goals

This phase does not:

- modify `020_schema`
- copy `Schema.gs` or `Db.gs` from the feature branch
- preserve `apiV1_*` compatibility wrappers
- add standalone `doGet`, `doPost`, `API_REGISTRY`, or `onOpen`
- add `500_student_fee` frontend files
- add Google Form triggers/import/retry logic
- add archive flags or archive APIs
- add spreadsheet export APIs
- add new IAM permission records or invent Student Fee permission IDs
- add fields such as `유형`, `적용종료학기`, `예정금액`, or `보관여부`

## 3. Source of truth

The existing `getOperationDbSchema_()` definitions are authoritative.

Student Fee uses these existing tables only:

- `semesters`
- `feeRates`
- `feePayers`
- `feeApplications`
- `feePayments`
- `feeRefundRequests`
- `feeRefunds`
- `businessAuditLogs`

No persistent field may be introduced only because the source feature branch had it.

If source behavior depends on a field that does not exist in the current schema, the implementation must choose one of:

1. derive the value from existing data,
2. represent it through `businessAuditLogs`, or
3. exclude the behavior from this phase.

## 4. Target architecture

```text
src/000_server/080_student_fee/
├─ 080_common/
│  ├─ student_fee_request.gs
│  ├─ student_fee_reference_query_service.gs
│  └─ student_fee_audit_sheet_dao.gs
│
├─ 081_payers/
│  ├─ fee_payers_api.gs
│  ├─ fee_payers_service.gs
│  ├─ fee_payers_query_service.gs
│  └─ fee_payers_sheet_dao.gs
│
├─ 082_payments/
│  ├─ fee_payments_api.gs
│  ├─ fee_payments_service.gs
│  ├─ fee_payments_query_service.gs
│  ├─ fee_applications_sheet_dao.gs
│  └─ fee_payments_sheet_dao.gs
│
└─ 083_refunds/
   ├─ fee_refunds_api.gs
   ├─ fee_refunds_service.gs
   ├─ fee_refunds_query_service.gs
   ├─ fee_refund_requests_sheet_dao.gs
   └─ fee_refunds_sheet_dao.gs
```

### Layer rules

- API files are thin entry points using `apiHandler_`.
- Service files own mutations and business state transitions.
- Query Service files own read-only composition and DTO shaping.
- Each Sheet DAO owns only its table.
- `080_common` contains only cross-feature Student Fee concerns.
- No generic repository/query-builder abstraction is introduced.
- No Student Fee code directly calls `Session.getActiveUser()`.

## 5. Authentication and authorization

Every Student Fee public API in this phase uses:

```js
requireLogin: true
```

through `apiHandler_`.

The authenticated context email is used for:

- `managerId`
- audit actor email
- mutation attribution

This phase does not attach `permission:` options because the current IAM permission model is being refined separately and there are no approved Student Fee permission identifiers yet.

The APIs must be shaped so a future `permission:` option can be added without changing Service/DAO contracts.

## 6. Public API contract

The source branch `apiV1_*` names are not preserved.

The new public server APIs are:

### Summary

- `api_getStudentFeeSummary`

### Fee payers

- `api_getFeePayerList`
- `api_getFeePayerDetail`
- `api_createFeePayer`
- `api_updateFeePayer`

### Payments

- `api_getFeeApplicationList`
- `api_getFeeApplicationDetail`
- `api_processFeeApplications`
- `api_calculateFeeAmount`
- `api_confirmFeePayment`

### Refunds

- `api_getFeeRefundRequestList`
- `api_getFeeRefundRequestDetail`
- `api_processFeeRefundRequests`
- `api_calculateFeeRefund`
- `api_confirmFeeRefund`

All APIs follow the current project `apiHandler_` pattern instead of the source branch `{ success, data, error }` wrapper and `callApi_` registry.

## 7. Payer behavior

### List and detail

Payer reads use `feePayers` as the master table.

List behavior may support current-schema fields only:

- student ID
- name
- affiliation
- starting semester
- manager
- updated timestamp

Student ID masking may be applied to list DTOs, while detail APIs return the fields required by authenticated internal operators.

### Create payer

`api_createFeePayer` creates a `feePayers` row using only current schema fields.

Required business data:

- `studentId`
- `name`
- `affiliation`
- `startSemesterId`

The authenticated email is written to `managerId` and the current time to `updatedAt`.

The service rejects duplicate student IDs and invalid semester references.

### Update payer

`api_updateFeePayer` may update only mutable current-schema fields. The primary key is not changed.

Every mutation writes a business audit log.

## 8. Fee rate resolution

The source feature used a semester-fee fallback hierarchy. The port instead follows the current schema.

`student_fee_reference_query_service.gs` resolves the fee rate from `feeRates`.

For a target date:

1. use active rows only,
2. choose a row whose effective date range contains the target date,
3. reject the operation if no valid fee rate exists.

No hard-coded default amount is introduced.

This is fail-closed because charging an invented fallback amount would create incorrect financial records.

## 9. Payment behavior

### Application list/detail

`feeApplications` is the application header and `feePayments` is the resulting payment record.

Query Services may join these tables in memory for DTO composition, but each DAO accesses only its own table.

### Fee calculation

`api_calculateFeeAmount` resolves one valid `feeRates.amountPerSemester` based on the request/payment date.

`feeApplications.semesterNumber` is treated as the current schema's application semester sequence/reference value, not as a quantity multiplier copied from the source feature.

Therefore this phase does not implement:

```text
applySemesters × amountPerSemester
```

The calculated payable amount for one payment record is the resolved fee rate amount.

### Application processing

`api_processFeeApplications` accepts application IDs and an action equivalent to approve/reject.

Rules:

- only applications in the accepted pending state may be processed
- reject changes only the application state/processing metadata
- approve changes the application state/processing metadata and creates exactly one `feePayments` row if one does not already exist
- the payment amount comes from the fee rate resolved for the application's `paymentDate`
- the authenticated email becomes the application/payment manager
- all mutations create audit log entries

The service must prevent duplicate payment creation for the same application.

### Payment confirmation

`api_confirmFeePayment` confirms an existing `feePayments` row as the supported terminal money status such as completed or mismatch, using the status values already present in the operational data contract.

It records:

- depositor name when provided
- manager email
- confirmation timestamp
- audit log

## 10. Refund behavior

### Refund request list/detail

`feeRefundRequests` is the request header and `feeRefunds` is the resulting refund record.

Account numbers are masked by default in list-oriented DTOs.

Full sensitive data exposure is never controlled by a client-supplied flag such as `hasFullAccess`.

In this phase all callers are authenticated, but future IAM permission checks must be able to gate sensitive detail without changing DAO contracts.

### Refund calculation

The source branch's remaining-semester formula is not portable because the current schema does not store the source fields required for that model.

The current-schema refund model is payment-based.

For the target `feePayments` row:

```text
maximum refundable amount
= feePayments.amount
- sum(existing related refund amounts that are pending or completed)
```

The result is never below zero.

`api_calculateFeeRefund` returns the maximum refundable amount and related payment/request context needed by callers.

### Refund request processing

`api_processFeeRefundRequests` accepts request IDs and approve/reject action.

Rules:

- only pending requests may be processed
- rejected requests do not create a `feeRefunds` row
- approval validates the requested/approved amount against the calculated maximum refundable amount
- approval creates exactly one `feeRefunds` row for the request
- duplicate refund-row creation is prevented
- actor email and timestamps come from Auth context/current time
- all state transitions are audited

### Refund confirmation

`api_confirmFeeRefund` confirms an existing `feeRefunds` row as completed or failed.

It records current-schema fields only:

- transfer date
- money status
- manager email
- optional transfer evidence ID when supplied
- audit log

## 11. Summary behavior

`api_getStudentFeeSummary` is a read-only composed view over the current tables.

It may include counts/totals that can be derived without adding fields, for example:

- payer count
- payment application counts by status
- payment counts/amount totals by money status
- refund request counts by status
- refund counts/amount totals by money status

It does not expose source-feature statistics that require missing fields such as `정식/임시` payer type.

## 12. Audit logging

Student Fee mutations write to the existing `businessAuditLogs` table.

The Student Fee audit DAO owns only that table access for this domain. It records:

- generated log ID using the project's existing ID style
- occurred time
- actor email from Auth context
- action type
- target type
- target ID
- before value
- after value
- reason where available

Business data tables are not expanded to duplicate audit-only information.

## 13. Request parsing and validation

`student_fee_request.gs` centralizes only Student Fee request normalization that is genuinely shared.

Validation stays close to the owning Service when it represents a business rule.

Examples:

- malformed/missing ID: request parsing
- duplicate payer: payer service
- invalid state transition: payment/refund service
- refund amount exceeds maximum: refund service
- missing active fee rate: reference query/business failure

No generic validation framework is introduced.

## 14. Error handling

The port follows the current server exception model.

- API uses `apiHandler_`.
- Domain failures throw meaningful errors.
- No new `withTryCatch_`, `ok_`, or `fail_` response family is introduced for Student Fee.
- Financial mutations fail closed when prerequisite data is missing or ambiguous.

Examples of fail-closed cases:

- no matching active fee rate
- invalid semester reference
- duplicate payment/refund creation attempt
- invalid current state for approval/rejection/confirmation
- refund exceeds refundable balance

## 15. Architecture boundaries

Allowed dependencies:

```text
080_student_fee → 010_core
080_student_fee → 020_schema
080_student_fee → 030_auth (through apiHandler context)
```

Future permission declaration may use IAM through the existing `apiHandler_` boundary.

Forbidden patterns:

```text
Student Fee → feature branch Db.gs/Schema.gs
Student Fee → Session.getActiveUser() directly
Student Fee DAO → another Student Fee table
Student Fee Query Service → Sheet write primitive
Student Fee API → direct Sheet access
Student Fee → frontend files
```

Cross-table composition belongs in Query Services or mutation Services, not multi-table DAOs.

## 16. Testing strategy

Add two server-side verification assets:

### `scripts/test-student-fee.js`

Behavior regression/characterization tests for:

- fee rate resolution
- payer create/update rules
- payment approve/reject flow
- duplicate payment prevention
- payment confirmation
- refundable amount calculation
- refund approve/reject flow
- duplicate refund prevention
- refund confirmation
- audit attribution from Auth context
- masking behavior for sensitive list data
- summary composition

### `scripts/verify-student-fee-architecture.js`

Architecture checks for:

- required files exist and are non-empty
- each public/internal function has one expected owner
- each DAO accesses only its owned table
- Query Services perform no writes
- API files do not call Sheet primitives directly
- no `Session.getActiveUser()` inside `080_student_fee`
- no `apiV1_*`, `SCHEMA`, `readAll_`, `insertRow_`, `updateRow_`, or source-feature generic DB layer is reintroduced
- no Google Form or frontend implementation in this phase

Update `scripts/verify-server-architecture.js` to require the new Student Fee public APIs while preserving all existing public contracts.

## 17. Acceptance criteria

This phase is complete when:

1. `080_student_fee` implements payer/payment/refund server behavior using only the current `020_schema` contract.
2. `020_schema` is unchanged.
3. All Student Fee public APIs use current project naming and `apiHandler_`.
4. All public APIs require login.
5. Mutation actor identity comes from Auth context, never direct Session access.
6. Fee charging uses active/effective `feeRates` with no hard-coded fallback.
7. Payment approval creates one payment record and prevents duplicates.
8. Refund approval enforces current-schema refundable balance and prevents duplicates.
9. All mutations write existing business audit logs.
10. No FormSync, frontend, export, archive, legacy API wrapper, or feature generic DB layer is introduced.
11. Student Fee behavior tests and architecture verification pass alongside existing architecture checks.
