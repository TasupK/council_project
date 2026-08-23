# UI System Consolidation Design

## Status

- Date: 2026-08-23
- Base: current `main`
- Design branch: `design/ui-system-refactor`
- Supersedes: `docs/superpowers/specs/2026-08-17-ui-system-migration-design.md`

## Goal

학생회비 화면에서 정착한 차분한 관리자 시스템 톤을 기준으로 전체 프론트엔드의 UI 구조를 하나의 공통 시스템으로 정리한다.

이번 작업의 목적은 새로운 제품 경험을 만드는 것이 아니라, 이미 구현된 기능과 정보 구조를 유지하면서 다음 문제를 해소하는 것이다.

1. 공통 스타일 안에 신형 App shell과 구형 `.shell/.top/.side/.page` 체계가 동시에 남아 있는 문제
2. `--bg/--primary/...`와 `--ui-*` 토큰이 병존하는 문제
3. Accounting/Event가 버튼, 카드, 배지, 테이블, 폼 등 공통 시각 요소를 자체 CSS에서 다시 구현하는 문제
4. 화면마다 간격, radius, font size, toolbar, page header, empty/loading/error 표현이 조금씩 다른 문제
5. 신규 화면 추가 시 어떤 스타일 계층을 사용해야 하는지 불명확한 문제

완료 후에는 `100_common`이 공통 시각 시스템의 단일 기준이 되고, 각 도메인 stylesheet는 업무 특화 레이아웃만 담당해야 한다.

## Non-goals

이번 단계에서는 다음을 하지 않는다.

- 서버/API/schema 변경
- 업무 흐름 변경
- 메뉴/라우트 재설계
- 테이블 컬럼 의미 변경
- 폼 필드 의미 변경
- JavaScript 프레임워크 도입
- 모든 도메인 stylesheet 삭제
- 시각적 브랜드를 전면 교체
- 모바일 우선 제품으로 재설계

필요한 경우 접근성이나 반응형 문제는 공통 primitive 수준에서 개선하되, 업무 흐름 재설계와 결합하지 않는다.

## Visual Direction

현재 Student Fee 계열의 시각적 방향을 기준으로 유지한다.

- 밝은 회색 배경 + 흰 surface
- 강한 장식보다 정보 밀도와 가독성 우선
- 짙은 slate/navy 계열 primary
- status는 semantic color로만 사용
- border와 spacing으로 구조를 표현하고 shadow는 최소화
- radius는 작고 일관되게 유지
- 관리자 업무 화면답게 table/form 중심의 높은 정보 밀도 유지

즉 이번 작업은 "새 디자인"보다 "하나의 디자인"을 만드는 작업이다.

## Target Architecture

UI 계층을 다음 네 단계로 구분한다.

```text
Foundation
  -> Components
    -> Patterns
      -> Domain layout
```

### 1. Foundation

공통 token과 reset을 소유한다.

대상:

- color
- typography
- spacing
- radius
- shadow
- border
- control height
- layout width
- breakpoint
- z-index

최종적으로 semantic `--ui-*` token만 공용 API로 사용한다.

기존 `--bg`, `--surface`, `--border`, `--primary`, `--radius` 등 legacy token은 마이그레이션 중 compatibility alias로만 허용하고, 전체 마이그레이션 완료 후 제거한다.

예시:

```css
--ui-bg
--ui-surface
--ui-border
--ui-border-strong
--ui-text
--ui-muted
--ui-primary
--ui-primary-hover
--ui-success-bg
--ui-success-fg
--ui-warning-bg
--ui-warning-fg
--ui-danger-bg
--ui-danger-fg
--ui-space-1 ... --ui-space-8
--ui-radius-sm
--ui-radius-md
--ui-radius-lg
```

## 2. Components

업무 도메인과 무관한 시각 컴포넌트는 `100_common`이 소유한다.

필수 공통 primitive:

- `ui-btn`
  - primary
  - secondary
  - ghost
  - danger
  - small / large
- `ui-field`
  - input
  - select
  - textarea
  - disabled / invalid
- `ui-card`
- `ui-stat-card`
- `ui-badge`
  - neutral
  - info
  - success
  - warning
  - danger
- `ui-table-wrap`
- `ui-table`
- `ui-modal`
- `ui-tabs`
- `ui-pagination`
- `ui-toast`
- `ui-empty-state`
- `ui-loading-state`
- `ui-error-state`
- `ui-divider`

Domain prefix가 붙은 generic visual component는 단계적으로 제거한다.

예:

```text
Accounting .small/.badge        -> ui-btn/ui-badge
Event .ew-btn/.ew-card/.ew-status -> ui-btn/ui-card/ui-badge
```

단, JavaScript selector 역할까지 하는 legacy class는 동작 계약을 깨지 않도록 compatibility hook으로 남길 수 있다.

## 3. Patterns

반복되는 업무 화면 조합도 공통 패턴으로 정의한다.

### Page pattern

```text
page-header
  breadcrumb / back
  title
  description
  actions

workspace
```

### List pattern

```text
page-header
filter/toolbar
summary(optional)
table
pagination
```

### Form pattern

```text
page-header
form-card
  label/control rows
action bar
```

### Detail pattern

```text
page-header
summary/status
section cards
secondary actions
```

### Modal pattern

```text
modal header
modal body
modal footer
```

이 패턴은 강제 HTML component framework가 아니라 class contract와 구조 guideline으로 유지한다.

## 4. Domain Layout Ownership

도메인은 업무 의미가 있는 layout만 소유한다.

### Student Fee

현재 공통 시스템 기준에 가장 가까운 reference implementation으로 사용한다.

남길 것:

- `sf-*` detail grid
- evidence grid
- 도메인 특화 modal layout

공통으로 이동할 것:

- generic table surface
- generic field/button/card/badge 상태

### Accounting

현재 독립 UI vocabulary가 가장 큰 영역 중 하나다.

남길 것:

- ledger column sizing
- reconciliation composition
- settlement/report layout
- accounting-specific upload/review composition

공통으로 이동할 것:

- button
- badge
- card
- field/select
- table visual
- modal shell
- pagination
- loading/empty/error state

`Accounting_Styles.html`은 유지하되 "Accounting 화면 배치"만 설명하도록 축소한다.

### Event

남길 것:

- event filter grid
- event form row composition
- attendance/applicant/detail layout
- date-range composition

공통으로 이동할 것:

- `ew-btn`
- `ew-card`
- `ew-status`
- generic field visual
- generic table visual
- modal shell
- loading/toast/pagination visual

`ew-*` class가 JS markup contract로 쓰이는 경우 migration 동안 class는 유지하되 스타일 책임은 `ui-*`로 이전한다.

### Settings / MyPage / Main / Login

이 영역들은 기능보다 shell/legacy CSS 영향이 크므로 공통 시스템 정리 이후 마이그레이션한다.

Settings:
- permission matrix 등 특화 layout 유지
- field/table/button/card는 공통화

MyPage:
- profile/facts/role composition 유지
- legacy `.shell/.top/.side/.page` 의존 제거

Main:
- dashboard grid/metric arrangement 유지
- card/action/status visual 공통화

Login:
- App shell과 분리된 단독 layout 유지
- token/button/alert typography는 Foundation/Component 사용

## App Shell Consolidation

`src/100_common/App_Styles.html`에서 가장 먼저 정리해야 할 대상이다.

현재 신형 App shell과 과거 shell selector가 함께 존재한다.

정리 원칙:

1. 현재 실제 페이지에서 사용하는 App shell selector를 authoritative contract로 지정한다.
2. `.shell`, `.top`, `.side`, `.page` 등 구형 shell selector의 실제 사용처를 검색한다.
3. 사용 중인 화면은 신형 shell 구조로 마이그레이션한다.
4. 사용처가 0이 된 legacy selector는 제거한다.
5. `.brand`, `.crumb`, `.active`처럼 의미가 넓어 충돌하는 selector는 scope 또는 semantic class로 정리한다.

공통 shell은 다음 책임만 가진다.

- header
- sidebar
- profile popover
- page container
- page header
- workspace
- status/footer area

도메인 전용 화면 스타일은 shell stylesheet에 들어오지 않는다.

## CSS File Responsibility

목표 구조:

```text
src/100_common/
  App_Styles.html
    foundation
    shell
    components
    patterns

src/400_accounting/common/
  Accounting_Styles.html
    accounting layout only

src/500_student_fee/common/
  Student_Fee_Styles.html
    student-fee layout only

src/600_event/600_common/
  Event_Styles.html
    event layout only
```

파일을 물리적으로 여러 개로 쪼개는 작업은 이번 단계의 필수 목표가 아니다. Apps Script include 구조상 `App_Styles.html` 한 파일을 유지해도 되지만, 내부 section은 위 책임 경계를 따라야 한다.

## Naming Rules

- 공통 visual API: `ui-*`
- shell: 현재 `app*` DOM ID + semantic shell class
- Accounting layout: `accounting-*`
- Student Fee layout: `sf-*`
- Event layout: `ew-*` 또는 `event-*` compatibility namespace

금지:

- generic `.active`에 display/layout 의미 부여
- generic `.brand`, `.page`, `.card`를 서로 다른 체계에서 재정의
- `App_Styles.html`에 `.accounting-*`, `.sf-*`, `.ew-*` 예외 추가
- domain stylesheet에서 `ui-btn`, `ui-card` 자체를 재정의

## Migration Strategy

한 번에 전체 CSS를 갈아엎지 않는다.

각 단계는 독립 PR로 진행하고, 다음 단계는 이전 단계가 main에 병합된 후 시작한다.

### Phase 0 — Contract and inventory

- current selector/token inventory
- duplicate/legacy selector 목록화
- UI architecture verifier 추가
- 공통 class 사용 규칙을 테스트로 고정

### Phase 1 — Foundation + App shell

- token 단일화
- legacy token compatibility alias 정리
- 신형 shell을 authoritative로 확정
- 사용하지 않는 legacy shell 제거
- page header/workspace/sidebar state 통일

### Phase 2 — Student Fee reference cleanup

- Student Fee를 reference implementation으로 정제
- 이미 공통 primitive가 있는 부분의 중복 제거
- component/pattern contract를 실제 화면에서 검증

### Phase 3 — Accounting migration

- generic visual responsibility를 `ui-*`로 이동
- Accounting stylesheet를 layout 중심으로 축소
- ledger/reconciliation/settlement behavior 유지

### Phase 4 — Event migration

- `ew-*` generic visual layer를 공통 primitive로 이동
- dynamic markup selector compatibility 유지
- list/form/detail/attendance/refund behavior 유지

### Phase 5 — Settings + MyPage

- legacy shell 의존 제거
- shared field/table/card/form pattern 적용

### Phase 6 — Main + Login

- dashboard surface 정리
- login standalone surface를 token/component 기준으로 통일

### Phase 7 — Legacy cleanup

- compatibility token 제거
- 사용처 없는 legacy selector 제거
- domain generic visual CSS 제거
- stale comments/documentation 갱신

## Testing Strategy

UI 작업이지만 pixel test 대신 구조/동작 계약을 자동화한다.

### Static architecture verifier

`verify-ui-system-architecture.js` 또는 기존 migration verifier를 갱신하여 다음을 검사한다.

- `App_Styles.html`에 domain-specific selector가 없는가
- 공통 token이 단일 namespace로 유지되는가
- 금지된 legacy shell selector가 migration 완료 후 남아 있지 않은가
- target page가 App shell과 공통 primitive를 사용하고 있는가
- domain stylesheet가 공통 primitive selector를 override하지 않는가

### Behavior regression

기존 테스트를 유지한다.

특히 다음 DOM contract는 보존한다.

- element IDs
- `data-*`
- form `name`
- page constants
- sidebar IDs
- API mapping
- modal action hooks
- dynamic rendering selector hooks

### Focused visual contract tests

필요 시 다음을 static test로 추가한다.

- page header structure
- table wrapper/table class pair
- button variants
- badge semantic variants
- disabled control style contract
- sidebar active/expanded state class contract

## Accessibility Baseline

공통화 과정에서 최소한 다음을 보장한다.

- button/anchor 역할 혼용 금지
- focus-visible state 제공
- disabled state는 opacity만이 아니라 실제 `disabled` 계약 유지
- status color만으로 의미를 전달하지 않도록 text label 유지
- modal은 기존 focus/close behavior를 보존
- table header와 form label semantic markup을 훼손하지 않음

## Rollout Rules

1. 기능 변경과 UI migration을 같은 PR에 섞지 않는다.
2. 한 PR은 한 layer 또는 한 domain을 원칙으로 한다.
3. migration 중 legacy class를 제거하기보다 compatibility hook을 먼저 유지한다.
4. 다음 phase로 넘어가기 전에 전체 Node regression + architecture verifier를 통과한다.
5. 최신 main 기준 synthetic merge CI를 확인한 후 병합한다.

## Acceptance Criteria

전체 UI consolidation 완료 조건:

1. `100_common`이 공통 visual system의 단일 source of truth다.
2. 공용 token은 `--ui-*` namespace 하나로 정리된다.
3. 구형 App shell CSS가 제거된다.
4. Accounting/Event domain stylesheet가 generic button/card/badge/table/modal system을 소유하지 않는다.
5. Student Fee, Accounting, Event, Settings, MyPage, Main, Login이 같은 visual language를 사용한다.
6. 각 domain stylesheet는 업무 특화 layout/composition 중심으로 축소된다.
7. 기존 route/API/data/business flow는 변경되지 않는다.
8. 기존 behavior regression이 통과한다.
9. UI architecture verifier가 통과한다.
10. 신규 화면을 만들 때 domain CSS에 새로운 generic component를 추가하지 않아도 된다.

## First Implementation Slice

첫 구현 PR은 전체 UI를 건드리지 않는다.

범위는 Phase 0 + Phase 1의 앞부분으로 제한한다.

- UI selector/token inventory test
- duplicate token contract 정리
- App shell authoritative selector 확정
- legacy shell의 실제 사용처 확인
- 공통 component/pattern 목록을 테스트로 고정

이 PR에서 개별 Accounting/Event 화면을 대규모로 수정하지 않는다.

그 다음 Student Fee를 reference 화면으로 정리하고, 확인된 primitive를 기준으로 Accounting/Event를 순차 이동한다.
