# Student Fee Frontend Design

## 1. Goal

Port the approved Student Fee frontend from `feature/student-fee-management` into the current application shell while making the Student Fee visual language the basis for a reusable shared design system.

This phase delivers only:

- shared design tokens and UI primitives in `100_common`
- Student Fee navigation and four frontend routes
- Student Fee summary, payer, payment, and refund screens
- modal-centered mutations
- frontend regression tests and architecture verification

Existing Main, Accounting, Event, and Settings screens are not visually migrated in this phase. Their migration is a separate next phase.

## 2. Base and constraints

Implementation is based on `refactor/student-fee-server`, which already exposes the approved Student Fee server APIs.

Persistent data remains governed by the current `020_schema`.

This phase MUST NOT:

- add DB fields
- change Student Fee server business semantics
- add Google Form integration
- add export or archive behavior
- add `apiV1_*` compatibility wrappers
- add client-controlled authorization such as `hasFullAccess`
- redesign the IAM permission model
- redesign existing Main/Accounting/Event/Settings pages
- introduce a frontend framework or generic component system

The frontend uses the current Apps Script HTML-template architecture and `google.script.run` integration pattern.

## 3. Design direction

The Student Fee feature branch is the visual reference for this application going forward.

Its useful characteristics are retained:

- soft neutral page background
- white cards
- 8-10px rounded surfaces
- compact controls and tables
- status-specific soft colors
- summary/stat cards
- clear bulk-action states
- modal-centered operational flows
- lightweight toast feedback

However, the standalone feature shell is not copied. Student Fee is rendered inside the current `100_common` application shell.

The design-system strategy is:

```text
100_common
  shared visual tokens and primitives
        ↓
500_student_fee/common
  Student Fee-specific composition/layout
        ↓
Student Fee pages
```

Do not create a large JavaScript UI-component framework. Reuse is expressed primarily through semantic HTML classes and small common helpers.

## 4. Frontend file structure

```text
src/
├─ 100_common/
│  ├─ App_Styles.html
│  ├─ App_Sidebar.html
│  └─ app_shell_js.html
│
└─ 500_student_fee/
   ├─ common/
   │  ├─ Student_Fee_Styles.html
   │  └─ student_fee_common_js.html
   │
   ├─ 500_home/
   │  ├─ Student_Fee_Home.html
   │  ├─ Student_Fee_Home_View.html
   │  └─ student_fee_home_js.html
   │
   ├─ 510_payers/
   │  ├─ Student_Fee_Payers.html
   │  ├─ Student_Fee_Payers_View.html
   │  └─ student_fee_payers_js.html
   │
   ├─ 520_payments/
   │  ├─ Student_Fee_Payments.html
   │  ├─ Student_Fee_Payments_View.html
   │  └─ student_fee_payments_js.html
   │
   └─ 530_refunds/
      ├─ Student_Fee_Refunds.html
      ├─ Student_Fee_Refunds_View.html
      └─ student_fee_refunds_js.html
```

No other Student Fee frontend directories are added in this phase.

## 5. Routes and authentication

Add exactly these routes to `src/000_server/Code.js`:

```text
student_fee          -> 500_student_fee/500_home/Student_Fee_Home
student_fee_payers   -> 500_student_fee/510_payers/Student_Fee_Payers
student_fee_payments -> 500_student_fee/520_payments/Student_Fee_Payments
student_fee_refunds  -> 500_student_fee/530_refunds/Student_Fee_Refunds
```

The existing login-protection rule must treat every route whose page starts with `student_fee` as authenticated application content.

No new permission ID is introduced in this frontend phase.

## 6. Sidebar behavior

`학생회비관리` becomes an expandable navigation group.

```text
학생회비관리 ▼
  전체 현황
  가입자 조회
  납부 관리
  환불 관리
```

Rules:

- the submenu is expanded by default on any `student_fee*` route
- each submenu item is a real Apps Script page route, not a client-side tab
- the current submenu item is visibly active
- the parent group is visibly active while any Student Fee route is open
- the sidebar continues to expose Main, Accounting, Event, and Settings according to current behavior

The shell JS owns URL construction and active-navigation state. Student Fee page JS must not duplicate application navigation logic.

## 7. Shared design-system additions

`100_common/App_Styles.html` becomes the source of reusable UI primitives that future pages can adopt.

### Tokens

Add or normalize tokens for:

- page background
- surface/card background
- text hierarchy
- muted text
- border colors
- primary action color
- hover state
- semantic status colors
- radius scale
- shadows
- spacing

The resulting visual language should be closer to the Student Fee feature branch than to the current sharper enterprise styling.

### Shared primitives

The common layer should support semantic classes for:

- page header/title/description
- card
- stat card
- button variants
- form fields
- toolbar/filter row
- data table
- status badge
- bulk action bar
- pagination
- modal overlay/dialog
- empty state
- loading state
- toast

Existing class behavior used by current pages must remain functional. This phase extends and normalizes `App_Styles`; it does not force existing pages to migrate to the new primitives.

## 8. Student Fee common frontend layer

`500_student_fee/common/Student_Fee_Styles.html` contains only Student Fee-specific layout/composition rules that are not generally reusable.

Examples:

- Student Fee dashboard grid composition
- payer/payment/refund table column sizing
- evidence-information layout
- Student Fee modal-specific field grouping

`student_fee_common_js.html` contains small shared frontend helpers only:

- Student Fee server API invocation wrapper
- error normalization
- toast display
- modal open/close
- HTML escaping
- date display formatting
- currency formatting
- badge rendering
- pagination rendering
- confirm helper
- loading/busy state helper

It must not contain payer/payment/refund business rules.

## 9. Home / summary page

Route: `student_fee`

Server API:

```text
api_getStudentFeeSummary
```

The page is read-only.

Show grouped summary cards for:

### Payers

- total payers

### Applications

- total
- pending (`접수`)
- approved (`승인`)
- rejected (`반려`)

### Payments

- total
- pending (`대기`)
- completed (`완료`)
- mismatch (`불일치`)
- completed amount

### Refund requests

- total
- pending (`접수`)
- approved (`승인`)
- rejected (`반려`)

### Refunds

- total
- pending (`대기`)
- completed (`완료`)
- failed (`실패`)
- completed amount

Relevant cards may link to their corresponding Student Fee route.

## 10. Payer page

Route: `student_fee_payers`

Server APIs:

```text
api_getFeePayerList
api_getFeePayerDetail
api_createFeePayer
api_updateFeePayer
```

### List

Provide:

- keyword search for student ID/name
- affiliation filter
- pagination
- total count
- payer table
- new payer button
- edit action per row

The list uses the server-provided masked student ID.

### Create modal

Fields are limited to current-schema data:

```text
학번
성명
소속
적용 시작 학기
```

Do not expose feature-only concepts such as `유형`, `적용종료학기`, or archive state.

### Update modal

Editable:

```text
성명
소속
적용 시작 학기
```

Student ID is immutable in the UI, matching the server contract.

After a successful mutation:

1. close modal
2. show success toast
3. reload the payer list

## 11. Payment page

Route: `student_fee_payments`

Server APIs:

```text
api_getFeeApplicationList
api_getFeeApplicationDetail
api_processFeeApplications
api_calculateFeeAmount
api_confirmFeePayment
```

### List

Provide:

- keyword search
- application-status filter
- pagination
- checkboxes
- bulk action bar shown only when rows are selected
- detail action

List rows display current-schema application data and joined payment state returned by the server.

### Approval / rejection

Both single-row and bulk application processing are supported.

Before approval, the UI calls `api_calculateFeeAmount` using the relevant payment date and displays the server-calculated amount.

If amount calculation fails, approval must not proceed.

Financial/business validation remains server-authoritative.

### Application detail modal

Show:

- applicant information
- application status
- payment date
- server-derived amount
- student-card evidence file ID
- deposit evidence file ID
- existing payment status when present

For `접수` applications, expose approve/reject actions.

### Payment confirmation modal

Only shown when an associated payment is in `대기`.

Inputs/actions:

- depositor name
- `완료`
- `불일치`

After mutation, close the confirmation modal and refresh the underlying detail/list state.

## 12. Refund page

Route: `student_fee_refunds`

Server APIs:

```text
api_getFeeRefundRequestList
api_getFeeRefundRequestDetail
api_processFeeRefundRequests
api_calculateFeeRefund
api_confirmFeeRefund
```

### List

Provide:

- keyword search
- request-status filter
- pagination
- checkboxes
- bulk action bar
- detail action

Use server-masked student IDs/account numbers in list views.

### Refund detail modal

Show:

- student ID
- bank
- masked/unmasked detail data as returned by the authenticated server contract
- account holder
- reason
- related payment ID
- request status
- evidence file IDs
- calculated payment amount
- calculated maximum refundable amount
- existing refund row when present

The UI must never send or interpret a `hasFullAccess` flag.

### Refund approval

Before approval, call `api_calculateFeeRefund`.

The approval modal shows the maximum refundable amount and accepts an approved amount.

Client-side validation prevents values less than or equal to zero or greater than the current calculated maximum, but the server remains authoritative and recalculates on mutation.

For multi-select approval, do not provide one shared explicit approved amount across multiple requests. Either approve each at its server-calculated maximum or require per-row processing; this must match the server contract that rejects a shared explicit amount for multiple IDs.

### Refund confirmation modal

Only shown when the associated refund is in `대기`.

Inputs/actions:

- transfer date
- transfer evidence file ID
- `완료`
- `실패`

## 13. Modal and mutation interaction rules

Operational actions are modal-centered rather than separate detail routes.

Common mutation sequence:

```text
user action
  -> local field validation
  -> confirmation for financial/destructive action
  -> mark modal/action busy
  -> call server
  -> server validates current state and mutates
  -> success: toast + close/refresh
  -> failure: keep modal open + restore controls + error toast
```

Rules:

- mutation buttons are disabled while a request is in flight
- double submission is prevented
- stale-state errors from the server are surfaced rather than silently coerced
- list/detail data is refreshed after mutation
- server errors remain visible enough for an operator to understand why an operation failed

## 14. Bulk action rules

Bulk action bars are hidden until one or more rows are selected.

Payment application bulk processing supports:

- approve
- reject

Refund request bulk processing supports:

- approve using each request's server-derived maximum
- reject

Do not add bulk confirmation of payment receipt or refund transfer; those are transaction-specific confirmation actions handled from detail modals.

## 15. Data and authorization boundaries

Frontend code does not reproduce domain calculations as authoritative logic.

Allowed client logic:

- input presence checks
- formatting
- UI enable/disable decisions
- simple max/min validation using fresh server results

Server-owned logic:

- application/refund state transitions
- duplicate prevention
- fee-rate resolution
- payment amount calculation
- refundable amount calculation
- maximum refund validation
- authenticated actor identity
- authorization

The frontend must not call Sheets/Drive APIs directly.

## 16. Error, loading, and empty states

Every page has explicit loading and empty states.

API failures use the shared error handler and toast presentation.

Financial mutations use confirmation dialogs before execution.

If a list request fails, keep the page shell rendered and replace the data region with an actionable error state rather than leaving stale loading UI.

If a mutation fails, keep the modal open and preserve operator input unless the server result proves that reloading is necessary.

## 17. Frontend verification

Add:

```text
scripts/test-student-fee-frontend.js
scripts/verify-student-fee-frontend.js
```

The frontend regression harness should verify meaningful behavior by evaluating relevant page/common JavaScript with a lightweight DOM/API stub where practical.

The architecture verifier must check at minimum:

- four Student Fee route templates exist
- four route mappings exist in `Code.js`
- `student_fee*` routes are login protected
- Student Fee submenu links point to the correct routes
- Student Fee parent/submenu active-navigation logic exists
- all four page shells include `100_common/App_Styles`
- all four page shells include `App_Header` and `App_Sidebar`
- Student Fee common styles/JS are included
- page JS only calls approved Student Fee `api_*` functions
- no `apiV1_*`
- no `hasFullAccess`
- no standalone copied shell/topbar/sidebar from the source feature
- no UI fields for `유형`, `적용종료학기`, or `보관여부`
- mutation UIs implement busy/double-submit protection
- payer/payment/refund operational flows use modals
- payment/refund list screens contain bulk-selection/action structure

Update `scripts/verify-server-architecture.js` for the four new routes/templates only as required by the current repository verifier contract.

## 18. Scope boundary with phase 3

This phase establishes the shared visual system but applies it fully only to Student Fee.

The following pages remain visually unchanged beyond any backward-compatible shared-style additions required not to break them:

- Main
- Accounting
- Event
- Settings

A separate phase 3 will migrate those screens to the Student Fee-derived shared design system without changing their business behavior.

## 19. Definition of done

This frontend phase is complete when:

- all four Student Fee routes render within the current app shell
- Student Fee submenu navigation works and shows correct active state
- summary data loads from the server API
- payer create/update works through modals
- payment approve/reject and receipt confirmation work through modals
- refund approve/reject and transfer confirmation work through modals
- search/filter/pagination and bulk actions work as specified
- common cards/tables/badges/modals/toast/loading primitives are available from `100_common`
- no current-schema violations are introduced
- no feature-branch standalone shell or legacy API contract is reintroduced
- Student Fee frontend tests and architecture verifier pass
- existing page classes remain backward compatible
