# Frontend App Shell Design

Date: 2026-08-20
Status: Proposed for implementation
Branch: `design/frontend-app-shell`

## 1. Goal

Standardize the authenticated application shell before broader frontend cleanup. The first phase changes layout behavior only and keeps existing domain page visuals and business interactions as stable as possible.

Approved user feedback:
- keep the header visible while working
- keep the sidebar visible while working
- remove the footer/status bar
- allow users to completely hide and restore the sidebar

## 2. Scope

This phase owns only the global application shell shared by authenticated pages.

Primary shared files:
- `src/100_common/App_Header.html`
- `src/100_common/App_Sidebar.html`
- `src/100_common/App_Styles.html`
- `src/100_common/app_shell_js.html`

Page templates that include the global shell may need minimal markup normalization so they all conform to the same shell contract. Existing domain-specific UI files under `250_main`, `300_settings`, `400_accounting`, `500_student_fee`, and `600_event` should not be visually redesigned in this phase.

The existing footer/status-bar markup, including the footer currently present in `src/250_main/Main.html`, is removed from application pages. Related unused `.status-bar` styling is removed when no longer referenced.

## 3. Chosen Layout Architecture

Use a viewport-sized CSS Grid app shell rather than independent fixed-position elements.

Conceptual structure:

```text
.app (100vh grid)
├─ header
└─ .body (minmax(0, 1fr))
   ├─ sidebar
   └─ main
```

The shell uses two rows:
- row 1: fixed-height header
- row 2: remaining viewport height

The body uses two columns:
- sidebar width
- remaining content width

The app root prevents document-level scrolling. The main content area owns vertical scrolling. The sidebar may independently scroll vertically if its navigation becomes taller than the available viewport.

This gives the required "fixed" behavior without manual `margin-top` / `margin-left` compensation.

## 4. Shell CSS Contract

The global stylesheet defines shell-level variables for header height and sidebar width.

Required behavior:
- `html`, `body`, and the app root fill the viewport.
- `.app` uses `height: 100vh` and grid rows for header + body.
- `.body` uses `min-height: 0`, grid columns, and `overflow: hidden`.
- `.main` uses `min-width: 0`, `min-height: 0`, and `overflow: auto`.
- `.sidebar` uses `min-height: 0` and `overflow-y: auto`.
- document/body scrolling must not compete with main-content scrolling.

No page should need to calculate its own header or sidebar offset.

## 5. Sidebar Visibility Behavior

The sidebar supports two states only:
- visible at the normal sidebar width
- completely hidden at zero width

A narrow icon-only sidebar mode is explicitly out of scope.

The app root receives a shell state class, e.g. `sidebar-hidden`, when hidden. The body grid column changes from the normal sidebar width to zero. The main content automatically expands into the freed space.

The sidebar toggle remains available in the header in both states so the user can always restore the sidebar.

### Toggle accessibility

The toggle is a real `<button>` with:
- a stable ID owned by the global shell
- `aria-controls` pointing to the sidebar
- `aria-expanded="true|false"` synchronized with current visibility
- an accessible Korean label that changes between opening and hiding the navigation

The existing sidebar receives a stable ID for this relationship.

## 6. Persistence

Sidebar visibility is a client preference and must not involve server state or OperationDB.

Use `localStorage` with a namespaced key dedicated to the app shell. The exact stored representation is private to `app_shell_js.html`.

Initialization order:
1. read the saved sidebar preference as early as the shared shell script can safely do so
2. apply the corresponding app-root class
3. synchronize toggle ARIA state
4. on toggle, update both DOM state and `localStorage`

If `localStorage` is unavailable or contains an invalid value, default to sidebar visible. Storage failures must not break navigation or page rendering.

The saved choice applies across Main, Settings, Accounting, Student Fee, Event, and other authenticated pages using the shared shell.

## 7. Header Behavior

The existing header remains the single global header component. A sidebar toggle button is added near the left side of the header, before or adjacent to the product brand.

Existing header functions remain intact:
- brand display
- search placeholder
- academic term selector
- notifications control
- user card / My Page navigation

This phase does not redesign those controls.

## 8. Footer Removal

The footer/status bar is removed rather than hidden with CSS.

Requirements:
- no authenticated application template should render the legacy `status-bar` footer
- global `.status-bar` styles are removed when no remaining runtime reference exists
- viewport calculations must not reserve a footer row or footer height

The footer information (system version, DB connection wording, academic year) is not relocated in this phase. If that information is required later, it should be designed as a separate feature rather than retained as dead layout chrome.

## 9. Page Compatibility

Authenticated page templates should follow the same structural contract:

```html
<body class="app-mode">
  <div class="app ...">
    <!-- App_Header -->
    <div class="body">
      <!-- App_Sidebar -->
      <main class="main">...</main>
    </div>
  </div>
  <!-- app_shell_js -->
</body>
```

Domain-specific classes may remain on `.app`, `.body`, or `.main` when required, but they must not override the shell's viewport ownership in a way that restores document scrolling or changes header/sidebar positioning.

Page-specific styles should continue to style content inside `.main`; they should not own global shell geometry.

## 10. Responsive Behavior

This first phase does not introduce a new mobile navigation design. The same complete hide/show mechanism remains available at narrow widths.

Existing responsive rules may continue to adapt content, but the app-shell invariants remain:
- header remains visible
- main owns content scrolling
- toggle remains reachable
- hidden sidebar gives the full body width to main

If existing responsive CSS conflicts with these invariants, only the conflicting shell rule is normalized; broader mobile redesign is out of scope.

## 11. JavaScript Ownership

`src/100_common/app_shell_js.html` owns all sidebar visibility behavior.

It should expose small internal functions for:
- reading the stored preference
- applying sidebar visibility
- toggling visibility
- synchronizing ARIA state

Domain page scripts must not independently hide/show the global sidebar.

Existing responsibilities in `app_shell_js.html` remain, including current-user binding, navigation links, navigation access, active navigation state, and Student Fee submenu behavior.

## 12. Error Handling

Shell behavior must fail open:
- missing/invalid persisted preference => sidebar visible
- `localStorage.getItem` failure => sidebar visible
- `localStorage.setItem` failure => current in-memory toggle still works
- missing toggle/sidebar element in a nonstandard page => shell initialization exits safely rather than throwing and breaking the page

Server API failures for navigation access remain independent of sidebar visibility.

## 13. Testing Strategy

Add a focused frontend shell contract test that reads the shared HTML/CSS/JS and verifies architectural invariants without requiring a browser runtime.

At minimum verify:
- header contains the global sidebar toggle
- sidebar has the ID referenced by the toggle
- app-shell JS contains persistent sidebar state handling
- app-shell JS synchronizes `aria-expanded`
- global shell CSS defines viewport-height grid behavior
- `.main` owns scrolling
- sidebar has independent overflow support
- hidden-sidebar shell state collapses the sidebar column
- known authenticated templates do not render `status-bar` footer markup
- no active global `.status-bar` dependency remains after removal

Existing Node regression, public/internal naming, and domain architecture tests must remain green.

Where practical, add a small JS behavior harness with a fake DOM/localStorage to verify:
- default visible state
- saved hidden state restoration
- toggle visible -> hidden -> visible
- storage failure does not throw

## 14. Non-goals

This phase does not include:
- redesigning Accounting, Student Fee, Event, Main, or Settings screens
- creating a full component library/design system
- changing backend APIs or domain contracts
- changing permissions/navigation authorization rules
- adding new footer replacement UI
- icon-only collapsed sidebar
- mobile drawer/overlay navigation redesign
- server-side storage of UI preferences

## 15. Acceptance Criteria

1. Header remains visible while the user scrolls page content.
2. Sidebar remains visible while the user scrolls main content.
3. Main content is the primary page-scroll container.
4. A global header button can completely hide and restore the sidebar.
5. Hidden sidebar space is immediately reclaimed by main content.
6. Sidebar visibility persists across page navigation using client-side storage.
7. Storage errors do not prevent the sidebar toggle from functioning in the current page.
8. The legacy footer/status bar is not rendered on authenticated application pages.
9. Domain-specific page design and business behavior remain otherwise unchanged.
10. Shared-shell and existing repository regression tests are green before merge.

## 16. Follow-up Work

After this shell phase is complete, the next frontend cleanup can audit:
- repeated page-level table/filter/modal patterns
- shared API-call/loading/error utilities
- duplication between global `100_common` and domain `common` folders
- design-token and component consistency

Those items are intentionally separate so shell behavior can stabilize before deeper UI refactoring.
