// 1. 납부신청 전체 조회
function listFeeApplicationRows_() {
  return readOperationTableClientRows_('feeApplications');
}

// 2. 납부신청 단건 조회
function findFeeApplicationRowById_(applicationId) {
  return findOperationTableRowById_('feeApplications', applicationId);
}

function findFeeApplicationRowBySourceResponseId_(sourceResponseId) {
  var sourceId = String(sourceResponseId || '').trim();
  if (!sourceId) return null;
  var rows = listFeeApplicationRows_();
  for (var i = 0; i < rows.length; i += 1) {
    if (String(rows[i].sourceResponseId || '').trim() === sourceId) return rows[i];
  }
  return null;
}

// 3. 납부신청 등록
function insertFeeApplicationRow_(application) {
  return appendOperationTableRow_('feeApplications', application);
}

// 4. 납부신청 수정
function updateFeeApplicationRowById_(applicationId, changes) {
  return updateOperationTableRow_('feeApplications', applicationId, changes);
}
