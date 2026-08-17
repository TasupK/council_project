# Event 도메인 리팩토링 설계

## 1. 목적

`src/000_server/050_event`를 학생회 행사복지 업무의 기준 구현(reference implementation)으로 정리한다.

이번 리팩토링은 공개 API 이름, 입력/출력 형태, validation/error, UUID, lock, Drive 처리, 기존 TODO 동작을 유지하면서 내부 책임과 파일 구조만 재배치한다.

## 2. 핵심 원칙

- API는 `apiHandler_()` 연결만 담당하는 얇은 진입점으로 유지한다.
- Service는 자기 feature의 상태 변경과 업무 규칙만 담당한다.
- Query Service는 자기 feature의 조회 모델과 필요한 cross-feature read composition을 담당하며 쓰기를 하지 않는다.
- Sheet DAO는 자기 feature의 Sheet 테이블 접근만 담당한다.
- File Service는 Google Drive I/O만 담당한다.
- `050_common`에는 primitive 수준의 Event 공통 코드만 둔다.
- Feature Service끼리 양방향 의존하지 않는다.
- 형식 대칭을 위해 빈 Service/Validator 파일을 만들지 않는다.
- Apps Script 전역 함수 모델을 그대로 사용하며 class/DI/generic repository/ORM을 도입하지 않는다.

## 3. 최종 구조

```text
src/000_server/050_event/
├─ 050_common/
│  ├─ event_constants.gs
│  ├─ event_error.gs
│  ├─ event_request.gs
│  └─ event_pagination.gs
├─ 051_events/
│  ├─ events_api.gs
│  ├─ events_service.gs
│  ├─ events_query_service.gs
│  ├─ events_validator.gs
│  └─ events_sheet_dao.gs
├─ 052_applicants/
│  ├─ applicants_api.gs
│  ├─ applicants_service.gs
│  ├─ applicants_query_service.gs
│  └─ applicants_sheet_dao.gs
├─ 053_payment/
│  ├─ payment_service.gs
│  └─ payment_sheet_dao.gs
├─ 054_attendance/
│  ├─ attendance_api.gs
│  ├─ attendance_service.gs
│  ├─ attendance_query_service.gs
│  └─ attendance_sheet_dao.gs
├─ 055_refunds/
│  ├─ refunds_api.gs
│  ├─ refunds_query_service.gs
│  └─ refunds_sheet_dao.gs
└─ 056_files/
   └─ event_file_service.gs
```

`050_common/event_query_service.gs`는 존재하지 않는다.

## 4. 함수 소유권

### 4.1 Events

`events_service.gs`
- `createEventData_`
- `updateEventData_`
- `updateEventStatusData_`
- `closeEventData_`

`events_query_service.gs`
- `getEventData_`
- `getEventListData_`
- `getUniqueEventValues_`
- `getEventDetailData_`

`events_validator.gs`
- `buildEventPayload_`

`events_sheet_dao.gs`
- Events 테이블 read/write 함수

### 4.2 Applicants

`applicants_service.gs`
- `processApplicantData_`

`applicants_query_service.gs`
- `getApplicantListData_`
- `getApplicantDetailData_`

`applicants_sheet_dao.gs`
- Event Applications 테이블 접근

### 4.3 Payment

`payment_service.gs`
- `getEventPaymentTotalsByApplicationId_`

`payment_sheet_dao.gs`
- `findAllEventPaymentClientRows_`

Payment는 Common helper가 아니라 독립 feature다.

### 4.4 Attendance

`attendance_service.gs`
- `applyAttendanceChangesData_`

`attendance_query_service.gs`
- `getAttendanceListData_`

`attendance_sheet_dao.gs`
- Attendance 테이블 read/write 함수
- `findEventAttendanceByApplicationId_`

`findEventAttendanceByApplicationId_()`는 Attendance 저장소 조회이므로 Service가 아니라 DAO가 소유한다.

### 4.5 Refunds

`refunds_query_service.gs`
- `getEventRefundListData_`

`refunds_sheet_dao.gs`
- `findAllEventRefundClientRows_`

현재 환불 상태 변경 로직이 없으므로 `refunds_service.gs`는 만들지 않는다.

### 4.6 Files

`event_file_service.gs`
- `uploadEventRelatedMaterial_`
- `getEventMaterialFolder_`
- `sanitizeEventDriveFileName_`

Drive 동작은 기존 구현을 유지한다.

## 5. Query Service 규칙

Query Service는 자기 feature가 제공하는 화면 조회를 소유한다. 복합 조회를 위해 다른 feature의 read 함수나 계산 Service를 호출할 수 있다.

금지 사항:

```text
withOperationWriteLock_
appendOperationTableRow_
updateOperationTableRow_
DriveApp 기반 파일 생성
상태 변경 side effect
```

예를 들어 `getEventDetailData_()`는 Events Query Service가 소유하지만 Applicants, Attendance, Payment 데이터를 읽어 상세 화면을 조합할 수 있다.

## 6. 공개 API 호환

다음 공개 API 이름과 계약을 유지한다.

Events:
- `api_getEventList`
- `api_getEventForEdit`
- `api_getEventDetail`
- `api_createEvent`
- `api_updateEvent`
- `api_updateEventStatus`
- `api_closeEvent`

Applicants:
- `api_getApplicantList`
- `api_getApplicantDetail`
- `api_processApplicant`

Attendance:
- `api_getAttendanceList`
- `api_applyAttendanceChanges`

Refunds:
- `api_getEventRefundList`

Payment 전용 공개 API는 이번 리팩토링에서 추가하지 않는다.

## 7. 동작 보존 규칙

다음은 구조 변경 중 수정하지 않는다.

- `getEventListData_()`의 기존 filter/sort/summary/options/pagination 동작
- `getEventListData_()`의 현재 중복 read 패턴
- `getEventDetailData_()`의 `currentBalance: null`
- Applicant의 `confirmDeposit` PROCESS_FAILED 동작
- Payment 합산 규칙
- Attendance validation/status 변경 규칙
- Refund 조회 조합 방식
- UUID/timestamp/lock/Drive/TODO 동작

성능 최적화나 미구현 업무 규칙 보완은 별도 작업으로 분리한다.

## 8. 검증 기준

`scripts/verify-event-architecture.js`는 다음을 검증한다.

- 최종 파일 경로 존재
- 중앙 `event_query_service.gs` 부재
- 함수별 단일 소유권
- Query Service read-only 경계
- 중복 함수 정의 부재
- 빈 `attendance_validator.gs`, `refunds_service.gs` 같은 대칭용 skeleton 부재

`scripts/test-event.js`는 다음 동작을 회귀 검증한다.

- Payment 합계
- 단일 Event 조회/NOT_FOUND
- Event 목록/요약/options
- Event 상세 집계
- Applicant 목록/상세
- Attendance 목록
- Refund 목록

Event는 이 구조를 다른 서버 도메인 리팩토링의 기준 구현으로 사용한다.
