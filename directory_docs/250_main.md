# 250_main

로그인 후 진입하는 메인 페이지 영역이다. 기능 메뉴로 이동하기 위한 허브 역할을 한다.

## 구성

```text
src/250_main/
├─ Main.html
├─ Main_View.html
├─ Main_Styles.html
└─ main_js.html
```

## 역할

- 로그인 사용자 정보 표시
- 주요 업무 메뉴 진입
- 공통 헤더와 사이드바 포함

## 규칙

- 메인 화면은 업무 데이터를 과하게 선조회하지 않는다.
- 기능별 상세 데이터는 각 업무 페이지 API에서 조회한다.
- 메뉴 추가 시 `App_Sidebar.html`, `Code.js` route, 대상 페이지 파일을 함께 확인한다.
