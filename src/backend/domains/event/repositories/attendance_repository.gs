// 1. 행사 출석 행 조회
function listEventAttendanceClientRows_() {
  return readOperationTableClientRows_('eventAttendance');
}

function findEventAttendanceRowById_(attendanceId) {
  return findOperationTableRowById_('eventAttendance', attendanceId);
}

function findEventAttendanceRowByApplicationId_(applicationId) {
  return listEventAttendanceClientRows_().filter(function (item) {
    return String(item.applicationId) === String(applicationId);
  })[0] || null;
}

// 2. 행사 출석 행 저장
function insertEventAttendanceRow_(attendance) {
  return appendOperationTableRow_('eventAttendance', attendance);
}

function updateEventAttendanceRowById_(attendanceId, changes) {
  return updateOperationTableRow_('eventAttendance', attendanceId, changes);
}
