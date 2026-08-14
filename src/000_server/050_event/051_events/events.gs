// 1. 행사 목록과 상세 조회
function api_getEventList(input) {
  requireLoginContext_();
  return getEventListData_(parseEventRequest_(input).request);
}

function api_getEventForEdit(input) {
  requireLoginContext_();
  return getEventData_(parseEventRequest_(input).request);
}

function api_getEventDetail(input) {
  requireLoginContext_();
  return getEventDetailData_(parseEventRequest_(input).request);
}

// 2. 행사 생성과 수정
function api_createEvent(input) {
  requireLoginContext_();
  return createEventData_(parseEventRequest_(input).request);
}

function api_updateEvent(input) {
  requireLoginContext_();
  return updateEventData_(parseEventRequest_(input).request);
}

// 3. 행사 상태 변경
function api_updateEventStatus(input) {
  requireLoginContext_();
  return updateEventStatusData_(parseEventRequest_(input).request);
}

function api_closeEvent(input) {
  requireLoginContext_();
  return closeEventData_(parseEventRequest_(input).request);
}
