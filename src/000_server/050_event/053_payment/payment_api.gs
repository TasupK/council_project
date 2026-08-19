// 행사 입금 등록
function api_createEventPayment(input) {
  return apiHandler_({
    operation: 'createEventPayment', input: input, requireLogin: true,
    access: eventApiAccess_('edit'),
    parse: parseEventRequest_,
    service: function (parsed, context) { return createEventPaymentData_(parsed.request, context); }
  });
}

// 행사 입금 수정
function api_updateEventPayment(input) {
  return apiHandler_({
    operation: 'updateEventPayment', input: input, requireLogin: true,
    access: eventApiAccess_('edit'),
    parse: parseEventRequest_,
    service: function (parsed, context) { return updateEventPaymentData_(parsed.request, context); }
  });
}
