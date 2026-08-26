# Frontend Compound Component v1 Design

## Status

Approved design amendment for `docs/superpowers/specs/2026-08-25-frontend-a-plus-architecture-design.md`.

Where this document conflicts with the earlier A+ component design, this document is authoritative for Compound Component behavior and markup contracts.

## Goal

Introduce a small, explicit Compound Component pattern to the existing Google Apps Script + Vanilla JS frontend before the broader A+ migration proceeds.

The first version deliberately applies Compound Components only to complex UI structures where parent/part relationships add clear value:

- Card
- Modal
- Filter

Primitive UI such as Button, Input, Select, Search, and Badge remains independent and is not forced into the compound model.

This is intentionally a narrow v1. Table, PageHeader, Form, and other UI structures are not converted to Compound Components until the first migration demonstrates that the pattern improves clarity and maintenance.

## Non-Goals

Compound Component v1 does not introduce:

- React-style component instances,
- Web Components or Custom Elements,
- Shadow DOM,
- a virtual DOM,
- client-side component registries,
- component factories for static markup,
- TypeScript,
- a bundler or build step,
- SPA routing,
- business logic inside shared UI components.

Static HTML remains the primary composition mechanism.

# 1. Core Model

The DOM element is the component instance.

There is no separate JavaScript object lifecycle for each rendered component.

```text
DOM element
  = component identity
  = component-local UI state boundary
```

Public component APIs follow this form:

```js
App.ui.<component>.<action>(element, ...);
```

Examples:

```js
App.ui.card.setLoading(cardElement, true);
App.ui.modal.open(modalElement);
App.ui.filter.values(filterElement);
```

The API must accept an actual DOM element. Common `App.core.resolveElement()` may still be used by page code before calling a component API, but Compound Component internals should operate on their supplied root element rather than repeatedly resolving global selectors.

# 2. Root and Part Markup Contract

A Compound Component root is declared with `data-ui`.

```html
<section data-ui="card">
  ...
</section>
```

Parts owned by that Compound Component are declared with `data-ui-part`.

```html
<section data-ui="card">
  <header data-ui-part="header">...</header>
  <div data-ui-part="body">...</div>
  <footer data-ui-part="footer">...</footer>
</section>
```

The distinction is intentional:

```text
data-ui
  -> independent UI component root

data-ui-part
  -> structural part owned by the nearest relevant compound root
```

A nested independent primitive keeps its own `data-ui`.

```html
<section data-ui="card">
  <header data-ui-part="header">
    <h2 data-ui-part="title">장부 내역</h2>
    <div data-ui-part="actions">
      <button data-ui="button" class="ui-btn">등록</button>
    </div>
  </header>

  <div data-ui-part="body">
    ...
  </div>
</section>
```

`Button` is not a Card part. It is an independent primitive placed inside the Card's `actions` part.

# 3. Compound Component v1 Set

## 3.1 Card

### Root

```html
data-ui="card"
```

### Parts

```text
body      required
header    optional
title     optional
actions   optional
footer    optional
```

Example:

```html
<section id="ledgerCard" class="ui-card" data-ui="card">
  <header data-ui-part="header">
    <h2 data-ui-part="title">장부 내역</h2>
    <div data-ui-part="actions">
      <button data-ui="button" class="ui-btn">등록</button>
    </div>
  </header>

  <div data-ui-part="body">
    ...
  </div>

  <footer data-ui-part="footer">
    ...
  </footer>
</section>
```

Initial public API:

```js
App.ui.card.getPart(card, partName);
App.ui.card.setLoading(card, loading);
App.ui.card.setEmpty(card, message);
App.ui.card.clearState(card);
```

Card behavior owns only presentation mechanics. It must not load domain data or call an API.

## 3.2 Modal

### Root

```html
data-ui="modal"
```

### Parts

```text
body      required
header    optional
actions   optional
footer    optional
```

Example:

```html
<div id="registerModal" class="ui-modal-overlay" data-ui="modal">
  <section class="ui-modal">
    <header data-ui-part="header">
      <h2>수입·지출 등록</h2>
      <button data-ui="button" data-ui-modal-close type="button">×</button>
    </header>

    <div data-ui-part="body">
      ...
    </div>

    <footer data-ui-part="footer">
      <div data-ui-part="actions">
        <button data-ui="button" type="button">저장</button>
      </div>
    </footer>
  </section>
</div>
```

Initial public API:

```js
App.ui.modal.getPart(modal, partName);
App.ui.modal.open(modal);
App.ui.modal.close(modal);
App.ui.modal.isOpen(modal);
```

Component events:

```text
ui:modal-open
ui:modal-close
```

Event payload:

```js
{
  id: modal.id || ''
}
```

The Modal component may own close-button mechanics, Escape-key handling, overlay-click behavior, focus presentation, and open/closed UI state when those behaviors are implemented. It must not know why a domain opened the modal or what save/approve/delete means.

## 3.3 Filter

### Root

```html
data-ui="filter"
```

### Parts

```text
fields    required
actions   optional
```

Example:

```html
<form id="ledgerFilter" class="ui-filter" data-ui="filter">
  <div data-ui-part="fields">
    <div data-ui="search">...</div>
    <select data-ui="select" name="type">...</select>
    <select data-ui="select" name="status">...</select>
  </div>

  <div data-ui-part="actions">
    <button data-ui="button" data-ui-filter-submit type="submit">조회</button>
    <button data-ui="button" data-ui-filter-reset type="button">초기화</button>
  </div>
</form>
```

Initial public API:

```js
App.ui.filter.getPart(filter, partName);
App.ui.filter.values(filter);
App.ui.filter.reset(filter);
```

Component events:

```text
ui:filter-submit
ui:filter-reset
```

Payload:

```js
{
  values: { ... }
}
```

The Filter owns form-value collection, reset mechanics, and domain-neutral submit/reset events. It does not decide what API fields mean or initiate an Accounting/Student Fee/Event query itself.

# 4. Primitive Components Remain Independent

Compound Component v1 explicitly keeps these as independent primitives:

```text
Button
Input
Select
Search
Badge
```

Their markup uses `data-ui` rather than `data-ui-part`.

Examples:

```html
<button data-ui="button" class="ui-btn">저장</button>
<input data-ui="input" class="ui-control">
<select data-ui="select" class="ui-control"></select>
<div data-ui="search">...</div>
<span data-ui="badge" class="ui-badge">정상</span>
```

A primitive may be nested inside any Compound Component without becoming owned structurally by that parent's implementation.

# 5. DOM Boundary Rule

A Compound Component implementation must not reach outside its supplied root element to find or mutate unrelated UI.

Allowed:

```js
App.ui.card.getPart = function (card, name) {
  return card.querySelector('[data-ui-part="' + name + '"]');
};
```

Not allowed:

```js
App.ui.card.setLoading = function (card, loading) {
  document.getElementById('ledgerTable').classList.toggle('loading', loading);
};
```

The component may access:

- its supplied root,
- descendants owned by that root,
- browser-level facilities needed for generic behavior such as `CustomEvent` or focus handling.

It must not query domain-specific IDs or sibling components through `document`.

This is a hard architecture boundary.

# 6. Part Resolution Rule

`data-ui-part` resolution is scoped to the supplied root.

A component must not assume that every optional part exists.

Required-part behavior:

- Card requires `body`.
- Modal requires `body`.
- Filter requires `fields`.

If a required part is absent, initialization or the operation that requires the part should fail clearly in development/testing rather than silently operating on unrelated DOM.

Optional parts must be handled gracefully.

For v1, a small helper is sufficient:

```js
App.ui.<component>.getPart(root, name);
```

No generic component tree or dependency-injection registry is introduced.

# 7. Component Initialization

`App.ui.init(document)` remains the common bootstrap entry point.

Compound Components participate only when they need behavior binding.

```text
App.ui.init(root)
  -> discover [data-ui="modal"]
  -> discover [data-ui="filter"]
  -> initialize required behavior
  -> mark binding state
```

Passive Cards do not need initialization merely because they are Compound Components.

Initialization must be idempotent.

A repeated call must not duplicate event handlers.

An implementation may use root-local markers such as:

```text
data-ui-initialized="true"
```

or an equivalent DOM-local mechanism.

A global mutable component-instance registry is not allowed in v1.

# 8. Component Communication

The existing A+ Command/Event model remains.

## Page -> Component

Direct DOM-centered command APIs:

```js
App.ui.card.setLoading(card, true);
App.ui.modal.open(modal);
App.ui.filter.reset(filter);
```

## Component -> Page

Domain-neutral DOM events:

```js
filter.addEventListener('ui:filter-submit', function (event) {
  AccountingLedgerPage.actions.applyFilter(event.detail.values);
});
```

Compound Components must never call a page controller or domain client directly.

# 9. State Ownership

UI state lives as close to the component DOM as practical.

Examples:

- Modal open/closed state -> Modal root classes/attributes.
- Card loading/empty state -> Card root classes/attributes and body presentation.
- Filter field state -> native form controls under the Filter root.

Page/business state stays inside the page controller.

```text
AccountingLedgerPage.state
  -> current page
  -> loaded ledger items
  -> business filters
  -> API result state

Card/Modal/Filter DOM
  -> visual/interactivity state only
```

There is no `App.ui.state = {...}` global store.

# 10. Styling Contract

Compound semantics and visual classes are related but not identical.

```html
<section class="ui-card" data-ui="card">
```

`ui-card` defines common appearance.

`data-ui="card"` defines behavior/structure semantics.

`data-ui-part` defines the compound relationship.

CSS must not rely exclusively on JavaScript behavior hooks when a semantic visual class is clearer. Likewise, JavaScript should prefer `data-ui`/`data-ui-part` hooks rather than visual class names.

# 11. Accounting First Application

Compound Component v1 is validated first in Accounting.

Recommended application order:

```text
Ledger
  -> Reconciliation
      -> Settlement
```

Ledger should exercise all three v1 Compound Components:

- Card for summary/list/content containers where structured behavior is useful,
- Filter for ledger search/filter controls,
- Modal for register/detail flows.

Reconciliation should reuse Card/Filter/Modal where the semantics match.

Settlement should reuse Card and Filter-like period controls only where the Filter contract is genuinely appropriate; do not force a Compound Component merely to achieve visual consistency.

The purpose of the first migration is to evaluate whether these boundaries make page code simpler. It is not to maximize the number of Compound Components.

# 12. Adoption Rule

A structure becomes a Compound Component only when all are true:

1. it has a meaningful root/part relationship,
2. multiple pages can share the structural behavior,
3. the component can remain domain-neutral,
4. giving it a shared API reduces page-owned DOM mechanics.

If the only commonality is visual appearance, use shared CSS rather than a Compound Component.

# 13. Deferred Candidates

These remain outside v1:

- Table
- PageHeader
- Form
- Tabs
- FileUpload
- Page layout primitives

After Accounting migration, evaluate each candidate based on observed duplication and clarity.

Do not pre-commit to converting them.

# 14. Testing Contract

Compound Component v1 requires focused DOM-level behavior tests and static architecture checks.

Minimum behavior coverage:

### Card

- resolves required `body` inside its own root,
- loading state affects only the supplied Card,
- empty state affects only the supplied Card,
- missing optional parts do not fail.

### Modal

- open/close affects only the supplied Modal,
- emits exactly one `ui:modal-open` / `ui:modal-close` event per transition,
- repeated initialization does not duplicate close behavior,
- required `body` is scoped to the Modal root.

### Filter

- values are collected only from controls inside the supplied Filter,
- reset affects only controls inside that Filter,
- submit emits one `ui:filter-submit` event with domain-neutral values,
- reset emits one `ui:filter-reset` event,
- repeated initialization does not duplicate handlers.

### Static architecture verifier

The verifier should reject:

- `App.ui.card`, `App.ui.modal`, or `App.ui.filter` querying known Accounting IDs through `document`,
- references from shared components to `accountingClient` or an Accounting page controller,
- a global `App.ui.state` store,
- migrated compound roots that omit required parts,
- page-specific generic modal/filter mechanics that duplicate the common implementation after migration.

# 15. Acceptance Criteria

Compound Component v1 is considered successful when:

1. Card, Modal, and Filter have documented root/part contracts.
2. Their public APIs are DOM-element centered.
3. Required and optional parts follow the contracts in this document.
4. Shared component code never queries domain-specific DOM outside its supplied root.
5. Button, Input, Select, Search, and Badge remain independent primitives.
6. No global component-instance registry or `App.ui.state` is introduced.
7. `App.ui.init()` remains idempotent.
8. Component-to-page communication uses domain-neutral custom events.
9. Accounting Ledger can be migrated using the pattern without changing business/API behavior.
10. Table/PageHeader/Form and other deferred candidates remain undecided until the v1 migration is evaluated.

## One-Sentence Rule

**A Compound Component is a DOM root with explicitly named local parts and domain-neutral behavior; the DOM element itself is the instance, and the component never reaches outside its root to control the page.**
