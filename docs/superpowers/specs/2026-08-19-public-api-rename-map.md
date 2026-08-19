# Public API Rename Map

This map implements `2026-08-19-public-api-naming-design.md`. It changes public RPC identifiers and in-repository callers only. `apiHandler_` operation strings, request/response shapes, authorization, locks, persistence, and business behavior remain unchanged.

## Event

| Old | New |
|---|---|
| `api_getEventList` | `api_getEvents` |
| `api_getEventForEdit` | `api_getEvent` |
| `api_getEventDetail` | `api_getEventOverview` |
| `api_getApplicantList` | `api_getEventApplicants` |
| `api_getApplicantDetail` | `api_getEventApplicant` |
| `api_processApplicant` | `api_processEventApplicant` |
| `api_syncApplicantsFromForms` | `api_syncEventApplicantsFromForms` |
| `api_getAttendanceList` | `api_getEventAttendances` |
| `api_applyAttendanceChanges` | `api_applyEventAttendanceChanges` |
| `api_getEventRefundList` | `api_getEventRefunds` |

## Accounting

| Old | New |
|---|---|
| `api_getLedgerList` | `api_getLedgerEntries` |
| `api_getLedgerDetail` | `api_getLedgerEntry` |
| `api_saveLedgerDraft` | `api_createLedgerDraft` |
| `api_getEvidenceFileContent` | `api_getLedgerEvidenceFileContent` |
| `api_getEvidenceAuditList` | `api_getLedgerEvidenceAudits` |
| `api_uploadBankTransactions` | `api_processBankTransactionUpload` |
| `api_runReconciliation` | `api_processReconciliation` |
| `api_getReconciliationList` | `api_getReconciliations` |
| `api_getReconciliationDetail` | `api_getReconciliation` |
| `api_linkReconciliation` | `api_applyReconciliationLink` |
| `api_createLedgerFromReconciliation` | `api_createLedgerEntryFromReconciliation` |
| `api_generateSettlementReport` | `api_createSettlementReport` |
| `api_getSettlementReportList` | `api_getSettlementReports` |

`api_getBankOcrLogs` already uses a plural semantic resource (`Logs`) and remains unchanged.

## Student Fee

| Old | New |
|---|---|
| `api_getStudentFeeReferenceData` | `api_getStudentFeeReference` |
| `api_getFeePayerList` | `api_getStudentFeePayers` |
| `api_getFeePayerDetail` | `api_getStudentFeePayer` |
| `api_createFeePayer` | `api_createStudentFeePayer` |
| `api_updateFeePayer` | `api_updateStudentFeePayer` |
| `api_getFeeApplicationList` | `api_getStudentFeeApplications` |
| `api_getFeeApplicationDetail` | `api_getStudentFeeApplication` |
| `api_processFeeApplications` | `api_processStudentFeeApplications` |
| `api_calculateFeeAmount` | `api_calculateStudentFeeAmount` |
| `api_confirmFeePayment` | `api_confirmStudentFeePayment` |
| `api_getFeeRefundRequestList` | `api_getStudentFeeRefundRequests` |
| `api_getFeeRefundRequestDetail` | `api_getStudentFeeRefundRequest` |
| `api_processFeeRefundRequests` | `api_processStudentFeeRefundRequests` |
| `api_calculateFeeRefund` | `api_calculateStudentFeeRefund` |
| `api_confirmFeeRefund` | `api_confirmStudentFeeRefund` |

## Settings bridge

| Old | New |
|---|---|
| `loadSettingsHomeData` | `api_getSettingsHome` |
| `loadSettingsUsersData` | `api_getSettingsUsers` |
| `saveSettingsUserDepartment` | `api_updateSettingsUserDepartment` |
| `loadSettingsRolesData` | `api_getSettingsRoles` |
| `loadSettingsPermissionsData` | `api_getSettingsPermissions` |
| `loadSettingsDepartmentsData` | `api_getSettingsDepartments` |

## Explicitly preserved public names

The following categories are intentionally not renamed in this pass:

- Session/diagnostic exceptions: `api_checkLogin`, `api_checkUserDbIntegrity`, `api_checkOperationDbIntegrity`.
- Auth/user context: `api_getCurrentUser`, `api_getMyPermissions`.
- Semantic query nouns: `Summary`, `Reference`, `Options`, `Content`, `Candidates`, `Logs`, `Overview`.
- Precise business commands already conforming: `api_updateEventStatus`, `api_closeEvent`, `api_processLedgerEntry`, `api_exportSettlementReport`.

No compatibility aliases are retained after migration.
