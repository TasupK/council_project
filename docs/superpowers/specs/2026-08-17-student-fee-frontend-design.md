# Student Fee Frontend Design

## 1. Goal and phase boundary

Port the Student Fee frontend from `feature/student-fee-management` into the current application shell, and use its visual language as the basis of a reusable shared design system.

This phase includes:

- shared design tokens and UI primitives in `100_common`
- four Student Fee routes and expandable sidebar navigation
- summary, payer, payment, and refund screens
- modal-centered operational flows
- one minimal read-only Student Fee reference API for semester options
- frontend regression tests and architecture verification

This phase does **not** visually migrate Main, Accounting, Event, or Settings. Their business behavior and current page structure remain unchanged; visual migration is phase 3.

Persistent data remains governed by the current `020_schema`. No DB fields are added.

## 2. Non-goals and constraints

Do not add or reintroduce:

- Google Form integration
- export
- archive
- feature-only fields such as `유형`, `적용종료학기`, or `보관여부`
- `apiV1_*`, `API_REGISTRY`, or `callApi_`
- client-controlled authorization such as `hasFullAccess`
- new IAM permission IDs
- a frontend framework or generic component runtime
- a copied standalone topbar/sidebar/shell from the feature branch

The frontend continues to use Apps Script HTML templates and `google.script.run`.

## 3. Design direction

The Student Fee feature branch becomes the visual reference for the application going forward:

- soft neutral background
- white cards
- 8-10px rounded surfaces
- compact controls/tables
- semantic soft status colors
- summary cards
- contextual bulk-action bars
- modal-centered workflows
- lightweight toast feedback

The feature's standalone shell is discarded. Student Fee renders inside the current `100_common` header/sidebar shell.

Design-system layering:

```text
100_common
  reusable tokens + UI primitives
        ↓
500_student_fee/common
  Student Fee-specific composition/layout
        ↓
Student Fee pages
```

Reuse is primarily semantic HTML classes plus small JS helpers. Do not build a large JS component abstraction.

## 4. Target file structure

```text
src/
├─ 100_common/
│  ├─ App_Styles.html
│  ├─ App_Sidebar.html
│  └─ app_shell_js.html
│
├─ 000_server/080_student_fee/080_common/
│  └─ student_fee_reference_api.gs
│
└─ 500_student_fee/
   ├─ common/
   │  ├─ Student_Fee_Styles.html
   │  └─ student_fee_common_js.html
   ├─ 500_home/
   │  ├─ Student_Fee_Home.html
   │  ├─ Student_Fee_Home_View.html
   │  └─ student_fee_home_js.html
   ├─ 510_payers/
   │  ├─ Student_Fee_Payers.html
   │  ├─ Student_Fee_Payers_View.html
   │  └─ student_fee_payers_js.html
   ├─ 520_payments/
   │  ├─ Student_Fee_Payments.html
   │  ├─ Student_Fee_Payments_View.html
   │  └─ student_fee_payments_js.html
   └─ 530_refunds/
      ├─ Student_Fee_Refunds.html
      ├─ Student_Fee_Refunds_View.html
      └─ student_fee_refunds_js.html
```

No `084_forms` or additional Student Fee frontend feature directory is introduced.

## 5. Routes and authentication

Add exactly these routes to `src/000_server/Code.js`:

```text
student_fee          -> 500_student_fee/500_home/Student_Fee_Home
student_fee_payers   -> 500_student_fee/510_payers/Student_Fee_Payers
student_fee_payments -> 500_student_fee/520_payments/Student_Fee_Payments
student_fee_refunds  -> 500_student_fee/530_refunds/Student_Fee_Refunds
```

All `student_fee*` routes are login-protected using the existing page-prefix authentication pattern.

No new route is added for detail screens; operational details are modal-centered.

## 6. Sidebar behavior

`학생회비관리` becomes an expandable navigation group:

```text
학생회비관리 ▼
  전체 현황
  가입자 조회
  납부 관리
  환불 관리
```

Rules:

- expanded by default on any `student_fee*` route
- submenu items use real Apps Script routes, not client-side tabs
- current submenu item is visibly active
- parent group is visibly active on all Student Fee routes
- existing Main/Accounting/Event/Settings navigation remains available according to current rules
- URL construction and active-state logic stay in `app_shell_js.html`

## 7. Shared design-system additions

`100_common/App_Styles.html` remains the shared source of reusable visual primitives.

### Tokens

Normalize/add tokens for:

- page background
- surface/card background
- text hierarchy and muted text
- border colors
- primary/hover colors
- semantic success/warning/danger/info colors
- radius scale
- shadow scale
- spacing scale

The new token values should move the application toward the softer Student Fee visual language while remaining backward compatible with existing class usage.

### Shared primitives

Provide reusable styles for:

- page header/title/description
- card
- stat card
- button variants
- form field/control
- toolbar/filter row
- data table
- status badge
- bulk action bar
- pagination
- modal overlay/dialog
- empty state
- loading state
- toast

Existing pages are not rewritten to these primitives in this phase. Shared-style changes must not break their current classes.

## 8. Student Fee common frontend layer

`Student_Fee_Styles.html` contains only domain-specific composition, for example:

- summary-grid layout
- Student Fee table column sizing
- evidence-information layout
- modal field grouping

`student_fee_common_js.html` contains only shared presentation helpers:

- Student Fee API wrapper around `google.script.run`
- error normalization
- toast
- modal open/close
- HTML escaping
- date formatting
- currency formatting
- badge rendering
- pagination rendering
- confirmation helper
- busy/loading helper

It must not contain payer/payment/refund business rules.

## 9. Minimal Student Fee reference API

The payer create/update modal requires a valid `startSemesterId` foreign key to `semesters`. The current Student Fee server has internal semester lookup helpers but no public API that can populate a selector.

Add one read-only endpoint:

```text
api_getStudentFeeReferenceData
```

Location:

```text
080_student_fee/080_common/student_fee_reference_api.gs
```

Contract:

```js
{
  semesters: [
    {
      id: 'semester-id',
      year: 2026,
      type: '1학기',
      startDate: '2026-03-01',
      endDate: '2026-06-30',
      active: true,
      label: '2026학년도 1학기'
    }
  ]
}
```

Rules:

- `requireLogin: true`
- read-only
- reads only the existing `semesters` table through Student Fee reference-query functions/Core primitives
- does not add schema fields
- returns deterministic semester ordering, newest year/semester first
- UI normally presents active semesters; an existing payer's inactive referenced semester may still be shown while editing so current data remains representable

This is the only Student Fee server API addition in the frontend phase. It exists solely to expose current-schema reference data required by the UI.

## 10. Summary page

Route: `student_fee`

API:

```text
api_getStudentFeeSummary
```

Read-only grouped cards:

- payer total
- application total / 접수 / 승인 / 반려
- payment total / 대기 / 완료 / 불일치 / 완료금액
- refund-request total / 접수 / 승인 / 반려
- refund total / 대기 / 완료 / 실패 / 완료금액

Relevant cards link to the matching Student Fee route.

## 11. Payer page

Route: `student_fee_payers`

APIs:

```text
api_getStudentFeeReferenceData
api_getFeePayerList
api_getFeePayerDetail
api_createFeePayer
api_updateFeePayer
```

### List

Provide:

- student ID/name keyword search
- affiliation text filter
- pagination
- total count
- payer table
- new payer button
- row edit action

Use the server-provided masked student ID in list rows.

### Create modal

Fields:

```text
학번
성명
소속
적용 시작 학기
```

`적용 시작 학기` is a select populated from `api_getStudentFeeReferenceData`, never a free-form semester ID field.

### Update modal

Editable:

```text
성명
소속
적용 시작 학기
```

Student ID is immutable.

On success: close modal, show toast, reload list.

## 12. Payment page

Route: `student_fee_payments`

APIs:

```text
api_getFeeApplicationList
api_getFeeApplicationDetail
api_processFeeApplications
api_calculateFeeAmount
api_confirmFeePayment
```

### List

Provide keyword search, application-status filter, pagination, checkboxes, conditional bulk-action bar, and detail action.

### Approval/rejection

Single and bulk processing are supported.

Before approval, call `api_calculateFeeAmount` for the relevant payment date and display the server-calculated amount. If calculation fails, approval does not proceed.

### Detail modal

Show current-schema data only:

- applicant information
- application status
- payment date
- server-derived amount
- student-card evidence file ID
- deposit evidence file ID
- associated payment status/data when present

For `접수`, expose approve/reject actions.

### Receipt-confirmation modal

Only for associated payment status `대기`.

Inputs/actions:

```text
입금자명
완료
불일치
```

After success, refresh detail/list state.

## 13. Refund page

Route: `student_fee_refunds`

APIs:

```text
api_getFeeRefundRequestList
api_getFeeRefundRequestDetail
api_processFeeRefundRequests
api_calculateFeeRefund
api_confirmFeeRefund
```

### List

Provide keyword search, request-status filter, pagination, checkboxes, conditional bulk-action bar, and detail action.

List views use server-masked student IDs/account numbers.

### Detail modal

Show:

- student ID
- bank/account/account holder as returned by the authenticated server detail contract
- reason
- related payment ID
- request status
- evidence file IDs
- calculated payment amount
- maximum refundable amount
- existing refund row when present

Never send or interpret `hasFullAccess`.

### Approval

Call `api_calculateFeeRefund` before approval.

The modal shows maximum refundable amount and allows an explicit approved amount for single-request approval. Client validation rejects `<= 0` or values above the fresh maximum; server validation remains authoritative.

For multi-select approval, do not send one shared explicit `approvedAmount`. Approve selected requests using each request's server-derived maximum by omitting the shared amount, matching the current server contract.

### Transfer-confirmation modal

Only for refund status `대기`.

Inputs/actions:

```text
송금일
송금 증빙 파일 ID
완료
실패
```

## 14. Modal and mutation interaction rules

Operational actions use modals rather than new routes.

Common flow:

```text
local validation
  -> confirmation for financial/destructive action
  -> set busy / disable mutation controls
  -> server call
  -> success: toast + close/refresh
  -> failure: keep modal open + restore controls + error toast
```

Rules:

- prevent double submission
- stale-state server errors are surfaced, not coerced
- refresh list/detail after mutation
- preserve operator input on recoverable failures
- server remains final authority for state transitions, duplicate prevention, rates, payment amounts, refund calculations, actor identity, and authorization

## 15. Bulk-action rules

Bulk bars remain hidden until rows are selected.

Payment applications:

- approve
- reject

Refund requests:

- approve using each server-derived maximum
- reject

Payment receipt confirmation and refund transfer confirmation are never bulk actions; they remain transaction-specific detail-modal actions.

## 16. Error/loading/empty states

Every Student Fee page has explicit loading and empty states.

List-load failures keep the application shell visible and replace the data region with an error state instead of leaving stale loading UI.

Mutation failures keep the modal open unless a server response makes reloading necessary.

Financial mutations require confirmation before execution.

## 17. Data and authorization boundary

Allowed client logic:

- required-field checks
- formatting
- enable/disable decisions
- simple validation against fresh server-calculated limits

Server-owned logic:

- state transitions
- duplicate prevention
- fee-rate resolution
- payment amount calculation
- refundable amount calculation
- maximum refund validation
- authenticated actor
- authorization

Frontend code never accesses Sheets/Drive directly.

## 18. Verification

Add:

```text
scripts/test-student-fee-frontend.js
scripts/verify-student-fee-frontend.js
```

The behavior harness evaluates meaningful page/common JS with lightweight DOM/API stubs where practical.

The frontend verifier checks at minimum:

- four Student Fee templates/routes exist
- all `student_fee*` routes are login protected
- sidebar submenu routes and active-state behavior are correct
- all Student Fee page shells include `100_common/App_Styles`, `App_Header`, and `App_Sidebar`
- Student Fee common styles/JS are included
- only approved Student Fee `api_*` calls are used, including `api_getStudentFeeReferenceData`
- no `apiV1_*`
- no `hasFullAccess`
- no copied standalone feature shell/topbar/sidebar
- no feature-only UI fields (`유형`, `적용종료학기`, `보관여부`)
- payer semester selector is populated through the reference API
- mutation UIs implement busy/double-submit protection
- payer/payment/refund operational flows are modal-centered
- payment/refund screens contain bulk-selection/action structure

Update existing server architecture verification for:

- the four new routes/templates
- the new public `api_getStudentFeeReferenceData`

## 19. Phase 3 boundary

This phase establishes the shared visual system but fully applies it only to Student Fee.

Main, Accounting, Event, and Settings remain visually unchanged apart from backward-compatible shared-style additions needed to preserve current behavior.

Phase 3 migrates those screens to the Student Fee-derived shared design system without changing business logic.

## 20. Definition of done

Complete when:

- all four Student Fee routes render in the current shell
- expandable Student Fee navigation and active states work
- summary cards load and route correctly
- payer create/update works through modals with a server-backed semester selector
- payment approve/reject and receipt confirmation work through modals
- refund approve/reject and transfer confirmation work through modals
- search/filter/pagination and specified bulk actions work
- shared card/table/badge/modal/toast/loading primitives exist in `100_common`
- no current-schema violation or feature-only persistence concept is introduced
- no standalone feature shell or legacy API contract is reintroduced
- Student Fee frontend tests/verifier pass
- Student Fee server regression verification remains green after the reference API addition
- existing page classes remain backward compatible
