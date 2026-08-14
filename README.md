# 학생회 통합 업무관리

Google Apps Script와 clasp를 기반으로 만드는 학생회 통합 업무관리 웹앱입니다.

현재 목표는 여러 기능 브랜치에 나뉘어 있던 로그인, 설정, 회계, 행사복지 기능을 하나의 Apps Script 웹앱 구조로 통합하는 것입니다. 기능을 새로 늘리기보다, 화면과 서버 코드를 유지보수하기 쉬운 단위로 분리하고 운영 DB 스키마에 맞춰 연결하는 것을 우선합니다.

## 현재 구성

```text
src/
├─ 000_server/           Apps Script 서버 코드
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
├─ 300_settings/         설정 페이지
├─ 400_accounting/       회계관리 페이지
├─ 500_studentFee/       학생회비관리 영역
└─ 600_event/            행사복지관리 페이지
```

## 서버 구조 원칙

- 클라이언트가 직접 호출하는 서버 함수는 `api_`로 시작합니다.
- 서버 내부 함수는 이름 끝에 `_`를 붙입니다.
- `ew`, `acc`처럼 폴더 역할과 중복되는 축약 접두사는 사용하지 않습니다.
- 단순히 다른 함수를 호출하기만 하는 wrapper는 만들지 않습니다.
- 로그인 확인은 `030_auth/auth_context.gs`의 `requireLoginContext_()`를 공통으로 사용합니다.
- 시트 탭 이름과 필드 이름은 schema 파일에서 관리하고, 기능 파일에는 흩뿌리지 않습니다.

행사복지관리처럼 서버 기능이 커지는 경우 기능 영역 안에서도 번호 하위 폴더를 둡니다.

```text
src/000_server/050_event/
├─ 050_common/       행사 공통 상수, 요청 검증, 페이지네이션, 결제 합계
├─ 051_events/       행사 목록, 상세, 생성, 수정, 상태 변경
├─ 052_applicants/   신청자 목록, 상세, 처리
├─ 053_attendance/   출석 목록, 변경, 검색
├─ 054_refunds/      환불 대상 조회
└─ 055_files/        행사 관련자료 업로드
```

## 라우팅 방식

화면 전환은 `doGet(e)`와 `?page=` 기반의 실제 페이지 라우팅을 사용합니다.

대표 페이지는 다음과 같습니다.

```text
login
main
settings
settings_users
settings_roles
settings_permissions
accounting
event
```

Apps Script 웹앱은 iframe 안에서 실행되므로, 로그인 이후 페이지 이동은 비동기 콜백에서 강제로 최상위 창을 이동시키는 방식보다 실제 링크 또는 사용자 동작 기반 라우팅을 우선합니다.

## 데이터베이스

현재 DB는 Google Sheets를 사용합니다.

- UserDB: 사용자, 부서, 역할, 권한, 권한 저장 이력
- OperationDB: 회계, 행사복지 등 운영 업무 데이터

DB의 탭 이름과 필드 이름은 다음 schema 파일을 기준으로 관리합니다.

```text
src/000_server/020_schema/user_db_schema.gs
src/000_server/020_schema/operation_db_schema.gs
```

탭 이름이나 필드 이름이 바뀌면 기능 파일이 아니라 schema 파일을 먼저 수정합니다.


## 로컬 개발

Apps Script 프로젝트에 반영할 때는 clasp를 사용합니다.

```bash
clasp push
clasp redeploy <deploymentId> -d "설명"
```

`clasp push`는 로컬 파일을 Apps Script 프로젝트에 올리는 작업입니다. GitHub push와는 별개입니다.

## 검수 기준

변경 후 최소한 다음을 확인합니다.

- 서버 `.gs`/`.js` 문법 오류 없음
- 클라이언트 `*_js.html` 스크립트 문법 오류 없음
- 클라이언트가 호출하는 `api_` 함수가 실제 서버에 존재함
- 제거한 함수의 호출부가 남아 있지 않음
- 보호 API는 서버에서 로그인 또는 권한을 확인함
- `git diff --check` 통과

Apps Script 배포 반영은 `clasp push`를 실행한 뒤 별도로 확인합니다.
