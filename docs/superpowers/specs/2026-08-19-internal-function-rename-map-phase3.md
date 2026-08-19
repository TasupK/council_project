# Internal Function Rename Map — Phase 3

Phase 1 and 2 already normalized DAO collections, DTO mappers/builders, domain mutation names, and query-service outputs. Phase 3 addresses the remaining high-confidence semantic mismatches verified from implementation bodies. Public `api_*`, GAS entry points, and Settings public bridge functions remain unchanged.

| Area | Old | New | Reason |
|---|---|---|---|
| Core | `sheetFindAll_` | `listSheetCrudItems_` | collection persistence read should lead with `list` |
| Core | `sheetFindById_` | `findSheetCrudItemById_` | nullable lookup should lead with `find` |
| Core | `sheetInsert_` | `insertSheetCrudItem_` | persistence verb should lead the name |
| Core | `sheetUpdateById_` | `updateSheetCrudItemById_` | persistence verb should lead the name |
| Core | `sheetCrudRowsToItems_` | `mapSheetCrudRowsToItems_` | row→item representation conversion is mapping |
| Core | `sheetCrudApplyChangesToRow_` | `applySheetCrudChangesToRow_` | explicit change-set application is `apply` |
| Schema | `checkOperationDbIntegrity_` | `validateOperationDbIntegrity_` | returns structured validation information |
| Schema | `getOperationDbReference_` | `resolveOperationDbReference_` | resolves referenced DB/table/column |
| Schema | `checkUserDbIntegrity_` | `validateUserDbIntegrity_` | returns structured validation information |
| Schema | `checkLoginUserDbIntegrity_` | `validateLoginUserDbIntegrity_` | scoped validation report |
| Schema | `createIntegrityIssue_` | `buildIntegrityIssue_` | constructs a DTO without persistence |
| Auth | `getCachedLoginContext_` | `readCachedLoginContext_` | reads infrastructure cache source |
| Auth | `cacheLoginContext_` | `writeLoginContextCache_` | explicit cache write |
| Auth | `getActiveUserEmailFromSession_` | `readActiveUserEmailFromSession_` | reads Apps Script session source |
| IAM | `summarizeRoleForUser_` | `buildRoleSummaryForUser_` | builds a role summary DTO |
| IAM | `actionToPermissionKey_` | `mapActionToPermissionKey_` | converts action text to runtime permission key |
| IAM | `permissionScreenId_` | `resolvePermissionScreenId_` | derives the effective runtime screen ID |
| Event | `getEventData_` | `getEventForEditData_` | final query-service result should name its use-case |
| Event | `getEventMaterialFolder_` | `resolveEventMaterialFolder_` | resolves/reuses effective Drive folder |
| Accounting | `findLedgerEntryDtoById_` | `getLedgerDetailData_` | final query result should not look like DAO lookup |
| Accounting | `getEvidenceFileContent_` | `readEvidenceFileContent_` | reads external Drive file content |
| Accounting | `getEvidenceFolder_` | `resolveEvidenceFolder_` | resolves/reuses effective evidence folder |
| Accounting | `createEvidenceFiles_` | `createEvidenceFilesData_` | business mutation service boundary uses `Data_` |
| Accounting | `bankAmountNumber_` | `parseBankAmount_` | parses raw OCR amount text |
| Accounting | `reconciliationTokens_` | `buildReconciliationTokens_` | builds normalized token collection |
| Accounting | `reconciliationDateDifference_` | `calculateReconciliationDateDifference_` | deterministic calculation |
| Accounting | `getReconciliationLedgerCandidates_` | `buildReconciliationLedgerCandidates_` | builds derived candidate collection |
| Accounting | `getCandidateScoresForBank_` | `calculateReconciliationCandidateScores_` | calculates and ranks scores |
| Accounting | `getSettlementEligibleItems_` | `buildSettlementEligibleItems_` | builds derived collection, not a final API DTO |

## Explicitly preserved names

Specialized verbs remain valid when they accurately describe their operation: `filter`, `format`, `upload`, `extract`, `score`, `sanitize`, `mask`, `paginate`, `group`, `open`, `append`, `invalidate`, `hash`.

## Invariants

- Public `api_*` identifiers are unchanged.
- `loadSettings*` / `saveSettings*` frontend bridge identifiers are unchanged.
- Parameters, return values, thrown errors, authorization, locks, state transitions, and Sheet/Drive side effects are unchanged.
- No compatibility alias remains after the rename.
