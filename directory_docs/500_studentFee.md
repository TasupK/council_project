# student fee

학생회비 납부자, 납부 승인, 환불 업무를 담당한다.

## 구조

```text
src/backend/domains/student_fee/
src/frontend/pages/student_fee_*/
src/frontend/features/student_fee_*/
src/frontend/entities/student_fee*/
```

## 규칙

- 서버 로직은 `src/backend/domains/student_fee/`에 둔다.
- 운영 DB 필드는 `operation_db_schema.gs` 기준으로 먼저 정의한다.
- 화면 파일은 진입 HTML, View, client JS로 나눈다.
- 미구현 기능은 TODO로 남기고 실제 호출은 연결하지 않는다.
