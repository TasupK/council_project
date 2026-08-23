# 600_event

행사복지관리 클라이언트 화면 영역이다. 행사 목록, 행사 등록/수정, 행사 상세 화면을 담당한다.

## 구성

```text
src/600_event/
├─ 600_common/   행사 공통 상태, API client, 스타일과 화면 보조 함수
├─ 610_home/     행사 목록, 검색, 요약과 상태 변경
├─ 620_form/     행사 등록과 수정
└─ 630_detail/   행사 상세와 기능별 탭 모듈
   ├─ event_detail_core_js.html          상세 캐시, 헤더, KPI, 기본정보
   ├─ event_detail_applicants_js.html    신청자 조회, 상세, 승인·반려
   ├─ event_detail_attendance_js.html    참가비·출석 조회와 일괄 저장
   ├─ event_detail_refunds_js.html       환불 대상 조회
   ├─ event_form_sync_js.html            Google Forms 응답 연동 확장
   └─ event_detail_bootstrap_js.html     이벤트 위임과 최초 상세 조회
```

## 역할

- 행사 화면 렌더링
- 행사 서버 API 호출
- 검색, 필터, 목록, 상세, 입력 상태 관리

## 규칙

- 행사 서버 로직은 `src/000_server/050_event/`에 둔다.
- 행사 화면 공통 코드는 `600_common/`에 둔다.
- 화면 파일은 `진입 HTML`, `View`, `*_js.html` 단위로 분리한다.
- 상세 탭 기능은 `core → applicants → attendance → refunds → form_sync → bootstrap` 순서로 불러온다.
- 상세 기능 파일은 `src/000_server/050_event`의 업무 경계를 따라 분리하고 서로의 서버 책임을 복제하지 않는다.
- 화면에서 사용하는 필드는 운영 DB schema와 맞춰 관리한다.
- 미구현 API는 호출하지 않고 TODO로 남긴다.
