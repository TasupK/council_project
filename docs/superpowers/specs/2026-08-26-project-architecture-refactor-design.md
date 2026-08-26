# Project-wide Architecture Refactor Design

## 1. 목적

현재 프로젝트는 숫자 접두사 기반 디렉토리(`000_server`, `100_common`, `400_accounting` 등)와 도메인별 하위 구조를 함께 사용하고 있다. 최근 Accounting, Student Fee, Event, IAM/Settings 영역에서 API/Service/DAO 분리와 UI partial 분리가 진행되었지만, 전체 구조를 설명하는 단일 아키텍처 규칙은 아직 불완전하다.

이번 리팩토링은 기능 추가보다 다음을 우선한다.

- frontend/backend 물리적 분리
- 역할과 의존 방향을 디렉토리 자체에서 드러내기
- 공통 기능의 중복 제거와 조합 기반 재사용
- 도메인 내부 응집도 강화
- 서비스 파일에 섞여 있는 orchestration, business rule, persistence 책임 분리
- 숫자 접두사 중심 구조 제거
- 향후 테스트 및 CI 경계 명확화

## 2. 전체 아키텍처

```text
src/
├─ backend/
│  ├─ app/
│  ├─ core/
│  └─ domains/
└─ frontend/
   ├─ app/
   ├─ pages/
   ├─ widgets/
   ├─ features/
   ├─ entities/
   └─ shared/
```

`src/appsscript.json`은 Apps Script manifest이므로 `src/` 루트에 유지한다.

## 3. 공통 설계 원칙

### 3.1 Composition over Inheritance

공통 기능은 거대한 Base class에 모으지 않는다. 작은 재사용 단위로 제공하고 필요한 영역에서 조합한다.

예:

```text
LedgerRepository
 ├─ uses SheetReader
 ├─ uses SheetWriter
 ├─ uses RowMapper
 └─ uses LockManager
```

상속은 명확한 `is-a` 관계가 있는 경우에만 제한적으로 사용한다.

### 3.2 공통 계층은 업무 도메인을 모른다

- `backend/core`는 Accounting, Event, Student Fee, IAM 내부 구현을 참조하지 않는다.
- `frontend/shared`는 ledger, refund, event 같은 업무 의미를 가지지 않는다.
- 업무 의미가 포함된 helper는 해당 도메인/feature/entity 안에 둔다.

### 3.3 단방향 의존성

상위 레이어는 하위 레이어를 사용할 수 있지만 역방향 의존은 금지한다.

### 3.4 불필요한 계층 금지

단순 조회나 단순 변환까지 모든 레이어를 강제하지 않는다. 역할이 없는 wrapper 파일은 만들지 않는다.

## 4. Backend Architecture

Backend는 **Domain-Oriented Layered Architecture**를 사용한다.

기본 흐름:

```text
Controller
↓
Application
↓
Business Rules
↓
Repository
↓
Google Sheets / Drive / Apps Script infrastructure
```

### 4.1 Controller

책임:

- `api_*` 외부 진입점
- request parsing/validation
- 로그인/권한 확인
- Application 또는 단순 Repository 호출
- API response 생성

금지:

- 복잡한 업무 규칙
- 직접적인 시트 조작

### 4.2 Application

Use Case와 orchestration을 담당한다.

예:

- create ledger
- approve ledger
- reconcile transaction
- approve refund
- import payment form
- change applicant status

여러 Repository와 Business Rule을 조합할 수 있다.

### 4.3 Business Rules

순수 업무 규칙을 담당한다.

예:

- 승인 가능 여부
- 상태 전이
- 학생회비 적용 학기 계산
- 환불 가능 조건
- reconciliation match 규칙

가능하면 순수 함수로 유지하고 다음을 직접 사용하지 않는다.

- `SpreadsheetApp`
- `DriveApp`
- `Session`
- HTML
- API response helper

### 4.4 Repository

저장소와의 경계를 담당한다.

- Sheets read/write
- row ↔ object mapping
- persistence query
- schema 기반 필드 접근

기존 `*_sheet_dao.gs`는 대부분 Repository 후보로 본다.

### 4.5 Core

기술적으로 공통인 기능만 둔다.

```text
backend/core/
├─ auth/
├─ db/
├─ response/
├─ errors/
├─ lock/
├─ audit/
└─ utils/
```

기존 `010_core`, schema 공통 접근, 인증 context 일부가 이 영역으로 이동한다.

## 5. Backend 목표 디렉토리

```text
backend/
├─ app/
│  ├─ bootstrap/
│  ├─ routing/
│  └─ config/
├─ core/
│  ├─ auth/
│  ├─ db/
│  ├─ response/
│  ├─ errors/
│  ├─ lock/
│  ├─ audit/
│  └─ utils/
└─ domains/
   ├─ iam/
   │  ├─ controllers/
   │  ├─ application/
   │  ├─ business_rules/
   │  └─ repositories/
   ├─ accounting/
   │  ├─ controllers/
   │  ├─ application/
   │  ├─ business_rules/
   │  └─ repositories/
   ├─ event/
   │  ├─ controllers/
   │  ├─ application/
   │  ├─ business_rules/
   │  └─ repositories/
   └─ student_fee/
      ├─ controllers/
      ├─ application/
      ├─ business_rules/
      └─ repositories/
```

## 6. Frontend Architecture

Frontend는 **FSD Lite + Page Controller**를 사용한다.

의존 방향:

```text
app
↓
pages
↓
widgets / features
↓
entities
↓
shared
```

### 6.1 app

전역 bootstrap, routing, shell composition, 전역 style/config를 담당한다.

### 6.2 pages

실제 route/screen 단위다. Page Controller는 화면 조립과 초기화만 담당하고 세부 행동은 feature로 위임한다.

### 6.3 widgets

여러 feature/entity를 조합한 큰 UI 블록이다.

예: sidebar, header, ledger table, applicant table.

### 6.4 features

사용자의 행동 단위다.

예:

- ledger_create
- ledger_edit
- ledger_approve
- reconciliation_run
- evidence_upload
- refund_approve
- applicant_status_change

### 6.5 entities

업무 데이터 단위다.

예: ledger, transaction, evidence, payment, event, applicant, user.

### 6.6 shared

업무 의미가 없는 공통 UI/API/lib/style/config만 둔다.

```text
frontend/shared/
├─ ui/
├─ api/
├─ lib/
├─ styles/
└─ config/
```

## 7. 현재 구조 → 목표 구조 Migration Map

### 7.1 Backend 상위 구조

| 현재 | 목표 | 처리 원칙 |
|---|---|---|
| `src/000_server/Code.js` | `src/backend/app/routing/` | doGet 및 HTML 조립 책임을 routing/bootstrap로 분리 |
| `src/000_server/001_init` | `src/backend/app/bootstrap/` | 최초 권한 승인/초기화 |
| `src/000_server/010_core` | `src/backend/core/*` | 파일별 실제 책임에 따라 db/response/audit/config 등으로 재배치 |
| `src/000_server/020_schema` | `src/backend/core/db/schema/` | 저장소 schema와 integrity 도구 |
| `src/000_server/030_auth` | `src/backend/core/auth/` + `domains/iam` | session/context는 core, 사용자/권한 업무 규칙은 IAM |
| `src/000_server/040_iam` | `src/backend/domains/iam/` | query service/DAO를 새 레이어로 재분류 |
| `src/000_server/050_event` | `src/backend/domains/event/` | API→controllers, DAO→repositories, service 재분류 |
| `src/000_server/060_accounting` | `src/backend/domains/accounting/` | API/Service/DAO를 새 레이어로 분리 |
| `src/000_server/070_settings` | `src/backend/domains/iam/controllers/` + `application/` | Settings는 별도 business domain으로 만들지 않고 IAM 관리 use case로 흡수 |
| `src/000_server/080_student_fee` | `src/backend/domains/student_fee/` | API/Service/DAO/policy를 새 레이어로 분리 |

### 7.2 Accounting Backend

현재 Accounting은 `common`, `ledger`, `evidence`, `reconciliation`, `settlement`로 이미 업무 경계가 존재한다.

- `*_api.gs` → `controllers/`
- `*_sheet_dao.gs` → `repositories/`
- `*_query_service.gs`, `*_service.gs` → 우선 `application/` 후보
- 계산/검증/상태 전이/matching 규칙 → `business_rules/`로 추출
- `accounting_entry_orchestration_service.gs` → `application/`
- `accounting_access.gs` → IAM/core auth 정책과 accounting-specific permission requirement를 분리
- `accounting_event_read_dao.gs`는 도메인 간 직접 persistence 참조 여부를 검토하고 Event의 공개 Application 경계로 대체하는 것을 원칙으로 한다.

### 7.3 Student Fee Backend

- `student_fee_coverage_policy.gs` → `business_rules/`
- `student_fee_form_settings_adapter.gs` → 외부 Form 연동 adapter 성격이므로 repository/infrastructure adapter로 배치
- `fee_form_mapper.gs` → repository mapper 또는 application input mapper
- `fee_form_reader.gs` → repository/adapter
- `*_api.gs` → controllers
- `*_sheet_dao.gs` → repositories
- `*_service.gs`, `*_query_service.gs`, import service → application

### 7.4 IAM/Settings Backend

IAM은 users/roles/permissions/departments를 하나의 business domain으로 유지한다.

기존 Settings 서버 기능은 별도 `settings` domain을 만들지 않고 IAM을 관리하는 controller/application use case로 흡수한다. 화면 이름은 Settings로 유지하지만 backend business boundary는 IAM으로 고정한다.

## 8. Frontend Migration Map

### 8.1 전역 공통

| 현재 | 목표 |
|---|---|
| `src/100_common/App_Header.html` | `frontend/widgets/header/` |
| `src/100_common/App_Sidebar.html` | `frontend/widgets/sidebar/` |
| `src/100_common/app_shell_js.html` | `frontend/app/bootstrap/` 또는 shell widget |
| `src/100_common/app_api_runner_js.html` | `frontend/shared/api/rpc/` |
| `src/100_common/App_Shell_Styles.html` | `frontend/app/styles/` |
| `src/100_common/App_Styles.html` | shared/app style로 분해; 업무별 selector는 원래 slice로 이동 |
| `src/100_common/Access_Denied.html` | `frontend/pages/access_denied/` |

### 8.2 기존 페이지 디렉토리

- `src/200_login` → `frontend/pages/login` + login feature/entity
- `src/250_main` → `frontend/pages/main`
- `src/270_mypage` → `frontend/pages/mypage` + user entity/profile feature
- `src/300_settings/300_home` → `frontend/pages/settings_home`
- `src/300_settings/310_users` → `frontend/pages/settings_users`
- `src/300_settings/320_roles` → `frontend/pages/settings_roles`
- `src/300_settings/330_permissions` → `frontend/pages/settings_permissions`
- `src/300_settings/340_departments` → `frontend/pages/settings_departments`
- `src/400_accounting/400_home` → `frontend/pages/accounting_home`
- `src/400_accounting/410_ledger` → `frontend/pages/accounting_ledger`
- `src/400_accounting/420_reconciliation` → `frontend/pages/accounting_reconciliation`
- `src/400_accounting/430_settlement` → `frontend/pages/accounting_settlement`
- `src/500_student_fee/500_home` → `frontend/pages/student_fee_home`
- `src/500_student_fee/510_payers` → `frontend/pages/student_fee_payers`
- `src/500_student_fee/520_payments` → `frontend/pages/student_fee_payments`
- `src/500_student_fee/530_refunds` → `frontend/pages/student_fee_refunds`
- `src/600_event/610_home` → `frontend/pages/event_home`
- `src/600_event/620_form` → `frontend/pages/event_form`
- `src/600_event/630_detail` → `frontend/pages/event_detail`

각 페이지의 현재 `*_js.html`은 그대로 page controller가 되는 것이 아니라 다음 기준으로 분해한다.

- 화면 초기화/조립 → page controller
- 사용자 행동 → feature
- 데이터 표시/normalize → entity
- 큰 재사용 UI → widget
- 업무 무관 UI/API/lib → shared

예를 들어 `accounting_ledger_js.html`의 등록/상세/승인/테이블 렌더링/API 호출은 각각 page controller, ledger_create/approve feature, ledger entity/widget, shared rpc로 분리한다.

## 9. 도메인 간 통신 규칙

다른 도메인의 Repository를 직접 호출하지 않는다.

금지 예:

```text
student_fee → accounting/repositories/ledger_repository
accounting → event/repositories/event_repository
```

Backend 내부의 cross-domain 호출은 상대 도메인이 공개한 **Application facade/use case**를 사용한다. Controller/API는 frontend 또는 외부 호출 경계로만 사용하며 backend 내부 통신에 사용하지 않는다.

```text
Accounting Application
        ↓
Event public Application facade
        ↓
Event Repository
```

이를 통해 persistence 구현은 호출 도메인에서 숨긴다.

## 10. 테스트 전략

리팩토링은 동작 보존을 우선한다.

1. 기존 API contract 테스트를 먼저 유지한다.
2. Repository 이동 전 기존 DAO 동작을 characterization test로 고정한다.
3. Business Rules를 추출할 때 순수 함수 테스트를 추가한다.
4. Frontend는 page composition, feature API mapping, modal/widget composition 테스트를 유지한다.
5. 각 migration 단계마다 전체 기존 CI를 실행한다.
6. `git diff --check`, server/client syntax, frontend→backend API mapping 검사를 유지한다.

## 11. Migration 순서

빅뱅 이동을 금지하고 다음 순서로 진행한다.

1. 새 최상위 skeleton과 architecture guard/test 추가
2. backend core/app 이동
3. IAM/Auth 경계 정리
4. Accounting backend migration
5. Student Fee backend migration
6. Event backend migration
7. frontend shared/app/widgets 기반 이동
8. Settings/Login/Main/MyPage frontend migration
9. Accounting frontend FSD migration
10. Student Fee frontend FSD migration
11. Event frontend FSD migration
12. 숫자 접두사 구조 제거 및 문서/CI 경로 갱신

각 단계는 기존 public API/route를 유지한 상태에서 완료하고, 호출부 전환이 끝난 뒤 legacy 경로를 제거한다.

## 12. 완료 기준

- `src/` 아래 기능 코드가 `backend/`, `frontend/` 두 축으로 분리됨
- 숫자 접두사 기반 최상위 디렉토리 제거
- backend에서 Controller/Application/Business Rules/Repository 책임이 코드상 구분됨
- frontend가 FSD Lite 의존 방향을 지킴
- 공통 계층에서 도메인 이름/업무 규칙이 제거됨
- cross-domain Repository 직접 참조가 없음
- 기존 API contract와 주요 사용자 흐름이 유지됨
- 전체 CI 통과
- README와 개발 문서가 새 구조를 기준으로 갱신됨
