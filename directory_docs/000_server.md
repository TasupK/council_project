# backend

Apps Script에서 실행되는 서버 코드 영역이다. `doGet(e)` 라우팅, 로그인 확인, 권한 조회, Google Sheets/Drive 접근, schema 기반 데이터 처리, 서버 공개 API를 담당한다.

## 구성

`src/backend/app`은 부트스트랩·설정·라우팅, `core`는 인증·응답·DB·감사 기반, `domains`는 IAM·회계·학생회비·행사 업무를 담당한다.

## 규칙

- 클라이언트가 직접 호출하는 함수는 `api_`로 시작한다.
- 서버 내부 함수는 이름 끝에 `_`를 붙인다.
- 로그인 확인은 `requireLoginContext_()`를 공통으로 사용한다.
- 시트 탭 이름과 필드 이름은 schema 파일에서 관리한다.
- 기능별 권한 검사는 로그인 확인 이후 각 기능 영역에서 추가한다.
- Apps Script 전역 스코프에서 실행되므로 함수명 충돌을 반드시 확인한다.
- 도메인은 Controller → Application → Business Rules/Repository 방향을 따른다.
- 다른 도메인의 Repository나 Controller를 직접 호출하지 않고 Application facade를 사용한다.

## 검수

- 서버 `.gs`/`.js` 문법 오류가 없어야 한다.
- 공개 API 함수가 실제 클라이언트 호출명과 일치해야 한다.
- 제거한 함수의 호출부가 남아 있지 않아야 한다.
- 보호 API는 서버에서 로그인 또는 권한을 확인해야 한다.
