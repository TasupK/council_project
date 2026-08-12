/**
 * DB/API 설계서에 명시된 행사복지관리 공개 함수 20개.
 * 공통 응답 형식은 {ok, data, error, meta}를 사용한다.
 */

function apiV1_getEventList(input) {
  return ewExecuteApi_(function () {
    return ewGetEventListData_(ewParseRequest_(input).request);
  });
}

function apiV1_updateEventStatus(input) {
  return ewExecuteApi_(function () {
    return ewUpdateEventStatusData_(ewParseRequest_(input).request);
  });
}

function apiV1_closeEvent(input) {
  return ewExecuteApi_(function () {
    return ewCloseEventData_(ewParseRequest_(input).request);
  });
}

function apiV1_createEvent(input) {
  return ewExecuteApi_(function () {
    return ewCreateEventData_(ewParseRequest_(input).request);
  });
}

function apiV1_getEventForEdit(input) {
  return ewExecuteApi_(function () {
    return ewGetEventData_(ewParseRequest_(input).request);
  });
}

function apiV1_updateEvent(input) {
  return ewExecuteApi_(function () {
    return ewUpdateEventData_(ewParseRequest_(input).request);
  });
}

function apiV1_getEventDetail(input) {
  return ewExecuteApi_(function () {
    return ewGetEventDetailData_(ewParseRequest_(input).request);
  });
}

function apiV1_getApplicantList(input) {
  return ewExecuteApi_(function () {
    return ewGetApplicantListData_(ewParseRequest_(input).request);
  });
}

function apiV1_getApplicantDetail(input) {
  return ewExecuteApi_(function () {
    return ewGetApplicantDetailData_(ewParseRequest_(input).request);
  });
}

function apiV1_syncApplicantsFromForms(input) {
  return ewExecuteApi_(function () {
    ewParseRequest_(input);
    return ewUnavailable_(
      'Google Forms 원본 ID와 응답 열 매핑이 API/DB 설계서에 없어 동기화를 실행하지 않았습니다.'
    );
  });
}

function apiV1_processApplicant(input) {
  return ewExecuteApi_(function () {
    return ewProcessApplicantData_(ewParseRequest_(input).request);
  });
}

function apiV1_getAttendanceList(input) {
  return ewExecuteApi_(function () {
    return ewGetAttendanceListData_(ewParseRequest_(input).request);
  });
}

function apiV1_syncAttendanceList(input) {
  return ewExecuteApi_(function () {
    ewParseRequest_(input);
    return ewUnavailable_(
      '출석 체크 원본과 동기화 기준이 API/DB 설계서에 없어 동기화를 실행하지 않았습니다.'
    );
  });
}

function apiV1_applyAttendanceChanges(input) {
  return ewExecuteApi_(function () {
    return ewApplyAttendanceChangesData_(ewParseRequest_(input).request);
  });
}

function apiV1_getEventLedgerList(input) {
  return ewExecuteApi_(function () {
    ewParseRequest_(input);
    return ewUnavailable_(
      '행사 장부의 관련 DB 테이블과 필드 계약이 설계서에 없어 목록을 만들 수 없습니다.'
    );
  });
}

function apiV1_syncEventLedgers(input) {
  return ewExecuteApi_(function () {
    ewParseRequest_(input);
    return ewUnavailable_(
      '장부관리 영역과의 연동 키 및 쓰기 권한이 확정되지 않아 동기화를 실행하지 않았습니다.'
    );
  });
}

function apiV1_getEventRefundList(input) {
  return ewExecuteApi_(function () {
    return ewGetRefundListData_(ewParseRequest_(input).request);
  });
}

function apiV1_syncEventRefundTargets(input) {
  return ewExecuteApi_(function () {
    ewParseRequest_(input);
    return ewUnavailable_(
      '환불 대상 선정 규칙이 설계서에 없어 동기화를 실행하지 않았습니다.'
    );
  });
}

function apiV1_exportGroupRefundSheet(input) {
  return ewExecuteApi_(function () {
    ewParseRequest_(input);
    return ewUnavailable_(
      '은행명·계좌번호의 물리 필드명이 DB 설계서에 없어 환불 파일을 생성하지 않았습니다.'
    );
  });
}

function apiV1_applyRefundTransfers(input) {
  return ewExecuteApi_(function () {
    ewParseRequest_(input);
    return ewUnavailable_(
      '환불 이체 결과 상태 필드와 반영 규칙이 설계서에 없어 DB를 변경하지 않았습니다.'
    );
  });
}
