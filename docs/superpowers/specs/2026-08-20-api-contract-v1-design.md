# Frontend ↔ Apps Script API Contract v1 Design

## Status

Proposed design for standardizing every authenticated frontend-to-server call in the council application.

## Goal

Create one predictable protocol for all frontend calls into Apps Script public `api_*` functions so that page code no longer depends on domain-specific `google.script.run` wrappers, request shapes, response envelopes, fallback semantics, or ad-hoc error conventions.

## Scope

This change standardizes:

- frontend GAS invocation through one shared runner;
- request envelopes;
- success response envelopes;
- error transport and normalization;
- domain-specific frontend clients;
- server API boundary handling;
- CI contracts that prevent direct or non-standard GAS calls from returning.

This change does not redesign domain data models, business workflows, page layouts, authorization rules, database schemas, or domain service internals unless a minimal API-boundary adaptation is required.

## Architectural Decision

All authenticated frontend server calls must follow this path:

```text
Page UI
  ↓
Domain Client
  ↓
runAppApi(apiName, request)
  ↓
google.script.run[apiName]({ request: ... })
  ↓
api_* public function
  ↓
apiHandler_
  ↓
Domain parser/service
```

Page code must not call `google.script.run` directly and must not know the transport details of Apps Script.

## 1. Canonical Request Contract

Every frontend call sends exactly one top-level transport object:

```js
{
  request: {
    // domain-specific input
  }
}
```

Examples:

```js
runAppApi('api_getEventOverview', {
  id: eventId
});
```

Transported to Apps Script as:

```js
{
  request: {
    id: eventId
  }
}
```

No-argument APIs still receive the same envelope:

```js
{
  request: {}
}
```

Public APIs must not rely on positional frontend arguments or `.apply(...)` varargs.

### Server unwrapping

The shared server API boundary owns generic request-envelope unwrapping:

```js
function unwrapApiRequest_(input) {
  var source = input && typeof input === 'object' ? input : {};
  return source.request && typeof source.request === 'object'
    ? source.request
    : source;
}
```

During migration, the fallback to `source` preserves compatibility with server-side tests or non-frontend internal callers that still pass raw request objects. New frontend code must always use `{ request: ... }`.

Domain parsers may still validate and normalize domain-specific fields after unwrapping.

## 2. Canonical Success Contract

Every public API success is represented by exactly one response envelope:

```js
{
  ok: true,
  data: <domain result>
}
```

Examples:

```js
{
  ok: true,
  data: {
    items: [],
    page: {
      page: 1,
      pageSize: 20,
      total: 0
    }
  }
}
```

```js
{
  ok: true,
  data: {
    user: {...},
    permissions: {...}
  }
}
```

The envelope is global; the shape inside `data` remains owned by each domain.

The frontend shared runner unwraps this success envelope and resolves only `response.data` to page/domain-client callers. Page code therefore does not branch on `response.ok` or manually unwrap `response.data`.

## 3. Error Contract

Errors are not returned as successful `{ ok: false }` responses.

Apps Script's native failure channel remains authoritative:

```text
server throws
  ↓
google.script.run.withFailureHandler(...)
  ↓
runAppApi rejects
  ↓
page/domain UI handles error
```

This preserves the distinction between a successful remote invocation and a failed remote invocation.

### Expected business errors

Expected validation, not-found, permission, invalid-state, and domain-processing errors are represented internally as typed application errors with:

```js
{
  code: 'VALIDATION_FAILED',
  message: '금액을 입력해주세요.',
  details: {
    field: 'amount'
  }
}
```

Services may throw typed application errors. They do not construct frontend response envelopes.

### Unexpected system errors

Unexpected exceptions from Drive, Sheets, internal bugs, or other infrastructure remain exceptions. The API boundary logs the original error but must not expose internal stack traces, spreadsheet IDs, file IDs, or implementation details to the browser.

The client receives a normalized error equivalent to:

```js
{
  code: 'INTERNAL_ERROR',
  message: '서버 처리 중 오류가 발생했습니다.',
  details: {}
}
```

### Client error object

`runAppApi()` rejects with one normalized frontend error shape:

```js
{
  code: string,
  message: string,
  details: object
}
```

Page code handles errors through normal Promise rejection / `try...catch` rather than inspecting API response envelopes.

## 4. Shared Frontend Runner

Create a shared authenticated frontend transport module under `src/100_common`.

Its responsibilities are limited to:

1. verify that the GAS runtime is available;
2. invoke exactly one `api_*` server function;
3. wrap the request as `{ request: request || {} }`;
4. validate the canonical success envelope;
5. resolve with `response.data`;
6. normalize GAS failure-handler errors;
7. reject malformed success responses.

It must not own:

- loading indicators;
- toast messages;
- retry policy;
- fallback data;
- modal behavior;
- page navigation;
- domain-specific request construction.

These remain page or domain-client responsibilities.

Conceptual interface:

```js
runAppApi(apiName, request) -> Promise<data>
```

## 5. Domain Frontend Clients

Each domain owns a thin client that maps semantic frontend operations to public API names and request shapes.

Examples:

```js
var eventClient = {
  getOverview: function (eventId) {
    return runAppApi('api_getEventOverview', { id: eventId });
  }
};
```

```js
var accountingClient = {
  getEntries: function (filter) {
    return runAppApi('api_getLedgerEntries', filter || {});
  }
};
```

Page files call domain clients, not `runAppApi()` directly except shared application-level code such as authenticated shell/session code where no domain client is appropriate.

Domain clients own:

- public API function names;
- domain request construction;
- semantic operation naming.

Domain clients do not own:

- UI loading/toasts;
- DOM state;
- transport/error implementation;
- business rules already owned by the server.

## 6. Loading, Fallback, and UI Error Policy

Loading state is UI state and remains outside the shared runner.

A page may use:

```js
setLoading(true);
try {
  var data = await eventClient.getOverview(eventId);
  render(data);
} catch (error) {
  handleError(error);
} finally {
  setLoading(false);
}
```

Fallback data must never be silently produced by the transport layer. If a page intentionally wants a fallback, it must state that locally:

```js
var items;
try {
  items = await accountingClient.getEntries(filter);
} catch (error) {
  items = [];
  showWarning(error.message);
}
```

This removes the current Accounting behavior where transport failures can resolve as fallback success values.

## 7. Server API Boundary

`apiHandler_()` remains the common execution boundary for protected APIs.

Its target responsibilities after migration are:

1. determine operation metadata;
2. establish login context when required;
3. enforce access/permission requirements;
4. unwrap the canonical request transport envelope;
5. invoke domain parsing when configured;
6. execute the domain service;
7. wrap successful domain results in `{ ok: true, data: ... }`;
8. log and normalize thrown errors before rethrowing through the Apps Script failure channel.

Public `api_*` functions stay thin and declarative.

A public API should conceptually look like:

```js
function api_getEventOverview(input) {
  return apiHandler_({
    operation: 'getEventDetail',
    input: input,
    requireLogin: true,
    access: eventApiAccess_('view'),
    parse: parseEventRequest_,
    service: function (request) {
      return getEventDetailData_(request);
    }
  });
}
```

`apiHandler_()` owns the success envelope; domain services return domain data only.

## 8. Migration Compatibility

This is an in-place contract migration, not a flag day rewrite of business logic.

The migration must preserve current behavior while changing transport boundaries in controlled batches.

Rules:

- server request unwrapping accepts both canonical envelopes and legacy raw objects during migration;
- frontend code migrated to the new runner must send only canonical envelopes;
- success-envelope migration must update server and corresponding frontend consumer in the same tested change;
- no compatibility layer may silently remain as a second permanent frontend calling convention;
- legacy domain wrappers (`callServer`, `studentFeeApi`, Event `api`, `callSettingsApi`, `callMyPageApi_`) are deleted after their consumers migrate;
- direct `google.script.run` remains allowed only in the shared transport runner and explicitly approved non-API platform integration code, if any.

## 9. Initial Migration Targets

The migration covers authenticated application areas:

- App Shell / current-user access lookup;
- MyPage;
- Settings;
- Accounting;
- Student Fee;
- Event.

Login page routing through server-side `doGet()` is not a frontend GAS API call and is not part of the frontend runner migration.

Existing unfinished business features remain unfinished unless transport conversion is required. In particular, API Contract v1 must not invent missing Event payment, Student Fee Form, OCR/audit, or Settlement confirmation workflows.

## 10. Naming Rules

- Apps Script public frontend-callable functions keep the `api_*` prefix.
- Internal server functions keep trailing `_` where that is the repository convention.
- Shared frontend transport: `runAppApi`.
- Domain client methods use semantic names and do not repeat the `api_` prefix.
- Page UI code must not contain raw `google.script.run` API invocation chains after migration.

## 11. CI / Contract Enforcement

Extend the existing frontend API mapping verification so CI enforces both existence and calling convention.

The final contract must fail when:

- frontend references an undefined `api_*` function;
- authenticated page code invokes `google.script.run` outside the approved shared runner;
- legacy domain transport wrappers are reintroduced;
- frontend domain/page code sends positional varargs through a GAS API wrapper;
- a public API consumed by migrated frontend code returns a legacy unwrapped success shape in tested contract fixtures;
- canonical request wrapping or success unwrapping behavior regresses.

The verifier may report server APIs not referenced by frontend as informational, because server/admin/form-sync entry points may legitimately have no browser consumer.

## 12. Testing Strategy

Use TDD and migrate in vertical slices.

Required tests include:

- shared runner resolves `data` from `{ ok: true, data }`;
- shared runner rejects malformed success envelopes;
- shared runner converts GAS failure-handler values to normalized client errors;
- request sent to GAS is exactly `{ request: ... }`;
- no-argument calls send `{ request: {} }`;
- server request unwrapping accepts canonical envelope and legacy raw object during migration;
- `apiHandler_()` wraps successful domain values once and only once;
- typed business errors travel through the failure channel;
- unexpected errors are logged and exposed as generic client-safe errors;
- each migrated domain page preserves its existing functional regression contracts;
- mapping verifier rejects direct/legacy calling conventions.

All existing Node regression workflows must remain green before integration.

## 13. Non-Goals

Not included in API Contract v1:

- REST/HTTP API introduction;
- replacing `google.script.run` with fetch;
- TypeScript migration;
- automatic retries;
- centralized global loading state;
- centralized toast UI;
- redesigning domain response data fields inside `data`;
- implementing currently unfinished business features;
- changing DB schemas.

## 14. Acceptance Criteria

API Contract v1 is complete when:

1. every authenticated frontend GAS API call flows through the shared runner;
2. page code calls semantic domain clients rather than domain-specific GAS wrappers;
3. every frontend request uses `{ request: ... }`;
4. every successful public API used by the frontend returns `{ ok: true, data: ... }`;
5. errors travel exclusively through the GAS failure channel and become normalized frontend errors;
6. transport never silently returns fallback values for failures;
7. legacy frontend API wrappers are removed;
8. direct `google.script.run` API invocation outside the approved runner is CI-blocked;
9. existing functional regression suites remain green;
10. no unfinished business workflow is accidentally activated as part of the transport refactor.
