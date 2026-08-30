# event frontend

행사복지관리 클라이언트 화면 영역이다. 행사 목록, 행사 등록/수정, 행사 상세 화면을 담당한다.

## 구성

행사 라우트는 `src/frontend/pages/event_*`, 사용자 행동은 `features/event_*`, 엔티티 API·공통 표현은 `entities/event`에 둔다.

## 역할

- 행사 화면 렌더링
- 행사 서버 API 호출
- 검색, 필터, 목록, 상세, 입력 상태 관리

## 규칙

- 행사 서버 로직은 `src/backend/domains/event/`에 둔다.
- 행사 화면 공통 표현과 API는 `entities/event/`에 둔다.
- 화면 파일은 `진입 HTML`, `View`, `*_js.html` 단위로 분리한다.
- 상세 기능은 Page Controller가 필요한 feature를 조합하며 서로의 서버 책임을 복제하지 않는다.
- 화면에서 사용하는 필드는 운영 DB schema와 맞춰 관리한다.
- 미구현 API는 호출하지 않고 TODO로 남긴다.
