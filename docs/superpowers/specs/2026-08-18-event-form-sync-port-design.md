# Event Google Forms Sync Port Design

Date: 2026-08-18
Status: Proposed for implementation
Source reference branch: `feature/event-welfare-form-sync`
Target branch: `refactor/event-form-sync-port`
Base: `main`

## 1. Goal

Port only the useful Google Forms applicant synchronization behavior from the legacy `feature/event-welfare-form-sync` branch into the current modular Event architecture.

An Event editor can connect a Google Form or response Spreadsheet and explicitly import new responses into the current OperationDB tables:

- `eventForms`
- `eventApplications`
- `eventExtraAnswers`

The port preserves the current Event architecture and public API style. It does not merge or reproduce the legacy monolithic EventWelfare implementation.

## 2. Scope

### In scope

1. Read Google Form / response Spreadsheet connection info per event.
2. Accept either a Google Form ID or a response Spreadsheet ID.
3. If only a Form ID is provided, resolve its response Spreadsheet through `FormApp`.
4. Select the best response sheet from the linked Spreadsheet.
5. Detect required response columns using header aliases.
6. Map base response fields to `eventApplications`.
7. Map non-base questions to `eventExtraAnswers`.
8. Prevent duplicate imports with `sourceResponseId`.
9. Calculate `appliedFee` from event fee configuration and applicant type.
10. Record connection status and last sync time in `eventForms`.
11. Return imported / duplicate / invalid counts and invalid-row diagnostics.
12. Enable the existing disabled Forms sync UI in Event Detail.
13. Enforce Event edit permission for connection changes and sync execution.

### Out of scope

- Attendance source synchronization
- Automatic payment/deposit matching
- Any write to `eventPayments` during Forms sync
- Accounting/ledger synchronization
- Refund target synchronization
- Group refund export or transfer-result import
- Replacing current Event CRUD
- Legacy `apiV1_*` APIs
- Legacy `EventWelfare_*` repository/service/config/client files
- Legacy hard-coded Spreadsheet IDs
- `.clasp.json` or `appsscript.json` changes
- Background or trigger-based automatic Forms sync

Synchronization remains explicit and user-triggered.

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

- `applicants_api.gs`: thin public endpoint and authorization.
- `applicants_form_reader.gs`: external Google Form / Spreadsheet access only.
- `applicants_form_mapper.gs`: response-header aliases and row-to-domain candidate conversion only.
- `applicants_form_sync_service.gs`: orchestration, duplicate detection, write lock, persistence coordination, result aggregation.
- `applicants_sheet_dao.gs`: domain-specific OperationDB read/write helpers only.

No generic repository or integration framework is introduced.

## 4. Existing contracts reused

The implementation reuses the current OperationDB schema and common helpers.

### `events`

Used fields:

- `id`
- `feeEnabled`
- `payerFee`
- `nonPayerFee`

### `eventForms`

Used fields:

- `id`
- `eventId`
- `googleFormId`
- `responseSheetId`
- `status`
- `lastSyncedAt`
- `createdAt`

### `eventApplications`

Possible imported fields:

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

Processing and evidence fields are not inferred by the sync.

### `eventExtraAnswers`

- `id`
- `applicationId`
- `questionId`
- `questionTitle`
- `answer`

`eventPayments` is explicitly not written by this feature.

## 5. API contract

Add one public Event API:

```js
api_syncApplicantsFromForms(input)
```

Input follows current Event request style:

```js
{
  id: '<eventId>',
  payload: {
    googleFormId: '<optional form id or url>',
    responseSheetId: '<optional spreadsheet id or url>'
  }
}
```

At least one usable source must exist after payload values are merged with the existing `eventForms` record.

Success data:

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

The endpoint uses the current Event/Core API handler and error conventions. The legacy API wrapper is not copied.

## 6. Permission model

The mutation requires:

1. authenticated session;
2. Event edit permission through existing IAM;
3. administrator bypass only through existing IAM admin behavior.

Event view permission can read existing event/applicant/Form-sync state but cannot change source configuration or start sync.

Frontend visibility is UX only; server authorization is authoritative.

## 7. Source resolution

Source values are resolved in this order:

1. non-empty values explicitly supplied in the request;
2. existing `eventForms` values.

Raw IDs and supported Google URLs are accepted. A small resource-ID normalizer extracts Form/Spreadsheet IDs.

When `responseSheetId` is absent and `googleFormId` exists:

```text
FormApp.openById(formId)
    ↓
getDestinationId()
    ↓
response Spreadsheet ID
```

Failure to open the Form, resolve its destination, or open the response Spreadsheet is a hard failure.

## 8. Response sheet selection

A response Spreadsheet may have multiple sheets. The reader scores candidate sheets by recognized base headers.

The selected sheet must contain:

- student ID
- name

Timestamp, phone, department, applicant type, bank fields, and explicit response ID are optional.

If no sheet contains both required columns, the request fails. Columns are never guessed by position.

## 9. Header aliases

Matching normalizes cosmetic variations such as whitespace and safe parenthetical/explanatory text.

Required aliases include at least:

```text
studentId:
- 학번
- 학생 학번

name:
- 성명
- 이름
- 학생 이름
```

Optional recognized fields include:

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

Alias rules live in `applicants_form_mapper.gs`, not schema definitions.

## 10. Row mapping

Each non-empty response row becomes either a valid candidate or an invalid-row diagnostic.

A row is invalid when `studentId` or `name` is missing after normalization. Invalid rows do not abort other valid imports.

A valid candidate contains:

```js
{
  applicant: { ... },
  extraAnswers: [ ... ]
}
```

Recognized base columns map to the applicant. Every non-empty unrecognized question becomes an `eventExtraAnswers` item.

The original question title is preserved. `questionId` is a deterministic identifier derived from the normalized question title plus stable column identity; no new question table is introduced.

## 11. Idempotency

`eventApplications.sourceResponseId` is the synchronization idempotency key.

Preferred source response ID:

1. explicit response-ID column when available;
2. otherwise a deterministic stable ID derived from source identity and normalized response values.

The fallback must include:

- response Spreadsheet ID;
- source sheet ID;
- normalized response timestamp when available;
- normalized identifying/base response values and response content.

**The fallback must not depend on the current row number**, because sorting or inserting rows in the source sheet must not make the same response look new.

A repeated sync of unchanged response data must not create a second application.

Duplicate detection occurs both against existing `eventApplications.sourceResponseId` values and within the current candidate batch.

## 12. Fee mapping

If event fee management is disabled:

```text
appliedFee = 0
```

If enabled:

- payer/member applicant type → `payerFee`
- non-payer/non-member applicant type → `nonPayerFee`

Applicant-type normalization is explicit and tested. Unknown/blank applicant type cannot silently receive an arbitrary classification; if fee calculation depends on the missing value, that response is invalid.

No payment row is created and no deposit status is inferred.

## 13. Persistence and transaction boundary

External response data is read before acquiring the OperationDB write lock.

Write-lock scope contains only internal persistence:

```text
withOperationWriteLock_
├─ re-read existing sourceResponseIds
├─ filter duplicates again
├─ insert eventApplications
├─ insert eventExtraAnswers
└─ upsert eventForms sync metadata
```

This minimizes lock duration while protecting against concurrent duplicate imports.

Domain-specific DAO helpers may be added, for example:

```js
appendEventApplicationRow_(item)
appendEventExtraAnswerRow_(item)
findEventFormByEventId_(eventId)
insertEventFormRow_(item)
updateEventFormRowById_(id, changes)
```

They delegate to current OperationDB CRUD helpers. They do not implement new generic Sheet CRUD.

## 14. Partial-success and failure policy

### Hard failure — no import

- event does not exist;
- no source is configured;
- Form destination cannot be resolved;
- response Spreadsheet cannot be opened;
- no response sheet has required student-ID/name columns;
- OperationDB schema/header validation fails;
- authorization fails.

### Partial success

Individual rows missing required values are skipped and reported in `invalidRows`. Valid rows continue.

Duplicates are skipped and counted separately, not treated as errors.

## 15. Form connection metadata

After a synchronization attempt successfully reaches persistence, `eventForms` is inserted or updated with resolved source information:

- event ID
- Google Form ID when known
- response Spreadsheet ID
- status `연동`
- last synchronized timestamp
- created timestamp on first insert

A failed source-read request must not overwrite a previously working connection with invalid source values.

## 16. Frontend integration

Reuse Event Detail; do not create a new page.

Enable the existing Forms controls to show:

- current Form/response source state;
- Form ID or URL input;
- response Spreadsheet ID or URL input;
- explicit `응답 동기화` action;
- last synchronized time;
- imported / duplicate / invalid result feedback.

After successful sync, reload applicant data through current Event APIs. The browser does not become a second applicant-data source of truth.

## 17. Event detail read model

Expose additive Form state derived from `eventForms`:

```js
formSync: {
  configured,
  googleFormId,
  responseSheetId,
  status,
  lastSyncedAt
}
```

## 18. Security and privacy

- Do not expose unrelated Spreadsheet or Drive IDs.
- Only the event's configured Form/response source is returned to authorized Event users.
- Do not persist raw response rows as blobs.
- Only mapped application fields and explicit additional answers are stored.
- Do not log full applicant PII in normal success logs.

## 19. Testing requirements

Focused tests cover:

1. raw ID and URL extraction;
2. required and optional header aliases;
3. best-sheet selection with stubs;
4. applicant mapping;
5. extra-answer mapping;
6. payer/non-payer fee calculation;
7. stable fallback `sourceResponseId` generation independent of row number;
8. duplicate prevention against existing rows;
9. duplicate prevention within one batch;
10. invalid-row partial success;
11. `eventForms` insert/update behavior;
12. Event edit authorization;
13. no `eventPayments` write during sync;
14. frontend controls and result handling.

Then run the existing complete regression suite and architecture verifiers before merge.

## 20. Architecture guardrails

Verification ensures:

- Form reader does not write OperationDB.
- Form mapper does not call `SpreadsheetApp` or `FormApp`.
- API remains thin.
- Query services remain read-only.
- No generic repository abstraction is introduced.
- No legacy `EventWelfare_*` files or `apiV1_*` APIs are copied.
- No legacy hard-coded Spreadsheet ID appears in product code.
- No `.clasp.json` or manifest change is introduced.
- Forms sync code does not write `eventPayments`.

## 21. Deployment assumptions

Required OperationDB tables and fields already exist in the current schema. Physical Sheets must contain the expected current headers before sync is used.

The Apps Script execution account must be able to open the configured Google Form and/or response Spreadsheet.

No automatic migration of external Forms or response sheets is attempted.

## 22. Success criteria

The port is complete when:

1. an authorized Event editor can connect a Form/response Spreadsheet;
2. valid responses import new applicants and extra answers;
3. repeated sync does not duplicate existing responses;
4. source row reordering does not defeat idempotency;
5. malformed individual rows are reported without blocking valid rows;
6. invalid source configuration does not corrupt existing Form metadata;
7. Event viewers cannot execute the mutation;
8. Forms sync creates no payment, attendance, ledger, or refund records;
9. existing Event behavior and repository regressions remain green;
10. the product branch contains no temporary CI/verification artifacts before merge.
