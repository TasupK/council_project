// 1. 행사 출석 행 조회
function findAllEventAttendanceClientRows_() {
  return readOperationTableClientRows_('eventAttendance');
}

function findEventAttendanceRowById_(attendanceId) {
  return findOperationTableRowById_('eventAttendance', attendanceId);
}

// 2. 행사 출석 행 저장
function insertEventAttendanceRow_(attendance) {
  return appendOperationTableRow_('eventAttendance', attendance);
}

function updateEventAttendanceRowById_(attendanceId, changes) {
  return updateOperationTableRow_('eventAttendance', attendanceId, changes);
}
