/**
 * Schema.gs
 * 학생회비관리(FEE) 도메인 테이블 스키마 정의
 *
 * 출처: 업로드된 "학생회_DB명세서_2026.xlsx"(30_학생회비_테이블목록 및 FEE01~05 필드정의 탭)와
 *       실제 운영 스프레드시트 "학생회_운영_2026.xlsx"의 시트 헤더를 그대로 반영했습니다.
 *       (작성 원칙: 물리명 = 현재 Google Sheets의 실제 탭명·열 이름을 그대로 사용)
 *
 * ※ 이 스크립트가 연결된 스프레드시트는 "학생회_운영_2026.xlsx"와 같은 구조여야 합니다.
 *    (사용자/역할/권한은 별도 워크북 "사용자_2026.xlsx", 운영파일목록은 별도 워크북이라 이 스크립트 범위 밖입니다.
 *     처리자 식별은 Session.getActiveUser().getEmail()을 사용합니다.)
 *
 * ※ 원본 필드정의 문서의 "납부신청" 탭은 6번 필드가 '납입기준학기'(Integer)·'적용종료학기' 필드가
 *    있었지만, 실제 운영 시트에는 '납입날짜'(Date)만 있고 '적용종료학기'가 없습니다.
 *    이 파일은 실제 운영 시트 헤더를 기준으로 삼았습니다.
 */

var SCHEMA = {
  // FEE_01_PAYER 회비납부자 (Master)
  FEE_PAYER: {
    sheetName: '회비납부자',
    pk: '학번',
    pkAuto: false, // 학번은 자동채번하지 않고 입력값을 그대로 사용
    label: '회비납부자',
    fields: [
      { name: '학번', type: 'Text', pk: true, required: true, pii: true },
      { name: '성명', type: 'Text', required: true, pii: true },
      { name: '소속', type: 'Code', required: true }, // 경영정보학과 / 경영대학
      { name: '유형', type: 'Code', required: true, default: '정식' }, // 정식 / 임시
      { name: '적용시작학기', type: 'Integer', required: true },
      { name: '적용종료학기', type: 'Integer', required: true },
      { name: '등록자ID', type: 'Text', required: true }, // 사용자_YYYY 운영진 이메일
      { name: '수정일시', type: 'DateTime', required: true }
    ]
  },

  // FEE_02_APPLICATION 납부신청 (Transaction Header)
  FEE_APPLICATION: {
    sheetName: '납부신청',
    pk: '납부신청ID',
    pkAuto: true,
    pkPrefix: 'PAYAPP',
    label: '납부신청',
    fields: [
      { name: '납부신청ID', type: 'ID', pk: true },
      { name: '학번', type: 'Text', required: true, pii: true, fk: 'FEE_PAYER.학번' },
      { name: '성명', type: 'Text', required: true, pii: true },
      { name: '소속', type: 'Code', required: true },
      { name: '유형', type: 'Code', required: true },
      { name: '납입날짜', type: 'Date', required: true },
      { name: '적용학기수', type: 'Integer', required: true },
      { name: '적용시작학기', type: 'Integer', required: true },
      { name: '예정금액', type: 'Currency', required: true },
      { name: '신청일시', type: 'DateTime', required: true },
      { name: '신청상태', type: 'Code', default: '접수' }, // 접수 / 승인 / 반려
      { name: '처리자ID', type: 'Text' },
      { name: '처리일시', type: 'DateTime' },
      { name: '처리사유', type: 'Text' },
      { name: '학생카드캡쳐파일ID', type: 'Text', required: true, pii: true },
      { name: '입금캡쳐파일ID', type: 'Text', required: true },
      { name: '보관여부', type: 'Boolean', default: 'N' } // [확장] 완료·반려 건을 목록에서 감추는 보관 처리용
    ]
  },

  // FEE_03_PAYMENT 납부내역 (Transaction Item)
  FEE_PAYMENT: {
    sheetName: '납부내역',
    pk: '납부ID',
    pkAuto: true,
    pkPrefix: 'PAY',
    label: '납부내역',
    fields: [
      { name: '납부ID', type: 'ID', pk: true },
      { name: '납부신청ID', type: 'Text', fk: 'FEE_APPLICATION.납부신청ID', required: true },
      { name: '학번', type: 'Text', fk: 'FEE_PAYER.학번', required: true, pii: true },
      { name: '유형', type: 'Code', required: true },
      { name: '학기당금액', type: 'Currency', required: true },
      { name: '적용학기수', type: 'Integer', required: true },
      { name: '적용시작학기', type: 'Integer', required: true },
      { name: '적용종료학기', type: 'Integer', required: true },
      { name: '납부금액', type: 'Currency', required: true },
      { name: '납부일', type: 'Date' },
      { name: '입금자명', type: 'Text', pii: true },
      { name: '금전처리상태', type: 'Code', default: '대기' }, // 대기 / 완료 / 불일치
      { name: '확인자ID', type: 'Text' },
      { name: '확인일시', type: 'DateTime' }
    ]
  },

  // FEE_04_REFUND_REQUEST 환불신청 (Transaction Header)
  FEE_REFUND_REQUEST: {
    sheetName: '환불신청',
    pk: '환불신청ID',
    pkAuto: true,
    pkPrefix: 'REFAPP',
    label: '환불신청',
    fields: [
      { name: '환불신청ID', type: 'ID', pk: true },
      { name: '학번', type: 'Text', fk: 'FEE_PAYER.학번', required: true, pii: true },
      { name: '대상납부ID', type: 'Text', fk: 'FEE_PAYMENT.납부ID', required: true },
      { name: '신청일시', type: 'DateTime', required: true },
      { name: '환불사유', type: 'Text', required: true },
      { name: '환불기준학기', type: 'Integer', required: true },
      { name: '사용학기수', type: 'Integer', required: true },
      { name: '환불대상학기수', type: 'Integer', required: true },
      { name: '자동계산금액', type: 'Currency', required: true },
      { name: '은행명', type: 'Text', required: true, pii: true },
      { name: '계좌번호', type: 'Text', required: true, pii: true },
      { name: '예금주', type: 'Text', required: true, pii: true },
      { name: '신청상태', type: 'Code', default: '접수' }, // 접수 / 승인 / 반려
      { name: '처리자ID', type: 'Text' },
      { name: '처리일시', type: 'DateTime' },
      { name: '처리사유', type: 'Text' },
      { name: '학생카드캡쳐파일ID', type: 'Text', required: true, pii: true },
      { name: '학적변동내역파일ID', type: 'Text', required: true, pii: true },
      { name: '기타증빙파일ID', type: 'Text' },
      { name: '보관여부', type: 'Boolean', default: 'N' } // [확장] 완료·반려 건을 목록에서 감추는 보관 처리용
    ]
  },

  // FEE_05_REFUND 환불내역 (Transaction Item)
  FEE_REFUND: {
    sheetName: '환불내역',
    pk: '환불ID',
    pkAuto: true,
    pkPrefix: 'REF',
    label: '환불내역',
    fields: [
      { name: '환불ID', type: 'ID', pk: true },
      { name: '환불신청ID', type: 'Text', fk: 'FEE_REFUND_REQUEST.환불신청ID', required: true },
      { name: '대상납부ID', type: 'Text', fk: 'FEE_PAYMENT.납부ID', required: true },
      { name: '승인금액', type: 'Currency', required: true },
      { name: '송금일', type: 'Date' },
      { name: '금전처리상태', type: 'Code', default: '대기' }, // 대기 / 완료 / 실패
      { name: '송금자ID', type: 'Text' },
      { name: '송금확인자료ID', type: 'Text' },
      { name: '등록일시', type: 'DateTime', required: true }
    ]
  },

  // COM_02_SETTINGS _설정 (공통, 학기당금액 등 운영 기준값)
  COM_SETTINGS: {
    sheetName: '_설정',
    pk: '설정키',
    pkAuto: false,
    label: '설정',
    fields: [
      { name: '설정키', type: 'Text', pk: true, required: true },
      { name: '설정값', type: 'Text' },
      { name: '설명', type: 'Text' }
    ]
  },

  // COM_03_BUSINESS_AUDIT 업무감사로그 (공통 감사 로그, 전 도메인 공용)
  COM_AUDIT: {
    sheetName: '업무감사로그',
    pk: '로그ID',
    pkAuto: true,
    pkPrefix: 'LOG',
    label: '업무감사로그',
    fields: [
      { name: '로그ID', type: 'ID', pk: true },
      { name: '발생일시', type: 'DateTime', required: true },
      { name: '처리자이메일', type: 'Text', required: true, pii: true },
      { name: '행위구분', type: 'Text', required: true },
      { name: '대상구분', type: 'Text', required: true },
      { name: '대상ID', type: 'Text', required: true },
      { name: '변경전값', type: 'Text' },
      { name: '변경후값', type: 'Text' },
      { name: '처리사유', type: 'Text' }
    ]
  }
};

// 코드값 상수 (DB명세서 필드 설명에 명시된 코드값 그대로)
var CODE = {
  소속: ['경영정보학과', '경영대학'],
  유형: ['정식', '임시'],
  신청상태: ['접수', '승인', '반려'],
  납부처리상태: ['대기', '완료', '불일치'],
  환불처리상태: ['대기', '완료', '실패']
};

// _설정 시트의 학기당금액 설정키가 없을 때 사용할 기본값(원).
// FEE03PAYME_납부내역_필드 설명 기준(현재 20,000원)을 따랐습니다.
// ※ 화면 목업 주석 중 하나는 "학기당 10,000원"으로 적혀 있어 DB명세서와 다릅니다.
//   실제 금액이 다르면 _설정 시트에 설정키=학기당금액 행을 넣어 덮어쓰면 됩니다.
var DEFAULT_SEMESTER_FEE = 20000;
