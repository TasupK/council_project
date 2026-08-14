# 학생회 통합 업무관리

Google Apps Script와 clasp를 기반으로 만드는 학생회 통합 업무관리 웹앱입니다.

현재 목표는 여러 기능 브랜치에 나뉘어 있던 로그인, 설정, 회계, 행사복지 기능을 하나의 Apps Script 웹앱 구조로 통합하는 것입니다. 기능을 새로 늘리기보다, 화면과 서버 코드를 유지보수하기 쉬운 단위로 분리하고 운영 DB 스키마에 맞춰 연결하는 것을 우선합니다.

## 1. 기본 원칙

- 기능을 추가하기 전에 기존 구조와 호출 흐름을 읽습니다.
- 사용자가 작성한 주석은 명시적인 요청 없이 제거하지 않습니다.
- 변경 범위 밖의 파일과 사용자 변경사항은 되돌리지 않습니다.
- 서버와 클라이언트의 책임을 분리합니다.
- 화면, 기능, 데이터 조회 범위를 같은 단위로 맞춥니다.
- 미구현 기능의 UI를 유지해야 하면 실행 연결을 주석 처리하고 `TODO`로 이유를 남깁니다.
- 람다식 대신 이름 있는 함수 또는 일반 `function` 표현식을 사용합니다.
- 코드 순서는 실제 실행 흐름에 맞추고 단계 주석으로 구분합니다.
- 구현 후 문법, DOM, include, API, 권한 경계를 검증합니다.

## 2. 현재 구성

```text
src/
├─ 000_server/
│  ├─ 001_init/          최초 권한 승인과 초기화
│  ├─ 010_core/          전역 설정, 응답, Sheets 공통 함수
│  ├─ 020_schema/        UserDB와 운영 DB 스키마, 무결성 검증
│  ├─ 030_auth/          로그인 사용자, 역할, 권한 조회
│  ├─ 040_login/         로그인 API, 세션 컨텍스트, 캐시
│  ├─ 050_event/         행사복지관리 서버 기능
│  ├─ 060_accounting/    회계관리 서버 기능
│  └─ Code.js            doGet 라우팅과 HTML 조립
├─ 100_common/           앱 공통 레이아웃, 스타일, 클라이언트 공통 JS
├─ 200_login/            로그인 페이지
├─ 250_main/             메인 페이지
├─ 300_settings/
│  ├─ 300_home/          설정 홈
│  ├─ 310_users/         사용자 관리
│  ├─ 320_roles/         역할 관리
│  ├─ 330_permissions/   업무 권한 설정
│  └─ common/            설정 영역 전용 클라이언트 공통 코드
├─ 400_accounting/       회계관리 페이지
├─ 500_studentFee/       학생회비관리 영역
└─ 600_event/            행사복지관리 페이지
```

숫자 접두사는 Apps Script 편집기와 저장소에서 기능 순서를 직관적으로 표시하기 위한 규칙입니다. 하나의 독립 페이지는 진입 HTML, View, 클라이언트 JS를 같은 폴더에 둡니다.

```text
Settings_Users.html
Settings_Users_View.html
settings_users_js.html
```

서버 기능이 커지는 경우 기능 영역 안에서도 번호 하위 폴더를 둡니다.

```text
src/000_server/050_event/
├─ 050_common/       행사 공통 상수, 요청 검증, 페이지네이션, 결제 합계
├─ 051_events/       행사 목록, 상세, 생성, 수정, 상태 변경
├─ 052_applicants/   신청자 목록, 상세, 처리
├─ 053_attendance/   출석 목록, 변경, 검색
├─ 054_refunds/      환불 대상 조회
└─ 055_files/        행사 관련자료 업로드
```

각 기능 폴더에서 `api_` 공개 함수 파일과 내부 업무 로직 파일을 함께 둡니다. `event_service.gs`처럼 여러 업무 기능을 한 파일에 몰아넣지 않습니다.

## 3. 서버와 클라이언트 경계

### 서버

`000_server`에 다음 책임을 둡니다.

- Google Session 사용자 식별
- 로그인, 관리자, 업무 권한 검증
- Google Sheets와 Drive 접근
- 스키마와 PK/FK 무결성 검증
- 캐시와 잠금
- 페이지별 API 응답 생성

서버 기능은 기능 영역별 파일에 배치합니다. 클라이언트가 직접 호출하는 공개 함수는 `api_`로 시작하고, 서버 내부 함수는 이름 끝에 `_`를 붙입니다. `ew`, `acc`처럼 폴더 역할과 중복되는 축약 접두사는 사용하지 않습니다. 공개 API와 내부 함수의 이름만 바꾸는 불필요한 래퍼는 만들지 않습니다.

로그인이 필요한 서버 API는 기능별 로그인 검사 함수를 만들지 않고 `030_auth/auth_context.gs`의 `requireLoginContext_()`를 공통으로 사용합니다. 기능별 권한 검사는 로그인 확인 이후 각 기능 영역에서 추가합니다.

### 클라이언트

HTML과 `*_js.html`에 다음 책임을 둡니다.

- 화면 구조와 접근성 속성
- `google.script.run`을 통한 서버 API 호출
- 서버 응답 렌더링
- 검색, 필터, 표시 상태와 사용자 입력 처리
- 페이지 링크 생성

클라이언트에서 관리자 여부를 확인할 수 있지만 보안 경계로 사용하지 않습니다. 데이터 반환 전 서버 API가 권한을 먼저 검사해야 합니다.

### 템플릿

진입 HTML의 `<?= ... ?>`, `<?!= ... ?>`는 페이지 조립과 초기값 전달에만 사용합니다. DB 조회와 업무 규칙을 템플릿에 넣지 않습니다. `include()`로 삽입한 HTML 조각 내부의 템플릿 표현식은 다시 평가되지 않으므로, 동적 값은 진입 HTML에서 변수로 선언하거나 클라이언트에서 렌더링합니다.

## 4. 페이지와 라우팅

화면 전환은 `doGet(e)`와 `?page=` 기반의 실제 페이지 라우팅을 사용합니다.

```text
login
main
settings
settings_users
settings_roles
settings_permissions
accounting
accounting_ledger
accounting_reconciliation
accounting_settlement
event
event_form
event_detail
```

- 독립 업무 화면을 하나의 HTML에 패널로 모두 넣지 않습니다.
- 페이지 이동은 `<a target="_top">`를 기본으로 합니다.
- Apps Script iframe에서 비동기 응답 이후 `window.top.location` 자동 이동에 의존하지 않습니다.
- 보호 라우트는 HTML 반환 전에 서버에서 로그인을 검사합니다.
- 보호 API는 주소를 직접 입력해도 권한 없는 데이터를 반환하지 않아야 합니다.

## 5. 공통 UI 기준

메인 화면의 헤더, 사이드바, 상태바를 앱 공통 레이아웃 기준으로 사용합니다.

```text
100_common/
├─ App_Header.html
├─ App_Sidebar.html
├─ App_Styles.html
└─ app_shell_js.html
```

기능 영역의 공통 코드는 해당 기능 API 호출과 오류 처리만 담당합니다. 앱 전체에서 쓰는 레이아웃을 기능 폴더에 복제하지 않습니다.

## 6. 로그인 컨텍스트 캐시

Google Session 이메일을 인증 기준으로 사용하고, 자체 브라우저 토큰을 인증 수단으로 만들지 않습니다.

```text
Session 이메일 확인
-> ScriptCache 조회
-> 캐시 적중: 컨텍스트 반환
-> 캐시 누락: Lock 획득
-> 캐시 재확인
-> UserDB 조회와 무결성 검증
-> 10분 캐시 저장
```

- 캐시는 조회 최적화 수단이며 인증을 대체하지 않습니다.
- 이메일은 SHA-256 기반 키로 변환합니다.
- 캐시 오류가 로그인 전체를 중단시키지 않도록 로그를 남기고 DB 조회로 진행합니다.
- 동시 캐시 생성은 `LockService`로 제한합니다.
- 사용자 상태, 역할 배정, 역할 권한 저장 기능을 구현할 때 관련 로그인 캐시를 무효화합니다.

## 7. 데이터베이스와 스키마

현재 DB는 Google Sheets를 사용합니다.

- UserDB: 사용자, 부서, 역할, 권한, 권한 저장 이력
- OperationDB: 회계, 행사복지 등 운영 업무 데이터

DB의 탭 이름과 필드 이름은 schema 파일을 기준으로 관리합니다.

```text
src/000_server/020_schema/user_db_schema.gs
src/000_server/020_schema/operation_db_schema.gs
```

탭 이름이나 필드 이름이 바뀌면 기능 파일이 아니라 schema 파일을 먼저 수정합니다.

### UserDB 규칙

- 시트 탭과 필드 이름은 `user_db_schema.gs`에서 정의합니다.
- 조회 코드는 스키마의 필드 매핑을 사용합니다.
- PK와 PK-FK 무결성 검증을 구분합니다.
- 복합 관계는 불필요한 인조 ID보다 의미 있는 복합 PK를 우선합니다.
- 로그인에서는 현재 사용자와 관련된 참조 무결성만 검사합니다.
- 전체 DB 검사는 별도 API로 유지합니다.

## 8. 조회 API 설계

페이지는 필요한 데이터만 요청합니다.

| 페이지 | API | 주요 반환 데이터 |
|---|---|---|
| 설정 홈 | `loadSettingsHomeData` | 앱, DB, 현재 사용자 |
| 사용자 관리 | `loadSettingsUsersData` | 사용자, 역할 |
| 역할 관리 | `loadSettingsRolesData` | 역할 |
| 업무 권한 | `loadSettingsPermissionsData` | 역할, 권한 트리, 역할별 권한 |

여러 페이지 데이터를 한 번에 반환하는 집계 API를 기본값으로 사용하지 않습니다. 공통 응답은 별도 함수에서 만들고, 페이지별 데이터만 추가합니다.

## 9. 구현 절차

1. 요청 범위와 현재 코드 흐름을 확인합니다.
2. 관련 파일, 함수 정의, 호출부, 서버 API 존재 여부를 검색합니다.
3. 페이지, 기능, 데이터 경계를 먼저 정합니다.
4. 실패 조건 또는 검수 기준을 구현 전에 작성하고 실패를 확인합니다.
5. 기존 명명, 주석, 코드 스타일에 맞춰 최소 변경합니다.
6. 파일 수정 전 어떤 파일을 왜 바꾸는지 사용자에게 알립니다.
7. 기능별로 구현하고 단계마다 문법과 참조를 검사합니다.
8. 사용하지 않는 이전 구조는 새 구조가 검증된 후 제거합니다.
9. 전체 검증 후 변경 내용과 남은 제한사항을 보고합니다.
10. 사용자가 요청한 경우에만 `clasp push`, Git commit, push를 수행합니다.

## 10. 검수 체크리스트

### 구조

- 모든 include 대상 파일이 존재합니다.
- 이전 파일명과 이전 include 경로가 남지 않습니다.
- 독립 페이지가 자체 View와 JS만 포함합니다.
- 공통 레이아웃이 기능 폴더에 중복되지 않습니다.

### JavaScript

- `.js`, `.gs`, `*_js.html` 스크립트의 문법 검사를 통과합니다.
- 람다식 `=>`이 남지 않습니다.
- 제거된 함수와 DOM ID 참조가 남지 않습니다.
- 사용자가 작성한 주석이 보존되어 있습니다.

### HTML과 DOM

- 중복 `id`가 없습니다.
- JS가 정적으로 참조하는 DOM ID가 실제 View 또는 동적 HTML에 존재합니다.
- 긴 줄은 읽을 수 있게 줄바꿈합니다.
- 페이지 링크는 올바른 보호 라우트를 가리킵니다.

### 서버와 보안

- 공개 API 함수가 실제로 구현되어 있습니다.
- 미구현 API의 활성 호출이 없습니다.
- 보호 API는 데이터 조회 전에 로그인과 권한을 검사합니다.
- 캐시는 인증을 우회하지 않습니다.
- 페이지별 API가 불필요한 전체 데이터를 반환하지 않습니다.

### 완료

- `git diff --check`를 통과합니다.
- 실제 Apps Script 배포 테스트를 하지 못했다면 명확히 보고합니다.
- 로컬 변경과 Apps Script push 상태를 구분해 보고합니다.

## 11. 디렉토리별 문서

- [000_server](directory_docs/000_server.md)
- [100_common](directory_docs/100_common.md)
- [200_login](directory_docs/200_login.md)
- [250_main](directory_docs/250_main.md)
- [300_settings](directory_docs/300_settings.md)
- [400_accounting](directory_docs/400_accounting.md)
- [500_studentFee](directory_docs/500_studentFee.md)
- [600_event](directory_docs/600_event.md)

## 12. 주요 문서

- [행사복지관리 README](docs/EventWelfare_README.md)
- [회계관리 README](docs/Accounting_README.md)
- [회계/행사 페이지 분리 계획](docs/accounting-event-page-routes.md)

## 13. 로컬 개발

Apps Script 프로젝트에 반영할 때는 clasp를 사용합니다.

```bash
clasp push
clasp redeploy <deploymentId> -d "설명"
```

`clasp push`는 로컬 파일을 Apps Script 프로젝트에 올리는 작업입니다. GitHub push와는 별개입니다.

## 14. 현재 제한사항

- 사용자, 역할, 권한 저장 서버 함수는 아직 구현되지 않았습니다.
- Drive 연결 UI는 유지하지만 서버 연결 함수는 비활성 상태입니다.
- 메인 현황과 빠른 실행 데이터는 현재 정적 예시입니다.
- 현재 변경사항은 `clasp push` 전까지 Apps Script 프로젝트에 반영되지 않습니다.
