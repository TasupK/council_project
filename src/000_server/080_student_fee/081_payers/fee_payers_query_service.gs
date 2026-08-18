// 1. 학번 목록 표시용 마스킹
function maskStudentFeeStudentId_(studentId) {
  var text = String(studentId || '');
  if (text.length <= 4) return text;
  return text.slice(0, 2) + '****' + text.slice(-2);
}

// 2. 회비납부자 목록 조회
function getFeePayerListData_(request) {
  var source = request && typeof request === 'object' ? request : {};
  var keyword = String(source.keyword || '').trim().toLowerCase();
  var affiliation = String(source.affiliation || '').trim();
  var page = Math.max(Number(source.page) || 1, 1);
  var pageSize = Math.max(Number(source.pageSize) || 20, 1);
  var rows = listFeePayerRows_().filter(function (row) {
    if (affiliation && String(row.affiliation || '') !== affiliation) return false;
    if (!keyword) return true;
    return String(row.name || '').toLowerCase().indexOf(keyword) >= 0 ||
      String(row.studentId || '').toLowerCase().indexOf(keyword) >= 0;
  });

  rows.sort(function (a, b) {
    var aUpdated = String(a.updatedAt || '');
    var bUpdated = String(b.updatedAt || '');
    if (aUpdated !== bUpdated) return bUpdated.localeCompare(aUpdated);
    return String(a.studentId || '').localeCompare(String(b.studentId || ''));
  });

  var total = rows.length;
  var start = (page - 1) * pageSize;
  var items = rows.slice(start, start + pageSize).map(function (row) {
    return {
      studentId: maskStudentFeeStudentId_(row.studentId),
      studentIdKey: String(row.studentId || ''),
      name: row.name,
      affiliation: row.affiliation,
      startSemesterId: row.startSemesterId,
      managerId: row.managerId,
      updatedAt: row.updatedAt
    };
  });

  return { items: items, page: page, pageSize: pageSize, total: total };
}

// 3. 회비납부자 상세 조회
function getFeePayerDetailData_(request) {
  var studentId = requireStudentFeeId_(request, ['studentId', 'id']);
  var row = findFeePayerRowById_(studentId);
  if (!row) throw new Error('회비납부자를 찾을 수 없습니다: ' + studentId);
  return row;
}
