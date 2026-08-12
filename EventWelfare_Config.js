/**
 * 행사복지관리 전용 설정.
 * 다른 업무 영역과의 전역 이름 충돌을 피하기 위해 ew 접두사를 사용한다.
 */
function ewConfig_() {
  return {
    spreadsheetPropertyKey: 'EVENT_WELFARE_SPREADSHEET_ID',
    materialFolderPropertyKey: 'EVENT_WELFARE_MATERIAL_FOLDER_ID',
    materialFolderName: 'Council Project 행사복지 관련자료',
    maxMaterialFileSizeBytes: 5 * 1024 * 1024,
    materialFileExtensions: [
      'pdf', 'hwp', 'hwpx', 'doc', 'docx', 'xls', 'xlsx',
      'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'zip'
    ],
    tables: {
      event: {
        sheetName: 'EVT_01_EVENT',
        idField: 'event_id',
        headers: [
          'event_id',
          'event_name',
          'event_type',
          'event_status',
          'department',
          'manager',
          'recruit_start_date',
          'recruit_end_date',
          'event_date',
          'event_place',
          'capacity',
          'fee_amount',
          'non_member_fee_amount',
          'event_purpose',
          'related_materials',
          'additional_notes'
        ]
      },
      applicant: {
        sheetName: 'EVT_02_EVENT_PARTICIPANT',
        idField: 'application_id',
        headers: [
          'application_id',
          'event_id',
          'name',
          'student_id',
          'phone',
          'applied_at',
          'membership_status',
          'depositor_name',
          'amount_due',
          'amount_paid',
          'fee_paid_date',
          'approval_status',
          'approved_at',
          'is_cancelled',
          'refund_amount',
          'refund_processed_at'
        ]
      },
      attendance: {
        sheetName: 'EVT_03_ATTENDANCE',
        idField: 'application_id',
        headers: [
          'application_id',
          'student_id',
          'fee_confirmed_at',
          'attendance_status',
          'attendance_checker'
        ]
      }
    },
    eventStatuses: ['예정', '모집중', '진행중', '종료'],
    membershipStatuses: ['납부', '미납'],
    approvalStatuses: ['대기', '승인', '반려'],
    attendanceStatuses: ['출석', '미참석'],
    defaultPageSize: 10,
    maxPageSize: 100
  };
}

/** index.html에는 행사복지 partial만 포함할 수 있다. */
function ewInclude_(fileName) {
  if (!/^EventWelfare_[A-Za-z0-9_]+$/.test(String(fileName || ''))) {
    throw new Error('허용되지 않은 HTML partial입니다.');
  }
  return HtmlService.createHtmlOutputFromFile(fileName).getContent();
}

function ewNow_() {
  return new Date().toISOString();
}

function ewToday_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Seoul', 'yyyy-MM-dd');
}

function ewCurrentUserEmail_() {
  // TODO(공통 인증): USER/ROLE/PERMISSION 설계 확정 후 권한 검증에 사용한다.
  return Session.getActiveUser().getEmail() || '';
}
