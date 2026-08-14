/**
 * Api.gs
 * 학생회비관리 API 구현 (FEE_API_001~018 매핑 + 실제 DB 2단계 처리 흐름 반영)
 *
 * 실제 운영 DB(학생회_운영_2026.xlsx)는 "신청"과 "내역"이 분리된 2단계 구조입니다.
 *  - 납부신청(신청상태: 접수/승인/반려) → 승인 시 납부내역 자동 생성(금전처리상태: 대기)
 *    → 입금 대사 후 apiV1_confirmPaymentReceipt 로 완료/불일치 확정
 *  - 환불신청(신청상태: 접수/승인/반려) → 승인 시 환불내역 자동 생성(금전처리상태: 대기)
 *    → 송금 후 apiV1_confirmRefundTransfer 로 완료/실패 확정
 * confirm 계열 2개 함수는 API설계 시트의 18개 목록에는 없지만, 실제 DB 구조상 반드시 필요해 추가했습니다.
 *
 * 모든 함수는 { success, data, error } 형태로 응답하며,
 * 프론트(index.html)에서는 google.script.run으로, 외부에서는 doPost(JSON)로 호출할 수 있습니다.
 */

function ok_(data) { return { success: true, data: data }; }
function fail_(message) { return { success: false, error: String(message) }; }

function withTryCatch_(fn) {
  try {
    return ok_(fn());
  } catch (e) {
    return fail_(e.message || e);
  }
}

function currentUserEmail_() {
  return Session.getActiveUser().getEmail() || 'system';
}

function maskStudentId_(studentId) {
  var s = String(studentId || '');
  if (s.length <= 4) return s;
  return s.slice(0, 2) + '****' + s.slice(-2);
}
function maskAccount_(accountNumber) {
  var s = String(accountNumber || '');
  if (s.length <= 4) return s;
  return s.slice(0, 3) + '****' + s.slice(-3);
}
function keyBy_(arr, field) {
  var map = {};
  arr.forEach(function (r) { map[r[field]] = r; });
  return map;
}
function paginate_(rows, page, pageSize) {
  page = page || 1; pageSize = pageSize || 20;
  var total = rows.length;
  var items = rows.slice((page - 1) * pageSize, page * pageSize);
  return { total: total, page: page, pageSize: pageSize, items: items };
}

/* ------------------------------------------------------------------ */
/* FEE_API_001  전체 현황 조회  apiV1_getSummary                        */
/* ------------------------------------------------------------------ */
function apiV1_getSummary() {
  return withTryCatch_(function () {
    var payers = readAll_('FEE_PAYER');
    var applications = readAll_('FEE_APPLICATION');
    var payments = readAll_('FEE_PAYMENT');
    var refundReqs = readAll_('FEE_REFUND_REQUEST');
    var refunds = readAll_('FEE_REFUND');

    var count = function (arr, field, value) { return arr.filter(function (r) { return r[field] === value; }).length; };
    var sum = function (arr, field) { return arr.reduce(function (s, r) { return s + (Number(r[field]) || 0); }, 0); };

    return {
      payer: {
        total: payers.length,
        정식: count(payers, '유형', '정식'),
        임시: count(payers, '유형', '임시')
      },
      application: {
        total: applications.length,
        접수: count(applications, '신청상태', '접수'),
        승인: count(applications, '신청상태', '승인'),
        반려: count(applications, '신청상태', '반려')
      },
      payment: {
        total: payments.length,
        대기: count(payments, '금전처리상태', '대기'),
        완료: count(payments, '금전처리상태', '완료'),
        불일치: count(payments, '금전처리상태', '불일치'),
        완료금액합계: sum(payments.filter(function (p) { return p.금전처리상태 === '완료'; }), '납부금액')
      },
      refundRequest: {
        total: refundReqs.length,
        접수: count(refundReqs, '신청상태', '접수'),
        승인: count(refundReqs, '신청상태', '승인'),
        반려: count(refundReqs, '신청상태', '반려')
      },
      refund: {
        total: refunds.length,
        대기: count(refunds, '금전처리상태', '대기'),
        완료: count(refunds, '금전처리상태', '완료'),
        실패: count(refunds, '금전처리상태', '실패'),
        완료금액합계: sum(refunds.filter(function (r) { return r.금전처리상태 === '완료'; }), '승인금액')
      }
    };
  });
}

/* ------------------------------------------------------------------ */
/* FEE_API_002  가입자(회비납부자) 목록 조회  apiV1_listMembers          */
/* params: { keyword, 유형, 소속, page, pageSize }                      */
/* ------------------------------------------------------------------ */
function apiV1_listMembers(params) {
  params = params || {};
  return withTryCatch_(function () {
    var rows = readAll_('FEE_PAYER');
    if (params.유형) rows = rows.filter(function (r) { return r.유형 === params.유형; });
    if (params.소속) rows = rows.filter(function (r) { return r.소속 === params.소속; });
    if (params.keyword) {
      var kw = String(params.keyword).toLowerCase();
      rows = rows.filter(function (r) {
        return String(r.성명).toLowerCase().indexOf(kw) !== -1 || String(r.학번).toLowerCase().indexOf(kw) !== -1;
      });
    }
    var paged = paginate_(rows, params.page, params.pageSize);
    // 개인정보보호: 목록 응답은 최소 필드만 제공(학번 마스킹)
    paged.items = paged.items.map(function (r) {
      return { 학번: maskStudentId_(r.학번), 성명: r.성명, 소속: r.소속, 유형: r.유형, 적용시작학기: r.적용시작학기, 적용종료학기: r.적용종료학기 };
    });
    return paged;
  });
}

/* [확장] 회비납부자 조회 화면 통계 카드: 전체/정식/임시/만료예정 */
function apiV1_getMemberStats() {
  return withTryCatch_(function () {
    var payers = readAll_('FEE_PAYER');
    var currentSemester = Number(getSetting_('현재학기', 0));
    var count = function (arr, field, value) { return arr.filter(function (r) { return r[field] === value; }).length; };
    return {
      전체: payers.length,
      정식: count(payers, '유형', '정식'),
      임시: count(payers, '유형', '임시'),
      만료예정: currentSemester ? payers.filter(function (r) { return Number(r.적용종료학기) === currentSemester; }).length : 0
    };
  });
}

/* ------------------------------------------------------------------ */
/* FEE_API_003  가입자 상세 조회  apiV1_getMember                       */
/* ------------------------------------------------------------------ */
function apiV1_getMember(params) {
  params = params || {};
  return withTryCatch_(function () {
    var payer = findById_('FEE_PAYER', params.학번);
    if (!payer) throw new Error('회비납부자를 찾을 수 없습니다: ' + params.학번);
    var applications = findWhere_('FEE_APPLICATION', function (a) { return a.학번 === payer.학번; });
    var payments = findWhere_('FEE_PAYMENT', function (p) { return p.학번 === payer.학번; });
    var refundReqs = findWhere_('FEE_REFUND_REQUEST', function (r) { return r.학번 === payer.학번; });
    return { payer: payer, applications: applications, payments: payments, refundRequests: refundReqs };
  });
}

/* ------------------------------------------------------------------ */
/* FEE_API_004  가입자 수기 등록  apiV1_createMember                    */
/* ------------------------------------------------------------------ */
function apiV1_createMember(params) {
  params = params || {};
  return withTryCatch_(function () {
    if (!params.학번 || !params.성명) throw new Error('학번과 성명은 필수입니다.');
    if (findById_('FEE_PAYER', params.학번)) throw new Error('이미 등록된 학번입니다: ' + params.학번);
    if (!params.적용시작학기 || !params.적용종료학기) throw new Error('적용시작학기/적용종료학기는 필수입니다.');

    var record = insertRow_('FEE_PAYER', {
      학번: params.학번,
      성명: params.성명,
      소속: params.소속 || '',
      유형: params.유형 || '정식',
      적용시작학기: params.적용시작학기,
      적용종료학기: params.적용종료학기,
      등록자ID: currentUserEmail_(),
      수정일시: new Date()
    });
    writeAudit_('FEE_PAYER', record.학번, '수기등록', '', JSON.stringify(record), params.note || '');
    return record;
  });
}

/* ------------------------------------------------------------------ */
/* FEE_API_005  가입자 정보 수정  apiV1_updateMember                    */
/* ------------------------------------------------------------------ */
function apiV1_updateMember(params) {
  params = params || {};
  return withTryCatch_(function () {
    if (!params.학번) throw new Error('학번이 필요합니다.');
    var before = findById_('FEE_PAYER', params.학번);
    if (!before) throw new Error('회비납부자를 찾을 수 없습니다: ' + params.학번);

    var editable = ['성명', '소속', '유형', '적용시작학기', '적용종료학기'];
    var patch = {};
    editable.forEach(function (k) { if (params[k] !== undefined) patch[k] = params[k]; });
    patch.수정일시 = new Date();

    var after = updateRow_('FEE_PAYER', params.학번, patch);
    writeAudit_('FEE_PAYER', params.학번, '정보수정', JSON.stringify(before), JSON.stringify(after), params.note || '');
    return after;
  });
}

/* ------------------------------------------------------------------ */
/* FEE_API_009  납부 필요액 계산  apiV1_calcPaymentDue                  */
/* params: { applySemesters }  ※ 학기당금액은 _설정 시트(설정키=학기당금액) 기준, 없으면 20,000원 */
/* ------------------------------------------------------------------ */
function apiV1_calcPaymentDue(params) {
  params = params || {};
  return withTryCatch_(function () {
    var semesterFee = getSemesterFee_();
    var applySemesters = Number(params.applySemesters || 0);
    return {
      semesterFee: semesterFee,
      applySemesters: applySemesters,
      totalDue: applySemesters * semesterFee,
      note: '학기당 ' + semesterFee.toLocaleString() + '원 × 적용학기수로 계산합니다.'
    };
  });
}

/* ------------------------------------------------------------------ */
/* FEE_API_006  납부 목록 조회 (납부신청 기준)  apiV1_listPayments        */
/* params: { status(신청상태), keyword, page, pageSize }                 */
/* ------------------------------------------------------------------ */
function apiV1_listPayments(params) {
  params = params || {};
  return withTryCatch_(function () {
    var rows = readAll_('FEE_APPLICATION');
    if (!params.includeArchived) rows = rows.filter(function (r) { return r.보관여부 !== 'Y'; });
    if (params.status) rows = rows.filter(function (r) { return r.신청상태 === params.status; });
    if (params.유형) rows = rows.filter(function (r) { return r.유형 === params.유형; });
    if (params.keyword) {
      var kw = String(params.keyword).toLowerCase();
      rows = rows.filter(function (r) {
        return String(r.성명).toLowerCase().indexOf(kw) !== -1 || String(r.학번).toLowerCase().indexOf(kw) !== -1;
      });
    }
    rows.sort(function (a, b) { return new Date(b.신청일시) - new Date(a.신청일시); });
    var paged = paginate_(rows, params.page, params.pageSize);
    var paymentsByApp = keyBy_(readAll_('FEE_PAYMENT'), '납부신청ID');
    paged.items = paged.items.map(function (r) {
      var payment = paymentsByApp[r.납부신청ID];
      return Object.assign({}, r, {
        학번: maskStudentId_(r.학번),
        납부ID: payment ? payment.납부ID : '',
        납부금액: payment ? payment.납부금액 : '',
        금전처리상태: payment ? payment.금전처리상태 : ''
      });
    });
    return paged;
  });
}

/* [확장] 납부 관리 화면 통계 카드: 신청접수/입금대기/입금완료/임시신청/입금불일치 */
function apiV1_getPaymentStats() {
  return withTryCatch_(function () {
    var apps = readAll_('FEE_APPLICATION').filter(function (r) { return r.보관여부 !== 'Y'; });
    var payments = readAll_('FEE_PAYMENT');
    var count = function (arr, field, value) { return arr.filter(function (r) { return r[field] === value; }).length; };
    return {
      신청접수: count(apps, '신청상태', '접수'),
      입금대기: count(payments, '금전처리상태', '대기'),
      입금완료: count(payments, '금전처리상태', '완료'),
      임시신청: apps.filter(function (r) { return r.신청상태 === '접수' && r.유형 === '임시'; }).length,
      입금불일치: count(payments, '금전처리상태', '불일치')
    };
  });
}

/* [확장] 접수/승인이 완료된 건을 목록에서 감춥니다(완료·반려 건만 보관 가능). */
function apiV1_archivePayment(params) {
  params = params || {};
  return withTryCatch_(function () {
    var before = findById_('FEE_APPLICATION', params.납부신청ID);
    if (!before) throw new Error('납부신청을 찾을 수 없습니다: ' + params.납부신청ID);
    var payment = findWhere_('FEE_PAYMENT', function (p) { return p.납부신청ID === before.납부신청ID; })[0];
    var isTerminal = before.신청상태 === '반려' || (payment && (payment.금전처리상태 === '완료' || payment.금전처리상태 === '불일치'));
    if (!isTerminal) throw new Error('완료·반려 상태인 건만 보관할 수 있습니다.');

    var after = updateRow_('FEE_APPLICATION', params.납부신청ID, { 보관여부: 'Y' });
    writeAudit_('FEE_APPLICATION', params.납부신청ID, '보관', 'N', 'Y', params.note || '');
    return after;
  });
}

/* ------------------------------------------------------------------ */
/* FEE_API_007  납부 상세 조회  apiV1_getPayment                        */
/* ------------------------------------------------------------------ */
function apiV1_getPayment(params) {
  params = params || {};
  return withTryCatch_(function () {
    var application = findById_('FEE_APPLICATION', params.납부신청ID);
    if (!application) throw new Error('납부신청 건을 찾을 수 없습니다: ' + params.납부신청ID);
    var payment = findWhere_('FEE_PAYMENT', function (p) { return p.납부신청ID === application.납부신청ID; })[0] || null;
    return { application: application, payment: payment };
  });
}

/* ------------------------------------------------------------------ */
/* FEE_API_008  납부신청 처리(단일/일괄)  apiV1_processPayments          */
/* params: { ids: [납부신청ID...], action: 'APPROVE'|'REJECT', reason }  */
/* 승인 시 납부내역(FEE_PAYMENT)을 자동 생성합니다(금전처리상태=대기).      */
/* ------------------------------------------------------------------ */
function apiV1_processPayments(params) {
  params = params || {};
  return withTryCatch_(function () {
    var ids = params.ids || [];
    var action = params.action;
    if (action !== 'APPROVE' && action !== 'REJECT') throw new Error('알 수 없는 action입니다: ' + action);
    var newStatus = action === 'APPROVE' ? '승인' : '반려';
    var email = currentUserEmail_();

    // 일괄 승인은 승인 결과 유형(정식/임시)이 동일한 항목에만 허용합니다(임시 가입 승인과 확정 가입 승인 혼합 금지).
    if (action === 'APPROVE' && ids.length > 1) {
      var types = ids.map(function (id) { var a = findById_('FEE_APPLICATION', id); return a ? a.유형 : null; }).filter(Boolean);
      var uniqueTypes = types.filter(function (v, i) { return types.indexOf(v) === i; });
      if (uniqueTypes.length > 1) throw new Error('일괄 승인은 승인 결과 유형이 동일한 항목에만 허용합니다(정식/임시 혼합 불가).');
    }

    var results = ids.map(function (id) {
      var before = findById_('FEE_APPLICATION', id);
      if (!before) return { id: id, success: false, message: '대상을 찾을 수 없습니다.' };
      if (before.신청상태 !== '접수') return { id: id, success: false, message: '이미 처리된 신청입니다(현재 상태: ' + before.신청상태 + ').' };

      var after = updateRow_('FEE_APPLICATION', id, {
        신청상태: newStatus,
        처리자ID: email,
        처리일시: new Date(),
        처리사유: action === 'REJECT' ? (params.reason || '') : ''
      });
      writeAudit_('FEE_APPLICATION', id, action === 'APPROVE' ? '승인' : '반려', before.신청상태, newStatus, params.reason || '');

      var paymentRecord = null;
      if (action === 'APPROVE') {
        var semesterFee = getSemesterFee_();
        var startSem = Number(before.적용시작학기);
        var applySem = Number(before.적용학기수);
        paymentRecord = insertRow_('FEE_PAYMENT', {
          납부신청ID: before.납부신청ID,
          학번: before.학번,
          유형: before.유형,
          학기당금액: semesterFee,
          적용학기수: applySem,
          적용시작학기: startSem,
          적용종료학기: startSem + applySem - 1,
          납부금액: before.예정금액,
          납부일: new Date(),
          입금자명: '',
          금전처리상태: '대기'
        });
        writeAudit_('FEE_PAYMENT', paymentRecord.납부ID, '생성', '', JSON.stringify(paymentRecord), '납부신청 승인에 따른 자동 생성');
      }
      return { id: id, success: true, after: after, payment: paymentRecord };
    });
    return results;
  });
}

/* ------------------------------------------------------------------ */
/* [확장] 납부내역 입금 대사 확정  apiV1_confirmPaymentReceipt           */
/* params: { 납부ID, result: 'DONE'|'MISMATCH', 입금자명 }               */
/* ------------------------------------------------------------------ */
function apiV1_confirmPaymentReceipt(params) {
  params = params || {};
  return withTryCatch_(function () {
    var before = findById_('FEE_PAYMENT', params.납부ID);
    if (!before) throw new Error('납부내역을 찾을 수 없습니다: ' + params.납부ID);
    var newStatus = params.result === 'DONE' ? '완료' : '불일치';
    var patch = {
      금전처리상태: newStatus,
      확인자ID: currentUserEmail_(),
      확인일시: new Date()
    };
    if (params.입금자명) patch.입금자명 = params.입금자명;
    var after = updateRow_('FEE_PAYMENT', params.납부ID, patch);
    writeAudit_('FEE_PAYMENT', params.납부ID, '입금확인', before.금전처리상태, newStatus, params.note || '');
    return after;
  });
}

/* ------------------------------------------------------------------ */
/* FEE_API_010  납부 내역 내보내기  apiV1_exportPayments                */
/* ------------------------------------------------------------------ */
function apiV1_exportPayments(params) {
  params = params || {};
  return withTryCatch_(function () {
    var listResult = apiV1_listPayments(Object.assign({}, params, { page: 1, pageSize: 100000 }));
    if (!listResult.success) throw new Error(listResult.error);
    var rows = listResult.data.items;

    var ss = SpreadsheetApp.create('학생회비_납부내역_' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd_HHmmss'));
    var sheet = ss.getSheets()[0];
    var headers = ['납부신청ID', '학번', '성명', '적용학기수', '예정금액', '신청상태', '신청일시', '처리일시'];
    sheet.appendRow(headers);
    rows.forEach(function (r) { sheet.appendRow(headers.map(function (h) { return r[h]; })); });
    writeAudit_('납부내역', '', '내보내기', JSON.stringify(params), rows.length + '건', '필터: ' + JSON.stringify(params));
    return { fileUrl: ss.getUrl(), rowCount: rows.length };
  });
}

/* ------------------------------------------------------------------ */
/* FEE_API_014  환불 가능액 계산  apiV1_calcRefund                      */
/* params: { 납부ID, 환불기준학기 }                                       */
/* 규칙(FEE04REFUN 필드 설명 기준):                                       */
/*  사용학기수 = clamp(환불기준학기 - 적용시작학기 + 1, 0, 적용학기수)      */
/*  환불대상학기수 = 적용학기수 - 사용학기수                                */
/*  자동계산금액 = 환불대상학기수 × 학기당금액(대상 납부건 기준 단가)        */
/* ------------------------------------------------------------------ */
function apiV1_calcRefund(params) {
  params = params || {};
  return withTryCatch_(function () {
    var payment = findById_('FEE_PAYMENT', params.납부ID);
    if (!payment) throw new Error('대상 납부내역을 찾을 수 없습니다: ' + params.납부ID);

    var 기준학기 = Number(params.환불기준학기);
    var 적용시작학기 = Number(payment.적용시작학기);
    var 적용학기수 = Number(payment.적용학기수);
    var 사용학기수 = 기준학기- 적용시작학기 + 1;
    if (사용학기수 < 0) 사용학기수 = 0;
    if (사용학기수 > 적용학기수) 사용학기수 = 적용학기수;
    var 환불대상학기수 = 적용학기수 - 사용학기수;
    var 학기당금액 = Number(payment.학기당금액) || getSemesterFee_();

    // 기존 환불액(같은 납부건에 대해 이미 승인/완료된 환불) 차감
    var existingRefundAmount = findWhere_('FEE_REFUND', function (r) {
      return r.대상납부ID === payment.납부ID && (r.금전처리상태 === '완료' || r.금전처리상태 === '대기');
    }).reduce(function (s, r) { return s + (Number(r.승인금액) || 0); }, 0);

    var 자동계산금액 = Math.max(환불대상학기수 * 학기당금액 - existingRefundAmount, 0);

    return {
      학번: payment.학번,
      적용시작학기: 적용시작학기,
      적용학기수: 적용학기수,
      환불기준학기: 기준학기,
      사용학기수: 사용학기수,
      환불대상학기수: 환불대상학기수,
      학기당금액: 학기당금액,
      기존환불액: existingRefundAmount,
      자동계산금액: 자동계산금액,
      note: '환불 기준 학기는 사용한 학기로 간주되어 환불 대상에서 제외되며, 기존 환불액은 차감됩니다.'
    };
  });
}

/* ------------------------------------------------------------------ */
/* FEE_API_011  환불 목록 조회 (환불신청 기준)  apiV1_listRefunds        */
/* ------------------------------------------------------------------ */
function apiV1_listRefunds(params) {
  params = params || {};
  return withTryCatch_(function () {
    var rows = readAll_('FEE_REFUND_REQUEST');
    if (!params.includeArchived) rows = rows.filter(function (r) { return r.보관여부 !== 'Y'; });
    if (params.status) rows = rows.filter(function (r) { return r.신청상태 === params.status; });
    if (params.keyword) {
      var kw = String(params.keyword).toLowerCase();
      var payers = keyBy_(readAll_('FEE_PAYER'), '학번');
      rows = rows.filter(function (r) {
        var p = payers[r.학번] || {};
        return String(p.성명 || '').toLowerCase().indexOf(kw) !== -1 || String(r.학번).toLowerCase().indexOf(kw) !== -1;
      });
    }
    rows.sort(function (a, b) { return new Date(b.신청일시) - new Date(a.신청일시); });
    var payersMap = keyBy_(readAll_('FEE_PAYER'), '학번');
    var refundsByReq = keyBy_(readAll_('FEE_REFUND'), '환불신청ID');
    var paged = paginate_(rows, params.page, params.pageSize);
    paged.items = paged.items.map(function (r) {
      var p = payersMap[r.학번] || {};
      var refund = refundsByReq[r.환불신청ID];
      return Object.assign({}, r, {
        성명: p.성명 || '',
        학번: maskStudentId_(r.학번),
        계좌번호: maskAccount_(r.계좌번호),
        환불ID: refund ? refund.환불ID : '',
        금전처리상태: refund ? refund.금전처리상태 : ''
      });
    });
    return paged;
  });
}

/* [확장] 환불 관리 화면 통계 카드: 신청접수/송금대기/송금완료/신청반려 */
function apiV1_getRefundStats() {
  return withTryCatch_(function () {
    var reqs = readAll_('FEE_REFUND_REQUEST').filter(function (r) { return r.보관여부 !== 'Y'; });
    var refunds = readAll_('FEE_REFUND');
    var count = function (arr, field, value) { return arr.filter(function (r) { return r[field] === value; }).length; };
    return {
      신청접수: count(reqs, '신청상태', '접수'),
      송금대기: count(refunds, '금전처리상태', '대기'),
      송금완료: count(refunds, '금전처리상태', '완료'),
      신청반려: count(reqs, '신청상태', '반려')
    };
  });
}

/* [확장] 완료·반려 상태인 환불신청만 목록에서 감춥니다. */
function apiV1_archiveRefund(params) {
  params = params || {};
  return withTryCatch_(function () {
    var before = findById_('FEE_REFUND_REQUEST', params.환불신청ID);
    if (!before) throw new Error('환불신청을 찾을 수 없습니다: ' + params.환불신청ID);
    var refund = findWhere_('FEE_REFUND', function (r) { return r.환불신청ID === before.환불신청ID; })[0];
    var isTerminal = before.신청상태 === '반려' || (refund && (refund.금전처리상태 === '완료' || refund.금전처리상태 === '실패'));
    if (!isTerminal) throw new Error('완료·반려 상태인 건만 보관할 수 있습니다.');

    var after = updateRow_('FEE_REFUND_REQUEST', params.환불신청ID, { 보관여부: 'Y' });
    writeAudit_('FEE_REFUND_REQUEST', params.환불신청ID, '보관', 'N', 'Y', params.note || '');
    return after;
  });
}

/* ------------------------------------------------------------------ */
/* FEE_API_012  환불 상세 조회  apiV1_getRefund                         */
/* 계좌정보 등 민감정보는 필요 권한자에게만 노출 (hasFullAccess 파라미터)   */
/* ------------------------------------------------------------------ */
function apiV1_getRefund(params) {
  params = params || {};
  return withTryCatch_(function () {
    var request = findById_('FEE_REFUND_REQUEST', params.환불신청ID);
    if (!request) throw new Error('환불신청 건을 찾을 수 없습니다: ' + params.환불신청ID);
    var refund = findWhere_('FEE_REFUND', function (r) { return r.환불신청ID === request.환불신청ID; })[0] || null;

    if (!params.hasFullAccess) {
      request = Object.assign({}, request, { 계좌번호: maskAccount_(request.계좌번호) });
    }
    return { request: request, refund: refund };
  });
}

/* ------------------------------------------------------------------ */
/* FEE_API_013  환불신청 처리(단일/일괄)  apiV1_processRefunds           */
/* 승인 시 환불내역(FEE_REFUND)을 자동 생성합니다(금전처리상태=대기).       */
/* ------------------------------------------------------------------ */
function apiV1_processRefunds(params) {
  params = params || {};
  return withTryCatch_(function () {
    var ids = params.ids || [];
    var action = params.action;
    if (action !== 'APPROVE' && action !== 'REJECT') throw new Error('알 수 없는 action입니다: ' + action);
    var newStatus = action === 'APPROVE' ? '승인' : '반려';
    var email = currentUserEmail_();

    var results = ids.map(function (id) {
      var before = findById_('FEE_REFUND_REQUEST', id);
      if (!before) return { id: id, success: false, message: '대상을 찾을 수 없습니다.' };
      if (before.신청상태 !== '접수') return { id: id, success: false, message: '이미 처리된 신청입니다(현재 상태: ' + before.신청상태 + ').' };

      var after = updateRow_('FEE_REFUND_REQUEST', id, {
        신청상태: newStatus,
        처리자ID: email,
        처리일시: new Date(),
        처리사유: action === 'REJECT' ? (params.reason || '') : ''
      });
      writeAudit_('FEE_REFUND_REQUEST', id, action === 'APPROVE' ? '승인' : '반려', before.신청상태, newStatus, params.reason || '');

      var refundRecord = null;
      if (action === 'APPROVE') {
        refundRecord = insertRow_('FEE_REFUND', {
          환불신청ID: before.환불신청ID,
          대상납부ID: before.대상납부ID,
          승인금액: params.approvedAmount || before.자동계산금액,
          금전처리상태: '대기',
          등록일시: new Date()
        });
        writeAudit_('FEE_REFUND', refundRecord.환불ID, '생성', '', JSON.stringify(refundRecord), '환불신청 승인에 따른 자동 생성');
      }
      return { id: id, success: true, after: after, refund: refundRecord };
    });
    return results;
  });
}

/* ------------------------------------------------------------------ */
/* [확장] 환불내역 송금 확정  apiV1_confirmRefundTransfer                */
/* params: { 환불ID, result: 'DONE'|'FAILED', 송금일 }                   */
/* ------------------------------------------------------------------ */
function apiV1_confirmRefundTransfer(params) {
  params = params || {};
  return withTryCatch_(function () {
    var before = findById_('FEE_REFUND', params.환불ID);
    if (!before) throw new Error('환불내역을 찾을 수 없습니다: ' + params.환불ID);
    var newStatus = params.result === 'DONE' ? '완료' : '실패';
    var patch = {
      금전처리상태: newStatus,
      송금자ID: currentUserEmail_(),
      송금일: params.송금일 ? new Date(params.송금일) : new Date()
    };
    var after = updateRow_('FEE_REFUND', params.환불ID, patch);
    writeAudit_('FEE_REFUND', params.환불ID, '송금확정', before.금전처리상태, newStatus, params.note || '');
    return after;
  });
}

/* ------------------------------------------------------------------ */
/* FEE_API_015  환불 내역 내보내기  apiV1_exportRefunds                 */
/* ------------------------------------------------------------------ */
function apiV1_exportRefunds(params) {
  params = params || {};
  return withTryCatch_(function () {
    var listResult = apiV1_listRefunds(Object.assign({}, params, { page: 1, pageSize: 100000 }));
    if (!listResult.success) throw new Error(listResult.error);
    var rows = listResult.data.items;

    var ss = SpreadsheetApp.create('학생회비_환불내역_' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd_HHmmss'));
    var sheet = ss.getSheets()[0];
    var headers = ['환불신청ID', '학번', '성명', '자동계산금액', '신청상태', '신청일시', '처리일시']
      .concat(params.includeAccount ? ['은행명', '계좌번호', '예금주'] : []);
    sheet.appendRow(headers);
    rows.forEach(function (r) { sheet.appendRow(headers.map(function (h) { return r[h]; })); });
    writeAudit_('환불내역', '', '내보내기', JSON.stringify(params), rows.length + '건', '필터: ' + JSON.stringify(params));
    return { fileUrl: ss.getUrl(), rowCount: rows.length };
  });
}

/* ------------------------------------------------------------------ */
/* FEE_API_016 / 017 / 018  구글폼 응답 반영 · 재처리                    */
/* 실제 구현은 FormSync.gs 참고 (트리거에서 호출)                         */
/* ------------------------------------------------------------------ */
function apiV1_importPaymentForm(params) {
  return withTryCatch_(function () { return importFormResponse_('PAYMENT', params); });
}
function apiV1_importRefundForm(params) {
  return withTryCatch_(function () { return importFormResponse_('REFUND', params); });
}
function apiV1_retryFormImport(params) {
  return withTryCatch_(function () { return retryFormImport_(params); });
}

/* ------------------------------------------------------------------ */
/* 공통 API 라우터 (외부 REST 호출/디버깅용)                             */
/* ------------------------------------------------------------------ */
var API_REGISTRY = {
  FEE_API_001: apiV1_getSummary,
  FEE_API_002: apiV1_listMembers,
  FEE_API_003: apiV1_getMember,
  FEE_API_004: apiV1_createMember,
  FEE_API_005: apiV1_updateMember,
  FEE_API_006: apiV1_listPayments,
  FEE_API_007: apiV1_getPayment,
  FEE_API_008: apiV1_processPayments,
  FEE_API_009: apiV1_calcPaymentDue,
  FEE_API_010: apiV1_exportPayments,
  FEE_API_011: apiV1_listRefunds,
  FEE_API_012: apiV1_getRefund,
  FEE_API_013: apiV1_processRefunds,
  FEE_API_014: apiV1_calcRefund,
  FEE_API_015: apiV1_exportRefunds,
  FEE_API_016: apiV1_importPaymentForm,
  FEE_API_017: apiV1_importRefundForm,
  FEE_API_018: apiV1_retryFormImport,
  FEE_API_EXT_01: apiV1_confirmPaymentReceipt,
  FEE_API_EXT_02: apiV1_confirmRefundTransfer,
  FEE_API_EXT_03: apiV1_getMemberStats,
  FEE_API_EXT_04: apiV1_getPaymentStats,
  FEE_API_EXT_05: apiV1_getRefundStats,
  FEE_API_EXT_06: apiV1_archivePayment,
  FEE_API_EXT_07: apiV1_archiveRefund
};

function callApi_(apiId, params) {
  var fn = API_REGISTRY[apiId];
  if (!fn) return fail_('알 수 없는 API ID: ' + apiId);
  return fn(params);
}
