# Internal Function Rename Map — Phase 2

This phase extends the first rename map using the fresh repository-wide inventory. Public `api_*`, GAS entry points, and public Settings entry functions remain unchanged.

| Area | Old | New | Reason |
|---|---|---|---|
| IAM | `getActiveRoleIdsByEmail_` | `buildActiveRoleIdsByEmail_` | builds email → role IDs index |
| IAM | `getPermissionIdsByRoleId_` | `buildPermissionIdsByRoleId_` | builds role → permission IDs index |
| IAM | `listActiveDepartments_` | `getActiveDepartmentsData_` | query-service DTO collection, not DAO rows |
| Event | `getUniqueEventValues_` | `buildUniqueEventValues_` | pure derived collection |
| Event | `processEventStatusData_` | `updateEventStatusData_` | simple status update, not approval workflow |
| Event | `processEventClosureData_` | `updateEventClosureData_` | simple closure status update |
| Event | `findEventFormAliasField_` | `resolveEventFormAliasField_` | alias resolution, not DAO lookup |
| Event | `getEventPaymentTotalsByApplicationId_` | `buildEventPaymentTotalsByApplicationId_` | builds application → total index |
| Event | `findEventAttendanceByApplicationId_` | `findEventAttendanceRowByApplicationId_` | DAO row naming consistency |
| Accounting | `makeId_` | `generateAccountingId_` | explicit ID generation |
| Accounting | `getCurrentUserName_` | `resolveAccountingSessionEmail_` | actually resolves active-user email |
| Accounting | `getAccountingActorEmail_` | `resolveAccountingActorEmail_` | resolves context/fallback actor email |
| Accounting | `inAccountingDateRange_` | `isAccountingDateInRange_` | boolean predicate |
| Accounting | `findAllAccountingEventRows_` | `listAccountingEventRows_` | collection DAO read |
| Accounting | `getLedgerEntries_` | `getLedgerEntriesData_` | composed client-facing query result |
| Accounting | `getLedgerEntryDto_` | `mapLedgerEntryDto_` | row → DTO transform |
| Accounting | `getEvidenceDto_` | `mapEvidenceDto_` | row → DTO transform |
| Accounting | `getLedgerDatabaseInfo_` | `getLedgerDatabaseInfoData_` | API-facing query result |
| Accounting | `getLedgerEventOptions_` | `getLedgerEventOptionsData_` | API-facing query result |
| Accounting | `getLedgerSummary_` | `getLedgerSummaryData_` | API-facing query result |
| Accounting | `saveLedgerEntry_` | `createLedgerEntryData_` | domain create command |
| Accounting | `saveLedgerDraft_` | `createLedgerDraftData_` | domain create command for draft |
| Accounting | `updateLedgerEntry_` | `updateLedgerEntryData_` | domain update command |
| Accounting | `softDeleteLedgerEntry_` | `deleteLedgerEntryData_` | domain delete command; soft-delete behavior unchanged |
| Accounting | `processLedgerEntry_` | `processLedgerEntryData_` | approval/review state transition |
| Accounting | `saveEvidenceFiles_` | `createEvidenceFiles_` | creates evidence Drive files and rows |
| Accounting | `getEvidenceAuditList_` | `getEvidenceAuditListData_` | API-facing query result |
| Accounting | `bankTransactionDuplicateKey_` | `buildBankTransactionDuplicateKey_` | pure derived key |
| Accounting | `saveParsedBankTransactions_` | `applyParsedBankTransactions_` | applies deduplicated parsed batch |
| Accounting | `uploadBankTransactions_` | `processBankTransactionUploadData_` | multi-step upload/OCR command |
| Accounting | `getBankOcrLogs_` | `getBankOcrLogsData_` | API-facing query result |
| Accounting | `getReconciliationList_` | `getReconciliationListData_` | API-facing query result |
| Accounting | `getReconciliationDetail_` | `getReconciliationDetailData_` | API-facing query result |
| Accounting | `getReconciliationCandidates_` | `getReconciliationCandidatesData_` | API-facing query result |
| Accounting | `runReconciliation_` | `processReconciliationData_` | multi-step reconciliation command |
| Accounting | `linkReconciliation_` | `applyReconciliationLinkData_` | applies explicit link change |
| Accounting | `createLedgerFromReconciliation_` | `createLedgerFromReconciliationData_` | domain create command |
| Accounting | `getSettlementSummary_` | `getSettlementSummaryData_` | API-facing query result |
| Accounting | `getSettlementReportList_` | `getSettlementReportListData_` | API-facing query result |
| Accounting | `getSettlementReport_` | `getSettlementReportData_` | API-facing query result |
| Accounting | `generateSettlementReport_` | `createSettlementReportData_` | creates persisted report |
| Settings | `buildSettingsBaseData_` | `buildSettingsBaseView_` | pure builder must not use `Data_` suffix |
| Settings | `listUsersForSettings_` | `getSettingsUsersData_` | query-service view result |
| Settings | `listRolesForSettings_` | `getSettingsRolesData_` | query-service view result |
| Settings | `memberSort_` | `compareSettingsDepartmentMembers_` | explicit comparator name |
| Student Fee | `findAllFeeRateRows_` | `readFeeRateRows_` | low-level OperationDB source read inside query service |
| Student Fee | `findAllStudentFeeSemesterRows_` | `readStudentFeeSemesterRows_` | low-level OperationDB source read inside query service |

## Deliberate exceptions

Specialized verbs such as `filter*`, `score*`, `sanitize*`, `format*`, `extract*`, `mask*`, `paginate*`, `summarize*`, and `export*` remain when they precisely describe the operation. Core primitives (`sheetFindAll_`, `sheetInsert_`, etc.) and external/public entry points are not part of this migration.

All changes are symbol-only: function bodies, parameters, return shapes, side effects, locks, authorization, and public API names must remain unchanged.
