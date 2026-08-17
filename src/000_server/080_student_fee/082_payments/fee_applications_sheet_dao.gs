// 1. 납부신청 전체 조회
function findAllFeeApplicationRows_() {
  return readOperationTableClientRows_('feeApplications');
}

// 2. 납부신청 단건 조회
function findFeeApplicationRowById_(applicationId) {
  return findOperationTableRowById_('feeApplications', applicationId);
}

// 3. 납부신청 수정
function updateFeeApplicationRowById_(applicationId, changes) {
  return updateOperationTableRow_('feeApplications', applicationId, changes);
}
