# login page

로그인 페이지 영역이다. Google Apps Script 세션의 사용자 이메일을 기준으로 로그인 가능 여부를 확인하고, 성공 시 메인 페이지로 이동한다.

## 구성

```text
src/frontend/pages/login/
├─ Login.html
├─ Login_View.html
└─ login_controller_js.html
```

## 흐름

```text
Login.html
-> Login_View.html 렌더링
-> login_controller_js.html
-> api_checkLogin()
-> 성공 시 main route 이동
```

## 규칙

- 클라이언트에서 인증 결과를 임의로 만들지 않는다.
- 로그인 판단은 서버의 `api_checkLogin()`과 `requireLoginContext_()` 흐름을 따른다.
- Apps Script iframe 제약 때문에 자동 이동은 사용자 동작 기반 route 이동을 우선한다.
- `login_controller_js.html`은 로그인 동작 중심으로 유지하고, 다른 페이지 공통 기능은 넣지 않는다.

## 참고

현재 로그인 페이지는 `src/frontend/pages/login/`에 있다.
