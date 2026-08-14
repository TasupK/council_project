// 1. 앱 기본 설정
var APP_TITLE = '학생회 통합 업무관리';

// 2. 외부 DB/Drive 연결 설정
var DB_CONFIG = {
  userSpreadsheetId: '1ofZ0M6lclOZudKp_36WCUk1_7ZjBCS8ACQ0x0dshe7g',
  operationSpreadsheetId: '1EI8MbFx2HSuizl0QFygRAZydYiv77W-6pQO10mRN55E',
  rootFolderId: '1Mw8LwWS3ZhdntQwvQ8dgvThGcKG35fG1',
};

// 3. 운영 DB 테이블 이름
var OPERATION_TABLES = {
  settings: '_설정',
  businessAuditLogs: '업무감사로그',
  semesters: '학기기준',
  feeRates: '회비금액기준',
  feePayers: '회비납부자',
  feeApplications: '납부신청',
  feePayments: '납부내역',
  feeRefundRequests: '환불신청',
  feeRefunds: '환불내역',
  events: '행사',
  eventForms: '행사폼',
  eventApplications: '행사신청',
  eventExtraAnswers: '신청추가답변',
  eventPayments: '행사입금',
  eventAttendance: '행사출석',
  eventSettlements: '행사정산',
  eventRefunds: '행사환불',
  ledger: '수입지출원장',
  evidence: '거래증빙',
  reconciliation: '감사대사'
};

// 4. 설정 화면 권한 컬럼 정의
var SETTINGS_PERMISSION_COLUMNS = [
  { key: 'menu', label: '메뉴 접근', hint: '(자동)' },
  { key: 'view', label: '조회' },
  { key: 'edit', label: '등록 및 수정' },
  { key: 'approve', label: '승인 및 보관' },
  { key: 'export', label: '다운로드' }
];

// 5. 관리자 역할 기준값
var ADMIN_ROLE_ID = 'role_admin';

// 6. 로그인 컨텍스트 캐시 설정
var LOGIN_CONTEXT_CACHE_PREFIX = 'LOGIN_CONTEXT_V1_';
var LOGIN_CONTEXT_CACHE_SECONDS = 600;
