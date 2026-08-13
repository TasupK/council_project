# Accounting·Event HTML 분리 설계

## 1. 목적

`400_accounting`과 `600_event`에서 JavaScript 문자열로 생성하는 화면 구조를 HTML로 이동한다. 설정 페이지와 동일하게 HTML은 화면 구조와 접근성 속성을 담당하고, JavaScript는 API 호출, 상태 관리, 데이터 바인딩, 반복 항목 생성만 담당한다.

이번 작업은 기능 추가가 아니라 표현 계층의 구조 정리다. 기존 API 이름, 요청·응답 형식, 사용자 흐름, 서버 권한 검증은 변경하지 않는다.

## 2. 공통 원칙

- 페이지 제목, 필터, 폼, 탭, 모달, 표 헤더, 빈 상태, 작업 버튼은 HTML에 작성한다.
- 데이터 개수에 따라 반복되는 표 행, 페이지 번호, 선택 옵션, 첨부파일 항목만 JavaScript에서 생성한다.
- 화면 단위 전환에는 `<template>`을 사용한다. JavaScript는 템플릿을 복제한 뒤 필요한 컨테이너에 삽입한다.
- `innerHTML`은 반복 데이터 렌더링과 템플릿 삽입에만 제한한다.
- 서버에서 받은 문자열은 기존 `escapeHtml` 또는 `textContent`를 통해 출력한다.
- 람다식은 사용하지 않고 일반 `function` 문법을 유지한다.
- 기존 사용자 주석과 미구현 기능의 `TODO`는 보존한다.

## 3. Accounting 구조

### HTML

`Accounting_View.html`에 다음 구조를 유지하거나 추가한다.

- 장부 화면 제목과 내부 탭
- 수입·지출 요약, 필터, 표 헤더와 `<tbody>`
- 계좌 대조 업로드, 필터, 표 헤더와 `<tbody>`
- 결산 요약과 보고서 설정 폼
- 등록 모달과 상세 모달
- 상세 정보 행과 증빙 목록 컨테이너
- 빈 데이터 행용 `<template>`

Accounting은 이미 화면 골격 대부분이 HTML에 있으므로, 남아 있는 상세 정보 행, 증빙 항목, 페이지 버튼 등의 HTML 문자열 생성을 우선 축소한다.

### JavaScript

`accounting_client_js.html`은 다음 역할만 담당한다.

- API 호출과 오류 처리
- 현재 탭, 필터, 페이지, 선택 거래 상태 관리
- `<tbody>` 반복 행 생성
- 정적 DOM의 `textContent`, `value`, `hidden`, `classList` 갱신
- 파일 선택과 미리보기 데이터 바인딩

## 4. Event 구조

### HTML 템플릿

`EventWelfare_View.html`에 다음 `<template>`을 정의한다.

- `event-list-template`: 행사 목록 제목, 필터, 요약, 표 구조
- `event-form-template`: 행사 등록·수정 폼 전체
- `event-detail-template`: 행사 상세 요약, KPI, 탭, 탭 패널
- `event-basic-template`: 행사 기본 정보
- `event-applicants-template`: 신청자 도구 모음과 표 구조
- `event-attendance-template`: 출석 도구 모음, 표 구조, 변경 저장 영역
- `event-refunds-template`: 환불 도구 모음과 표 구조
- `event-pending-template`: 설계 미확정 기능 안내
- `event-applicant-modal-template`: 신청자 상세 모달

고정된 표 헤더와 버튼은 각 템플릿에 둔다. `<tbody>`, 페이지 영역, 상태값 컨테이너만 비워 두고 JavaScript가 채운다.

### JavaScript

`EventWelfare_Client.html`은 다음 순서로 정리한다.

1. 상태와 DOM 참조
2. API 호출과 공통 오류 처리
3. 템플릿 복제와 공통 데이터 바인딩
4. 행사 목록 데이터 바인딩
5. 행사 등록·수정 폼 데이터 바인딩
6. 행사 상세와 탭 데이터 바인딩
7. 신청자·출석·환불 반복 행 렌더링
8. 모달 데이터 바인딩
9. 사용자 이벤트 처리

`pageHead`, `field`, `formRow`, `applicantsToolbar`, `attendanceToolbar`, `tabsHtml`처럼 고정 HTML을 반환하는 함수는 제거한다.

## 5. 데이터 흐름

```text
doGet 라우팅
→ 진입 HTML 조립
→ View와 template 로드
→ 클라이언트 초기화
→ google.script.run API 호출
→ 템플릿 복제 또는 기존 정적 DOM 선택
→ textContent/value/classList와 반복 행 반영
```

페이지 라우팅, 로그인 검증, accounting/event 서버 API는 이번 작업에서 변경하지 않는다.

## 6. 오류 처리

- 템플릿 또는 필수 DOM이 없으면 초기화 단계에서 명확한 오류를 발생시킨다.
- API 실패는 기존 오류 표시 방식을 유지한다.
- 빈 목록은 표 전체를 문자열로 교체하지 않고 빈 상태 행을 표시한다.
- 미구현 기능 버튼은 비활성 상태와 `TODO`를 유지한다.

## 7. 검증 기준

- accounting/event 클라이언트 스크립트 문법이 통과한다.
- 람다식이 존재하지 않는다.
- 모든 `getElementById`와 템플릿 참조가 실제 HTML에 존재한다.
- 렌더된 페이지에 중복 ID가 없다.
- 클라이언트가 호출하는 모든 서버 API가 존재한다.
- 페이지 전체, 폼 전체, 모달 전체를 조립하는 대형 `innerHTML`이 남지 않는다.
- 반복 행 외의 표 헤더와 고정 버튼이 HTML에 존재한다.
- `git diff --check`가 통과한다.

## 8. 범위 제외

- accounting/event 기능 및 API 계약 변경
- 운영 DB 스키마 변경
- 세부 업무 권한 ID 추가
- 디자인 전면 개편
- `clasp push`와 실제 Apps Script 배포
