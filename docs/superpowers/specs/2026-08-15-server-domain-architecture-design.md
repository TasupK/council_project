# 서버 도메인 아키텍처 재설계

## 1. 목적

학생회 통합 업무관리 웹앱의 서버 코드를 학생회 업무 영역 중심으로 재구성한다. 기능을 추가하거나 기존 화면 동작을 변경하는 작업이 아니라, 유지보수 가능한 서버 구조와 실행 규칙을 만드는 것이 목적이다.

이번 재설계는 다음 세 가지 구조를 적용한다.

1. Package by Domain
2. API Lifecycle Template
3. Service + Sheet DAO + 공통 Sheet CRUD

## 2. 범위

### 포함

- `src/000_server` 서버 구조 재설계
- 도메인별 API, Service, Sheet DAO 분리
- API 공통 실행 생애주기 정의
- 공통 Schema 기반 Sheet CRUD 정의
- 공개 API의 로그인 및 권한 검사 흐름 통일
- 기존 `doGet(e)` 라우팅과 화면 템플릿 매핑 유지 및 정리
- 도메인별 점진적 전환

### 제외

- 클라이언트 HTML 및 JavaScript 구조 변경
- 기존 `page` 파라미터와 화면 URL 변경
- 신규 업무 기능 구현
- API 응답 형식 일괄 변경
- 감사 이력 구조 도입
- 캐시 정책 재설계
- 조회 모델 세분화
- 오류 코드 및 응답 체계 확장

## 3. 설계 원칙

### 3.1 업무 도메인 중심 구성

서버 코드는 기술 계층별 전역 폴더가 아니라 `auth`, `login`, `event`, `accounting`, `settings` 같은 업무 도메인을 기준으로 구성한다. 도메인 내부에서 API, Service, Sheet DAO의 책임을 분리한다.

### 3.2 단방향 의존

기본 실행 방향은 다음과 같다.

```text
Client
  -> Public API
  -> API Lifecycle Handler
  -> Domain Service
  -> Domain Sheet DAO
  -> Core Sheet CRUD
  -> Google Sheets
```

세부 의존 규칙은 다음과 같다.

- API는 Service를 호출한다.
- Service는 도메인 업무 흐름과 업무 규칙을 담당한다.
- Service는 `SpreadsheetApp`을 직접 호출하지 않는다.
- Sheet DAO는 데이터 조회와 저장 의도를 표현한다.
- Sheet DAO는 업무 상태나 승인 조건을 판단하지 않는다.
- Sheet DAO만 공통 Sheet CRUD를 호출한다.
- Core는 특정 도메인을 알지 못한다.
- Schema는 순수 메타데이터만 정의하며 시트를 열지 않는다.
- 다른 도메인의 Sheet DAO를 직접 호출하지 않는다.

### 3.3 공개 경계 유지

- 클라이언트가 호출하는 공개 함수는 `api_`로 시작한다.
- 서버 내부 함수는 이름 끝에 `_`를 붙인다.
- 기존 공개 API 이름, 입력값, 반환 형태를 유지한다.
- 기존 화면의 `page` 값과 템플릿 경로를 유지한다.
- 다른 함수의 이름만 바꾸어 호출하는 공개 wrapper는 만들지 않는다.
- 람다식은 사용하지 않는다.
- 사용자가 작성한 기존 주석과 TODO는 명시적인 변경 사유 없이 제거하지 않는다.

## 4. 목표 디렉터리 구조

```text
src/000_server/
├─ 001_init/
│  └─ authorize_app.gs
├─ 010_core/
│  ├─ api_handler.gs
│  ├─ sheet_crud.gs
│  ├─ response.gs
│  ├─ sheets.gs
│  └─ config.gs
├─ 020_schema/
│  ├─ user_db_schema.gs
│  ├─ user_db_integrity.gs
│  ├─ operation_db_schema.gs
│  └─ operation_db_integrity.gs
├─ 030_auth/
│  ├─ 031_users/
│  ├─ 032_roles/
│  └─ 033_permissions/
├─ 040_login/
│  ├─ login_api.gs
│  ├─ login_service.gs
│  ├─ login_session.gs
│  └─ login_cache.gs
├─ 050_event/
│  ├─ 050_common/
│  ├─ 051_events/
│  ├─ 052_applicants/
│  ├─ 053_attendance/
│  ├─ 054_refunds/
│  └─ 055_files/
├─ 060_accounting/
│  ├─ 060_common/
│  ├─ 061_ledger/
│  ├─ 062_reconciliation/
│  ├─ 063_settlement/
│  └─ 064_evidence/
├─ 070_settings/
│  ├─ settings_api.gs
│  └─ settings_service.gs
└─ Code.js
```

도메인의 세부 기능 폴더는 필요한 파일만 가진다.

```text
<feature>_api.gs
<feature>_service.gs
<feature>_sheet_dao.gs
<feature>_validator.gs    선택 사항
```

## 5. 공통 Schema

UserDB와 OperationDB의 Schema는 `020_schema`에서 중앙 관리한다. 각 도메인은 탭명이나 실제 헤더명을 직접 정의하지 않고 데이터베이스 종류와 테이블 키로 Schema를 참조한다.

```javascript
sheetFindAll_('operation', 'events');
```

Schema와 실행 설정의 책임을 구분한다.

```text
Schema
- 탭 이름
- 필드 이름
- PK
- FK
- 필수 필드

Config
- Spreadsheet ID
- Drive Folder ID
- 실행 환경 설정
```

Schema 함수는 `SpreadsheetApp`, `PropertiesService`, Drive API를 호출하지 않는 순수 메타데이터 함수로 유지한다. Schema 객체 생성 비용은 Sheet I/O와 비교하면 실제 병목이 아니며, 성능 최적화는 시트 전체 조회와 반복 API 호출을 줄이는 데 집중한다.

## 6. API Lifecycle Template

### 6.1 공개 API의 책임

공개 API는 현재 이름과 호출 계약을 유지하면서 공통 Handler에 실행 정보를 선언한다.

```javascript
function api_getEventList(input) {
  return apiHandler_({
    operation: 'getEventList',
    input: input,
    requireLogin: true,
    permission: {
      domain: 'event',
      action: 'view'
    },
    parse: parseEventListRequest_,
    service: getEventList_
  });
}
```

### 6.2 실행 순서

```text
1. 요청 정보 구성
2. 로그인 컨텍스트 확인
3. 권한 검증
4. 입력 파싱 및 검증
5. Domain Service 실행
6. 기존 반환 형태로 결과 반환
7. 실패 시 작업명과 원인 기록
```

`apiHandler_()`는 권한 검증의 실행 시점만 관리한다. 실제 권한 판정은 `030_auth`의 `requirePermission_()`에 위임한다.

```javascript
function apiHandler_(options) {
  try {
    var context = options.requireLogin
      ? requireLoginContext_()
      : null;

    if (options.permission) {
      requirePermission_(context, options.permission);
    }

    var request = options.parse
      ? options.parse(options.input)
      : options.input;

    return options.service(request, context);
  } catch (error) {
    console.error(
      '[' + options.operation + '] ' +
      (error && error.stack ? error.stack : error)
    );
    throw error;
  }
}
```

최초 권한 승인 함수와 독립 관리 함수에는 Handler 사용을 강제하지 않는다. 공통 생애주기가 동일한 공개 업무 API에만 적용한다.

## 7. Service와 권한 경계

Service는 로그인과 권한 검사가 끝난 요청을 받아 업무 흐름을 수행한다. 권한 선언은 공개 API에 두고 실제 판정은 Auth가 담당한다.

```text
Public API: 필요한 권한 선언
API Handler: 로그인과 권한 검사 실행
Auth: 사용자 권한 판정
Service: 업무 처리
```

기본 권한 표현은 다음 형태를 사용한다.

```javascript
permission: {
  domain: 'event',
  action: 'view'
}
```

현재 단계에서는 한 API에 하나의 기본 권한을 선언한다. 복합 권한 정책은 실제 업무 요구가 확정된 뒤 별도로 설계한다.

## 8. Sheet CRUD Template

공통 Sheet CRUD는 Schema 해석과 실제 Sheet I/O를 담당한다.

```javascript
sheetFindAll_(database, tableKey);
sheetFindById_(database, tableKey, id);
sheetInsert_(database, tableKey, item);
sheetUpdateById_(database, tableKey, id, changes);
```

공통 실행 순서는 다음과 같다.

```text
1. 데이터베이스 선택
2. 공통 Schema에서 테이블 정의 조회
3. Spreadsheet와 Sheet 열기
4. 필수 헤더 확인
5. 배치 읽기 또는 쓰기
6. 행과 객체 변환
7. 내부 행 번호를 제거한 결과 반환
```

쓰기 작업은 공통 Lock을 사용한다. 반복문 안에서 `getValue()`, `setValue()`를 호출하지 않고, 가능한 범위에서 `getValues()`, `setValues()`를 사용한다.

이번 단계에서는 범용 ORM, 동적 Query Builder, 범용 삭제 기능을 만들지 않는다. 도메인별 검색 조건은 DAO 함수에서 표현한다.

## 9. Domain Sheet DAO

DAO는 공통 CRUD에 도메인 의미를 부여한다.

```javascript
function findAllEvents_() {
  return sheetFindAll_('operation', 'events');
}

function findEventById_(eventId) {
  return sheetFindById_('operation', 'events', eventId);
}

function insertEvent_(event) {
  return sheetInsert_('operation', 'events', event);
}
```

DAO 함수는 다음 규칙을 따른다.

- 조회는 `find*`로 시작한다.
- 저장은 `insert*`, `update*`로 시작한다.
- Sheet의 실제 탭명과 헤더명을 직접 사용하지 않는다.
- DTO 조립이나 상태 판단 같은 업무 로직을 포함하지 않는다.
- 다른 도메인의 DAO를 직접 호출하지 않는다.

## 10. 점진적 전환 순서

### 1단계: Core 기반

- `api_handler.gs` 추가
- `sheet_crud.gs` 추가
- 기존 `sheets.gs`의 책임 분리
- 새로운 구조가 검증될 때까지 기존 함수를 유지

### 2단계: Event

- Events, Applicants, Attendance, Refunds, Files를 각각 API, Service, DAO로 분리
- 공개 `api_*` 이름과 기존 반환 형태 유지
- 행사 화면의 호출 흐름 검증
- 새 구조에서 사용하지 않는 이전 함수 제거

### 3단계: Accounting

- Ledger, Reconciliation, Settlement, Evidence로 분리
- Service의 직접 Sheet 접근 제거
- 회계 화면의 호출 흐름 검증

### 4단계: Auth와 Login

- Users, Roles, Permissions를 세부 도메인으로 분리
- 로그인 컨텍스트 생성 흐름과 기존 캐시 동작 유지
- API Handler의 권한 검사와 Auth 판정 연결

### 5단계: Settings

- Settings API와 Service를 분리
- Users, Roles, Permissions 도메인을 통해 데이터를 조회
- 현재 미구현 상태인 저장 기능은 추가하지 않음

### 6단계: 전체 정리

- 중복 함수와 불필요한 wrapper 제거
- 이전 함수와 호출 참조 제거
- 문서와 디렉터리 안내 갱신
- 전체 정적 검증 수행

## 11. 호환성 원칙

- 기존 공개 API 함수명을 유지한다.
- 기존 API 입력과 반환 형태를 유지한다.
- 기존 `doGet(e)`의 `page` 값과 화면 템플릿 경로를 유지한다.
- 클라이언트 HTML과 JavaScript는 이번 재설계 범위에서 수정하지 않는다.
- 기존 캐시 동작과 무결성 검사 동작을 변경하지 않는다.
- 실제 기능 변경이 필요한 문제를 발견하면 구조 변경과 섞지 않고 별도 작업으로 기록한다.

## 12. 검증 기준

### 구조

- 모든 서버 업무 기능이 도메인과 세부 기능 폴더에 배치되어 있다.
- Service에서 `SpreadsheetApp`을 직접 호출하지 않는다.
- Domain Sheet DAO만 공통 Sheet CRUD를 호출한다.
- Core가 특정 업무 도메인을 참조하지 않는다.
- Schema 외부에 새로운 탭명과 실제 필드명이 정의되지 않는다.

### API와 권한

- 기존 클라이언트 호출 대상 `api_*` 함수가 모두 존재한다.
- 공개 API의 입력과 반환 형태가 유지된다.
- 보호 API는 Service 실행 전에 로그인과 권한을 검사한다.
- 제거한 공개 함수나 내부 함수의 호출부가 남아 있지 않다.

### 코드

- 서버 `.gs`와 `.js` 문법 검사를 통과한다.
- 람다식이 없다.
- 함수명이 중복되지 않는다.
- 사용자가 작성한 주석과 TODO가 보존되어 있다.
- `git diff --check`를 통과한다.

### 배포

- 로컬 검증과 Apps Script 배포 상태를 구분해 보고한다.
- 사용자가 명시적으로 요청하기 전에는 `clasp push`를 실행하지 않는다.

## 13. 완료 조건

다음 조건을 모두 만족하면 서버 구조 재설계를 완료한 것으로 본다.

1. Core Template이 구현되고 Event, Accounting, Auth/Login, Settings가 순서대로 전환되었다.
2. 기존 화면이 같은 공개 API와 응답 형태를 사용한다.
3. 보호 API가 공통 생애주기에서 로그인과 권한을 검증한다.
4. Service와 Google Sheets 사이에 Domain Sheet DAO와 공통 Sheet CRUD 경계가 존재한다.
5. 중앙 Schema가 모든 DAO의 테이블 및 필드 정의 기준으로 사용된다.
6. 정적 검증과 참조 검사가 통과한다.
