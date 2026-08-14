/**
 * FormSync.gs
 * 구글폼 응답 -> 납부신청 / 환불신청 자동 반영 (FEE_API_016~018)
 *
 * 실제 DB명세서에는 별도의 "폼 원본 응답" 테이블이 없습니다(작성 원칙: 세션성 데이터 제외,
 * 물리명은 실제 시트를 그대로 사용). 그래서 폼 응답은 검증 후 바로 납부신청/환불신청 시트에
 * 신청상태='접수'로 기록하고, 성공/실패 이력은 공용 업무감사로그(COM_03)에 남깁니다.
 * 실패 건은 업무감사로그의 변경후값에 원본 응답을 JSON으로 보관해두어 재처리할 수 있습니다.
 *
 * 사용 방법:
 * 1) 납부 신청용 구글폼, 환불 신청용 구글폼을 각각 만들고 응답을 이 스프레드시트의
 *    별도 시트(예: "납부폼_응답", "환불폼_응답")로 연결합니다.
 * 2) installFormTriggers() 를 한 번 실행해 onFormSubmit 트리거를 등록합니다.
 * 3) 폼 제출 시 자동으로 납부신청/환불신청에 반영됩니다. 실패하면(예: 미등록 학번)
 *    업무감사로그에 사유가 남고, apiV1_retryFormImport({ logId }) 로 재처리할 수 있습니다.
 */

var FORM_SHEET_NAMES = {
  PAYMENT: '납부폼_응답',
  REFUND: '환불폼_응답'
};

function installFormTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onFormSubmitTrigger_') ScriptApp.deleteTrigger(t);
  });
  var ss = getSS_();
  ScriptApp.newTrigger('onFormSubmitTrigger_').forSpreadsheet(ss).onFormSubmit().create();
}

/** 폼 제출 트리거 핸들러: 어떤 폼인지 시트 이름으로 판별 후 반영 시도 */
function onFormSubmitTrigger_(e) {
  var sheetName = e.range.getSheet().getName();
  var formType = sheetName === FORM_SHEET_NAMES.PAYMENT ? 'PAYMENT'
    : sheetName === FORM_SHEET_NAMES.REFUND ? 'REFUND' : null;
  if (!formType) return;

  var headers = e.range.getSheet().getRange(1, 1, 1, e.range.getSheet().getLastColumn()).getValues()[0];
  var rowValues = e.values;
  var rawData = {};
  headers.forEach(function (h, i) { rawData[h] = rowValues[i]; });

  importFormResponse_(formType, { rawData: rawData });
}

/**
 * 폼 문항명(한글) -> 납부신청/환불신청 물리 필드명 매핑.
 * 실제 폼 문항 제목에 맞게 조정하세요.
 */
var FIELD_MAP = {
  PAYMENT: {
    학번: '학번', 성명: '성명', 소속: '소속', 유형: '유형',
    납입날짜: '납입날짜', 적용학기수: '적용학기수', 적용시작학기: '적용시작학기',
    학생카드캡쳐파일ID: '학생카드캡쳐파일ID', 입금캡쳐파일ID: '입금캡쳐파일ID'
  },
  REFUND: {
    학번: '학번', 대상납부ID: '대상납부ID', 환불사유: '환불사유', 환불기준학기: '환불기준학기',
    은행명: '은행명', 계좌번호: '계좌번호', 예금주: '예금주',
    학생카드캡쳐파일ID: '학생카드캡쳐파일ID', 학적변동내역파일ID: '학적변동내역파일ID', 기타증빙파일ID: '기타증빙파일ID'
  }
};

var FORM_TARGET_TABLE = { PAYMENT: 'FEE_APPLICATION', REFUND: 'FEE_REFUND_REQUEST' };
var FORM_TARGET_LABEL = { PAYMENT: '납부신청', REFUND: '환불신청' };

/**
 * 폼 응답 1건을 검증 후 납부신청 또는 환불신청으로 반영합니다.
 * params.rawData: 폼 컬럼명(한글) -> 값 매핑 객체
 */
function importFormResponse_(formType, params) {
  params = params || {};
  var rawData = params.rawData || {};
  var map = FIELD_MAP[formType];
  var targetTable = FORM_TARGET_TABLE[formType];
  var targetLabel = FORM_TARGET_LABEL[formType];

  try {
    var studentId = rawData[map.학번];
    if (!studentId) throw new Error('학번 값이 비어있습니다.');
    var payer = findById_('FEE_PAYER', studentId);
    if (!payer) throw new Error('회비납부자 정보를 찾을 수 없습니다(학번: ' + studentId + '). 먼저 가입 등록이 필요합니다.');

    var targetId;
    if (formType === 'PAYMENT') {
      var applySem = Number(rawData[map.적용학기수] || 0);
      var due = apiV1_calcPaymentDue({ applySemesters: applySem });
      var application = insertRow_('FEE_APPLICATION', {
        학번: payer.학번,
        성명: rawData[map.성명] || payer.성명,
        소속: rawData[map.소속] || payer.소속,
        유형: rawData[map.유형] || payer.유형,
        납입날짜: rawData[map.납입날짜] || new Date(),
        적용학기수: applySem,
        적용시작학기: rawData[map.적용시작학기] || payer.적용시작학기,
        예정금액: due.success ? due.data.totalDue : 0,
        신청일시: new Date(),
        신청상태: '접수',
        학생카드캡쳐파일ID: rawData[map.학생카드캡쳐파일ID] || '',
        입금캡쳐파일ID: rawData[map.입금캡쳐파일ID] || ''
      });
      targetId = application.납부신청ID;
    } else {
      var targetPaymentId = rawData[map.대상납부ID];
      var payment = targetPaymentId ? findById_('FEE_PAYMENT', targetPaymentId) : null;
      if (!payment) throw new Error('환불 대상 납부내역을 찾을 수 없습니다: ' + targetPaymentId);

      var request = insertRow_('FEE_REFUND_REQUEST', {
        학번: payer.학번,
        대상납부ID: payment.납부ID,
        신청일시: new Date(),
        환불사유: rawData[map.환불사유] || '',
        환불기준학기: rawData[map.환불기준학기] || '',
        사용학기수: 0,
        환불대상학기수: 0,
        자동계산금액: 0,
        은행명: rawData[map.은행명] || '',
        계좌번호: rawData[map.계좌번호] || '',
        예금주: rawData[map.예금주] || '',
        신청상태: '접수',
        학생카드캡쳐파일ID: rawData[map.학생카드캡쳐파일ID] || '',
        학적변동내역파일ID: rawData[map.학적변동내역파일ID] || '',
        기타증빙파일ID: rawData[map.기타증빙파일ID] || ''
      });

      // 자동계산금액 등을 계산해서 채워 넣음
      var calc = apiV1_calcRefund({ 납부ID: payment.납부ID, 환불기준학기: rawData[map.환불기준학기] });
      if (calc.success) {
        updateRow_('FEE_REFUND_REQUEST', request.환불신청ID, {
          사용학기수: calc.data.사용학기수,
          환불대상학기수: calc.data.환불대상학기수,
          자동계산금액: calc.data.자동계산금액
        });
      }
      targetId = request.환불신청ID;
    }

    writeAudit_(targetLabel, targetId, '폼접수', '', '', '구글폼 자동 반영 성공');
    return { target_id: targetId, result: 'SUCCESS' };

  } catch (err) {
    writeAudit_(targetLabel, '', '폼접수실패', '', JSON.stringify(rawData), err.message);
    return { result: 'FAILED', error: err.message };
  }
}

/**
 * 실패한 폼 응답을 재검증하여 다시 반영합니다.
 * params: { logId }  ※ 업무감사로그의 로그ID (행위구분='폼접수실패'인 행)
 */
function retryFormImport_(params) {
  params = params || {};
  var log = findById_('COM_AUDIT', params.logId);
  if (!log) throw new Error('로그를 찾을 수 없습니다: ' + params.logId);
  if (log.행위구분 !== '폼접수실패') throw new Error('재처리 대상이 아닙니다(행위구분: ' + log.행위구분 + ').');

  var formType = log.대상구분 === '납부신청' ? 'PAYMENT' : log.대상구분 === '환불신청' ? 'REFUND' : null;
  if (!formType) throw new Error('알 수 없는 대상구분입니다: ' + log.대상구분);

  var rawData = JSON.parse(log.변경후값 || '{}');
  var result = importFormResponse_(formType, { rawData: rawData });
  writeAudit_(log.대상구분, result.target_id || '', '폼재처리', params.logId, result.result, result.error || '');
  return result;
}
