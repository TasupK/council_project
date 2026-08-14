/**
 * 행사복지관리 전용 설정.
 * 다른 업무 영역과의 전역 이름 충돌을 피하기 위해 ew 접두사를 사용한다.
 */
function ewConfig_() {
  return {
    spreadsheetId: '1EI8MbFx2HSuizl0QFygRAZydYiv77W-6pQO10mRN55E',
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
        sheetName: '행사',
        idField: 'event_id',
        headers: [
          'event_id',
          'event_name',
          'event_type',
          'manager',
          'event_status',
          'application_management_enabled',
          'participation_fee_enabled',
          'fee_amount',
          'non_member_fee_amount',
          'attendance_management_enabled',
          'refund_management_enabled',
          'full_refund_policy',
          'settlement_balance_distribution_enabled',
          'recruit_start_date',
          'recruit_end_date',
          'event_date',
          'event_end_date',
          'capacity',
          'event_purpose',
          'created_at',
          'updated_at',
          'evidence_folder_id'
        ],
        physicalHeaders: [
          '행사ID', '행사명', '행사분류', '담당자ID', '진행상태', '신청관리여부',
          '참가비여부', '납부자참가비', '비납부자참가비', '출석관리여부', '환불관리여부',
          '전액환불정책', '결산잔액분배여부', '신청시작일시', '신청종료일시', '행사시작일시',
          '행사종료일시', '신청정원', '설명', '등록일시', '수정일시', '증빙폴더ID'
        ],
        fieldMap: {
          event_id: '행사ID',
          event_name: '행사명',
          event_type: '행사분류',
          manager: '담당자ID',
          event_status: '진행상태',
          application_management_enabled: '신청관리여부',
          participation_fee_enabled: '참가비여부',
          fee_amount: '납부자참가비',
          non_member_fee_amount: '비납부자참가비',
          attendance_management_enabled: '출석관리여부',
          refund_management_enabled: '환불관리여부',
          full_refund_policy: '전액환불정책',
          settlement_balance_distribution_enabled: '결산잔액분배여부',
          recruit_start_date: '신청시작일시',
          recruit_end_date: '신청종료일시',
          event_date: '행사시작일시',
          event_end_date: '행사종료일시',
          capacity: '신청정원',
          event_purpose: '설명',
          created_at: '등록일시',
          updated_at: '수정일시',
          evidence_folder_id: '증빙폴더ID'
        }
      },
      eventForm: {
        sheetName: '행사폼',
        idField: 'event_form_id',
        headers: [
          'event_form_id',
          'event_id',
          'google_form_id',
          'response_spreadsheet_id',
          'connection_status',
          'last_synced_at',
          'created_at'
        ],
        physicalHeaders: [
          '행사폼ID', '행사ID', 'GoogleFormID', '응답시트ID', '연동상태', '마지막동기화일시', '등록일시'
        ],
        fieldMap: {
          event_form_id: '행사폼ID',
          event_id: '행사ID',
          google_form_id: 'GoogleFormID',
          response_spreadsheet_id: '응답시트ID',
          connection_status: '연동상태',
          last_synced_at: '마지막동기화일시',
          created_at: '등록일시'
        }
      },
      applicant: {
        sheetName: '행사신청',
        idField: 'application_id',
        headers: [
          'application_id',
          'event_id',
          'source_response_id',
          'applied_at',
          'student_id',
          'name',
          'major',
          'phone',
          'applicant_type',
          'amount_due',
          'bank',
          'account_number',
          'account_holder',
          'approval_status',
          'imported_at',
          'manager_id',
          'approved_at',
          'student_card_file_id',
          'payment_capture_file_id'
        ],
        physicalHeaders: [
          '신청ID', '행사ID', '원본응답ID', '원본응답일시', '학번', '성명', '학과', '연락처',
          '신청자구분', '적용참가비', '은행', '계좌번호', '예금주', '신청상태', '가져온일시',
          '담당자ID', '처리일시', '학생카드캡쳐파일ID', '입금캡쳐파일ID'
        ],
        fieldMap: {
          application_id: '신청ID',
          event_id: '행사ID',
          source_response_id: '원본응답ID',
          applied_at: '원본응답일시',
          student_id: '학번',
          name: '성명',
          major: '학과',
          phone: '연락처',
          applicant_type: '신청자구분',
          amount_due: '적용참가비',
          bank: '은행',
          account_number: '계좌번호',
          account_holder: '예금주',
          approval_status: '신청상태',
          imported_at: '가져온일시',
          manager_id: '담당자ID',
          approved_at: '처리일시',
          student_card_file_id: '학생카드캡쳐파일ID',
          payment_capture_file_id: '입금캡쳐파일ID'
        }
      },
      additionalAnswer: {
        sheetName: '신청추가답변',
        idField: 'additional_answer_id',
        headers: [
          'additional_answer_id',
          'application_id',
          'question_id',
          'question_title',
          'answer_value'
        ],
        physicalHeaders: ['추가답변ID', '신청ID', '질문ID', '질문제목', '답변값'],
        fieldMap: {
          additional_answer_id: '추가답변ID',
          application_id: '신청ID',
          question_id: '질문ID',
          question_title: '질문제목',
          answer_value: '답변값'
        }
      },
      deposit: {
        sheetName: '행사입금',
        idField: 'deposit_id',
        headers: [
          'deposit_id',
          'application_id',
          'amount_due',
          'amount_paid',
          'payment_date',
          'depositor_name',
          'payment_status',
          'manager_id',
          'confirmed_at'
        ],
        physicalHeaders: [
          '행사입금ID', '신청ID', '납부예정금액', '실제입금액', '입금일', '입금자명',
          '금전처리상태', '담당자ID', '확인일시'
        ],
        fieldMap: {
          deposit_id: '행사입금ID',
          application_id: '신청ID',
          amount_due: '납부예정금액',
          amount_paid: '실제입금액',
          payment_date: '입금일',
          depositor_name: '입금자명',
          payment_status: '금전처리상태',
          manager_id: '담당자ID',
          confirmed_at: '확인일시'
        }
      },
      attendance: {
        sheetName: '행사출석',
        idField: 'application_id',
        headers: [
          'attendance_id',
          'application_id',
          'attendance_status',
          'confirmed_at',
          'attendance_checker',
          'confirmation_method'
        ],
        physicalHeaders: ['출석ID', '신청ID', '출석상태', '확인일시', '담당자ID', '확인방법'],
        fieldMap: {
          attendance_id: '출석ID',
          application_id: '신청ID',
          attendance_status: '출석상태',
          confirmed_at: '확인일시',
          attendance_checker: '담당자ID',
          confirmation_method: '확인방법'
        }
      },
      refund: {
        sheetName: '행사환불',
        idField: 'refund_id',
        headers: [
          'refund_id',
          'application_id',
          'deposit_id',
          'settlement_id',
          'refund_type',
          'calculation_base_amount',
          'refund_amount',
          'payment_status',
          'refund_date',
          'manager_id',
          'result_file_id',
          'created_at'
        ],
        physicalHeaders: [
          '행사환불ID', '신청ID', '행사입금ID', '행사정산ID', '환불구분', '계산기준금액',
          '환불금액', '금전처리상태', '환불일', '담당자ID', '환불결과자료ID', '등록일시'
        ],
        fieldMap: {
          refund_id: '행사환불ID',
          application_id: '신청ID',
          deposit_id: '행사입금ID',
          settlement_id: '행사정산ID',
          refund_type: '환불구분',
          calculation_base_amount: '계산기준금액',
          refund_amount: '환불금액',
          payment_status: '금전처리상태',
          refund_date: '환불일',
          manager_id: '담당자ID',
          result_file_id: '환불결과자료ID',
          created_at: '등록일시'
        }
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
