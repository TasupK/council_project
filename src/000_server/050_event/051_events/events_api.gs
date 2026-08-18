// 1. 행사 목록과 상세 조회
function api_getEventList(input) {
  return apiHandler_({
    operation: 'getEventList', input: input, requireLogin: true,
    access: eventApiAccess_('view'),
    parse: parseEventRequest_,
    service: function (parsed) { return getEventListData_(parsed.request); }
  });
}

function api_getEventForEdit(input) {
  return apiHandler_({
    operation: 'getEventForEdit', input: input, requireLogin: true,
    access: eventApiAccess_('view'),
    parse: parseEventRequest_,
    service: function (parsed) { return getEventData_(parsed.request); }
  });
}

function api_getEventDetail(input) {
  return apiHandler_({
    operation: 'getEventDetail', input: input, requireLogin: true,
    access: eventApiAccess_('view'),
    parse: parseEventRequest_,
    service: function (parsed) { return getEventDetailData_(parsed.request); }
  });
}

// 2. 행사 생성과 수정
function api_createEvent(input) {
  return apiHandler_({
    operation: 'createEvent', input: input, requireLogin: true,
    access: eventApiAccess_('edit'),
    parse: parseEventRequest_,
    service: function (parsed, context) { return createEventData_(parsed.request, context); }
  });
}

function api_updateEvent(input) {
  return apiHandler_({
    operation: 'updateEvent', input: input, requireLogin: true,
    access: eventApiAccess_('edit'),
    parse: parseEventRequest_,
    service: function (parsed, context) { return updateEventData_(parsed.request, context); }
  });
}

// 3. 행사 상태 변경
function api_updateEventStatus(input) {
  return apiHandler_({
    operation: 'updateEventStatus', input: input, requireLogin: true,
    access: eventApiAccess_('approve'),
    parse: parseEventRequest_,
    service: function (parsed, context) { return processEventStatusData_(parsed.request, context); }
  });
}

function api_closeEvent(input) {
  return apiHandler_({
    operation: 'closeEvent', input: input, requireLogin: true,
    access: eventApiAccess_('approve'),
    parse: parseEventRequest_,
    service: function (parsed, context) { return processEventClosureData_(parsed.request, context); }
  });
}
