# Accounting Standalone 기능 포팅 설계

## 1. 목적

`codex/apps-script-수입-지출-관리` 브랜치의 standalone Accounting 구현 중 현재 `main`에 없는 기능을, 현재 프로젝트의 OperationDB와 feature/domain 구조에 맞춰 포팅한다.

standalone 브랜치 자체는 병합하지 않는다. 단일 `Code.gs`/`index.html`, 독립 Accounting Spreadsheet 초기화, 별도 `PROCESS_LOG`, 샘플 시드 데이터는 가져오지 않고 기능과 업무 규칙만 현재 구조로 재구성한다.

기준 브랜치는 `main`, 작업 브랜치는 `refactor/accounting-standalone-port`이다.

## 2. 범위

### 포함

- 원장 요약 조회
- 원장 수정
- 원장 soft delete
- 원장 임시저장
- 증빙 파일 조회/감사 기능 보완
- 이미지/PDF 계좌 거래내역 OCR
- 수입/지출 계좌 거래 파싱
- 계좌 거래 중복 저장 방지
- 계좌 거래 저장
- 자동 매칭 미리보기
- 기간 기준 공식 감사대사 실행
- 감사대사 헤더 및 건별 결과 저장
- 확인필요 건 후보 조회/수동 연결
- 원장누락의심 건에서 신규 원장 생성 후 연결
- OCR 처리 이력 조회
- 기간 기준 전체 결산 요약
- 전체 결산 스냅샷 저장
- 과거 결산 이력/상세 조회
- 결산 export용 데이터 반환
- 주요 mutation을 기존 `businessAuditLogs`에 기록

### 제외

- standalone 브랜치 전체 merge
- Accounting 전용 독립 Spreadsheet
- standalone `PROCESS_LOG`
- 원장 `departmentId` 추가
- 부서별 필터/결산
- 행사별 결산
- CSV/Excel 계좌파일 파싱
- OCR 원문 저장
- OCR 보정 전용 UI
- 은행별 맞춤 파서 고도화
- 실제 `.xlsx`/PDF 결산 파일 생성
- 학생회비/행사입금 도메인을 직접 조회하는 수입 특화 매칭
- 대량 데이터용 서버 페이지네이션 재설계
- 권한 체계 자체의 신규 설계

## 3. 서버 책임 경계

```text
src/000_server/060_accounting/
├─ 060_common/
├─ 061_ledger/
├─ 062_evidence/
├─ 063_reconciliation/
└─ 064_settlement/
```

- `061_ledger`: 원장 조회/등록/수정/임시저장/soft delete/처리 상태
- `062_evidence`: 증빙 Drive 저장/조회/감사 조회
- `063_reconciliation`: OCR, 계좌거래 저장, 자동매칭, 공식 대사, 후보 조회, 수동 연결, 원장 생성 연계
- `064_settlement`: 기간 기준 전체 결산 요약, 스냅샷, 이력/상세, export DTO

API는 thin wrapper로 유지한다. mutation은 Service, 조회/조합은 Query Service, Sheet I/O는 Sheet DAO, Drive I/O는 File Service가 담당한다.

`063_reconciliation`은 원장 Sheet를 직접 수정하지 않는다. 원장 생성/수정이 필요하면 `061_ledger`의 service를 호출한다.

## 4. OperationDB 변경

기존 의미는 유지한다.

- `ledger`: 수입지출원장
- `evidence`: 거래증빙
- `reconciliation`: 기간 단위 감사대사 헤더
- `businessAuditLogs`: 업무 감사로그

### 4.1 기존 `ledger`에 상태 필드 1개 추가

원장 임시저장과 soft delete를 `matchStatus`에 섞지 않기 위해 `recordStatus`를 추가한다.

| 필드 | 값 | 의미 |
|---|---|---|
| `recordStatus` | `ACTIVE` | 일반 원장 |
|  | `DRAFT` | 임시저장 |
|  | `DELETED` | soft delete |

기존 행은 값이 비어 있으면 `ACTIVE`로 해석한다. `matchStatus`는 대조 상태 전용으로 유지한다.

- 일반 원장 조회/대조/결산은 `recordStatus != DELETED`만 대상으로 한다.
- 공식 대사와 결산에서는 `DRAFT`를 제외한다.
- 물리 행 삭제는 하지 않는다.

### 4.2 `bankTransactions` — 계좌거래

| 필드 | 의미 |
|---|---|
| `id` | 계좌거래ID |
| `transactionAt` | 거래일시/거래일 |
| `expense` | `true`=지출, `false`=수입 |
| `counterparty` | 거래상대명 |
| `description` | 적요/거래내용 |
| `amount` | 양수 금액. 방향은 `expense`로 구분 |
| `sourceFileName` | 원본 파일명 |
| `createdAt` | 등록일시 |

중복키는 `sourceFileName + transactionAt + expense + amount + normalized(counterparty/description)` 조합을 사용한다. 동일 거래 재업로드 시 중복 행을 만들지 않는다.

### 4.3 `bankOcrLogs` — 계좌OCR로그

| 필드 | 의미 |
|---|---|
| `id` | OCR로그ID |
| `fileName` | 파일명 |
| `status` | 처리상태 |
| `extractedCount` | 추출 거래 수 |
| `errorMessage` | 실패/확인 필요 요약 |
| `createdAt` | 처리일시 |

OCR 원문은 저장하지 않는다.

### 4.4 `reconciliationItems` — 감사대사상세

| 필드 | 의미 |
|---|---|
| `id` | 대사상세ID |
| `reconciliationId` | 감사대사 헤더 ID |
| `bankTransactionId` | 계좌거래ID |
| `ledgerId` | 연결된 원장ID, 미연결이면 빈 값 |
| `status` | `정상`, `확인필요`, `원장누락의심` |
| `differenceAmount` | 계좌-원장 금액 차이 |
| `matchMethod` | `auto`, `manual`, `created` |
| `note` | 판단/수동처리 사유 |
| `createdAt` | 생성일시 |
| `updatedAt` | 수정일시 |

논리 FK:

- `reconciliationId -> reconciliation.id`
- `bankTransactionId -> bankTransactions.id`
- `ledgerId -> ledger.id`

### 4.5 `settlementReports` — 결산보고서

| 필드 | 의미 |
|---|---|
| `id` | 결산ID |
| `startDate` | 시작일 |
| `endDate` | 종료일 |
| `totalIncome` | 총수입 |
| `totalExpense` | 총지출 |
| `balance` | 수입-지출 잔액 |
| `incomeCount` | 수입 건수 |
| `expenseCount` | 지출 건수 |
| `evidenceCount` | 포함 원장의 증빙 건수 |
| `status` | 결산상태 |
| `managerId` | 생성 담당자 이메일 |
| `createdAt` | 생성일시 |

결산은 불변 스냅샷이다. 같은 기간을 다시 생성하면 기존 행을 수정하지 않고 새 이력을 만든다.

## 5. OCR/계좌거래 수집 흐름

```text
이미지/PDF 업로드
  -> OCR 텍스트 추출
  -> 수입/지출 거래 파싱
  -> 중복 검사
  -> bankTransactions 저장
  -> bankOcrLogs 저장
  -> 자동 매칭 미리보기 반환
```

- 1차 지원 파일은 이미지/PDF만이다.
- standalone의 Drive Advanced Service OCR 방식을 포팅한다.
- 임시 OCR 문서는 처리 후 삭제한다.
- 입금/출금 모두 판별한다.
- 방향, 날짜, 금액 또는 거래상대가 불확실하면 자동 정상으로 처리하지 않는다.
- OCR 원문은 OperationDB에 저장하지 않는다.

OCR 업로드와 공식 감사대사 실행은 분리한다. OCR 업로드만으로 `reconciliation` 이력을 생성하지 않는다.

## 6. 자동 매칭 규칙

수입/지출 모두 대조하지만 방향이 같은 거래끼리만 후보가 된다.

- 계좌 수입 -> 수입 원장
- 계좌 지출 -> 지출 원장

규칙:

1. 방향 일치 필수
2. 금액 일치 필수
3. 거래일 동일 또는 ±1일
4. 거래상대명/적요 정규화 후 완전일치, 부분일치, 공통토큰을 점수화
5. 최상위 후보가 유일하고 문자열 근거가 충분하면 `정상`
6. 후보 복수/동률/근거 부족이면 `확인필요`
7. 후보가 없으면 `원장누락의심`
8. 같은 공식 대사 안에서 하나의 원장을 여러 계좌거래가 자동 점유할 수 없다. 충돌 시 `확인필요`
9. 후보 원장은 `recordStatus = ACTIVE`이고 대조 가능한 원장만 사용한다.

건별 상태는 정확히 세 개만 사용한다.

- `정상`
- `확인필요`
- `원장누락의심`

자동/수동/원장생성후연결 여부는 상태가 아니라 `matchMethod`로 표현한다.

## 7. 공식 감사대사 실행

```text
기간 지정
  -> 기간 내 bankTransactions 조회
  -> 기간 내 ACTIVE ledger 조회
  -> 자동 매칭 계산
  -> reconciliation 헤더 생성
  -> reconciliationItems 일괄 저장
  -> 헤더 건수/상태 요약 확정
  -> businessAuditLogs 기록
```

기존 `reconciliation`은 감사기간, 기초/기말잔액, 계좌/원장 거래건수, 누락/초과/불일치/증빙미비 건수, 대사상태, 담당자/확인정보를 저장하는 실행 헤더로 유지한다.

건별 결과는 `reconciliationItems`에서만 관리한다.

## 8. 수동 대조

### 후보 원장 연결

`확인필요` 항목은 후보 원장을 조회할 수 있다.

수동 연결 시:

- 동일 대사 내 다른 항목이 해당 원장을 이미 확정 점유했는지 검증
- 방향 일치 검증
- 금액 일치 검증
- 성공 시 `ledgerId` 기록
- `status = 정상`
- `matchMethod = manual`
- `updatedAt` 갱신
- 감사로그 기록

### 원장누락에서 신규 원장 생성

`원장누락의심` 항목은 계좌거래의 방향/일자/금액/거래상대/적요를 기본값으로 신규 원장을 생성할 수 있다.

- `061_ledger` mutation service로 `ACTIVE` 원장 생성
- 생성 원장 ID를 상세에 연결
- `status = 정상`
- `matchMethod = created`
- 감사로그 기록

## 9. 원장 기능 보완

Public behavior:

- `api_getLedgerSummary`
- `api_getLedgerList`
- `api_getLedgerDetail`
- `api_createLedgerEntry`
- `api_saveLedgerDraft`
- `api_updateLedgerEntry`
- `api_deleteLedgerEntry`
- `api_processLedgerEntry`

규칙:

- `api_createLedgerEntry` -> `recordStatus = ACTIVE`
- `api_saveLedgerDraft` -> `recordStatus = DRAFT`
- draft 저장 후 정식 저장 시 같은 ID를 ACTIVE로 전환하며 새 중복 행을 만들지 않는다.
- `api_deleteLedgerEntry` -> `recordStatus = DELETED`
- 삭제 원장은 일반 조회/대조/결산에서 제외
- `matchStatus`는 원장 대조 상태 전용

## 10. 결산

1차는 기간 기준 전체 결산만 지원한다.

포함 조건:

- `recordStatus = ACTIVE`
- `matchStatus === '정상'`
- 지정 기간 내 거래

집계:

- 총수입
- 총지출
- 잔액
- 수입 건수
- 지출 건수
- 포함 원장 증빙 건수

`api_generateSettlementReport`는 집계 결과를 `settlementReports`에 새 스냅샷으로 저장한다. 기존 결산을 덮어쓰지 않는다.

export는 실제 파일을 만들지 않는다. 선택한 결산 스냅샷과 대응 상세 원장 데이터를 export용 DTO로 반환한다.

## 11. Public API 계약

모든 API는 기존 `apiHandler_`와 로그인 검증을 사용한다. standalone의 `apiV1_*`는 남기지 않는다.

### `061_ledger`

- `api_getLedgerSummary`
- `api_getLedgerList`
- `api_getLedgerDetail`
- `api_createLedgerEntry`
- `api_saveLedgerDraft`
- `api_updateLedgerEntry`
- `api_deleteLedgerEntry`
- `api_processLedgerEntry`

### `062_evidence`

- `api_getEvidenceFileContent`
- `api_getEvidenceAuditList`

### `063_reconciliation`

- `api_uploadBankTransactions`
- `api_runReconciliation`
- `api_getReconciliationList`
- `api_getReconciliationDetail`
- `api_getReconciliationCandidates`
- `api_linkReconciliation`
- `api_createLedgerFromReconciliation`
- `api_getBankOcrLogs`

`api_uploadBankTransactions`는 OCR/파싱/저장과 자동매칭 미리보기만 수행한다.

`api_runReconciliation`만 공식 `reconciliation`/`reconciliationItems` 이력을 생성한다.

### `064_settlement`

- `api_getSettlementSummary`
- `api_generateSettlementReport`
- `api_getSettlementReportList`
- `api_getSettlementReport`
- `api_exportSettlementReport`

## 12. Frontend 연결

standalone의 UI를 가져오지 않는다. 현재 `src/400_accounting` 및 공통 UI 시스템을 유지한다.

### `410_ledger`

- 기존 목록/상세/등록 UI 유지
- 수정/삭제/임시저장 API 연결

### `420_reconciliation`

현재 TODO 연결부를 실제 기능으로 교체한다.

- 이미지/PDF 업로드
- OCR 실행 상태
- 자동매칭 미리보기
- 기간 기준 공식 대사 실행
- 대사 결과 조회/필터
- 후보 조회
- 수동 연결
- 원장 생성 후 연결

### `430_settlement`

- 현재 disabled인 결산 생성 연결
- 기간 선택
- 실시간 요약
- 전체 결산 생성
- 과거 결산 이력
- export 데이터 요청

부서별/행사별 결산 UI는 활성화하지 않는다.

## 13. 감사/오류/동시성

`businessAuditLogs` 기록 대상:

- 원장 수정
- 원장 soft delete
- OCR 처리 결과 요약
- 공식 감사대사 실행
- 수동 연결
- 원장 생성 후 연결
- 결산 생성

오류 규칙:

- 여러 파일 업로드 시 파일 단위 실패를 격리한다. 성공 파일 저장을 전체 rollback하지 않는다.
- 대사 실행과 수동 연결은 기존 Lock 패턴을 사용한다.
- Drive OCR 임시파일 삭제 실패는 OCR 결과 자체를 무효화하지 않는다.
- 모든 API 오류는 기존 `apiHandler_`/response 계약을 따른다.

## 14. 테스트 전략

### 서버 기능 테스트

- 수입 OCR 파싱
- 지출 OCR 파싱
- 불명확 OCR 처리
- 계좌거래 중복 방지
- 수입↔수입 / 지출↔지출 방향 제한
- 금액 불일치 후보 제외
- 날짜 ±1일
- 거래상대/적요 점수
- 후보 동률 -> 확인필요
- 원장 중복 점유 방지
- 원장누락의심
- 공식 대사 헤더/상세 저장
- 수동 연결 성공/충돌
- 원장 생성 후 연결
- OCR 원문 미저장
- DRAFT/DELETED 원장 대조 제외
- 정상 ACTIVE 원장만 결산 포함
- 결산 스냅샷 불변성
- 전체 결산 이력 조회
- 원장 수정/임시저장/soft delete
- 증빙 집계

### Frontend 테스트

- OCR 업로드 서버 호출
- 공식 대사 실행 호출
- 세 상태 렌더링
- 후보 선택/수동 연결
- 원장 생성 후 갱신
- 결산 생성 버튼 활성화/호출
- 결산 이력 렌더링

### Architecture verifier

- API 직접 Sheet/Drive 접근 금지
- reconciliation -> ledger mutation은 ledger service를 통해서만 수행
- settlement은 DAO/query boundary 준수
- standalone `apiV1_`, `LEDGER_DB`, `LEDGER_EXT_DB`, 독립 Spreadsheet 초기화 코드 유입 금지

Accounting 테스트 후 repository-wide regression suite를 다시 실행한다.

## 15. 완료 기준

1. standalone 브랜치 병합 없이 현재 main 구조에 기능이 재구성된다.
2. 수입/지출 이미지·PDF OCR 거래가 중복 없이 저장된다.
3. OCR 업로드와 공식 감사대사 실행이 분리된다.
4. 공식 대사는 `reconciliation` 헤더와 `reconciliationItems` 상세를 생성한다.
5. 대사 상세 상태는 `정상 / 확인필요 / 원장누락의심` 세 개만 사용한다.
6. 확인필요 건은 수동 연결할 수 있다.
7. 원장누락의심 건은 신규 원장 생성 후 연결할 수 있다.
8. OCR 원문은 저장되지 않는다.
9. 원장은 `recordStatus`로 ACTIVE/DRAFT/DELETED를 구분하며 물리 삭제하지 않는다.
10. 전체 결산은 ACTIVE + `matchStatus=정상` 원장만 포함하고 불변 스냅샷을 남긴다.
11. 부서별/행사별 결산, CSV/Excel 파싱, 실제 XLSX/PDF 생성은 구현하지 않는다.
12. 기존 Accounting UI와 공통 UI 시스템을 유지한다.
13. Accounting 테스트 및 전체 회귀검증이 통과한다.
