// 1. 행사 출석 조회
function api_getEventAttendances(input) {
  return apiHandler_({
    operation: 'getAttendanceList', input: input, requireLogin: true,
    access: eventApiAccess_('view'),
    parse: parseEventRequest_,
    service: function (parsed) { return getAttendanceListData_(parsed.request); }
  });
}

// 2. 행사 출석 변경
function api_applyEventAttendanceChanges(input) {
  return apiHandler_({
    operation: 'applyAttendanceChanges', input: input, requireLogin: true,
    access: eventApiAccess_('edit'),
    parse: parseEventRequest_,
    service: function (parsed, context) { return applyAttendanceChangesData_(parsed.request, context); }
  });
}

// TODO(행사 출석): 출석 체크 원본과 동기화 기준 확정 후 동기화 함수를 구현한다.
