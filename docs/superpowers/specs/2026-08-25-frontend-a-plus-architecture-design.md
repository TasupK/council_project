# Frontend A+ Architecture Design

## Goal

Refactor the existing Google Apps Script frontend without introducing a build step, TypeScript, SPA routing, React, Vue, or another frontend framework.

The target is a stronger frontend architecture inside the current `HtmlService + include() + Vanilla JS + ?page=` model.

The design has four pillars:

1. separate the application frame from page content,
2. define a shared UI component system,
3. centralize common frontend behavior under the `App` namespace,
4. keep domain pages responsible only for page state, API use, and business flow.

This is an architecture refactor, not a product-flow redesign.

## Base and Working Branch

- Base branch: `main`
- Base commit: `ff4ffe0415ff4db6258f324e0a8e9039bc9e21f0`
- Working branch: `refactor/frontend-architecture-a-plus`

## Relationship to the Existing UI Migration Design

`docs/superpowers/specs/2026-08-17-ui-system-migration-design.md` centralized shared visual primitives while intentionally leaving domain interaction JavaScript in place.

This design extends that work. It keeps the same domain-neutral `ui-*` visual principle but adds two responsibilities that were previously excluded:

- a shared application frame,
- shared component behavior under `App.ui`.

The previous design remains useful as migration history, but this document is authoritative for the next frontend architecture phase where the two conflict.

## Non-Goals

This refactor does not introduce:

- React, Vue, Svelte, or another framework,
- TypeScript,
- npm-based build output,
- Vite, esbuild, Rollup, Webpack, or another bundler,
- SPA navigation,
- client-side route ownership,
- external frontend hosting,
- server API contract changes,
- business workflow redesign,
- schema changes.

`clasp push`, Apps Script templates, and server-side `doGet(?page=...)` routing remain the deployment and navigation model.

# 1. Architecture

The frontend is divided into four responsibility layers.

```text
Server
  -> App Frame
      -> App UI
          -> Domain Page
```

Dependency direction is one-way from page-specific code toward common code.

```text
Page
  -> Domain
      -> App.ui / App.shell / App.router
          -> App.core
```

Common layers must not depend on Accounting, Student Fee, Event, Settings, or another domain.

## 1.1 Server

The server remains responsible for:

- authentication and authorization,
- resolving `?page=...`,
- selecting the page descriptor,
- producing bootstrap context,
- rendering the shared application frame.

The server should no longer require every protected page to own a complete HTML document containing its own Header, Sidebar, common styles, and common scripts.

## 1.2 App Frame

The App Frame owns persistent application chrome and page composition:

- Header,
- Sidebar,
- profile controls,
- navigation,
- the main content container,
- common stylesheet inclusion,
- common frontend bootstrap,
- page content slot,
- page-specific style/script inclusion.

A protected page provides only its content and optional page-specific resources.

Conceptually:

```text
App_Frame
├─ App_Header
├─ App_Sidebar
└─ App_Content
   └─ Page View
```

The exact Apps Script template implementation may vary as long as this ownership boundary remains true.

## 1.3 Shared UI System

The shared UI layer defines domain-neutral components such as:

- button,
- card,
- search,
- filter,
- field/input/select,
- table,
- modal,
- toast,
- pagination,
- badge,
- loading/empty/error presentation.

A shared component owns:

1. its HTML contract,
2. its visual contract,
3. its JavaScript behavior,
4. its UI state.

It does not own business data or business decisions.

## 1.4 Domain Page

A page owns:

- page-local state,
- API calls through domain clients,
- domain/business flow,
- mapping API data into UI presentation,
- reacting to UI component events.

A page must not reimplement generic button, modal, search, filter, toast, pagination, or similar component behavior.

# 2. Proposed Common Structure

The logical target is:

```text
src/100_common/
├─ frame/
│  ├─ App_Frame.html
│  ├─ App_Header.html
│  ├─ App_Sidebar.html
│  └─ app_frame_js.html
│
├─ styles/
│  ├─ App_Tokens.html
│  ├─ App_Base.html
│  └─ App_Layout.html
│
├─ ui/
│  ├─ App_UI_Styles.html
│  └─ app_ui_js.html
│
├─ core/
│  ├─ app_core_js.html
│  └─ app_api_runner_js.html
│
└─ api/
   └─ app_client_js.html
```

This is a responsibility model, not a requirement to maximize file count. If Apps Script file ergonomics make several component implementations easier to maintain in one physical file, they may share a file while preserving the logical namespaces below.

# 3. `App` Namespace

Global frontend behavior is exposed through one root namespace.

```js
App = {
  core: {},
  router: {},
  shell: {},
  ui: {
    button: {},
    card: {},
    search: {},
    filter: {},
    input: {},
    select: {},
    table: {},
    modal: {},
    toast: {},
    pagination: {}
  }
};
```

New generic global functions such as `escapeHtml()`, `showToast()`, `money()`, or `paginationHtml()` are prohibited.

Compatibility globals may temporarily exist during migration, but they should delegate to the new namespace and be removed once their consumers are migrated.

# 4. Component Contract

## 4.1 Static Markup by Default

Static components are authored directly in page HTML.

Example:

```html
<button
  id="ledgerCreateButton"
  class="ui-btn ui-btn--primary"
  data-ui="button"
>
  등록
</button>
```

The page should not call `App.ui.button.create()` merely to generate markup that can be expressed statically.

JavaScript rendering is reserved for UI whose structure is inherently driven by data, for example:

- table rows,
- pagination items,
- dynamically repeated badges/items,
- transient toast instances.

## 4.2 Component Behavior and State

The component JavaScript owns UI mechanics and presentation state.

Examples:

```js
App.ui.button.setLoading(button, true);
App.ui.modal.open(modal);
App.ui.search.clear(search);
App.ui.card.setLoading(card, true);
```

Examples of component-owned state:

- disabled,
- loading,
- active,
- expanded/collapsed,
- empty,
- error,
- current UI selection where it is presentation-only.

Business state remains page-owned.

`App.ui` must not hold one giant mutable global state object for all components. UI state should stay as close to the relevant DOM element as practical.

## 4.3 Business Boundary

Allowed:

```js
App.ui.button.setLoading(button, true);
App.ui.modal.open(modal);
```

Not allowed:

```js
App.ui.button.createPayment();
App.ui.modal.approveLedger();
```

A component may know that a button was clicked. It may not know what a ledger approval means.

# 5. Component Initialization

The default initialization model is declarative `data-ui` markup plus one common bootstrap call.

```html
<div data-ui="search">...</div>
<form data-ui="filter">...</form>
<button data-ui="button">...</button>
```

During frame startup:

```js
App.ui.init(document);
```

Conceptually:

```js
App.ui.init = function (root) {
  App.ui.button.initAll(root);
  App.ui.search.initAll(root);
  App.ui.filter.initAll(root);
  App.ui.modal.initAll(root);
};
```

Only components that require initialization participate. A passive card does not need initialization merely to satisfy a framework pattern.

Initialization must be idempotent or guard against double binding so that accidental repeated initialization does not duplicate event handlers.

# 6. Component-to-Page Communication

The public component interface uses two directions.

## 6.1 Commands: Page -> Component

Pages may invoke component APIs to change UI state.

```js
App.ui.button.setLoading(button, true);
App.ui.modal.open(modal);
App.ui.pagination.update(pagination, model);
```

## 6.2 Events: Component -> Page

Components emit domain-neutral custom events.

Examples:

```text
ui:search
ui:filter-submit
ui:filter-reset
ui:page-change
ui:modal-open
ui:modal-close
```

Example:

```js
pagination.addEventListener('ui:page-change', function (event) {
  AccountingLedgerPage.changePage(event.detail.page);
});
```

The pagination component reports a page change. It does not call Accounting code directly.

Event payloads must be minimal and domain-neutral.

# 7. Page Controller Pattern

Each page should expose one page-level namespace/controller instead of scattering state and functions across the global scope.

Conceptually:

```js
var AccountingLedgerPage = {
  state: {
    page: 1,
    pageSize: 20,
    filters: {}
  },

  init: function () {
    this.bindEvents();
    this.load();
  },

  bindEvents: function () {},
  load: function () {},
  render: function () {},

  actions: {
    openCreate: function () {},
    filter: function () {}
  },

  modals: {}
};
```

Exact method names may vary by page, but the intent is consistent:

- one clear page root,
- explicit page state,
- explicit initialization,
- business actions grouped visibly,
- no generic utility duplication.

# 8. App Frame Rendering Flow

The target protected-page flow is:

```text
Request
  -> doGet(?page=accounting_ledger)
  -> authenticate / authorize
  -> resolve page descriptor
  -> build APP_BOOTSTRAP
  -> render App_Frame
      -> Header
      -> Sidebar
      -> page view slot
      -> common styles/scripts
      -> page styles/scripts
  -> App shell/UI initialization
  -> PageController.init()
```

A page descriptor should provide enough information for the common renderer to assemble a page without requiring a page-owned full document shell.

Conceptually:

```js
accounting_ledger: {
  view: '400_accounting/410_ledger/Accounting_Ledger_View',
  style: '400_accounting/410_ledger/Accounting_Ledger_Styles',
  script: '400_accounting/410_ledger/accounting_ledger_js',
  domain: 'accounting'
}
```

The implementation must preserve current route names and authorization semantics.

# 9. Bootstrap Context

Protected pages should converge on a single initial context object rather than many unrelated globals.

Target shape:

```js
window.APP_BOOTSTRAP = {
  webAppUrl: '...',
  currentPage: 'accounting_ledger',
  user: {
    name: '...',
    title: '...',
    isAdmin: false
  },
  access: {
    accounting: true,
    studentFee: true,
    event: false,
    settings: false
  }
};
```

The exact access shape may follow the current server permission model, but bootstrap data should be generated once by the authenticated server render path.

Where safe, Header and Sidebar should consume this context instead of immediately issuing an additional `getCurrentUser()` request on every page load.

The API remains available for explicit refresh scenarios; eliminating every client-side user query is not a requirement if freshness is needed.

# 10. Shared Visual Rules

Common appearance remains domain-neutral.

The design-system ownership chain is:

```text
Tokens
  -> Base
      -> Common UI
          -> Domain Layout
```

The shared layer owns visual semantics including:

- color and spacing tokens,
- radius and elevation,
- buttons,
- cards,
- fields/selects,
- search,
- filter surfaces,
- tables,
- modals,
- pagination,
- badges,
- common status/loading/empty/error presentation.

Domain CSS owns only genuinely domain-specific composition such as ledger column layout, reconciliation arrangement, event detail composition, or permission matrices.

New domain-specific versions of generic components such as `accounting-button`, `event-card`, or `student-fee-search` are prohibited unless the component has a truly different semantic contract rather than merely different styling.

# 11. Initial Component Set

The first common UI contract should cover the components already repeated across domains:

1. Button
2. Card
3. Field/Input/Select
4. Search
5. Filter
6. Modal
7. Toast
8. Pagination
9. Table presentation helpers where useful
10. Loading / Empty / Error state helpers

File upload can follow after the base system because it has more workflow-specific behavior and should not block the initial architecture migration.

# 12. Migration Strategy

This must not be a big-bang rewrite.

## Phase 1: Common Foundation

Introduce or reorganize:

- App Frame,
- `App` namespace,
- `App.core`,
- `App.shell`,
- `App.router`,
- `App.ui`,
- common component contracts,
- `APP_BOOTSTRAP`,
- compatibility shims only where necessary.

Existing pages remain functional during this phase.

## Phase 2: Accounting Migration

Accounting is the first full migration target because it currently exposes the broadest combination of:

- filters,
- tables,
- modals,
- status presentation,
- file interactions,
- pagination,
- page-level state.

Recommended page order:

```text
Ledger
  -> Reconciliation
      -> Settlement
```

Move generic responsibilities out of `accounting_common_js.html` into common UI/core only when the behavior is truly domain-neutral.

Accounting-specific helpers remain in the Accounting domain.

## Phase 3: Student Fee Migration

Replace duplicated helpers such as Student Fee-specific toast, money/date formatting, busy, modal, and pagination implementations with common contracts where behavior matches.

Do not change Student Fee business flow or API contracts.

## Phase 4: Event Migration

Move generic Event helpers such as toast, formatting, pagination, and common modal/filter behavior to `App.ui` / `App.core` while preserving Event-specific state and navigation behavior.

## Phase 5: Settings and Main Migration

Migrate remaining generic shell/UI usage and reduce compatibility helpers.

## Phase 6: Cleanup

After all consumers are migrated:

- delete compatibility globals,
- remove legacy visual aliases that are no longer used,
- remove obsolete domain-generic helpers,
- remove page-owned full document shells where replaced by App Frame,
- verify no domain depends on another domain's frontend helper.

# 13. Error and Loading Handling

Common UI handles presentation mechanics; pages decide business meaning.

Example flow:

```text
Page starts API request
  -> App.ui.card/button sets loading state
  -> domain client calls runAppApi
  -> success: page updates state/render
  -> failure: page chooses user-facing message
  -> App.ui.toast renders it
  -> loading state cleared
```

`runAppApi()` remains the shared transport boundary and should not be replaced as part of this refactor.

Error normalization that is independent of a domain belongs in core/API transport. Domain-specific error interpretation belongs in domain/page code.

# 14. Testing and Verification

This architecture needs both behavioral regression tests and static architecture checks.

Add focused verification for the following contracts:

- protected pages render through the common App Frame after migration,
- Header and Sidebar are not duplicated inside migrated page documents,
- route names are unchanged,
- API names and request contracts are unchanged,
- `App.ui` does not reference domain namespaces,
- migrated pages do not define duplicate generic UI helpers,
- `data-ui` initialization is safe against duplicate binding,
- component custom events use documented names and payloads,
- JS-referenced IDs and form `name` attributes remain intact,
- page controllers initialize successfully,
- existing domain tests continue to pass.

The current repository test/verifier suite remains authoritative where relevant. New static verifiers should check architecture contracts rather than pixel-perfect visual output.

For component behavior, focused DOM-level tests or test fixtures should cover at least:

- button loading/disabled state,
- filter submit/reset event payload,
- search input/clear behavior,
- modal open/close behavior,
- pagination page-change event,
- duplicate initialization protection.

# 15. Acceptance Criteria

The frontend A+ architecture phase is complete when:

1. Protected pages can be rendered with a shared Frame that owns Header, Sidebar, common resources, and the content slot.
2. Migrated pages no longer own duplicated full application shells.
3. Generic UI components use one common `ui-*` visual contract.
4. Generic UI behavior is available under `App.ui.<component>`.
5. Static component markup remains directly readable in page HTML; JS-generated markup is reserved for genuinely dynamic structures.
6. `data-ui` plus `App.ui.init()` provides common initialization without duplicate event binding.
7. Components communicate upward through domain-neutral events and accept state changes through public commands.
8. Page-level state and business flow remain domain/page-owned.
9. Generic globals and duplicate domain UI helpers are removed after their consumers migrate.
10. `APP_BOOTSTRAP` becomes the standard initial context for the Frame and protected pages.
11. Existing routes, Apps Script deployment model, API contracts, and business behavior remain intact.
12. Relevant existing tests and new architecture/component verifiers pass.

# 16. Architectural Rules for Future Development

After migration, new frontend work should follow these rules:

- Do not create a page-specific Header or Sidebar.
- Do not create a domain-specific clone of an existing generic UI component.
- Do not add generic top-level global functions.
- Do not let `App.ui` import or call domain logic.
- Do not place business state in shared component state.
- Prefer static HTML plus component behavior over JS-generated static markup.
- Use public component commands instead of manipulating component internals from page code where an API exists.
- Use domain-neutral custom events for component-to-page communication.
- Preserve `page -> domain -> common` dependency direction.

These rules are the intended long-term frontend contract for the project.
