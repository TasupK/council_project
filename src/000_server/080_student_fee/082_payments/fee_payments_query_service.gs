// 1. 납부신청 목록용 학번 마스킹
function maskFeeApplicationStudentId_(studentId) {
  var text = String(studentId || '');
  if (text.length <= 4) return text;
  return text.slice(0, 2) + '****' + text.slice(-2);
}

// 2. 납부신청 목록 조회와 납부내역 조합
function getFeeApplicationListData_(request) {
  var source = request && typeof request === 'object' ? request : {};
  var keyword = String(source.keyword || '').trim().toLowerCase();
  var status = String(source.status || '').trim();
  var page = Math.max(Number(source.page) || 1, 1);
  var pageSize = Math.max(Number(source.pageSize) || 20, 1);
  var paymentByApplicationId = {};

  listFeePaymentRows_().forEach(function (payment) {
    if (payment.applicationId) paymentByApplicationId[String(payment.applicationId)] = payment;
  });

  var rows = listFeeApplicationRows_().filter(function (row) {
    if (status && String(row.status || '') !== status) return false;
    if (!keyword) return true;
    return String(row.name || '').toLowerCase().indexOf(keyword) >= 0 ||
      String(row.studentId || '').toLowerCase().indexOf(keyword) >= 0;
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
    item.studentId = maskFeeApplicationStudentId_(row.studentId);
    item.payment = paymentByApplicationId[String(row.id)] || null;
    return item;
  });

  return { items: items, page: page, pageSize: pageSize, total: total };
}

// 3. 납부신청 상세 조회
function getFeeApplicationDetailData_(request) {
  var applicationId = requireStudentFeeId_(request, ['applicationId', 'id']);
  var application = findFeeApplicationRowById_(applicationId);
  if (!application) throw new Error('납부신청을 찾을 수 없습니다: ' + applicationId);
  return {
    application: application,
    payment: findFeePaymentRowByApplicationId_(applicationId)
  };
}

// 4. 납부 예정 금액 계산
function calculateFeeAmountData_(request) {
  var paymentDate = String(request && request.paymentDate || '').trim().slice(0, 10);
  if (!paymentDate) throw new Error('paymentDate 값이 필요합니다.');
  var rate = resolveStudentFeeRate_(paymentDate);
  return {
    paymentDate: paymentDate,
    feeRateId: rate.id,
    amount: Number(rate.amountPerSemester)
  };
}

// 5. 학생회비 전체 현황 조회
function getStudentFeeSummaryData_() {
  var payers = listFeePayerRows_();
  var applications = listFeeApplicationRows_();
  var payments = listFeePaymentRows_();
  var refundRequests = listFeeRefundRequestRows_();
  var refunds = listFeeRefundRows_();
  var countByStatus = function (rows, status) {
    return rows.filter(function (row) { return String(row.status || '') === status; }).length;
  };
  var countByMoneyStatus = function (rows, status) {
    return rows.filter(function (row) { return String(row.moneyStatus || '') === status; }).length;
  };
  var sumCompleted = function (rows, amountField) {
    return rows.filter(function (row) {
      return String(row.moneyStatus || '') === '완료';
    }).reduce(function (sum, row) {
      return sum + (Number(row[amountField]) || 0);
    }, 0);
  };

  return {
    payers: { total: payers.length },
    applications: {
      total: applications.length,
      pending: countByStatus(applications, '접수'),
      approved: countByStatus(applications, '승인'),
      rejected: countByStatus(applications, '반려')
    },
    payments: {
      total: payments.length,
      pending: countByMoneyStatus(payments, '대기'),
      completed: countByMoneyStatus(payments, '완료'),
      mismatch: countByMoneyStatus(payments, '불일치'),
      completedAmount: sumCompleted(payments, 'amount')
    },
    refundRequests: {
      total: refundRequests.length,
      pending: countByStatus(refundRequests, '접수'),
      approved: countByStatus(refundRequests, '승인'),
      rejected: countByStatus(refundRequests, '반려')
    },
    refunds: {
      total: refunds.length,
      pending: countByMoneyStatus(refunds, '대기'),
      completed: countByMoneyStatus(refunds, '완료'),
      failed: countByMoneyStatus(refunds, '실패'),
      completedAmount: sumCompleted(refunds, 'approvedAmount')
    }
  };
}
