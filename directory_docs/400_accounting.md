# 400_accounting

회계관리 클라이언트 화면 영역이다. 장부 홈, 장부 내역, 입금 대조, 정산 화면을 담당한다.

## 구성

```text
src/400_accounting/
├─ 400_home/             회계 홈
├─ 410_ledger/           장부 내역
├─ 420_reconciliation/   입금 대조
├─ 430_settlement/       정산
└─ common/               회계 영역 전용 스타일과 client helper
```

## 역할

- 회계 화면 렌더링
- 회계 서버 API 호출
- 검색, 필터, 목록 표시, 입력 상태 관리

## 규칙

- 회계 서버 로직은 `src/000_server/060_accounting/`에 둔다.
- 회계 화면 공통 코드는 `common/`에 둔다.
- 화면 파일은 `진입 HTML`, `View`, `*_js.html` 단위로 분리한다.
- 미구현 버튼이나 API 호출은 실행 연결을 막고 TODO를 남긴다.

## 참고

상세 API와 서버 구조는 [회계관리 README](../Accounting_README.md)를 따른다.
