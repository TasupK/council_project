# Business Audit Taxonomy Design

## 1. 목적

`업무감사로그`를 Student Fee, Accounting, Event가 함께 사용하는 시스템 공통 감사로그로 정리한다.

현재 스키마는 공통 9개 컬럼을 이미 제공하지만, 도메인별로 `행위구분`과 `대상구분`의 표현 방식이 서로 다르다. Student Fee는 `생성`, `수정`, `승인`과 같은 한글 값을 사용하고 Accounting은 `CREATE`, `UPDATE`, `VALIDATE`와 같은 영문 대문자 값을 사용한다. 과거 데이터에는 `수기등록`, `폼접수`, `FEE_PAYER`, `납부신청` 등 레거시 값도 남아 있다.

이번 변경의 목표는 기존 물리 스키마를 깨지 않으면서 앞으로 생성되는 감사로그의 의미와 형식을 하나의 계약으로 통일하는 것이다.

## 2. 범위

### 포함

- 공통 Audit Service 도입
- `행위구분` canonical taxonomy 정의
- `대상구분` canonical taxonomy 정의
- `변경전값`, `변경후값`의 JSON 직렬화 계약 통일
- Student Fee의 기존 감사로그 호출을 공통 서비스로 이관
- Accounting의 기존 감사로그 호출을 공통 서비스로 이관
- Event mutation에 감사로그 기록 추가
- 감사로그 계약에 대한 정적/회귀 테스트 추가

### 제외

- `업무감사로그` 시트 컬럼 추가/삭제/이름 변경
- 과거 감사로그 행의 일괄 재작성
- 감사로그 조회 UI 신설
- 프론트엔드 리팩터링
- 데이터 웨어하우스/외부 로그 시스템 도입

## 3. 핵심 원칙

### 3.1 기존 9개 컬럼 유지

물리 스키마는 다음을 그대로 유지한다.

- `로그ID`
- `발생일시`
- `처리자이메일`
- `행위구분`
- `대상구분`
- `대상ID`
- `변경전값`
- `변경후값`
- `처리사유`

따라서 OperationDB 구조 자체의 migration은 필요하지 않다.

### 3.2 기존 로그는 immutable legacy evidence

기존 행은 감사 증적이므로 의미를 추정해 재작성하지 않는다.

과거 값이 canonical taxonomy와 다르더라도 그대로 보존한다. 새 계약은 변경 배포 이후 생성되는 로그부터 적용한다.

### 3.3 공통 서비스가 유일한 신규 write path

신규 감사로그 기록은 공통 서비스 `writeBusinessAudit_()`를 통해서만 수행한다.

Student Fee의 `writeStudentFeeAudit_()`와 Accounting의 `writeAccountingAudit_()`는 제거하거나 호환 wrapper로 축소한다. 최종적으로 도메인 서비스가 `businessAuditLogs` 테이블에 직접 append하지 않도록 한다.

### 3.4 사람이 읽는 값이 아니라 기계적으로 안정적인 code 사용

`행위구분`, `대상구분`에는 화면 표시용 한글 문구가 아니라 canonical code를 저장한다.

화면에서 한글 표시가 필요하면 별도 label mapping으로 해결한다.

## 4. Canonical action taxonomy

1차 범위의 canonical action은 다음으로 제한한다.

| Code | 의미 | 사용 예 |
|---|---|---|
| `CREATE` | 업무 객체 신규 생성 | 회비납부자 생성, 행사 생성, 원장 생성 |
| `UPDATE` | 기존 객체 필드 변경 | 행사 수정, 회비납부자 수정, 원장 수정 |
| `DELETE` | 삭제 또는 업무상 무효 처리 | 원장 무효 처리 |
| `APPROVE` | 신청/요청 승인 | 회비 납부신청 승인, 환불신청 승인 |
| `REJECT` | 신청/요청 반려 | 회비 납부신청 반려, 환불신청 반려 |
| `CONFIRM` | 상태/금전/출석/결산 확정 | 입금 확인, 송금 확인, 출석 확인, 결산 확정 |
| `IMPORT` | 외부 원본 데이터 유입 | Toss 거래내역 import, Form 응답 import |
| `EXPORT` | 외부 파일/리포트 출력 | 납부내역 export 등 |
| `SYNC` | 외부 시스템과의 동기화 | 행사 Google Form 응답 동기화 |
| `VALIDATE` | 검증 수행 | OCR 검증 |
| `RECONCILE` | 대사 snapshot 생성/검증 | 계좌거래-원장 감사대사 |
| `SETTLE` | 정산/결산 snapshot 생성 | 회계 결산, 행사 정산 생성 |

`PROCESS`처럼 의미가 넓은 action은 제거한다. 실제 의도에 따라 `CONFIRM`, `APPROVE`, `REJECT`, `UPDATE` 등으로 구체화한다.

## 5. Canonical target taxonomy

`대상구분`은 OperationDB schema key와 동일한 lowerCamelCase 값을 사용한다.

### Student Fee

- `feePayers`
- `feeApplications`
- `feePayments`
- `feeRefundRequests`
- `feeRefunds`

### Event

- `events`
- `eventForms`
- `eventApplications`
- `eventExtraAnswers`
- `eventPayments`
- `eventAttendance`
- `eventSettlements`
- `eventRefunds`

### Accounting

- `bankTransactions`
- `ledger`
- `ledgerEvidence`
- `reconciliations`
- `reconciliationItems`
- `settlementReports`

정확한 값은 `getOperationDbSchema_()`의 table key를 source of truth로 삼는다. 감사로그에서 별도 대문자 enum을 중복 정의하지 않는다.

## 6. Audit event payload contract

공통 서비스 시그니처는 다음 형태를 사용한다.

```javascript
writeBusinessAudit_({
  actorEmail: 'user@example.com',
  actionType: 'UPDATE',
  targetType: 'events',
  targetId: 'EVT-001',
  beforeValue: { status: '준비' },
  afterValue: { status: '진행중' },
  reason: '행사 진행상태 변경'
});
```

### 필드 계약

- `actorEmail`
  - 필수
  - trim 후 빈 문자열 금지
  - 현재 인증 context에서 얻은 Google email 사용
- `actionType`
  - 필수
  - canonical action 목록에 포함되어야 함
- `targetType`
  - 필수
  - OperationDB schema의 감사 대상 table key여야 함
- `targetId`
  - 단건 mutation은 해당 PK
  - batch/import 작업은 의미 있는 batch identifier를 사용하되, 임의의 자연어 대신 명시적인 값 사용
- `beforeValue`
  - object, array, primitive 또는 null 허용
  - 저장 시 JSON 문자열로 직렬화
- `afterValue`
  - object, array, primitive 또는 null 허용
  - 저장 시 JSON 문자열로 직렬화
- `reason`
  - 사람이 읽는 업무 사유
  - null이면 빈 문자열

## 7. JSON 직렬화 규칙

`변경전값`, `변경후값`은 항상 valid JSON text여야 한다.

예:

```text
null
{"status":"접수"}
{"status":"승인","managerEmail":"..."}
["APP-001","APP-002"]
```

기존처럼 어떤 호출은 raw string `승인`, 다른 호출은 JSON object를 넣는 방식을 금지한다.

공통 serializer는 `undefined`를 `null`로 정규화하고, 직렬화 불가능한 값은 명시적으로 실패시킨다. 감사로그 기록 실패를 조용히 무시하지 않는다.

## 8. 도메인별 매핑

### Student Fee

기존 값은 다음 방향으로 정규화한다.

- `생성` → `CREATE`
- `수정` → `UPDATE`
- `승인` → `APPROVE`
- `반려` → `REJECT`
- `입금확인` → `CONFIRM`
- `송금확인` → `CONFIRM`

`feeApplications` 승인/반려 시 before/after는 상태 문자열만 저장하지 않고 최소 `{ status: ... }` object를 저장한다.

### Accounting

기존 값은 다음 방향으로 정규화한다.

- `CREATE` → `CREATE`
- `UPDATE` → `UPDATE`
- `DELETE` → `DELETE`
- `VALIDATE` → `VALIDATE`
- `IMPORT` → `IMPORT`
- `RECONCILE` → `RECONCILE`
- `SETTLEMENT` → `SETTLE`
- `CONFIRM` → `CONFIRM`
- `PROCESS` → 업무 의미에 따라 `CONFIRM` 또는 `UPDATE`

Accounting의 기존 대문자 target `LEDGER`, `EVIDENCE`, `BANK_TRANSACTION`, `RECONCILIATION`, `SETTLEMENT_REPORT`도 schema key 기반 lowerCamelCase target으로 변경한다.

### Event

Event mutation은 현재 공통 감사로그 coverage가 부족하므로 이번 변경에서 신규 기록한다.

최소 coverage는 다음과 같다.

- 행사 생성: `CREATE / events`
- 행사 수정: `UPDATE / events`
- Form 연결/갱신: `CREATE|UPDATE|SYNC / eventForms`
- Form 응답 가져오기: `IMPORT|SYNC / eventApplications`
- 신청 처리: `APPROVE|REJECT|UPDATE / eventApplications`
- 참가비 입금 처리: `CONFIRM / eventPayments`
- 출석 처리: `CONFIRM / eventAttendance`
- 행사 정산 생성/확정: `SETTLE|CONFIRM / eventSettlements`
- 행사 환불 생성/처리: `CREATE|CONFIRM / eventRefunds`

현재 실제로 구현된 mutation endpoint만 먼저 연결하고, 아직 stub인 기능을 감사로그 때문에 새로 구현하지 않는다.

## 9. 공통 코드 배치

공통 감사 기능은 서버 core에 둔다.

제안 파일:

```text
src/000_server/010_core/business_audit.gs
```

책임:

- canonical action constant
- target validation
- before/after serializer
- `writeBusinessAudit_()`
- `businessAuditLogs` append orchestration

도메인별 DAO는 비즈니스 감사 기록의 source of truth가 되지 않는다.

## 10. 오류 처리

감사로그는 mutation의 부수적인 console log가 아니라 업무 증적이다.

따라서 정상 mutation이 수행되었는데 감사로그만 유실되는 상태를 가능한 한 만들지 않는다. 현재 Google Sheets 기반 구조에서는 완전한 DB transaction을 제공할 수 없으므로 다음 원칙을 따른다.

1. mutation에 필요한 검증을 먼저 완료한다.
2. 실제 row mutation을 수행한다.
3. 동일 write lock 범위에서 가능한 경우 감사로그도 기록한다.
4. 감사로그 기록 실패를 catch 후 무시하지 않는다.

향후 cross-sheet rollback 전략은 별도 작업으로 다룬다.

## 11. Legacy 데이터 정책

실제 `업무감사로그`에 이미 존재하는 다음과 같은 값은 수정하지 않는다.

- `내보내기`
- `수기등록`
- `폼접수`
- `폼접수실패`
- `FEE_PAYER`
- `납부신청`
- `납부내역`
- `환불내역`

신규 로그 조회 기능이 필요해지면 legacy mapping을 read-time adapter로 제공한다. 이번 변경에서는 과거 행 migration을 수행하지 않는다.

## 12. 테스트 전략

새 회귀 테스트는 최소 다음을 검증한다.

1. canonical action 이외 값이 거부되는가
2. 존재하지 않는 targetType이 거부되는가
3. before/after가 항상 valid JSON text로 저장되는가
4. Student Fee 서비스가 legacy 한글 action을 더 이상 기록하지 않는가
5. Accounting 서비스가 대문자 target/`PROCESS`/`SETTLEMENT`을 더 이상 기록하지 않는가
6. Event의 실제 mutation 서비스가 감사로그를 기록하는가
7. 도메인별 직접 `appendOperationTableRow_('businessAuditLogs', ...)` 호출이 공통 서비스 외부에 남아 있지 않은가
8. 기존 OperationDB 9개 컬럼 스키마가 유지되는가

## 13. 완료 기준

- 새 감사로그 write path가 `writeBusinessAudit_()`로 통일됨
- 신규 로그의 action/target이 canonical taxonomy만 사용함
- before/after가 valid JSON text임
- Student Fee, Accounting, Event의 실제 mutation coverage가 확보됨
- 과거 실제 시트 로그는 변경되지 않음
- 기존 도메인 회귀 테스트와 신규 감사로그 테스트가 모두 통과함
- 프론트엔드는 변경하지 않음
