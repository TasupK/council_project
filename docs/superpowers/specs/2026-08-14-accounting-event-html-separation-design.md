# Accounting·Event HTML 분리 설계

## 1. 목적

`400_accounting`과 `600_event`를 설정 영역처럼 실제 페이지 단위로 분리하고, JavaScript 문자열로 생성하는 화면 구조를 각 페이지 HTML로 이동한다. HTML은 화면 구조와 접근성 속성을 담당하고, JavaScript는 해당 페이지의 API 호출, 상태 관리, 데이터 바인딩, 반복 항목 생성만 담당한다.

이번 작업은 기능 추가가 아니라 표현 계층의 구조 정리다. 기존 API 이름, 요청·응답 형식, 사용자 흐름, 서버 권한 검증은 변경하지 않는다.

## 2. 공통 원칙

- 페이지 제목, 필터, 폼, 탭, 모달, 표 헤더, 빈 상태, 작업 버튼은 HTML에 작성한다.
- 데이터 개수에 따라 반복되는 표 행, 페이지 번호, 선택 옵션, 첨부파일 항목만 JavaScript에서 생성한다.
- 주요 화면 전환은 `doGet(e)`와 `?page=` 라우트로 처리한다. JavaScript로 페이지 전체를 교체하지 않는다.
- 한 페이지 안에서 반복되는 행이나 모달 항목에만 필요한 경우 `<template>`을 사용한다.
- `innerHTML`은 반복 데이터 렌더링과 템플릿 삽입에만 제한한다.
- 서버에서 받은 문자열은 기존 `escapeHtml` 또는 `textContent`를 통해 출력한다.
- 람다식은 사용하지 않고 일반 `function` 문법을 유지한다.
- 기존 사용자 주석과 미구현 기능의 `TODO`는 보존한다.

## 3. Accounting 페이지 구조

```text
400_accounting/
├─ 400_home/
│  ├─ Accounting_Home.html
│  ├─ Accounting_Home_View.html
│  └─ accounting_home_js.html
├─ 410_ledger/
│  ├─ Accounting_Ledger.html
│  ├─ Accounting_Ledger_View.html
│  └─ accounting_ledger_js.html
├─ 420_reconciliation/
│  ├─ Accounting_Reconciliation.html
│  ├─ Accounting_Reconciliation_View.html
│  └─ accounting_reconciliation_js.html
├─ 430_settlement/
│  ├─ Accounting_Settlement.html
│  ├─ Accounting_Settlement_View.html
│  └─ accounting_settlement_js.html
└─ common/
   └─ accounting_common_js.html
```

### 페이지 책임

- `400_home`: 장부 요약과 장부 하위 페이지 진입점을 표시한다.
- `410_ledger`: 수입·지출 필터, 목록, 등록 모달, 상세 모달을 담당한다.
- `420_reconciliation`: 계좌내역 업로드, 대조 필터와 결과 목록을 담당한다.
- `430_settlement`: 결산 요약과 보고서 설정을 담당한다.
- `common`: accounting API 호출, 오류 처리, 금액·날짜 표시처럼 여러 accounting 페이지에서 공유하는 코드만 둔다.

각 진입 HTML은 공통 헤더·사이드바와 자기 View·JS만 include한다. 수입·지출 행, 대조 결과 행, 증빙 항목처럼 개수가 변하는 데이터만 JavaScript가 생성한다.

### Accounting 라우트

```text
?page=accounting
?page=accounting_ledger
?page=accounting_reconciliation
?page=accounting_settlement
```

`accounting`은 `400_home`을 반환한다. accounting 사이드바 또는 페이지 내 하위 메뉴는 실제 링크와 `target="_top"`을 사용한다.

## 4. Event 페이지 구조

```text
600_event/
├─ 600_home/
│  ├─ Event_Home.html
│  ├─ Event_Home_View.html
│  └─ event_home_js.html
├─ 610_form/
│  ├─ Event_Form.html
│  ├─ Event_Form_View.html
│  └─ event_form_js.html
├─ 620_detail/
│  ├─ Event_Detail.html
│  ├─ Event_Detail_View.html
│  └─ event_detail_js.html
└─ common/
   └─ event_common_js.html
```

### 페이지 책임

- `600_home`: 행사 필터, 요약, 목록과 생성 페이지 진입점을 담당한다.
- `610_form`: 행사 생성과 수정을 담당한다. `id`가 없으면 생성, 있으면 기존 행사 조회 후 수정으로 동작한다.
- `620_detail`: 행사 요약과 기본정보·신청자·출석·환불 탭을 담당한다.
- `common`: 행사 API 호출, 오류 처리, 텍스트 이스케이프, 금액·날짜·상태 표시처럼 여러 행사 페이지에서 공유하는 코드만 둔다.

행사 상세 내부 탭은 동일한 행사 컨텍스트를 공유하므로 별도 라우트로 나누지 않는다. 탭 패널의 고정 구조는 `Event_Detail_View.html`에 두고, 활성 탭 표시와 데이터 행만 JavaScript가 갱신한다.

### Event 라우트

```text
?page=event
?page=event_form
?page=event_form&id={eventId}
?page=event_detail&id={eventId}
```

페이지 간 이동은 실제 링크를 사용한다. `id`는 진입 HTML에서 안전하게 직렬화해 클라이언트 초기값으로 전달하고, 서버 API는 전달받은 ID에 대한 데이터 접근 권한과 존재 여부를 다시 검사한다.

`pageHead`, `field`, `formRow`, `applicantsToolbar`, `attendanceToolbar`, `tabsHtml`처럼 고정 HTML을 반환하는 함수는 제거한다.

## 5. 데이터 흐름

```text
doGet 라우팅과 로그인 검증
→ 페이지별 진입 HTML 조립
→ 해당 페이지 View와 JS만 로드
→ URL의 id를 안전한 초기값으로 전달
→ 페이지 전용 google.script.run API 호출
→ 정적 DOM의 textContent/value/classList와 반복 행 반영
```

로그인 검증과 accounting/event 서버 API 계약은 변경하지 않는다. `doGet`에는 페이지별 라우트와 `id` 초기값 전달만 추가한다.

## 6. 오류 처리

- 페이지별 필수 DOM이 없으면 초기화 단계에서 명확한 오류를 발생시킨다.
- API 실패는 기존 오류 표시 방식을 유지한다.
- 빈 목록은 표 전체를 문자열로 교체하지 않고 빈 상태 행을 표시한다.
- 미구현 기능 버튼은 비활성 상태와 `TODO`를 유지한다.

## 7. 검증 기준

- accounting/event 클라이언트 스크립트 문법이 통과한다.
- 람다식이 존재하지 않는다.
- 모든 `getElementById`와 템플릿 참조가 실제 HTML에 존재한다.
- 렌더된 페이지에 중복 ID가 없다.
- 클라이언트가 호출하는 모든 서버 API가 존재한다.
- accounting/event 하위 메뉴가 올바른 `?page=` 링크를 사용한다.
- 각 페이지가 자기 View와 JS만 include한다.
- 페이지 전체, 폼 전체, 모달 전체를 조립하는 대형 `innerHTML`이 남지 않는다.
- 반복 행 외의 표 헤더와 고정 버튼이 HTML에 존재한다.
- `git diff --check`가 통과한다.

## 8. 범위 제외

- accounting/event 기능 및 API 계약 변경
- 운영 DB 스키마 변경
- 세부 업무 권한 ID 추가
- 디자인 전면 개편
- `clasp push`와 실제 Apps Script 배포
