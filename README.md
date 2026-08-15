# 학생회 통합업무 자동화 - 장부관리 기능 정리

이 문서는 Google Apps Script 기반 학생회 통합업무 자동화 프로젝트 중 `장부관리` 기능의 현재 구현 범위와 병합 전 확인이 필요한 부분을 정리한 문서입니다.

현재 구현 범위는 다음과 같습니다.

- 수입·지출 관리
- 증빙자료 관리
- 계좌·장부 대조
- 계좌 거래내역 OCR 자동 대조
- 결산 보고서 생성

## 1. 전체 구조

이 프로젝트는 Google Apps Script 웹앱으로 동작하며, Google Sheets를 데이터베이스처럼 사용합니다.

사용자가 웹앱에 접속하면 `doGet()`이 실행되고, `initLedgerDatabase()`가 필요한 시트를 자동 생성합니다. 화면은 `index.html`에서 공통 레이아웃, 수입·지출 화면, 계좌·장부 대조 화면, 결산 보고서 화면을 조합해 표시합니다.

클라이언트 화면은 `google.script.run`으로 Apps Script 서버 함수를 호출하고, 서버 함수는 Google Sheets와 Google Drive에 데이터를 저장합니다.

## 2. 데이터 시트

| 시트명 | 역할 |
| --- | --- |
| `TRANSACTION` | 수입·지출 거래 내역 |
| `EVENT` | 행사 목록 |
| `DDEPARTMENT` | 부서 목록 |
| `EVIDENCE` | 증빙자료 파일 정보 |
| `BANK_TRANSACTION` | 계좌 거래내역 |
| `RECONCILIATION_RESULT` | 계좌·장부 대조 결과 |
| `BANK_OCR_LOG` | 계좌 거래내역 OCR 처리 로그 |
| `SETTLEMENT_REPORT` | 결산 보고서 결과 |
| `PROCESS_LOG` | 대조, 결산, 증빙 등 처리 이력 |

스프레드시트 ID는 Script Properties의 `COUNCIL_LEDGER_SPREADSHEET_ID`에 저장됩니다. 증빙자료 Drive 폴더 ID는 `COUNCIL_LEDGER_EVIDENCE_FOLDER_ID`에 저장됩니다.

## 3. 수입·지출 관리

### 현재 기능

- 수입·지출 거래 목록 조회
- 총 수입, 총 지출, 승인 대기, 확인 요청 건수 표시
- 키워드 검색
- 거래 구분, 부서, 행사, 상태 필터
- 페이지 이동
- 신규 수입·지출 등록
- 임시저장
- 거래 상세 보기
- 거래 승인 처리
- 거래 확인요청/대기 상태 변경
- 거래 수정
- 거래 삭제
- 거래별 증빙자료 첨부
- 행사별 잔액 표시
- DB 시트 바로가기 표시

### 작동 방식

1. 수입·지출 화면 진입 시 `apiV1_getLedgerList()`가 거래 목록을 불러옵니다.
2. `apiV1_getLedgerEventOptions()`가 행사 목록과 행사별 잔액을 계산합니다.
3. 화면 상단에 총 수입, 총 지출, 대기 건수, 확인 요청 건수가 표시됩니다.
4. 사용자는 검색어와 필터로 현재 목록을 좁혀 볼 수 있습니다.
5. `등록` 버튼을 누르면 수입·지출 등록 모달이 열립니다.
6. 사용자는 구분, 거래일, 부서, 금액, 거래처 또는 입금자명, 행사, 적요, 비고, 증빙자료를 입력합니다.
7. `등록하기`를 누르면 `apiV1_createLedgerEntry()`가 실행되어 상태가 `대기`인 거래가 추가됩니다.
8. `임시저장`을 누르면 `apiV1_saveLedgerDraft()`가 실행되어 임시저장 거래가 추가됩니다.
9. 목록의 `상세보기`를 누르면 거래 상세와 증빙자료를 확인할 수 있습니다.
10. 상세 모달에서 `승인`을 누르면 `apiV1_processLedgerEntry()`가 거래 상태를 승인으로 변경합니다.
11. 필요 시 확인요청 또는 대기 상태로 되돌릴 수 있습니다.
12. 수정 기능은 기존 거래 내용을 다시 저장하고, 삭제 기능은 실제 행 삭제가 아니라 `is_deleted` 값을 이용해 목록에서 제외하는 방식입니다.

### 주요 API

| 함수 | 역할 |
| --- | --- |
| `apiV1_getLedgerSummary(filter)` | 수입·지출 요약 계산 |
| `apiV1_getLedgerList(filter)` | 거래 목록 조회 |
| `apiV1_getLedgerDetail(transactionId)` | 거래 상세 조회 |
| `apiV1_getLedgerEventOptions()` | 행사 목록과 잔액 조회 |
| `apiV1_createLedgerEntry(request)` | 신규 거래 등록 |
| `apiV1_saveLedgerDraft(request)` | 거래 임시저장 |
| `apiV1_processLedgerEntry(request)` | 승인 또는 확인요청 처리 |
| `apiV1_updateLedgerEntry(request)` | 거래 수정 |
| `apiV1_deleteLedgerEntry(request)` | 거래 삭제 처리 |

## 4. 증빙자료 관리

### 현재 기능

- 수입·지출 등록 시 여러 개의 증빙자료 첨부
- 이미지, PDF, Excel, CSV 파일 업로드 지원
- 드래그 앤 드롭 업로드 UI
- Google Drive 파일 저장
- `EVIDENCE` 시트에 파일 정보 저장
- 거래 상세 화면에서 이미지 미리보기
- 거래 상세 화면에서 파일 다운로드
- Drive 이미지 파일 base64 로딩을 통한 미리보기
- 증빙자료 감사 목록 조회 API

### 작동 방식

1. 사용자가 등록 모달에서 파일을 선택하거나 드래그 앤 드롭합니다.
2. 클라이언트가 파일명을 표시하고 파일 목록을 상태에 저장합니다.
3. 거래 저장 시 파일을 base64로 읽어 서버에 전달합니다.
4. `saveEvidenceFiles_()`가 파일을 Drive에 저장합니다.
5. Drive 폴더가 없으면 `getEvidenceFolder_()`가 자동 생성합니다.
6. 파일 URL, 파일 ID, MIME 타입, 파일 크기 등이 `EVIDENCE` 시트에 저장됩니다.
7. 거래 상세 화면에서 이미지 파일은 미리보기로 표시되고, 그 외 파일은 다운로드 링크로 표시됩니다.

### 주요 API

| 함수 | 역할 |
| --- | --- |
| `saveEvidenceFiles_(transactionId, files, timestamp)` | 증빙자료 저장 |
| `createEvidenceDriveFile_(...)` | Drive 파일 생성 |
| `getEvidenceFolder_()` | 증빙자료 폴더 조회 또는 생성 |
| `apiV1_getEvidenceFileContent(request)` | Drive 파일 내용 조회 |
| `apiV1_getEvidenceAuditList(filter)` | 증빙자료 감사 목록 조회 |

## 5. 계좌·장부 대조

### 현재 기능

- 계좌 거래내역 파일 업로드 UI
- Excel, CSV, PDF, 이미지 파일 선택 지원
- 계좌·장부 대조 실행 버튼
- OCR 분석 중 상태 표시
- OCR 처리 결과 요약 표시
- 대조 결과 목록 표시
- 거래일 기간 필터
- 수입·지출 구분 필터
- 대조 결과 상태 필터
- 키워드 검색
- 정상, 확인 필요, 불일치 상태 표시
- 대조 결과 요약 표시
- 대조 처리 로그 기록
- 대조 후보 거래 조회 API
- 대조 결과와 기존 장부 거래 수동 연결 API
- 대조 결과에서 새 장부 거래 생성 API

### 작동 방식

1. 계좌·장부 대조 화면 진입 시 `apiV1_getReconciliationList()`가 기존 대조 결과를 불러옵니다.
2. 사용자는 계좌 거래내역 이미지 또는 PDF 파일을 업로드할 수 있습니다.
3. `대조 실행`을 누르면 파일이 base64 payload로 서버에 전달되고 `apiV1_reconcileBankTransactions()`가 실행됩니다.
4. 서버는 OCR 텍스트 추출, 지출 거래 후보 파싱, 계좌 거래 저장, 장부 거래 자동 대조를 순서대로 실행합니다.
5. 처리 결과는 `BANK_TRANSACTION`, `BANK_OCR_LOG`, `RECONCILIATION_RESULT`, `PROCESS_LOG` 시트에 저장됩니다.
6. 화면은 OCR 처리 결과와 대조 결과를 표시합니다.
7. 사용자는 기간, 구분, 상태, 검색어로 결과를 필터링할 수 있습니다.
8. 자동 매칭이 애매한 항목은 후보 거래를 조회한 뒤 `apiV1_linkReconciliation()`으로 수동 연결할 수 있습니다.
9. 장부에 없는 계좌 거래는 `apiV1_createLedgerFromReconciliation()`으로 장부 거래를 생성한 뒤 대조 결과에 연결할 수 있습니다.

### 주요 API

| 함수 | 역할 |
| --- | --- |
| `apiV1_reconcileBankTransactions(request)` | 계좌·장부 대조 실행 |
| `apiV1_getReconciliationList(filter)` | 대조 결과 목록 조회 |
| `apiV1_getReconciliationDetail(reconciliationId)` | 대조 결과 상세 조회 |
| `apiV1_getReconciliationCandidates(request)` | 대조 후보 장부 거래 조회 |
| `apiV1_linkReconciliation(request)` | 대조 결과와 장부 거래 연결 |
| `apiV1_createLedgerFromReconciliation(request)` | 대조 결과에서 장부 거래 생성 |
| `apiV1_getBankOcrLogs(request)` | 계좌 OCR 처리 로그 조회 |
| `buildReconciliationSummary_()` | 대조 요약 계산 |

## 6. 계좌 거래내역 OCR 기능 현황

### 현재 구현 상태

대상 브랜치 기준 OCR 기능은 `계좌 거래내역 이미지/PDF 업로드 → Google Drive OCR 텍스트 추출 → 지출 거래 후보 파싱 → 장부 거래 자동 대조 → 결과 저장` 흐름까지 구현되어 있습니다.

현재 계좌·장부 대조 화면에서는 `.pdf`, `.png`, `.jpg`, `.jpeg`, `.webp` 파일을 선택할 수 있습니다. 서버는 Google Drive 고급 서비스의 OCR 기능을 사용하므로 Apps Script 프로젝트에서 Drive API 사용 설정과 권한 승인이 필요합니다.

### 현재 실제 작동 방식

1. 사용자가 이미지 또는 PDF 계좌 거래내역 파일을 선택합니다.
2. 파일명은 업로드 영역에 표시됩니다.
3. `대조 실행`을 누르면 클라이언트가 파일명, 파일 크기, MIME 타입, base64 내용을 서버에 전달합니다.
4. 서버는 파일 형식을 검증합니다.
5. 서버는 Drive OCR로 텍스트를 추출합니다.
6. OCR 원문과 처리 상태를 `BANK_OCR_LOG` 시트에 저장합니다.
7. 서버는 OCR 텍스트를 거래 단위 블록으로 나누고 거래일, 거래처, 적요, 출금액을 추출합니다.
8. 추출된 지출 거래는 중복 여부를 확인한 뒤 `BANK_TRANSACTION` 시트에 저장됩니다.
9. 저장된 계좌 거래와 승인된 장부 지출 거래를 금액, 날짜, 거래처/적요 유사도 기준으로 자동 대조합니다.
10. 대조 결과는 정상, 확인 필요, 장부 누락 의심 등의 상태로 `RECONCILIATION_RESULT`에 저장됩니다.
11. 화면은 OCR 텍스트 추출 여부, 거래 후보 수, 지출 거래 수, 실패 파일 수, 대조 결과를 표시합니다.

### 보완 방향

현재 OCR은 은행 거래내역의 문서 구조와 OCR 품질에 영향을 받습니다. 따라서 실사용 전 여러 은행 양식으로 테스트하고, 실패 케이스를 보정할 수 있는 UI가 필요합니다.

추가로 CSV/Excel처럼 OCR이 필요 없는 정형 파일 파싱을 지원하면 정확도와 안정성을 높일 수 있습니다. OCR 신뢰도가 낮거나 파싱이 불완전한 항목은 자동 정상 처리하지 않고 `확인 필요` 상태로 보내는 방식이 적절합니다.

PM 검토 시 이 기능은 `OCR 자동 대조 1차 구현 완료`로 볼 수 있습니다. 단, 운영 반영 전에는 Drive API 권한, 실제 은행 양식별 인식률, 중복 저장 방지, 수동 보정 UX를 반드시 확인해야 합니다.

## 7. 결산 보고서

### 현재 기능

- 결산 요약 카드 표시
- 총 수입, 총 지출, 잔액, 행사 수 표시
- 수입 건수, 지출 건수 표시
- 회계 기간 선택
- 대상 부서 선택
- 결산 기준 선택
- 보고서 포함 항목 선택
- 결산 보고서 생성
- `SETTLEMENT_REPORT` 시트에 보고서 결과 저장
- `PROCESS_LOG`에 결산 생성 로그 저장
- 최신 또는 특정 결산 보고서 조회
- 결산 보고서 내보내기 API

### 작동 방식

1. 결산 보고서 화면 진입 시 `apiV1_getSettlementSummary()`가 현재 장부 기준 요약을 계산합니다.
2. 화면 상단 카드에 총 수입, 총 지출, 잔액, 행사 수가 표시됩니다.
3. 사용자는 회계 기간, 대상 부서, 기준, 포함 항목을 선택합니다.
4. `보고서 생성`을 누르면 `apiV1_generateSettlementReport()`가 실행됩니다.
5. 서버는 조건에 맞는 수입·지출 데이터를 집계합니다.
6. 보고서 ID, 기간, 행사, 총수입, 총지출, 잔액, 증빙 수, 상태를 `SETTLEMENT_REPORT`에 저장합니다.
7. 생성 이력은 `PROCESS_LOG`에 기록됩니다.
8. `apiV1_exportSettlementReport()`는 내보내기용 파일명과 보고서 데이터를 반환합니다.

### 주요 API

| 함수 | 역할 |
| --- | --- |
| `apiV1_getSettlementSummary(filter)` | 결산 요약 계산 |
| `apiV1_generateSettlementReport(request)` | 결산 보고서 생성 및 저장 |
| `apiV1_getSettlementReport(reportId)` | 결산 보고서 조회 |
| `apiV1_exportSettlementReport(request)` | 내보내기용 데이터 반환 |

### 현재 한계

결산 보고서 내보내기는 실제 `.xlsx`나 PDF 파일을 생성하는 기능이 아니라, 내보내기용 데이터와 파일명을 반환하는 API 형태입니다. 실제 결산 보고서 양식 파일 생성은 후속 구현이 필요합니다.

## 8. 공통 화면 기능

- 사이드바에서 수입·지출 관리, 계좌·장부 대조, 결산 보고서 화면 전환
- 현재 화면에 맞는 제목, 설명, breadcrumb 자동 변경
- 수입·지출 화면에서만 등록 버튼 표시
- 처리 결과 toast 메시지 표시
- 서버 연결 실패 시 fallback 샘플 데이터 표시
- 하단 상태바에 UI 연결 상태와 DB 시트 링크 표시
- 장부관리 메뉴 접기/펼치기

## 9. 초기 샘플 데이터

데이터가 비어 있으면 테스트용 샘플이 자동 생성됩니다.

- 부서: 문화체육국, 회장단, 홍보국, 사무국
- 행사: 봄학기 MT, 중간고사 간식, 해당없음
- 거래: 수입·지출 샘플 4건
- 증빙자료: 샘플 증빙 2건
- 계좌 거래내역: 샘플 은행 거래 3건
- 대조 결과: 정상 2건, 불일치 1건
- 결산 보고서: 샘플 결산 보고서 1건

샘플 데이터는 화면 흐름 확인용입니다. 실제 운영 데이터의 자동 대조 정확도를 검증하려면 계좌 파일 파싱과 OCR 로직을 추가한 뒤 별도 테스트가 필요합니다.

## 10. 병합 전 확인 사항

### 병합 가능 범위

- 수입·지출 목록 조회, 등록, 임시저장, 상세 보기, 승인 처리
- 수입·지출 수정 및 삭제 처리
- 증빙자료 업로드, Drive 저장, 상세 화면 미리보기
- 계좌 거래내역 이미지/PDF OCR 추출
- OCR 기반 지출 거래 후보 파싱
- 계좌·장부 자동 대조와 결과 표시
- 대조 결과 수동 연결 API
- 대조 후보 조회 API
- 대조 결과 기반 장부 거래 생성 API
- 결산 요약 계산
- 결산 보고서 데이터 저장

### 조건부 또는 후속 구현 필요

- CSV/Excel 계좌 거래내역 파싱
- OCR 결과 보정 UI
- 은행별 OCR 파싱 정확도 검증
- OCR 실패/저신뢰 항목 검토 UX
- 실제 결산 보고서 `.xlsx` 또는 PDF 파일 생성
- 대조 상세 모달
- 증빙자료 단독 추가, 삭제, 교체
- 권한별 승인 제어
- 대량 데이터 대응을 위한 서버 페이지네이션

## 11. 주요 리스크

| 리스크 | 영향 | 대응 |
| --- | --- | --- |
| OCR 품질 편차 | 은행 양식 또는 이미지 품질에 따라 추출 오류 가능 | 실제 은행 양식별 테스트와 보정 UI 추가 |
| CSV/Excel 파싱 미구현 | 정형 계좌 파일 자동 대조 불가 | CSV 파싱부터 우선 구현 |
| 결산 내보내기 미완성 | 실제 보고서 파일이 생성되지 않음 | 내보내기 API 범위를 명확히 설명 |
| 한글 인코딩 깨짐 | 일부 화면 문구나 시드 데이터가 깨져 보일 수 있음 | Apps Script 편집기에서 문구 정리 |
| Drive 권한 정책 미정 | 증빙자료 미리보기 또는 다운로드 실패 가능 | 배포 계정과 공유 정책 확정 |

## 12. 주요 파일 구성

| 파일 | 역할 |
| --- | --- |
| `Config.gs` | 시트명, 헤더, 웹앱 진입점 설정 |
| `DataStore.gs` | 시트 생성, 초기 데이터, 공통 데이터 읽기/쓰기 |
| `LedgerApi.gs` | 수입·지출 관리 API |
| `EvidenceApi.gs` | 증빙자료 저장 및 조회 API |
| `ReconciliationApi.gs` | 계좌·장부 대조 API |
| `SettlementApi.gs` | 결산 보고서 API |
| `Utilities.gs` | 필터, ID 생성, 날짜 변환 등 공통 유틸 |
| `index.html` | 전체 웹앱 조립 |
| `Layout.html` | 상단바, 사이드바, 페이지 헤더 |
| `LedgerView.html` / `LedgerClient.html` | 수입·지출 화면과 동작 |
| `ReconciliationView.html` / `ReconciliationClient.html` | 계좌·장부 대조 화면과 동작 |
| `SettlementView.html` / `SettlementClient.html` | 결산 보고서 화면과 동작 |
| `EvidenceClient.html` | 파일 업로드와 증빙 미리보기 |
| `Modals.html` | 등록 모달, 상세 모달, toast |
