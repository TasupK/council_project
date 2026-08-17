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

## 7. Status contract

The current schema stores status as text but does not enumerate allowed values. This phase preserves the feature branch's existing business status semantics without changing the schema.

### Application status

```text
접수 → 승인
접수 → 반려
```

Allowed values used by this phase:

- `접수`
- `승인`
- `반려`

### Payment money status

A payment created from an approved application starts as `대기`.

Confirmation transitions:

```text
대기 → 완료
대기 → 불일치
```

Allowed values used by this phase:

- `대기`
- `완료`
- `불일치`

### Refund money status

A refund created from an approved refund request starts as `대기`.

Confirmation transitions:

```text
대기 → 완료
대기 → 실패
```

Allowed values used by this phase:

- `대기`
- `완료`
- `실패`

Mutation Services reject unsupported state transitions instead of coercing unknown values.

## 8. ID generation

The current operation schema defines primary keys but not a sequential ID-generation contract.

For new Student Fee-generated records in this phase, mutation Services use collision-resistant UUID values via `Utilities.getUuid()`, consistent with the current Event implementation approach.

UUID generation applies to records created by this phase such as:

- `feePayments.id`
- `feeRefunds.id`
- `businessAuditLogs.id`

`feePayers.studentId` remains a caller-supplied natural key and is never generated.

This phase does not create `feeApplications` or `feeRefundRequests`; those request-ingestion paths belong to the later frontend/Form integration phases.

## 9. Payer behavior

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

The service rejects duplicate student IDs and semester IDs that do not exist in `semesters`.

### Update payer

`api_updateFeePayer` may update only mutable current-schema fields. The primary key is not changed.

Every mutation writes a business audit log.

## 10. Fee rate resolution

The source feature used a semester-fee fallback hierarchy. The port instead follows the current schema.

`student_fee_reference_query_service.gs` resolves the fee rate from `feeRates`.

For a target date:

1. use active rows only,
2. find rows whose effective date range contains the target date,
3. require exactly one matching row,
4. reject the operation when there is no match or more than one match.

No hard-coded default amount is introduced.

This is fail-closed because charging an invented or ambiguous amount would create incorrect financial records.

## 11. Payment behavior

### Application list/detail

`feeApplications` is the application header and `feePayments` is the resulting payment record.

Query Services may join these tables in memory for DTO composition, but each DAO accesses only its own table.

### Fee calculation

`api_calculateFeeAmount` resolves one valid `feeRates.amountPerSemester` based on the supplied payment/request date.

`feeApplications.semesterNumber` is treated as the current schema's application semester sequence/reference value, not as a quantity multiplier copied from the source feature.

Therefore this phase does not implement:

```text
applySemesters × amountPerSemester
```

The calculated payable amount for one payment record is the single resolved fee-rate amount.

### Application processing

`api_processFeeApplications` accepts application IDs and `action: 'APPROVE' | 'REJECT'`.

Rules:

- only applications with `status === '접수'` may be processed
- `REJECT` changes status to `반려` and writes processing metadata
- `APPROVE` changes status to `승인`, writes processing metadata, and creates exactly one `feePayments` row if one does not already exist
- a created payment starts with `moneyStatus === '대기'`
- the payment amount comes from the single fee rate resolved for the application's `paymentDate`
- missing/invalid `paymentDate` is a validation failure; current date is not silently substituted
- the authenticated email becomes the application/payment manager
- all mutations create audit log entries

The service must prevent duplicate payment creation for the same application.

### Payment confirmation

`api_confirmFeePayment` accepts an existing payment ID and `result: 'DONE' | 'MISMATCH'`.

Mappings:

```text
DONE     → 완료
MISMATCH → 불일치
```

Only a payment currently in `대기` may be confirmed.

It records:

- depositor name when provided
- manager email
- confirmation timestamp
- audit log

## 12. Refund behavior

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
- sum(existing related refund amounts whose moneyStatus is 대기 or 완료)
```

The result is never below zero.

`api_calculateFeeRefund` returns the maximum refundable amount and related payment/request context needed by callers.

### Refund request processing

`api_processFeeRefundRequests` accepts request IDs, `action: 'APPROVE' | 'REJECT'`, and an approved amount when approving.

Rules:

- only requests with `status === '접수'` may be processed
- `REJECT` changes status to `반려` and does not create a `feeRefunds` row
- `APPROVE` changes status to `승인`
- approval requires a positive approved amount not greater than the calculated maximum refundable amount
- approval creates exactly one `feeRefunds` row for the request
- a created refund starts with `moneyStatus === '대기'`
- duplicate refund-row creation is prevented
- actor email and timestamps come from Auth context/current time
- all state transitions are audited

### Refund confirmation

`api_confirmFeeRefund` accepts an existing refund ID and `result: 'DONE' | 'FAILED'`.

Mappings:

```text
DONE   → 완료
FAILED → 실패
```

Only a refund currently in `대기` may be confirmed.

It records current-schema fields only:

- transfer date
- money status
- manager email
- optional transfer evidence ID when supplied
- audit log

## 13. Summary behavior

`api_getStudentFeeSummary` is a read-only composed view over the current tables.

It may include counts/totals that can be derived without adding fields, for example:

- payer count
- payment application counts by `접수/승인/반려`
- payment counts/amount totals by `대기/완료/불일치`
- refund request counts by `접수/승인/반려`
- refund counts/amount totals by `대기/완료/실패`

It does not expose source-feature statistics that require missing fields such as `정식/임시` payer type.

## 14. Audit logging

Student Fee mutations write to the existing `businessAuditLogs` table.

The Student Fee audit DAO owns only physical access to that table. Mutation Services construct the audit item, including its UUID, and call the DAO to insert it.

Audit records contain current-schema fields only:

- UUID log ID
- occurred time
- actor email from Auth context
- action type
- target type
- target ID
- before value
- after value
- reason where available

Business data tables are not expanded to duplicate audit-only information.

## 15. Request parsing and validation

`student_fee_request.gs` centralizes only Student Fee request normalization that is genuinely shared.

Validation stays close to the owning Service when it represents a business rule.

Examples:

- malformed/missing ID: request parsing
- duplicate payer: payer service
- invalid state transition: payment/refund service
- refund amount exceeds maximum: refund service
- missing/ambiguous active fee rate: reference query/business failure

No generic validation framework is introduced.

## 16. Error handling

The port follows the current server exception model.

- API uses `apiHandler_`.
- Domain failures throw meaningful errors.
- No new `withTryCatch_`, `ok_`, or `fail_` response family is introduced for Student Fee.
- Financial mutations fail closed when prerequisite data is missing or ambiguous.

Examples of fail-closed cases:

- no matching active fee rate
- multiple matching active fee rates
- invalid semester reference
- duplicate payment/refund creation attempt
- invalid current state for approval/rejection/confirmation
- refund exceeds refundable balance

## 17. Architecture boundaries

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
Student Fee → 050_event / 060_accounting / 070_settings internals
Student Fee DAO → another Student Fee table
Student Fee Query Service → Sheet write primitive
Student Fee API → direct Sheet access
Student Fee → frontend files
```

Cross-table composition belongs in Query Services or mutation Services, not multi-table DAOs.

## 18. Testing strategy

Add two server-side verification assets:

### `scripts/test-student-fee.js`

Behavior regression/characterization tests for:

- fee rate resolution, including no-match and ambiguous-match failures
- payer create/update rules
- payment approve/reject flow
- duplicate payment prevention
- payment confirmation
- refundable amount calculation
- refund approve/reject flow
- duplicate refund prevention
- refund confirmation
- UUID generation for created records
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
- no dependency on Event/Accounting/Settings internals
- no `apiV1_*`, `SCHEMA`, `readAll_`, `insertRow_`, `updateRow_`, or source-feature generic DB layer is reintroduced
- no Google Form or frontend implementation in this phase

Update `scripts/verify-server-architecture.js` to require the new Student Fee public APIs while preserving all existing public contracts.

## 19. Acceptance criteria

This phase is complete when:

1. `080_student_fee` implements payer/payment/refund server behavior using only the current `020_schema` contract.
2. `020_schema` is unchanged.
3. All Student Fee public APIs use current project naming and `apiHandler_`.
4. All public APIs require login.
5. Mutation actor identity comes from Auth context, never direct Session access.
6. Fee charging uses exactly one active/effective `feeRates` row with no hard-coded fallback.
7. Payment approval creates one payment record in `대기` and prevents duplicates.
8. Refund approval enforces current-schema refundable balance, creates one refund record in `대기`, and prevents duplicates.
9. Payment/refund confirmation follows the explicit status transition contract.
10. All mutations write existing business audit logs with UUID IDs.
11. No FormSync, frontend, export, archive, legacy API wrapper, or feature generic DB layer is introduced.
12. Student Fee behavior tests and architecture verification pass alongside existing architecture checks.
