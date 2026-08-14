// 1. 행사 출석 조회
function api_getAttendanceList(input) {
  requireLoginContext_();
  return getAttendanceListData_(parseEventRequest_(input).request);
}

// 2. 행사 출석 변경
function api_applyAttendanceChanges(input) {
  requireLoginContext_();
  return applyAttendanceChangesData_(parseEventRequest_(input).request);
}

// TODO(행사 출석): 출석 체크 원본과 동기화 기준 확정 후 동기화 함수를 구현한다.
