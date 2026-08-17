# Shared UI System Migration Design

## Goal

Migrate the existing Main, Settings, Accounting, and Event frontends to the Student Fee-derived shared UI system without changing their information architecture, business workflows, API contracts, routes, or server behavior.

This phase is a visual-system migration, not a product-flow redesign.

## Base and Branch

- Base branch: `refactor/student-fee-frontend`
- Working branch: `refactor/ui-system-migration`
- Migration order: `Settings -> Main -> Accounting -> Event`

## Design Principle

Use semantic shared UI classes for common visual roles, while keeping each domain's layout-specific classes and JavaScript contracts intact.

```text
100_common/App_Styles.html
  -> shared visual responsibility

Domain styles
  -> domain-specific layout responsibility only
```

The shared layer owns appearance such as surface, spacing, radius, button, field, card, table, badge, tabs, modal, loading, empty, and toast behavior. Domain style files continue to own layout that is meaningful only inside that domain.

## Scope

### Included

- Extend and normalize the `ui-*` primitives introduced during the Student Fee frontend phase.
- Migrate reusable visual roles in Main, Settings, Accounting, and Event markup to `ui-*` classes.
- Remove or reduce duplicate domain CSS rules whose only responsibility is shared visual appearance.
- Keep domain-specific grid, column, form-layout, matrix, and detail-layout rules in the domain stylesheet.
- Add static migration verification for shared UI adoption and selector preservation.
- Run existing domain regression tests and architecture verifiers where available.

### Excluded

- Route changes.
- Server/API changes.
- Data model/schema changes.
- New features.
- Reordering page content or redesigning navigation flows.
- Changing table columns or form field semantics.
- Replacing domain JavaScript helpers with Student Fee helpers.
- Introducing a JavaScript component framework.
- Deleting domain style files merely to reduce file size.

## Shared UI Ownership

`src/100_common/App_Styles.html` is the single source for common visual primitives.

The shared system covers:

- design tokens: background, surface, border, text hierarchy, primary, status colors, spacing, radius, shadow
- page heading and page actions
- buttons and button variants
- form fields, selects, labels, and grouped controls
- toolbars and filter surfaces
- cards and stat cards
- tables and table wrappers
- badges and status treatments
- tabs
- modal shell
- bulk-action bar
- pagination
- loading, empty, and error states
- toast presentation

Shared rules MUST stay domain-neutral. `App_Styles.html` must not contain selectors named after Accounting, Event, Settings, or Main merely to fix one page.

## Domain Style Ownership

Domain styles remain when they express layout or domain-specific composition rather than generic visual appearance.

### Main

Keep:

- dashboard grid composition
- dashboard section placement
- quick-action grid sizing
- domain-specific metric arrangement

Move to shared UI:

- cards
- stat surfaces
- button-like quick actions
- status colors
- spacing/radius/surface conventions

### Settings

Keep:

- permission matrix layout
- settings-specific data alignment
- any role/permission layout whose structure is unique to Settings

Move to shared UI:

- page heading
- buttons
- toolbar
- fields/selects
- tables
- loading/empty states
- cards and list surfaces

Settings is migrated first because it already relies heavily on existing common classes and is the lowest-risk validation target.

### Accounting

Keep:

- ledger-specific columns and form layout
- reconciliation layout
- settlement/report layout
- accounting-specific composition and responsive sizing

Move to shared UI:

- tabs
- cards
- buttons
- fields/selects
- tables
- badges
- modals
- toolbar/filter surfaces
- loading/empty/toast presentation where applicable

`Accounting_Styles.html` remains, but common visual definitions should be removed when equivalent `ui-*` primitives exist.

### Event

Keep:

- event filter-grid composition
- event form layout
- event detail layout
- date-range, application-detail, attendance, and other event-specific composition rules

Move to shared UI:

- `ew-btn`-style visual responsibilities -> `ui-btn`
- `ew-card`-style visual responsibilities -> `ui-card` or `ui-stat-card`
- `ew-field`-style common field visuals -> `ui-field`
- common table visuals -> `ui-table-wrap` / `ui-table`
- generic status visuals -> `ui-badge`
- generic modal shell -> shared modal primitives
- generic loading/toast surfaces -> shared primitives

Event is migrated last because it has the largest independent visual vocabulary and therefore the highest selector-regression risk.

## Markup Migration Rules

The migration changes semantic styling classes while preserving behavior selectors.

### Must Preserve

- element IDs used by JavaScript
- `data-*` attributes used by JavaScript
- `name` attributes on form controls
- route values and page constants
- API names and payload shape
- table column meaning and order
- modal action meaning and lifecycle
- filter and pagination behavior

### May Change

- purely visual CSS classes
- class combinations whose only role is styling
- duplicated domain styles that are replaced by a shared primitive

When a legacy class is both a styling hook and a JavaScript selector, the class must remain until JavaScript is safely changed and regression-tested. Prefer preserving it as a compatibility hook rather than coupling style cleanup to behavior refactoring.

## Shared Primitive Strategy

This phase uses semantic class migration rather than CSS override-only migration.

Examples:

```html
<button class="ew-btn ew-btn-primary">...</button>
```

becomes conceptually:

```html
<button class="ui-btn primary">...</button>
```

and a legacy domain card such as:

```html
<article class="status-card">...</article>
```

moves toward:

```html
<article class="ui-stat-card status-card">...</article>
```

when `status-card` is still needed for domain-specific layout.

The objective is not to erase all domain classes. The objective is to make generic visual responsibility visibly owned by `ui-*` while domain classes express domain composition only.

## Migration Sequence

Each domain follows the same three-step migration pattern:

1. **Markup adoption**
   - add or replace shared semantic `ui-*` classes
   - preserve JS selectors and data contracts

2. **Domain CSS reduction**
   - remove duplicate generic visual rules
   - retain only domain-specific layout/composition rules

3. **Regression verification**
   - existing behavior tests
   - syntax/static checks
   - UI migration verifier

Order:

```text
Settings
  -> Main
  -> Accounting
  -> Event
```

Do not start the next domain until the current domain passes its focused checks.

## Data Flow and Error Handling

No data-flow redesign is part of this phase.

Existing page JavaScript continues to call the same APIs through the same helpers and request shapes. Existing confirmation, error, toast, loading, pagination, and mutation behavior remains authoritative for each domain.

The Student Fee common JavaScript helper is not promoted to a global frontend framework during this phase. Shared styling is centralized; domain interaction code remains domain-owned.

## Testing and Verification

Add:

```text
scripts/verify-ui-system-migration.js
```

The verifier should enforce the migration contract rather than pixel-perfect appearance.

It checks:

- Main, Settings, Accounting, and Event page shells continue to include `100_common/App_Styles`.
- Target pages actually use shared `ui-*` primitives for common visual roles.
- legacy visual-only classes targeted by this phase are reduced or removed where their shared replacement exists.
- JavaScript-referenced IDs and `data-*` hooks remain present in their associated markup.
- form `name` attributes used by existing page logic remain unchanged.
- routes and API names are unchanged.
- `App_Styles.html` contains no domain-specific exception selectors for Main, Settings, Accounting, or Event.
- domain styles remain allowed for layout-specific rules.

Existing tests/verifiers remain the source of truth for behavior:

```text
scripts/test-core.js
scripts/test-auth-iam.js
scripts/test-event.js
scripts/test-accounting.js
scripts/test-settings.js
scripts/test-student-fee.js
scripts/test-student-fee-frontend.js

scripts/verify-auth-iam-architecture.js
scripts/verify-event-architecture.js
scripts/verify-accounting-architecture.js
scripts/verify-settings-architecture.js
scripts/verify-student-fee-architecture.js
scripts/verify-student-fee-frontend.js
scripts/verify-server-architecture.js
scripts/verify-ui-system-migration.js
```

If the environment cannot execute the complete repository suite, completion claims must distinguish focused verified scope from unexecuted cross-domain checks.

## Acceptance Criteria

The phase is complete when:

1. Main, Settings, Accounting, and Event retain their current information structure and behavior.
2. Shared visual roles visibly use the common `ui-*` system.
3. Domain style files primarily contain layout/composition rules rather than parallel button/card/table/modal systems.
4. Student Fee remains visually consistent with the migrated pages without being rewritten.
5. No server, schema, API, route, form-contract, or business-flow changes are introduced.
6. Existing behavior tests available in the execution environment pass for the changed scope.
7. `verify-ui-system-migration.js` passes and reports no selector-contract violations.

## Non-Goals for a Later Phase

This work intentionally does not redesign the Main dashboard content, simplify Accounting workflows, restructure Event creation/detail flows, or redesign Settings permissions. Those would be separate product-design changes requiring their own specification.
