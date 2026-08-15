# Event 도메인 리팩토링 설계

## 1. 목적

`src/000_server/050_event`를 학생회 행사복지 업무의 기준 구현(reference implementation)으로 정리한다.

이번 작업은 기존 기능을 수정하거나 확장하는 작업이 아니다. 공개 API 이름, 입력값, 반환 형태, 검증 결과, 현재 TODO에 기록된 미확정 업무 규칙을 유지하면서 내부 책임과 파일 구조만 재배치한다.

Event 도메인을 정리한 뒤 Accounting, Settings 등 다른 도메인이 동일한 규칙을 따를 수 있도록 기준 구조를 만든다.

## 2. 핵심 원칙

### 2.1 외부 동작 보존

다음 항목은 변경하지 않는다.

- 공개 `api_*` 함수명
- 공개 API 입력 형태
- 공개 API 반환 형태
- 현재 validation 결과와 error code
- UUID 생성 방식
- 현재 Lock 사용 방식
- Drive 업로드 정책
- 현재 TODO에 기록된 미확정 업무 규칙
- 클라이언트 HTML/JavaScript

리팩토링 중 기능상 문제를 발견하면 이번 작업에 섞지 않고 별도 이슈 또는 후속 작업으로 기록한다.

### 2.2 변경 이유를 기준으로 파일을 나눈다

파일 크기가 아니라 책임과 변경 이유를 기준으로 나눈다.

```text
API
  -> 요청 진입점과 공통 Handler 연결

Validator
  -> 입력값 해석, 정규화, 유효성 검증

Service
  -> 한 feature의 업무 상태 변경과 업무 규칙

Query Service
  -> 여러 feature의 데이터를 조합하여 조회 모델 생성

Sheet DAO
  -> 자기 feature의 Sheet 테이블 접근

File Service
  -> Google Drive 파일 처리
```

### 2.3 단방향 의존

기본 의존 방향은 다음과 같다.

```text
Public API
  -> Validator
  -> Feature Service
  -> Feature Sheet DAO
  -> Core Sheet CRUD
```

복합 조회는 다음 흐름을 사용한다.

```text
Public API
  -> Event Query Service
      -> Events DAO
      -> Applicants DAO
      -> Payment Service / DAO
      -> Attendance DAO
      -> Refund DAO
```

Feature Service끼리 양방향으로 호출하지 않는다.

```text
금지:
Applicant Service -> Payment Service
Payment Service   -> Applicant Service
```

여러 feature를 조합해야 하면 Query Service가 위에서 조정한다.

## 3. 목표 디렉터리 구조

```text
src/000_server/050_event/
├─ 050_common/
│  ├─ event_constants.gs
│  ├─ event_error.gs
│  ├─ event_request.gs
│  ├─ event_pagination.gs
│  └─ event_query_service.gs
│
├─ 051_events/
│  ├─ events_api.gs
│  ├─ events_service.gs
│  ├─ events_validator.gs
│  └─ events_sheet_dao.gs
│
├─ 052_applicants/
│  ├─ applicants_api.gs
│  ├─ applicants_service.gs
│  └─ applicants_sheet_dao.gs
│
├─ 053_payment/
│  ├─ payment_service.gs
│  └─ payment_sheet_dao.gs
│
├─ 054_attendance/
│  ├─ attendance_api.gs
│  ├─ attendance_service.gs
│  ├─ attendance_validator.gs
│  └─ attendance_sheet_dao.gs
│
├─ 055_refunds/
│  ├─ refunds_api.gs
│  ├─ refunds_service.gs
│  └─ refunds_sheet_dao.gs
│
└─ 056_files/
   └─ event_file_service.gs
```

현재 `053_attendance`, `054_refunds`, `055_files`는 각각 `054_attendance`, `055_refunds`, `056_files`로 이동한다.

## 4. Common 책임

`050_common`은 모든 하위 feature가 공유해도 되는 Event 전용 기반 코드만 가진다.

### 유지

- `event_constants.gs`
- `event_error.gs`
- `event_request.gs`
- `event_pagination.gs`

### 추가

- `event_query_service.gs`

### 제거 대상

현재 Common에 있는 아래 파일은 Payment feature로 이동한다.

- `event_payments.gs`
- `event_payment_sheet_dao.gs`

Common은 특정 업무 엔티티의 저장소나 업무 규칙을 소유하지 않는다.

## 5. 051_events

### 5.1 API

현재 `events.gs`는 `events_api.gs`로 이름을 명확히 한다.

다음 공개 함수는 이름과 계약을 그대로 유지한다.

- `api_getEventList`
- `api_getEventForEdit`
- `api_getEventDetail`
- `api_createEvent`
- `api_updateEvent`
- `api_updateEventStatus`
- `api_closeEvent`

API는 `apiHandler_()`와 parser/service 연결만 담당한다.

### 5.2 Validator

현재 `event_events.gs`의 아래 책임을 `events_validator.gs`로 이동한다.

- `buildEventPayload_`

행사 입력 필드 정규화, 숫자 파싱, 날짜 비교, status 검증은 Events Validator의 책임이다.

공통 primitive validator인 아래 함수는 `050_common/event_request.gs`에 유지한다.

- `requireEventRequestId_`
- `requireEventText_`
- `normalizeEventText_`
- `parseEventNumber_`
- `parseEventDateText_`
- `validateEventChoice_`

### 5.3 Service

아래 함수는 `events_service.gs`로 이동한다.

- `createEventData_`
- `updateEventData_`
- `updateEventStatusData_`
- `closeEventData_`
- `getEventData_`

이 함수들은 Event 자체의 생성, 수정, 상태 변경, 단일 엔티티 조회를 담당한다.

현재 구현의 UUID, timestamp, lock, 파일 업로드 호출, 기본 필드 생성 규칙은 그대로 유지한다.

### 5.4 Query Service로 이동

아래 함수는 여러 데이터를 조합하거나 화면 조회 모델을 만들기 때문에 `050_common/event_query_service.gs`로 이동한다.

- `getEventListData_`
- `getEventDetailData_`
- `getUniqueEventValues_`

`getEventListData_()`는 Events 데이터만 읽더라도 filtering, summary, options, pagination을 조합해 화면용 조회 모델을 만든다. 따라서 상태 변경 Service와 분리한다.

`getEventDetailData_()`는 Events, Applicants, Attendance, Payment 데이터를 조합하므로 반드시 Query Service에 둔다.

### 5.5 DAO

`events_sheet_dao.gs`의 아래 함수는 현재 구조를 유지한다.

- `findAllEventRows_`
- `findAllEventClientRows_`
- `findEventRowById_`
- `insertEventRow_`
- `updateEventRowById_`

DAO는 `events` 테이블 외 다른 feature를 알지 못한다.

## 6. 052_applicants

### 6.1 API

현재 `applicants.gs`는 `applicants_api.gs`로 이름을 명확히 한다.

다음 공개 함수는 유지한다.

- `api_getApplicantList`
- `api_getApplicantDetail`
- `api_processApplicant`

### 6.2 Service

아래 함수는 Applicant의 상태 변경 업무이므로 `applicants_service.gs`에 둔다.

- `processApplicantData_`

현재 `confirmDeposit`이 `PROCESS_FAILED`를 반환하는 동작도 그대로 유지한다.

### 6.3 Query Service로 이동

아래 함수는 Applicants 외 Payment 또는 Attendance 데이터를 조합하므로 `event_query_service.gs`로 이동한다.

- `getApplicantListData_`
- `getApplicantDetailData_`

### 6.4 DAO

`applicants_sheet_dao.gs`의 아래 함수는 유지한다.

- `findAllEventApplicationClientRows_`
- `findEventApplicationRowById_`
- `updateEventApplicationRowById_`

DAO는 `eventApplications` 테이블만 접근한다.

## 7. 053_payment

Payment는 Common helper가 아니라 Event 내부의 독립 업무 feature로 취급한다.

근거는 다음과 같다.

- `eventPayments`라는 독립 테이블이 존재한다.
- Applicant, Attendance, Event Detail 등 여러 업무가 결제 상태를 참조한다.
- 신청별 납부 합계 계산은 단순 문자열/배열 utility가 아니라 Payment 데이터 해석 규칙이다.

### 7.1 Service

현재 `050_common/event_payments.gs`의 아래 함수를 `053_payment/payment_service.gs`로 이동한다.

- `getEventPaymentTotalsByApplicationId_`

현재 계산 방식과 반환 형태는 변경하지 않는다.

### 7.2 DAO

현재 `050_common/event_payment_sheet_dao.gs`의 아래 함수를 `053_payment/payment_sheet_dao.gs`로 이동한다.

- `findAllEventPaymentClientRows_`

DAO는 `eventPayments` 테이블만 접근한다.

### 7.3 공개 API

현재 Payment 전용 공개 API는 없다. 이번 리팩토링에서 새 API를 만들지 않는다.

## 8. 054_attendance

현재 `053_attendance`를 `054_attendance`로 이동한다.

### 8.1 API

현재 `attendance.gs`는 `attendance_api.gs`로 이름을 명확히 한다.

다음 공개 함수는 유지한다.

- `api_getAttendanceList`
- `api_applyAttendanceChanges`

### 8.2 Service

아래 함수는 출석 상태 변경 업무이므로 `attendance_service.gs`에 둔다.

- `applyAttendanceChangesData_`
- `findEventAttendanceByApplicationId_`

`findEventAttendanceByApplicationId_()`는 현재 단순 검색 helper지만 Attendance feature 내부 구현으로 유지한다. 이번 단계에서 새로운 DAO query primitive를 만들지 않는다.

### 8.3 Validator

출석 변경 payload의 `items`, `applicationId`, `status` 검증은 향후 `attendance_validator.gs`로 옮길 수 있도록 파일 경계를 마련한다.

이번 작업에서는 외부 동작 보존이 우선이므로 validation 코드를 이동하더라도 error code와 message를 변경하지 않는다.

### 8.4 Query Service로 이동

아래 함수는 Applicants + Attendance + Payment를 조합하므로 `event_query_service.gs`로 이동한다.

- `getAttendanceListData_`

### 8.5 DAO

현재 `attendance_sheet_dao.gs`의 아래 함수는 유지한다.

- `findAllEventAttendanceClientRows_`
- `findEventAttendanceRowById_`
- `insertEventAttendanceRow_`
- `updateEventAttendanceRowById_`

DAO는 `eventAttendance` 테이블만 접근한다.

## 9. 055_refunds

현재 `054_refunds`를 `055_refunds`로 이동한다.

### 9.1 API

현재 `refunds.gs`는 `refunds_api.gs`로 이름을 명확히 한다.

공개 함수는 유지한다.

- `api_getEventRefundList`

### 9.2 Query Service

현재 `getEventRefundListData_()`는 Refund와 Applicant 데이터를 조합하므로 `event_query_service.gs`로 이동한다.

- `getEventRefundListData_`

### 9.3 Service

현재 실제 환불 상태 변경 기능은 구현되어 있지 않으므로 `refunds_service.gs`에는 억지로 로직을 만들지 않는다.

향후 환불 대상 선정, 환불 승인, 이체 결과 반영 등 상태 변경 업무가 생길 때 Service에 추가한다.

### 9.4 DAO

현재 `refunds_sheet_dao.gs`의 아래 함수는 유지한다.

- `findAllEventRefundClientRows_`

DAO는 `eventRefunds` 테이블만 접근한다.

## 10. 056_files

현재 `055_files/event_files.gs`를 `056_files/event_file_service.gs`로 이동한다.

이 feature는 Spreadsheet DAO 계층이 아니라 Google Drive 외부 서비스 경계다.

다음 함수는 File Service에 유지한다.

- `uploadEventRelatedMaterial_`
- `getEventMaterialFolder_`
- `sanitizeEventDriveFileName_`

다음 설정값도 File Service에 유지한다.

- `EVENT_MATERIAL_FOLDER_PROPERTY_KEY`
- `EVENT_MATERIAL_FOLDER_NAME`
- `EVENT_MAX_MATERIAL_FILE_SIZE_BYTES`
- `EVENT_MATERIAL_FILE_EXTENSIONS`

DriveApp, PropertiesService, blob 생성 동작을 이번 작업에서 변경하지 않는다.

## 11. Query Service 함수 매핑

최종적으로 `050_common/event_query_service.gs`가 담당할 현재 함수는 다음과 같다.

```text
getEventListData_
getEventDetailData_
getUniqueEventValues_
getApplicantListData_
getApplicantDetailData_
getAttendanceListData_
getEventRefundListData_
```

Query Service는 조회 모델을 만들기 위해 여러 feature의 DAO/Service를 읽을 수 있다.

단, 쓰기 작업은 하지 않는다.

```text
Query Service 금지:
- insert*
- update*
- Drive 파일 생성
- 상태 변경
- Lock을 잡고 데이터 수정
```

## 12. 함수 이동 요약

```text
현재: 051_events/event_events.gs
  buildEventPayload_              -> 051_events/events_validator.gs
  getEventListData_               -> 050_common/event_query_service.gs
  getUniqueEventValues_           -> 050_common/event_query_service.gs
  createEventData_                -> 051_events/events_service.gs
  updateEventData_                -> 051_events/events_service.gs
  updateEventStatusData_          -> 051_events/events_service.gs
  closeEventData_                 -> 051_events/events_service.gs
  getEventData_                   -> 051_events/events_service.gs
  getEventDetailData_             -> 050_common/event_query_service.gs

현재: 052_applicants/event_applicants.gs
  getApplicantListData_           -> 050_common/event_query_service.gs
  getApplicantDetailData_         -> 050_common/event_query_service.gs
  processApplicantData_           -> 052_applicants/applicants_service.gs

현재: 050_common/event_payments.gs
  getEventPaymentTotalsByApplicationId_
                                  -> 053_payment/payment_service.gs

현재: 050_common/event_payment_sheet_dao.gs
  findAllEventPaymentClientRows_  -> 053_payment/payment_sheet_dao.gs

현재: 053_attendance/event_attendance.gs
  getAttendanceListData_          -> 050_common/event_query_service.gs
  applyAttendanceChangesData_     -> 054_attendance/attendance_service.gs
  findEventAttendanceByApplicationId_
                                  -> 054_attendance/attendance_service.gs

현재: 054_refunds/event_refunds.gs
  getEventRefundListData_         -> 050_common/event_query_service.gs

현재: 055_files/event_files.gs
  전체                            -> 056_files/event_file_service.gs
```

## 13. 파일 이름 규칙

기준 구현에서는 역할이 이름에 드러나도록 한다.

```text
*_api.gs
*_service.gs
*_validator.gs
*_sheet_dao.gs
```

공통 조회 조합만 `event_query_service.gs`로 둔다.

기존 내부 함수 이름은 이번 리팩토링에서 불필요하게 변경하지 않는다. 파일 이동과 함수 rename을 동시에 수행하면 회귀 추적이 어려워지기 때문이다.

## 14. 리팩토링 실행 순서

### 1단계: Payment 승격

- `053_payment` 생성
- `event_payments.gs` -> `payment_service.gs` 이동
- `event_payment_sheet_dao.gs` -> `payment_sheet_dao.gs` 이동
- 참조가 유지되는지 검증

### 2단계: 기존 폴더 번호 이동

- `053_attendance` -> `054_attendance`
- `054_refunds` -> `055_refunds`
- `055_files` -> `056_files`

Apps Script에서 폴더 자체는 런타임 namespace가 아니므로 함수 계약은 유지하되 clasp 배포 대상 경로를 검증한다.

### 3단계: API 파일 명확화

- `events.gs` -> `events_api.gs`
- `applicants.gs` -> `applicants_api.gs`
- `attendance.gs` -> `attendance_api.gs`
- `refunds.gs` -> `refunds_api.gs`

공개 함수 내용은 최소 변경한다.

### 4단계: Service/Validator 분리

Events부터 적용한다.

- `events_validator.gs`
- `events_service.gs`

그 다음 Applicants와 Attendance 상태 변경 로직을 각 Service로 이동한다.

### 5단계: Query Service 구성

여러 feature를 조합하는 조회 함수를 `event_query_service.gs`로 이동한다.

기존 API 함수는 같은 내부 함수 이름을 계속 호출하도록 하여 외부 계약과 호출 흐름을 보존한다.

### 6단계: 기존 임시 파일 제거

호출 참조가 모두 사라진 것을 확인한 뒤 아래 임시/과도기 파일을 제거한다.

- `event_events.gs`
- `event_applicants.gs`
- `event_attendance.gs`
- `event_refunds.gs`

## 15. 검증 기준

### 외부 호환성

- 기존 Event 공개 `api_*` 함수가 모두 존재한다.
- 공개 함수 인자와 반환 형태가 동일하다.
- 기존 validation/error 결과가 유지된다.
- 클라이언트 수정 없이 기존 화면 호출이 가능하다.

### 구조

- Payment가 `053_payment` 독립 feature에 존재한다.
- Attendance는 `054_attendance`에 존재한다.
- Refunds는 `055_refunds`에 존재한다.
- Files는 `056_files`에 존재한다.
- Feature Service가 다른 Feature Service와 양방향 의존하지 않는다.
- 복합 조회는 `event_query_service.gs`에 모인다.
- Query Service는 쓰기 작업을 하지 않는다.
- DAO는 자기 테이블만 접근한다.
- Google Drive API 호출은 `056_files/event_file_service.gs`에 격리된다.

### 기능 보존

- 행사 목록/상세/수정 조회
- 행사 생성/수정/상태변경/종료
- 신청자 목록/상세/승인/반려
- 출석 목록/변경
- 환불 대상 조회
- 관련자료 업로드

위 동작은 구조 변경 전후 동일해야 한다.

## 16. 이번 작업에서 하지 않는 것

- Payment 공개 API 신규 구현
- 입금 확인 규칙 구현
- 환불 처리 기능 구현
- Google Forms 동기화 구현
- 출석 원본 동기화 구현
- 권한 정책 변경
- API 응답 DTO 재설계
- 오류 체계 재설계
- 캐시 도입
- Repository interface 도입
- Dependency Injection 도입
- 범용 ORM 또는 Query Builder 도입

현재 프로젝트 규모와 Apps Script 특성을 고려하여 필요한 만큼만 구조화한다.
