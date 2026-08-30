# 학생회 통합 업무관리

Google Apps Script와 clasp를 기반으로 만드는 학생회 통합 업무관리 웹앱입니다.

로그인, 설정, 회계, 학생회비, 행사복지 기능을 하나의 Apps Script 웹앱으로 통합합니다. 서버와 프론트엔드를 물리적으로 분리하고, 공개 API 계약과 사용자 동작을 유지하면서 업무 책임별 구조를 적용합니다.

## 현재 구성

```text
src/
├─ appsscript.json
├─ backend/
│  ├─ app/               부트스트랩, 설정, 라우팅
│  ├─ core/              인증, 응답, DB·스키마, 감사 공통 기반
│  └─ domains/           accounting, event, iam, student_fee
└─ frontend/
   ├─ app/               앱 shell과 전역 스타일
   ├─ pages/             라우트 단위 화면과 Page Controller
   ├─ widgets/           여러 기능을 조합하는 UI 블록
   ├─ features/          사용자 행동 단위 로직
   ├─ entities/          업무 엔티티별 API·표현
   └─ shared/            업무 비의존 RPC transport와 공통 스타일
```

## 서버 구조 원칙

- 클라이언트가 직접 호출하는 서버 함수는 `api_`로 시작합니다.
- 서버 내부 함수는 이름 끝에 `_`를 붙입니다.
- `ew`, `acc`처럼 폴더 역할과 중복되는 축약 접두사는 사용하지 않습니다.
- 단순히 다른 함수를 호출하기만 하는 wrapper는 만들지 않습니다.
- 로그인 확인은 `backend/core/auth/auth_context.gs`의 `requireLoginContext_()`를 공통으로 사용합니다.
- 시트 탭 이름과 필드 이름은 schema 파일에서 관리하고, 기능 파일에는 흩뿌리지 않습니다.

각 업무 도메인은 필요한 계층만 생성합니다.

```text
src/backend/domains/<domain>/
├─ controllers/       공개 API와 요청·응답 경계
├─ application/       유스케이스와 업무 흐름 조정
├─ business_rules/    Apps Script 인프라에 의존하지 않는 순수 규칙
└─ repositories/      Sheets, Drive, Forms 등 영속성·외부 서비스 접근
```

의존 방향은 `Controller → Application → Business Rules / Repository`입니다. 공통 기능은 상속하지 않고 조합하며, 다른 도메인의 Repository나 Controller를 직접 호출하지 않습니다. 도메인 간 연동은 Application facade를 사용합니다.

프론트엔드 의존 방향은 `app → pages → widgets/features → entities → shared`입니다. `shared`는 업무 지식을 갖지 않으며, `google.script.run` 직접 호출은 `frontend/shared/api/rpc`의 RPC transport만 담당합니다.

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
src/backend/core/db/schema/user_db_schema.gs
src/backend/core/db/schema/operation_db_schema.gs
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
