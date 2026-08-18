# Event Google Forms Sync Port Design

Date: 2026-08-18
Status: Proposed for implementation
Source reference branch: `feature/event-welfare-form-sync`
Target branch: `refactor/event-form-sync-port`
Base: `main`

## 1. Goal

Port only the useful Google Forms applicant synchronization behavior from the legacy `feature/event-welfare-form-sync` branch into the current modular Event architecture.

The implementation must allow an event manager with Event edit permission to connect a Google Form or response Spreadsheet and explicitly import new responses into the current OperationDB tables:

- `eventForms`
- `eventApplications`
- `eventExtraAnswers`

The port must preserve the current Event architecture and public API style. It must not merge or reproduce the legacy monolithic EventWelfare implementation.

## 2. Scope

### In scope

1. Read Google Form / response Spreadsheet connection info per event.
2. Accept either a Google Form ID or a response Spreadsheet ID.
3. If only a Form ID is provided, resolve its response Spreadsheet through `FormApp`.
4. Select the best response sheet from the linked Spreadsheet.
5. Detect required response columns using header aliases.
6. Map base response fields to `eventApplications`.
7. Map all non-base questions to `eventExtraAnswers`.
8. Prevent duplicate imports with `sourceResponseId`.
9. Calculate `appliedFee` from the event's payer/non-payer fee configuration and applicant type.
10. Record connection status and last sync time in `eventForms`.
11. Return imported / duplicate / invalid counts and invalid-row diagnostics.
12. Enable the existing disabled Forms sync UI in Event Detail.
13. Enforce Event edit permission for connection changes and sync execution.

### Out of scope

- Attendance source synchronization
- Automatic payment/deposit matching
- Accounting/ledger synchronization
- Refund target synchronization
- Group refund export or transfer-result import
- Replacing the current Event CRUD implementation
- Legacy `apiV1_*` APIs
- Legacy `EventWelfare_*` repository/service/config/client files
- Legacy hard-coded Spreadsheet IDs
- `.clasp.json` or `appsscript.json` changes
- Background or trigger-based automatic Forms sync

The synchronization remains explicit and user-triggered.

## 3. Architectural ownership

Google Forms applicant sync belongs inside the existing applicant subdomain because its output is applicant data and additional applicant answers.

```text
src/000_server/050_event/052_applicants/
├─ applicants_api.gs
├─ applicants_query_service.gs
├─ applicants_service.gs
├─ applicants_sheet_dao.gs
├─ applicants_form_sync_service.gs      NEW
├─ applicants_form_reader.gs            NEW
└─ applicants_form_mapper.gs            NEW
```

Responsibilities:

- `applicants_api.gs`: thin public API endpoint and permission requirement.
- `applicants_form_reader.gs`: external Google Form / Spreadsheet access only.
- `applicants_form_mapper.gs`: response-header aliases and row-to-domain candidate conversion only.
- `applicants_form_sync_service.gs`: orchestration, duplicate detection, write lock, persistence coordination, result aggregation.
- `applicants_sheet_dao.gs`: domain-specific OperationDB read/write helpers only.

No generic repository or integration framework will be introduced.

## 4. Existing contracts reused

The implementation must reuse the current OperationDB schema and common helpers.

### Event source data

`events` provides:

- `id`
- `feeEnabled`
- `payerFee`
- `nonPayerFee`
- event existence and configuration

### Form connection

`eventForms` provides:

- `id`
- `eventId`
- `googleFormId`
- `responseSheetId`
- `status`
- `lastSyncedAt`
- `createdAt`

### Applicant destination

`eventApplications` provides:

- `id`
- `eventId`
- `sourceResponseId`
- `sourceResponseAt`
- `studentId`
- `name`
- `department`
- `phone`
- `applicantType`
- `appliedFee`
- `bankName`
- `accountNumber`
- `accountHolder`
- `status`
- `importedAt`
- `managerId`
- `processedAt`
- evidence fields

The sync process only populates fields that can be derived from the Form response or event configuration. Processing fields remain untouched/defaulted.

### Additional answer destination

`eventExtraAnswers` provides:

- `id`
- `applicationId`
- `questionId`
- `questionTitle`
- `answer`

## 5. API contract

Add one public Event API endpoint:

```js
api_syncApplicantsFromForms(input)
```

Input follows the current Event request style:

```js
{
  id: '<eventId>',
  payload: {
    googleFormId: '<optional form id or url>',
    responseSheetId: '<optional spreadsheet id or url>'
  }
}
```

At least one usable source must exist after merging payload values with the existing `eventForms` record.

Success response data:

```js
{
  importedCount: 0,
  duplicateCount: 0,
  invalidCount: 0,
  invalidRows: [
    { row: 3, reason: '학번 또는 성명 누락' }
  ],
  sourceSheetName: '설문지 응답 시트1',
  formSync: {
    configured: true,
    googleFormId: '...',
    responseSheetId: '...',
    status: '연동',
    lastSyncedAt: '...'
  }
}
```

The API remains wrapped by the current Event/Core API handler and error conventions. The legacy `{ok,data,error,meta}` wrapper must not be copied as a separate API stack.

## 6. Permission model

The endpoint requires:

1. authenticated session;
2. Event edit permission, using the existing IAM permission model;
3. administrator bypass only through the existing IAM admin behavior.

Event view permission is sufficient to view existing event/applicant/Form-sync state, but not to update connection information or start synchronization.

Frontend hiding/disabling is UX only. Server permission enforcement remains authoritative.

## 7. Source resolution

The service merges requested source information with any existing `eventForms` row.

Priority:

1. non-empty values explicitly supplied in the request;
2. existing `eventForms` values.

IDs may be supplied as raw IDs or standard Google URLs. A small resource-ID normalizer may extract the identifier from supported Form/Spreadsheet URLs.

If `responseSheetId` is missing but `googleFormId` exists:

```text
FormApp.openById(formId)
    ↓
getDestinationId()
    ↓
response Spreadsheet ID
```

Failures to open the Form, find its destination, or open the response Spreadsheet are hard failures for the synchronization request.

## 8. Response sheet selection

The response Spreadsheet may contain multiple sheets.

The reader examines candidate sheets and scores them by recognized base headers. A valid chosen sheet must contain at minimum:

- student ID
- name

Timestamp, phone, department, applicant type, bank fields, and response ID are optional recognized fields.

If no sheet contains both required columns, fail the whole request with a validation error. Do not guess arbitrary columns by position.

## 9. Header alias model

Header matching must normalize cosmetic variations such as:

- leading/trailing whitespace
- repeated whitespace
- simple explanatory suffixes or parenthetical text where safe
- common Korean naming variants

Required base aliases include at least:

```text
studentId:
- 학번
- 학생 학번

name:
- 성명
- 이름
- 학생 이름
```

Optional base aliases should cover:

```text
sourceResponseAt / timestamp
phone / 연락처
 department / 학과 / 소속
applicantType / 신청자구분 / 학생회비 납부 여부
bankName / 은행
accountNumber / 계좌번호
accountHolder / 예금주
sourceResponseId / 응답ID
```

The alias list is an integration mapping concern and lives in `applicants_form_mapper.gs`, not in schema definitions.

## 10. Row mapping

Each non-empty response row becomes either:

- a valid import candidate; or
- an invalid-row diagnostic.

A row is invalid when either `studentId` or `name` is missing after normalization.

Invalid rows do not abort otherwise valid imports.

A valid candidate contains:

```js
{
  applicant: { ... },
  extraAnswers: [ ... ]
}
```

Base recognized columns map into the applicant object. Every non-empty unrecognized question maps into an `eventExtraAnswers` row.

The question title is preserved from the response sheet header. `questionId` may use a stable deterministic identifier derived from the normalized header/index; it must not require a new database table.

## 11. Idempotency

`eventApplications.sourceResponseId` is the synchronization idempotency key.

Preferred source response ID:

1. explicit response-ID column when available;
2. otherwise a deterministic stable hash/ID derived from immutable source coordinates and response content sufficient to identify the same original response on repeated sync.

The fallback identifier must include at least:

- response Spreadsheet ID
- source sheet ID
- a stable row identity/input set

A repeated sync of an unchanged source response must not create a second application.

Duplicate detection occurs against all existing `eventApplications.sourceResponseId` values before writes, and within the current candidate batch as well.

## 12. Fee mapping

`appliedFee` is derived from the Event configuration.

If event fee management is disabled:

```text
appliedFee = 0
```

If fee management is enabled:

- payer/member applicant type → `payerFee`
- non-payer/non-member applicant type → `nonPayerFee`

Applicant type normalization must be explicit and tested. Unknown/blank applicant type must not silently receive an arbitrary paid/non-paid classification; the mapper should use the safest existing domain default or mark the row invalid if fee calculation depends on the missing type.

## 13. Persistence and transaction boundary

External Google response data is read before obtaining the OperationDB write lock.

Write lock scope contains only internal persistence:

```text
withOperationWriteLock_
├─ re-read existing sourceResponseIds
├─ filter duplicates again
├─ insert eventApplications
├─ insert eventExtraAnswers
└─ upsert eventForms sync metadata
```

This minimizes lock duration while still protecting against concurrent duplicate imports.

Domain-specific DAO helpers may be added, for example:

```js
appendEventApplicationRow_(item)
appendEventExtraAnswerRow_(item)
findEventFormByEventId_(eventId)
insertEventFormRow_(item)
updateEventFormRowById_(id, changes)
```

They must delegate to current OperationDB CRUD helpers rather than directly implementing generic Sheet CRUD.

## 14. Partial-success and failure policy

### Hard failure — no import

- event does not exist;
- no Form or response Spreadsheet source is configured;
- Form destination cannot be resolved;
- response Spreadsheet cannot be opened;
- response sheet lacks required student-ID/name columns;
- OperationDB schema/header validation fails;
- server authorization fails.

### Partial success

Individual response rows with missing required values are skipped and reported in `invalidRows` while valid rows continue.

Duplicates are skipped and counted separately, not treated as errors.

## 15. Form connection metadata

After a successful synchronization attempt that reaches persistence, `eventForms` is inserted or updated with the resolved source information.

Store:

- event ID
- Google Form ID when known
- response Spreadsheet ID
- status = connected/`연동`
- last synchronized timestamp
- created timestamp on first insert

A failed source-read request must not overwrite a previously working connection with invalid values.

## 16. Frontend integration

Reuse the existing Event Detail page. Do not create a new page.

The currently disabled Google Forms integration controls become functional.

The UI should expose:

- current configured Form/response Spreadsheet state;
- Form ID or URL input;
- response Spreadsheet ID or URL input;
- explicit “응답 동기화” action;
- last synchronized time;
- result feedback for imported / duplicate / invalid rows.

The existing applicant table reloads after a successful import.

The UI must not maintain a second source of truth for applicant data. After sync, applicant data is read from the current Event APIs/OperationDB.

## 17. Event detail read model

The Event detail/applicant read model should expose Form sync state derived from `eventForms` so the page can render:

```js
formSync: {
  configured,
  googleFormId,
  responseSheetId,
  status,
  lastSyncedAt
}
```

This is additive to existing Event detail output.

## 18. Security and privacy

- Do not expose unrelated Spreadsheet IDs or Drive IDs.
- Only the event's own configured Form/response source is returned to authorized Event users.
- Do not persist raw response-sheet rows as blobs.
- Only mapped application fields and explicit additional answers are stored.
- Do not log full applicant PII in normal success logs.

## 19. Testing requirements

Add focused tests for:

1. raw ID and URL resource-ID extraction;
2. required header alias recognition;
3. optional header recognition;
4. correct best-sheet selection behavior using stubs;
5. applicant field mapping;
6. extra-answer mapping;
7. payer/non-payer fee calculation;
8. stable fallback sourceResponseId generation;
9. duplicate prevention across existing DB rows;
10. duplicate prevention within one sync batch;
11. invalid-row partial success;
12. eventForms insert/update metadata behavior;
13. Event edit authorization contract;
14. frontend sync controls and result handling.

Then run the existing complete regression suite and all architecture verifiers before merge.

## 20. Architecture guardrails

Verification must ensure:

- Form reader does not write OperationDB.
- Form mapper does not call SpreadsheetApp/FormApp.
- API remains thin.
- Query services remain read-only.
- `052_applicants` does not introduce a generic repository abstraction.
- No legacy `EventWelfare_*` files or `apiV1_*` APIs are copied.
- No hard-coded legacy Spreadsheet ID appears in product code.
- No `.clasp.json` or manifest change is introduced by this port.

## 21. Migration / deployment assumptions

The required OperationDB tables and fields already exist in the current schema. Deployment must ensure the physical Sheets contain the expected current headers before synchronization is used.

The executing Apps Script account must have permission to open the configured Google Form and/or response Spreadsheet.

No automatic migration of external Google Forms or response sheets is attempted.

## 22. Success criteria

The port is complete when:

1. an authorized Event editor can connect a Form/response Spreadsheet;
2. a valid response source imports new applicants and extra answers;
3. repeated sync does not duplicate existing responses;
4. malformed individual rows are reported without blocking valid rows;
5. invalid source configuration fails without corrupting existing Form metadata;
6. Event viewers cannot execute the mutation;
7. existing Event behavior and all repository regressions remain green;
8. the product branch contains no temporary CI/verification artifacts before merge.
