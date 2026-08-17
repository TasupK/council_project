// 1. 납부신청 목록 조회와 납부내역 조합
function getFeeApplicationListData_(request) {
  var source = request && typeof request === 'object' ? request : {};
  var keyword = String(source.keyword || '').trim().toLowerCase();
  var status = String(source.status || '').trim();
  var page = Math.max(Number(source.page) || 1, 1);
  var pageSize = Math.max(Number(source.pageSize) || 20, 1);
  var paymentByApplicationId = {};

  findAllFeePaymentRows_().forEach(function (payment) {
    if (payment.applicationId) paymentByApplicationId[String(payment.applicationId)] = payment;
  });

  var rows = findAllFeeApplicationRows_().filter(function (row) {
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
    item.studentId = maskStudentFeeStudentId_(row.studentId);
    item.payment = paymentByApplicationId[String(row.id)] || null;
    return item;
  });

  return { items: items, page: page, pageSize: pageSize, total: total };
}

// 2. 납부신청 상세 조회
function getFeeApplicationDetailData_(request) {
  var applicationId = requireStudentFeeId_(request, ['applicationId', 'id']);
  var application = findFeeApplicationRowById_(applicationId);
  if (!application) throw new Error('납부신청을 찾을 수 없습니다: ' + applicationId);
  return {
    application: application,
    payment: findFeePaymentRowByApplicationId_(applicationId)
  };
}

// 3. 납부 예정 금액 계산
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
