# Accounting Standalone 기능 포팅 설계

## 1. 목적

`codex/apps-script-수입-지출-관리` 브랜치의 standalone Accounting 구현에서 현재 `main`에 아직 반영되지 않은 기능을, 현재 프로젝트의 OperationDB 및 feature/domain 구조에 맞춰 포팅한다.

이 작업은 standalone 브랜치 자체를 병합하지 않는다. standalone의 단일 `Code.gs`/`index.html`, 독립 Spreadsheet 초기화, 별도 `PROCESS_LOG`, 샘플 시드 데이터는 가져오지 않고 기능과 업무 규칙만 현재 구조로 재구성한다.

기준 브랜치는 `main`이며 작업 브랜치는 `refactor/accounting-standalone-port`이다.

## 2. 범위

### 포함

- 원장 요약 조회
- 원장 수정
- 원장 soft delete
- 원장 임시저장 보완
- 증빙 파일 조회/감사 기능 보완
- 이미지/PDF 계좌 거래내역 OCR
- 수입 및 지출 계좌 거래 파싱
- 계좌 거래 중복 저장 방지
- 계좌 거래 저장
- 계좌-원장 자동 매칭 미리보기
- 기간 기준 공식 감사대사 실행
- 감사대사 실행 헤더 및 건별 결과 저장
- 확인필요 건의 후보 원장 조회
- 건별 수동 연결
- 원장누락의심 건에서 새 원장 생성 후 연결
- OCR 처리 이력 조회
- 기간 기준 전체 결산 요약
- 전체 결산 스냅샷 저장
- 과거 결산 이력 및 상세 조회
- 결산 export용 데이터 반환
- 주요 mutation 및 처리 결과를 기존 `businessAuditLogs`에 기록

### 제외

- standalone 브랜치 전체 merge
- Accounting 전용 독립 Spreadsheet
- standalone `PROCESS_LOG`
- 부서ID를 원장에 추가하는 스키마 변경
- 부서별 필터 및 부서별 결산
- 행사별 결산
- CSV/Excel 계좌 거래내역 파싱
- OCR 원문 저장
- OCR 보정 전용 UI
- 은행별 맞춤 파서 고도화
- 실제 `.xlsx` 또는 PDF 결산 파일 생성
- 학생회비/행사입금 도메인을 직접 조회하는 수입 전용 매칭 규칙
- 대량 데이터용 서버 페이지네이션 재설계
- 권한 체계 자체의 신규 설계

## 3. 기존 구조 유지 원칙

현재 Accounting 서버 구조를 기준으로 기능을 추가한다.

```text
src/000_server/060_accounting/
├─ 060_common/
├─ 061_ledger/
├─ 062_evidence/
├─ 063_reconciliation/
└─ 064_settlement/
```

책임은 다음과 같이 고정한다.

### `061_ledger`

- 원장 조회
- 원장 등록
- 원장 수정
- 원장 soft delete
- 임시저장
- 원장 처리 상태 변경

### `062_evidence`

- 증빙 Drive 저장
- 증빙 파일 조회
- 증빙 감사 조회

### `063_reconciliation`

- 계좌 파일 OCR/파싱
- 계좌 거래 저장
- 자동 매칭
- 공식 감사대사 실행
- 감사대사 결과 조회
- 후보 조회
- 수동 연결
- 계좌 거래에서 원장 생성
- OCR 처리 이력 조회

### `064_settlement`

- 기간 기준 전체 결산 요약
- 결산 스냅샷 생성
- 결산 이력/상세 조회
- export용 데이터 생성

API는 thin wrapper로 유지하고 business mutation은 Service, 조회/조합은 Query Service, 물리적 Sheet I/O는 Sheet DAO, Drive I/O는 File Service가 담당한다.

## 4. OperationDB 모델

기존 테이블의 의미는 변경하지 않는다.

- `ledger`: 수입지출원장
- `evidence`: 거래증빙
- `reconciliation`: 기간 단위 감사대사 실행 헤더
- `businessAuditLogs`: 업무 처리 이력

추가 테이블은 네 개만 둔다.

### 4.1 `bankTransactions` — 계좌거래

계좌 파일에서 추출한 수입/지출 원본 거래를 저장한다.

| 필드 | 의미 |
|---|---|
| `id` | 계좌거래ID |
| `transactionAt` | 거래일시 또는 거래일 |
| `expense` | 지출 여부. `true`=지출, `false`=수입 |
| `counterparty` | 거래상대명 |
| `description` | 적요/거래내용 |
| `amount` | 양수 금액. 방향은 `expense`로 구분 |
| `sourceFileName` | 원본 파일명 |
| `createdAt` | 등록일시 |

중복 판정은 최소한 `sourceFileName + transactionAt + expense + amount + normalized(counterparty/description)` 조합을 사용한다. 동일 거래를 다시 업로드해도 중복 행을 추가하지 않는다.

### 4.2 `bankOcrLogs` — 계좌OCR로그

OCR 실행의 성공/실패 및 결과 요약만 저장한다. OCR 원문은 저장하지 않는다.

| 필드 | 의미 |
|---|---|
| `id` | OCR로그ID |
| `fileName` | 처리 파일명 |
| `status` | 처리상태 |
| `extractedCount` | 추출 거래 수 |
| `errorMessage` | 실패/확인 필요 사유 요약 |
| `createdAt` | 처리일시 |

### 4.3 `reconciliationItems` — 감사대사상세

공식 감사대사 실행 1건의 계좌-원장 건별 결과를 저장한다.

| 필드 | 의미 |
|---|---|
| `id` | 대사상세ID |
| `reconciliationId` | 감사대사 헤더 ID |
| `bankTransactionId` | 계좌거래ID |
| `ledgerId` | 연결된 원장 거래ID. 미연결이면 빈 값 |
| `status` | `정상`, `확인필요`, `원장누락의심` |
| `differenceAmount` | 계좌와 원장 금액 차이 |
| `matchMethod` | `auto`, `manual`, `created` 등 연결 방식 |
| `note` | 판단/수동처리 사유 |
| `createdAt` | 생성일시 |
| `updatedAt` | 수정일시 |

FK 관계는 `reconciliationId -> reconciliation.id`, `bankTransactionId -> bankTransactions.id`, `ledgerId -> ledger.id`로 논리 검증한다.

### 4.4 `settlementReports` — 결산보고서

기간 기준 전체 결산 결과를 불변 스냅샷으로 저장한다.

| 필드 | 의미 |
|---|---|
| `id` | 결산ID |
| `startDate` | 결산 시작일 |
| `endDate` | 결산 종료일 |
| `totalIncome` | 총수입 |
| `totalExpense` | 총지출 |
| `balance` | 수입-지출 잔액 |
| `incomeCount` | 수입 건수 |
| `expenseCount` | 지출 건수 |
| `evidenceCount` | 포함 원장의 증빙 건수 |
| `status` | 결산상태 |
| `managerId` | 생성 담당자 이메일 |
| `createdAt` | 생성일시 |

결산 생성 후 원장이 변경되어도 기존 결산 행의 집계값을 다시 계산하거나 덮어쓰지 않는다. 재생성은 새 결산 이력으로 저장한다.

## 5. OCR과 계좌거래 수집

OCR 업로드와 공식 감사대사 실행은 분리한다.

```text
이미지/PDF 업로드
  -> OCR 텍스트 추출
  -> 수입/지출 거래 파싱
  -> 중복 검사
  -> bankTransactions 저장
  -> bankOcrLogs 결과 저장
  -> 자동 매칭 미리보기 반환
```

지원 파일은 1차 범위에서 이미지와 PDF로 제한한다. Drive Advanced Service를 이용한 OCR 방식을 standalone에서 포팅하되 임시 OCR 문서는 처리 후 삭제한다.

파서는 출금뿐 아니라 입금도 판별한다. 불확실한 방향, 날짜, 금액 또는 거래상대명은 정상으로 강제 처리하지 않고 확인이 필요한 결과로 반환한다.

OCR 원문은 OperationDB에 저장하지 않는다.

## 6. 자동 매칭 규칙

수입과 지출 모두 대조 대상이다. 다만 서로 같은 방향끼리만 후보가 된다.

- 계좌 수입 -> 수입 원장
- 계좌 지출 -> 지출 원장

후보 조건 및 점수 기준은 다음 원칙을 따른다.

1. 거래 방향이 같아야 한다.
2. 금액이 같아야 기본 후보가 된다.
3. 거래일은 동일일 또는 ±1일 범위까지만 허용한다.
4. 거래상대명과 적요를 정규화하여 완전 일치, 부분 일치, 공통 토큰 여부를 점수화한다.
5. 최상위 후보가 유일하고 문자열 근거가 충분하면 자동 `정상`으로 판단한다.
6. 후보가 여러 개이거나 문자열 근거가 약하면 `확인필요`로 둔다.
7. 후보가 없으면 `원장누락의심`으로 둔다.
8. 하나의 원장을 여러 계좌거래가 동시에 자동 점유할 수 없다. 충돌 시 관련 건은 `확인필요`로 내린다.

상태는 정확히 세 개만 사용한다.

- `정상`
- `확인필요`
- `원장누락의심`

`수동연결`, `자동연결`, `원장생성후연결`은 상태가 아니라 `matchMethod`로 표현한다.

학생회비 및 행사입금 등 다른 업무 도메인을 직접 조회하는 특수 매칭은 이번 범위에 포함하지 않는다. 현재 `ledger` 데이터만을 일반 대조 대상으로 사용한다.

## 7. 공식 감사대사 실행

파일 업로드/OCR 시점에는 공식 `reconciliation` 이력을 생성하지 않는다.

사용자가 기간을 지정해 대사 실행을 요청하면 다음 순서로 동작한다.

```text
대사 실행 요청
  -> 기간 내 bankTransactions 조회
  -> 기간 내 ledger 조회
  -> 자동 매칭 계산
  -> reconciliation 헤더 생성
  -> reconciliationItems 일괄 저장
  -> 헤더의 건수/상태 요약 확정
  -> businessAuditLogs 기록
```

기존 `reconciliation` 테이블은 다음 의미를 계속 가진다.

- 감사기간
- 계좌/원장 기초·기말 잔액
- 계좌/원장 거래 건수
- 누락/초과/불일치/증빙미비 건수
- 대사 상태
- 담당자/확인시점/확인내용

건별 매칭 상태는 `reconciliationItems`에서 관리한다.

## 8. 수동 대조

`확인필요` 결과는 후보 원장을 조회할 수 있다.

수동 연결 시:

- 선택 원장이 해당 대사 내 다른 계좌거래에 이미 확정 연결됐는지 검증한다.
- 방향과 금액 호환성을 검증한다.
- 연결이 유효하면 `ledgerId`를 기록한다.
- 상태를 `정상`으로 변경한다.
- `matchMethod = manual`로 기록한다.
- 수정일시와 감사로그를 남긴다.

`원장누락의심` 결과에서 사용자가 원장 생성을 선택하면:

- 계좌거래의 방향/일자/금액/거래상대/적요를 기본값으로 신규 원장을 생성한다.
- 생성된 원장 ID를 상세 결과에 연결한다.
- `matchMethod = created`로 기록한다.
- 상태를 `정상`으로 변경한다.

원장 생성은 반드시 `061_ledger`의 mutation service를 재사용한다. `063_reconciliation`이 원장 Sheet를 직접 쓰지 않는다.

## 9. 원장 기능 보완

standalone에서 현재 main에 빠진 원장 기능만 현재 구조에 맞춰 추가한다.

### 추가 API/동작

- 원장 요약 조회
- 원장 수정
- 원장 soft delete
- 임시저장 보완

soft delete는 물리적 행 삭제를 하지 않는다. 현재 OperationDB 원장 스키마가 별도 삭제 필드를 갖고 있지 않으므로, 실제 구현 계획 단계에서 기존 schema 계약을 훼손하지 않는 표현 방법을 먼저 정한다. 이 설계에서는 물리 삭제를 금지한다는 업무 규칙만 확정한다.

임시저장도 현재 OperationDB가 별도 draft 상태 필드를 갖고 있지 않으므로, 별도 필드를 무조건 추가하지 않는다. 구현 계획 단계에서 기존 `matchStatus` 및 API 계약을 확인해 최소 변경으로 표현 가능한지 검증하고, 불가능하면 이 항목은 명시적으로 후속 스키마 변경 대상으로 분리한다.

## 10. 결산

1차 결산은 전체 결산만 지원한다.

### 포함 대상

지정 기간의 원장 중 `matchStatus === '정상'`인 거래만 집계한다.

`미확인`, `확인필요` 등 정상 확정되지 않은 원장은 결산에서 제외한다.

### 계산

- 총수입
- 총지출
- 잔액 = 총수입 - 총지출
- 수입 건수
- 지출 건수
- 포함 원장의 증빙 건수

### 저장

`api_generateSettlementReport` 실행 시 위 집계값을 `settlementReports`에 신규 스냅샷으로 저장한다.

동일 기간에 여러 차례 생성할 수 있으며 기존 이력을 덮어쓰지 않는다.

### export

이번 범위에서 export는 실제 파일 생성이 아니다. 선택한 결산 스냅샷과 해당 조건에 대응하는 상세 원장 데이터를 export용 DTO로 반환한다.

## 11. Public API 계약

모든 public API는 기존 `apiHandler_`를 사용하고 로그인 요구를 유지한다. standalone의 `apiV1_*` 이름은 새 코드에 남기지 않는다.

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

`api_uploadBankTransactions`는 OCR/파싱/저장과 자동 매칭 미리보기를 반환하지만 공식 감사대사 행은 만들지 않는다.

`api_runReconciliation`만 공식 `reconciliation` 및 `reconciliationItems`를 생성한다.

### `064_settlement`

- `api_getSettlementSummary`
- `api_generateSettlementReport`
- `api_getSettlementReportList`
- `api_getSettlementReport`
- `api_exportSettlementReport`

## 12. Frontend 연결

standalone의 `index.html`을 가져오지 않는다. 현재 `src/400_accounting` 화면 구조와 공통 UI 시스템을 유지한다.

### `410_ledger`

- 현재 목록/상세/등록 UI 유지
- 서버의 수정/삭제/임시저장 계약 연결
- 기존 레이아웃과 컴포넌트 스타일 유지

### `420_reconciliation`

현재 TODO로 막혀 있는 서버 연결을 실제 기능으로 교체한다.

- 이미지/PDF 업로드
- OCR 실행 상태
- 자동 매칭 미리보기
- 기간 기준 공식 대사 실행
- 대사 결과 조회/필터
- 확인필요 후보 조회
- 수동 연결
- 원장 생성 후 연결

### `430_settlement`

- 현재 disabled 상태인 결산 생성 동작 연결
- 기간 선택
- 실시간 요약
- 전체 결산 생성
- 결산 이력 조회
- export 데이터 요청

부서 선택 및 행사별 결산 UI는 이번 범위에서 활성화하지 않는다.

## 13. 감사 및 오류 처리

다음 mutation은 `businessAuditLogs`에 기록한다.

- 원장 수정
- 원장 삭제 처리
- 계좌 파일 OCR 처리 결과 요약
- 공식 감사대사 실행
- 수동 대사 연결
- 원장누락 건의 원장 생성 후 연결
- 결산 생성

OCR은 파일 단위 실패를 구분한다. 여러 파일 업로드 시 한 파일 실패가 전체 성공 파일의 저장을 취소하지 않는다.

대사 실행과 수동 연결처럼 데이터 정합성이 중요한 mutation은 기존 Lock 패턴을 적용한다.

Drive OCR 임시파일 삭제 실패는 OCR 결과 자체를 무효화하지 않되, 가능한 범위에서 정리 실패를 로깅한다.

모든 API 오류는 기존 `apiHandler_`/response 계약을 따른다.

## 14. 테스트 전략

기존 Accounting 테스트와 architecture verifier를 확장한다.

### Unit/functional test

- 수입 OCR 파싱
- 지출 OCR 파싱
- 불명확 OCR 결과 처리
- 계좌거래 중복 방지
- 수입↔수입, 지출↔지출 방향 제한
- 금액 불일치 후보 제외
- 날짜 ±1일 규칙
- 거래상대/적요 점수
- 후보 동률 시 확인필요
- 원장 중복 점유 방지
- 원장누락의심 판정
- 공식 대사 헤더/상세 저장
- 수동 연결 성공/충돌
- 원장 생성 후 연결
- OCR 원문 미저장
- 결산 정상 원장만 집계
- 결산 스냅샷 불변성
- 전체 결산 이력 조회
- 원장 수정/soft delete 계약
- 증빙 집계

### Frontend test

- OCR 업로드 서버 호출
- 공식 대사 실행 서버 호출
- 결과 상태 렌더링
- 후보 선택/수동 연결
- 원장 생성 후 화면 갱신
- 결산 생성 버튼 활성화 및 호출
- 결산 이력 렌더링

### Architecture verification

- API가 직접 Sheet/Drive를 쓰지 않는지 검증
- reconciliation이 ledger DAO를 직접 호출하지 않고 ledger service를 통해 mutation하는지 검증
- settlement가 물리 Sheet 접근 대신 DAO/query boundary를 지키는지 검증
- standalone `apiV1_`, `LEDGER_DB`, `LEDGER_EXT_DB`, 독립 Spreadsheet 초기화 코드가 새 구조에 유입되지 않았는지 검증

전체 Accounting 테스트 이후 기존 repository-wide regression suite를 다시 실행한다.

## 15. 완료 기준

다음 조건을 모두 만족하면 포팅 완료로 본다.

1. standalone 브랜치 병합 없이 현재 main 구조에 기능이 재구성되어 있다.
2. 수입/지출 이미지·PDF OCR 결과가 `bankTransactions`에 중복 없이 저장된다.
3. OCR 업로드 자체와 공식 감사대사 실행이 분리되어 있다.
4. 공식 대사는 `reconciliation` 헤더와 `reconciliationItems` 상세를 생성한다.
5. 자동 상태는 `정상 / 확인필요 / 원장누락의심` 세 종류만 사용한다.
6. 확인필요 건을 수동 원장 연결할 수 있다.
7. 원장누락의심 건에서 원장을 생성하고 연결할 수 있다.
8. OCR 원문은 DB에 저장되지 않는다.
9. 전체 결산은 정상 원장만 포함하고 스냅샷 이력을 남긴다.
10. 부서별/행사별 결산, CSV/Excel 파싱, 실제 XLSX/PDF 생성은 구현되지 않는다.
11. 기존 Accounting UI와 공통 UI 시스템이 유지된다.
12. 기존 Accounting 및 전체 회귀검증이 통과한다.
