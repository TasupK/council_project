// 1. 행사 신청 행 조회
function findAllEventApplicationClientRows_() {
  return readOperationTableClientRows_('eventApplications');
}

function findEventApplicationRowById_(applicationId) {
  return findOperationTableRowById_('eventApplications', applicationId);
}

// 2. 행사 신청 행 저장
function updateEventApplicationRowById_(applicationId, changes) {
  return updateOperationTableRow_('eventApplications', applicationId, changes);
}
