# Student Fee Form Source Provenance Design

## Goal

회비 납부 Google Form의 원본 응답 저장소를 OperationDB와 분리하고, OperationDB에는 정규화된 `납부신청`만 저장한다. 각 신청은 Google Form의 실제 Response ID를 provenance로 보유하여 동일 응답의 중복 import를 구조적으로 방지한다.

## Current Problem

현재 OperationDB 파일 안에 `납부폼_응답` 탭이 존재하지만 정식 OperationDB schema에는 포함되지 않는다. 정식 업무 데이터인 `납부신청(feeApplications)`은 `납부신청ID`만 가지고 있고 원본 Google Form 응답과의 추적 키가 없다. 따라서 동일 원본 응답을 다시 읽었을 때 이미 import되었는지를 안정적으로 판별할 수 없다.

## Source Boundary

### Canonical source

- Google Form 자체가 canonical source다.
- 원본 응답 고유키는 `FormResponse.getId()`의 Google Form Response ID다.
- 원본 응답 시각은 `FormResponse.getTimestamp()`를 사용한다.
- Google Form 연결 응답 Spreadsheet는 사람이 확인할 수 있는 raw mirror이며 시스템이 수정하지 않는다.
- OperationDB의 서비스는 Form/응답 Spreadsheet에 write하지 않는다.

### Important constraint

Google Form 응답 Spreadsheet에는 Response ID가 기본 컬럼으로 저장되지 않는다. 따라서 `원본응답ID`를 안정적으로 얻으려면 Spreadsheet row number나 `timestamp + studentId`를 조합하지 않고 FormApp을 통해 FormResponse를 읽어야 한다.

## Target Flow

```text
Google Form
  ├─ FormResponse.getId() / getTimestamp()
  └─ 별도 Google Form 응답 Spreadsheet (raw mirror, read-only)
              ↓
Student Fee Form Import Service
              ↓
OperationDB.납부신청
  ├─ 납부신청ID
  ├─ 원본응답ID
  ├─ 원본응답일시
  ├─ 가져온일시
  └─ 기존 신청 업무필드
```

## OperationDB Schema Change

`feeApplications`에 다음 필드를 추가한다.

- `sourceResponseId` → `원본응답ID`
- `sourceResponseAt` → `원본응답일시`
- `importedAt` → `가져온일시`

기존 필드는 유지한다.

```text
납부신청ID
원본응답ID
원본응답일시
학번
성명
소속
납입날짜
신청학기차수
신청일시
신청상태
가져온일시
담당자이메일
처리일시
학생카드캡쳐파일ID
입금캡쳐파일ID
```

`납부신청ID`는 업무 PK로 유지한다. `원본응답ID`는 provenance business key이며 중복을 허용하지 않는다.

## Import Contract

### Input

Import service는 설정된 Google Form ID를 사용하여 Form responses를 읽는다.

각 응답에서 최소 다음 정보를 추출한다.

```javascript
{
  sourceResponseId: response.getId(),
  sourceResponseAt: response.getTimestamp(),
  studentId: ...,
  name: ...,
  affiliation: ...,
  paymentDate: ...,
  semesterNumber: ...,
  studentCardFileId: ...,
  depositFileId: ...
}
```

질문 매핑은 응답 Spreadsheet의 물리적 열 위치가 아니라 Google Form item title 기준으로 수행한다.

### Deduplication

- `sourceResponseId`가 이미 `feeApplications`에 존재하면 재생성하지 않는다.
- 중복은 오류가 아니라 `skipped` 결과로 처리한다.
- 중복 확인과 insert는 write lock 안에서 authoritative reread 후 수행한다.

### Creation

신규 응답은 다음 규칙으로 저장한다.

- `id`: 기존 `PAYAPP-*` 생성 규칙 유지
- `sourceResponseId`: Google Form Response ID
- `sourceResponseAt`: Google Form response timestamp
- `appliedAt`: 원본 응답일시를 기준으로 저장
- `importedAt`: 실제 import 실행 시각
- `status`: 기존 신규 신청 기본상태 유지
- `managerEmail`: import를 실행한 현재 사용자 이메일
- 파일 ID: Form의 파일 업로드 답변에서 Drive file ID를 정규화하여 저장

## Audit

신규 import마다 canonical business audit를 기록한다.

```text
IMPORT / feeApplications
```

- before: `null`
- after: 생성된 `feeApplications` row
- reason: `Google Form 납부신청 가져오기`

중복 skip은 DB mutation이 아니므로 업무감사로그를 생성하지 않는다.

## Source Configuration

Google Form ID는 코드 상수로 하드코딩하지 않는다. OperationDB `_설정`에 설정키를 사용한다.

권장 키:

```text
STUDENT_FEE_PAYMENT_FORM_ID
```

응답 Spreadsheet ID는 import에 필수는 아니므로 시스템 source-of-truth 설정으로 사용하지 않는다. 운영자가 raw 응답 파일을 열기 위한 UI가 필요할 때만 별도 설정을 추가한다.

## Existing Data Migration

현재 `납부신청`의 기존 행은 원본 Response ID를 복원할 수 있는 확실한 근거가 없다. `timestamp + studentId` 등으로 추정하여 backfill하지 않는다.

따라서:

- 기존 `납부신청` 행의 provenance 3개 컬럼은 nullable legacy 값으로 둔다.
- 신규 Form import로 만들어지는 행부터 provenance를 필수로 기록한다.
- integrity는 `sourceResponseId`가 존재하는 행에 대해서만 uniqueness를 강제한다.

현재 OperationDB의 `납부폼_응답` 탭은 새 import 경로와 전체 regression이 검증되기 전까지 삭제하지 않는다. 최종 migration 단계에서 별도 백업 후 탭을 제거한다.

## Raw Source Decommission

삭제 조건:

1. `납부폼_응답`을 읽거나 쓰는 production 코드가 0건이다.
2. 실제 Google Form ID가 `_설정`에 등록되어 있다.
3. FormApp 기반 parser/import 테스트가 GREEN이다.
4. 실제 Form response 한 건 이상을 dry-run/read-only로 정상 파싱한다.
5. OperationDB 백업을 생성한다.
6. 기존 `납부신청` 행 수와 PK를 snapshot한다.
7. `납부폼_응답` 탭을 삭제한다.
8. OperationDB 전체 integrity를 재검증한다.

## Non-Goals

이번 작업에서는 다음을 하지 않는다.

- 학생회비 프론트엔드 전수 수정
- 기존 legacy `납부신청`에 sourceResponseId 추정 backfill
- Google Form 질문 자체의 재설계
- 환불 Form source 분리
- 기존 과거 raw 응답 내용 수정

## Acceptance Criteria

1. OperationDB schema의 `feeApplications`가 provenance 3개 필드를 가진다.
2. Google Form Response ID가 신규 신청의 canonical source key다.
3. 동일 Response ID는 두 번 import되지 않는다.
4. source row 식별에 Spreadsheet row number를 사용하지 않는다.
5. Google Form/응답 Spreadsheet는 시스템에서 write하지 않는다.
6. 신규 import는 `IMPORT / feeApplications` audit를 기록한다.
7. legacy `납부신청`은 provenance null을 허용하고 기존 PK/행 수를 보존한다.
8. 새 경로 검증 후에만 OperationDB `납부폼_응답` 탭을 제거한다.
