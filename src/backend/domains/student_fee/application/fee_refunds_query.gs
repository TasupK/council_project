// 1. 환불 목록용 학번 마스킹
function maskFeeRefundStudentId_(studentId) {
  var text = String(studentId || '');
  if (text.length <= 4) return text;
  return text.slice(0, 2) + '****' + text.slice(-2);
}

// 2. 환불 계좌번호 마스킹
function maskStudentFeeAccountNumber_(accountNumber) {
  var text = String(accountNumber || '');
  if (text.length <= 6) return text;
  return text.slice(0, 3) + '****' + text.slice(-3);
}

function requireFeeRefundLookupId_(request, keys, label) {
  var source = request && typeof request === 'object' ? request : {};
  for (var i = 0; i < keys.length; i += 1) {
    var value = String(source[keys[i]] == null ? '' : source[keys[i]]).trim();
    if (value) return value;
  }
  throw new Error(label + ' 값이 필요합니다.');
}

// 3. 납부건 기준 환불 가능 잔액 계산
function calculateRefundableAmount_(paymentId) {
  var payment = findFeePaymentRowById_(paymentId);
  if (!payment) throw new Error('납부내역을 찾을 수 없습니다: ' + paymentId);

  var requestIds = listFeeRefundRequestRows_().filter(function (row) {
    return String(row.paymentId) === String(paymentId);
  }).map(function (row) {
    return String(row.id);
  });

  var usedAmount = listFeeRefundRows_().filter(function (row) {
    return requestIds.indexOf(String(row.requestId)) >= 0 && ['대기', '완료'].indexOf(String(row.moneyStatus || '')) >= 0;
  }).reduce(function (sum, row) {
    return sum + (Number(row.approvedAmount) || 0);
  }, 0);

  return Math.max((Number(payment.amount) || 0) - usedAmount, 0);
}

// 4. 환불 가능액 조회
function calculateFeeRefundData_(request) {
  var paymentId = requireFeeRefundLookupId_(request, ['paymentId', 'id'], 'paymentId');
  var payment = findFeePaymentRowById_(paymentId);
  if (!payment) throw new Error('납부내역을 찾을 수 없습니다: ' + paymentId);
  return {
    paymentId: paymentId,
    paymentAmount: Number(payment.amount) || 0,
    refundableAmount: calculateRefundableAmount_(paymentId)
  };
}

// 5. 환불신청 목록 조회
function getFeeRefundRequestListData_(request) {
  var source = request && typeof request === 'object' ? request : {};
  var keyword = String(source.keyword || '').trim().toLowerCase();
  var status = String(source.status || '').trim();
  var page = Math.max(Number(source.page) || 1, 1);
  var pageSize = Math.max(Number(source.pageSize) || 20, 1);
  var refundByRequestId = {};

  listFeeRefundRows_().forEach(function (refund) {
    if (refund.requestId) refundByRequestId[String(refund.requestId)] = refund;
  });

  var rows = listFeeRefundRequestRows_().filter(function (row) {
    if (status && String(row.status || '') !== status) return false;
    if (!keyword) return true;
    return String(row.studentId || '').toLowerCase().indexOf(keyword) >= 0 ||
      String(row.accountHolder || '').toLowerCase().indexOf(keyword) >= 0 ||
      String(row.bankName || '').toLowerCase().indexOf(keyword) >= 0;
  });

  rows.sort(function (a, b) {
    var aApplied = String(a.appliedAt || '');
    var bApplied = String(b.appliedAt || '');
    if (aApplied !== bApplied) return bApplied.localeCompare(aApplied);
    return String(b.id || '').localeCompare(String(a.id || ''));
  });

  var total = rows.length;
  var start = (page - 1) * pageSize;
  var items = rows.slice(start, start + pageSize).map(function (row) {
    var item = {};
    Object.keys(row).forEach(function (key) { item[key] = row[key]; });
    item.studentId = maskFeeRefundStudentId_(row.studentId);
    item.accountNumber = maskStudentFeeAccountNumber_(row.accountNumber);
    item.refund = refundByRequestId[String(row.id)] || null;
    return item;
  });

  return { items: items, page: page, pageSize: pageSize, total: total };
}

// 6. 환불신청 상세 조회
function getFeeRefundRequestDetailData_(request) {
  var requestId = requireFeeRefundLookupId_(request, ['refundRequestId', 'requestId', 'id'], 'refundRequestId');
  var row = findFeeRefundRequestRowById_(requestId);
  if (!row) throw new Error('환불신청을 찾을 수 없습니다: ' + requestId);
  return {
    request: row,
    refund: findFeeRefundRowByRequestId_(requestId)
  };
}
