# Internal Function Rename Map

이 문서는 `2026-08-18-internal-function-naming-design.md`의 1차 migration 범위를 고정한다. Public `api_*` 함수는 대상이 아니다. 아래 35개는 파일 역할과 함수 의미가 명확해 rename 위험이 낮은 고신뢰 대상만 포함한다.

| File | Role | Old | New | Reason |
|---|---|---|---|---|
| `040_iam/041_users/users_query_service.gs` | mapper | `toUserDto_` | `mapUserDto_` | DTO 변환은 `map*` |
| `040_iam/042_roles/roles_query_service.gs` | builder | `getRolesById_` | `buildRolesById_` | 메모리 index 구성은 `build*` |
| `040_iam/042_roles/roles_query_service.gs` | mapper | `toRoleDto_` | `mapRoleDto_` | DTO 변환은 `map*` |
| `040_iam/043_permissions/permissions_query_service.gs` | mapper | `toPermissionDto_` | `mapPermissionDto_` | DTO 변환은 `map*` |
| `040_iam/043_permissions/permissions_query_service.gs` | builder | `getPermissionsById_` | `buildPermissionsById_` | 메모리 index 구성은 `build*` |
| `040_iam/044_departments/departments_query_service.gs` | mapper | `toDepartmentDto_` | `mapDepartmentDto_` | DTO 변환은 `map*` |
| `040_iam/044_departments/departments_query_service.gs` | builder | `getDepartmentsById_` | `buildDepartmentsById_` | 메모리 index 구성은 `build*` |
| `050_event/051_events/events_service.gs` | mutation | `updateEventStatusData_` | `processEventStatusData_` | 상태전이는 `process*Data_` |
| `050_event/051_events/events_service.gs` | mutation | `closeEventData_` | `processEventClosureData_` | 상태전이는 `process*Data_` |
| `050_event/051_events/events_sheet_dao.gs` | DAO | `findAllEventRows_` | `listEventRows_` | 복수 DAO 조회는 `list*` |
| `050_event/051_events/events_sheet_dao.gs` | DAO | `findAllEventClientRows_` | `listEventClientRows_` | 복수 DAO 조회는 `list*` |
| `050_event/052_applicants/applicants_form_mapper.gs` | builder | `getEventFormHeaderAliases_` | `buildEventFormHeaderAliases_` | mapping metadata 구성은 `build*` |
| `050_event/052_applicants/applicants_form_mapper.gs` | reader | `eventFormCell_` | `readEventFormCell_` | source cell read는 `read*` |
| `050_event/052_applicants/applicants_form_mapper.gs` | builder | `stableEventFormResponseId_` | `buildStableEventFormResponseId_` | derived ID 구성은 `build*` |
| `050_event/052_applicants/applicants_form_mapper.gs` | builder | `eventFormQuestionId_` | `buildEventFormQuestionId_` | derived ID 구성은 `build*` |
| `050_event/052_applicants/applicants_form_reader.gs` | parser | `extractGoogleResourceId_` | `parseGoogleResourceId_` | raw ID 파싱은 `parse*` |
| `050_event/052_applicants/applicants_form_reader.gs` | resolver | `selectEventFormResponseSheet_` | `resolveEventFormResponseSheet_` | 후보 선택은 `resolve*` |
| `050_event/052_applicants/applicants_form_sync_service.gs` | mutation | `syncApplicantsFromFormsData_` | `applyApplicantFormSyncData_` | 외부 change set 적용은 `apply*Data_` |
| `050_event/052_applicants/applicants_sheet_dao.gs` | DAO | `findAllEventApplicationClientRows_` | `listEventApplicationClientRows_` | 복수 DAO 조회는 `list*` |
| `050_event/052_applicants/applicants_sheet_dao.gs` | DAO | `findAllEventApplicationSourceResponseIds_` | `listEventApplicationSourceResponseIds_` | 복수 DAO 조회는 `list*` |
| `050_event/053_payment/payment_sheet_dao.gs` | DAO | `findAllEventPaymentClientRows_` | `listEventPaymentClientRows_` | 복수 DAO 조회는 `list*` |
| `050_event/054_attendance/attendance_sheet_dao.gs` | DAO | `findAllEventAttendanceClientRows_` | `listEventAttendanceClientRows_` | 복수 DAO 조회는 `list*` |
| `050_event/055_refunds/refunds_sheet_dao.gs` | DAO | `findAllEventRefundClientRows_` | `listEventRefundClientRows_` | 복수 DAO 조회는 `list*` |
| `060_accounting/061_ledger/ledger_sheet_dao.gs` | DAO | `findAllLedgerRows_` | `listLedgerRows_` | 복수 DAO 조회는 `list*` |
| `060_accounting/062_evidence/evidence_sheet_dao.gs` | DAO | `findAllLedgerEvidenceRows_` | `listLedgerEvidenceRows_` | 복수 DAO 조회는 `list*` |
| `060_accounting/063_reconciliation/bank_ocr_sheet_dao.gs` | DAO | `findAllBankOcrLogRows_` | `listBankOcrLogRows_` | 복수 DAO 조회는 `list*` |
| `060_accounting/063_reconciliation/bank_transaction_sheet_dao.gs` | DAO | `findAllBankTransactionRows_` | `listBankTransactionRows_` | 복수 DAO 조회는 `list*` |
| `060_accounting/063_reconciliation/reconciliation_sheet_dao.gs` | DAO | `findAllReconciliationRows_` | `listReconciliationRows_` | 복수 DAO 조회는 `list*` |
| `060_accounting/063_reconciliation/reconciliation_sheet_dao.gs` | DAO | `findAllReconciliationItemRows_` | `listReconciliationItemRows_` | 복수 DAO 조회는 `list*` |
| `060_accounting/064_settlement/settlement_sheet_dao.gs` | DAO | `findAllSettlementReportRows_` | `listSettlementReportRows_` | 복수 DAO 조회는 `list*` |
| `080_student_fee/081_payers/fee_payers_sheet_dao.gs` | DAO | `findAllFeePayerRows_` | `listFeePayerRows_` | 복수 DAO 조회는 `list*` |
| `080_student_fee/082_payments/fee_applications_sheet_dao.gs` | DAO | `findAllFeeApplicationRows_` | `listFeeApplicationRows_` | 복수 DAO 조회는 `list*` |
| `080_student_fee/082_payments/fee_payments_sheet_dao.gs` | DAO | `findAllFeePaymentRows_` | `listFeePaymentRows_` | 복수 DAO 조회는 `list*` |
| `080_student_fee/083_refunds/fee_refund_requests_sheet_dao.gs` | DAO | `findAllFeeRefundRequestRows_` | `listFeeRefundRequestRows_` | 복수 DAO 조회는 `list*` |
| `080_student_fee/083_refunds/fee_refunds_sheet_dao.gs` | DAO | `findAllFeeRefundRows_` | `listFeeRefundRows_` | 복수 DAO 조회는 `list*` |

## Explicit exceptions for this migration

다음 유형은 1차 rename 대상에서 제외한다.

- Public `api_*` functions.
- Core technical primitives such as `sheetFindAll_`, `sheetFindById_`, `sheetInsert_`, `sheetUpdateById_`.
- GAS/technical lifecycle helpers such as `with*Lock_`, `open*Spreadsheet_`, response constructors, cache functions.
- Explicit error throw helpers (`throw*Error_`).
- Domain utilities whose current verb already communicates semantics (`calculate*`, `normalize*`, `resolve*`, `parse*`, `build*`, `require*`, `validate*`, `is/has/can*`).
- Names requiring business interpretation beyond file/function evidence; these may be handled in a later naming pass.

## Migration invariant

The migration is symbol-only. Parameter order, return shape, authorization, locks, writes, state transitions, and public API identifiers must remain unchanged.
