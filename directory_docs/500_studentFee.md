# 500_studentFee

학생회비관리 영역으로 예약된 디렉토리다.

현재는 구체적인 화면 파일이 없다. 추후 기능을 통합할 때 기존 번호 체계를 따라 페이지 폴더를 만든다.

## 예정 구조

```text
src/500_studentFee/
├─ 500_home/
├─ 510_...
└─ common/
```

## 규칙

- 서버 로직은 `src/000_server/070_studentFee/`처럼 별도 서버 영역을 만든 뒤 연결한다.
- 운영 DB 필드는 `operation_db_schema.gs` 기준으로 먼저 정의한다.
- 화면 파일은 진입 HTML, View, client JS로 나눈다.
- 미구현 기능은 TODO로 남기고 실제 호출은 연결하지 않는다.
