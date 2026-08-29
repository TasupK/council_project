# frontend 공통 기반

앱 전체에서 공유하는 클라이언트 레이아웃과 브라우저 공통 코드 영역이다. 특정 업무 기능의 데이터 처리나 화면 전용 로직은 이곳에 두지 않는다.

## 구성

공통 기반은 `src/frontend/app`, `shared`, `widgets/app_header`, `widgets/app_sidebar`에 책임별로 나뉜다.

## 역할

- 공통 헤더, 사이드바, 기본 레이아웃 제공
- 앱 전체에서 재사용하는 스타일 제공
- 현재 페이지 표시, 공통 페이지 이동, 기본 shell 동작 제공

## 규칙

- 특정 페이지에서만 쓰는 DOM 조작은 각 페이지의 `*_js.html`에 둔다.
- 특정 업무 API 호출은 기능 영역의 client JS에서 처리한다.
- 공통 navigation은 `doGet(e)`의 page route와 맞아야 한다.
- 사이드바 링크를 추가하면 `Code.js` route와 해당 페이지 파일도 함께 확인한다.
