// 1. 운영 DB 테이블 스키마 정의
function getOperationDbSchema_() {
  return {
    settings: {
      name: '_설정',
      sheetName: OPERATION_TABLES.settings,
      fields: {
        key: '설정키',
        value: '설정값',
        description: '설명'
      },
      primaryKey: ['key'],
      foreignKeys: []
    },
    businessAuditLogs: {
      name: '업무감사로그',
      sheetName: OPERATION_TABLES.businessAuditLogs,
      fields: {
        id: '로그ID',
        occurredAt: '발생일시',
        actorEmail: '처리자이메일',
        actionType: '행위구분',
        targetType: '대상구분',
        targetId: '대상ID',
        beforeValue: '변경전값',
        afterValue: '변경후값',
        reason: '처리사유'
      },
      primaryKey: ['id'],
      foreignKeys: []
    },
    semesters: {
      name: '학기기준',
      sheetName: OPERATION_TABLES.semesters,
      fields: {
        id: '학기ID',
        year: '학년도',
        type: '학기구분',
        startDate: '시작일',
        endDate: '종료일',
        active: '활성여부'
      },
      primaryKey: ['id'],
      foreignKeys: []
    },
    feeRates: {
      name: '회비금액기준',
      sheetName: OPERATION_TABLES.feeRates,
      fields: {
        id: '금액기준ID',
        startDate: '적용시작일',
        endDate: '적용종료일',
        amountPerSemester: '학기당금액',
        active: '활성여부'
      },
      primaryKey: ['id'],
      foreignKeys: []
    },
    feePayers: {
      name: '회비납부자',
      sheetName: OPERATION_TABLES.feePayers,
      fields: {
        studentId: '학번',
        name: '성명',
        affiliation: '소속',
        startSemesterId: '적용시작학기ID',
        managerId: '담당자ID',
        updatedAt: '수정일시'
      },
      primaryKey: ['studentId'],
      foreignKeys: [
        { field: 'startSemesterId', refDatabase: 'operation', refTable: 'semesters', refField: 'id' },
        { field: 'managerId', refDatabase: 'user', refTable: 'users', refField: 'email' }
      ]
    },
    feeApplications: {
      name: '납부신청',
      sheetName: OPERATION_TABLES.feeApplications,
      fields: {
        id: '납부신청ID',
        studentId: '학번',
        name: '성명',
        affiliation: '소속',
        paymentDate: '납입날짜',
        semesterNumber: '신청학기차수',
        appliedAt: '신청일시',
        status: '신청상태',
        managerId: '담당자ID',
        processedAt: '처리일시',
        studentCardFileId: '학생카드캡쳐파일ID',
        depositFileId: '입금캡쳐파일ID'
      },
      primaryKey: ['id'],
      foreignKeys: [
        { field: 'managerId', refDatabase: 'user', refTable: 'users', refField: 'email' }
      ]
    },
    feePayments: {
      name: '납부내역',
      sheetName: OPERATION_TABLES.feePayments,
      fields: {
        id: '납부ID',
        applicationId: '납부신청ID',
        amount: '납부금액',
        paymentDate: '납부일',
        depositorName: '입금자명',
        moneyStatus: '금전처리상태',
        managerId: '담당자ID',
        confirmedAt: '확인일시'
      },
      primaryKey: ['id'],
      foreignKeys: [
        { field: 'applicationId', refDatabase: 'operation', refTable: 'feeApplications', refField: 'id' },
        { field: 'managerId', refDatabase: 'user', refTable: 'users', refField: 'email' }
      ]
    },
    feeRefundRequests: {
      name: '환불신청',
      sheetName: OPERATION_TABLES.feeRefundRequests,
      fields: {
        id: '환불신청ID',
        studentId: '학번',
        bankName: '은행명',
        accountNumber: '계좌번호',
        accountHolder: '예금주',
        reason: '환불사유',
        paymentId: '납부내역ID',
        semesterNumber: '환불신청학기차수',
        appliedAt: '신청일시',
        status: '신청상태',
        managerId: '담당자ID',
        processedAt: '처리일시',
        studentCardFileId: '학생카드캡쳐파일ID',
        enrollmentChangeFileId: '학적변동내역파일ID',
        otherEvidenceFileId: '기타증빙파일ID'
      },
      primaryKey: ['id'],
      foreignKeys: [
        { field: 'studentId', refDatabase: 'operation', refTable: 'feePayers', refField: 'studentId' },
        { field: 'paymentId', refDatabase: 'operation', refTable: 'feePayments', refField: 'id' },
        { field: 'managerId', refDatabase: 'user', refTable: 'users', refField: 'email' }
      ]
    },
    feeRefunds: {
      name: '환불내역',
      sheetName: OPERATION_TABLES.feeRefunds,
      fields: {
        id: '환불ID',
        requestId: '환불신청ID',
        approvedAmount: '승인금액',
        transferDate: '송금일',
        moneyStatus: '금전처리상태',
        managerId: '담당자ID',
        transferEvidenceId: '송금확인자료ID',
        createdAt: '등록일시'
      },
      primaryKey: ['id'],
      foreignKeys: [
        { field: 'requestId', refDatabase: 'operation', refTable: 'feeRefundRequests', refField: 'id' },
        { field: 'managerId', refDatabase: 'user', refTable: 'users', refField: 'email' }
      ]
    },
    events: {
      name: '행사',
      sheetName: OPERATION_TABLES.events,
      fields: {
        id: '행사ID',
        name: '행사명',
        category: '행사분류',
        managerId: '담당자ID',
        status: '진행상태',
        applicationEnabled: '신청관리여부',
        feeEnabled: '참가비여부',
        payerFee: '납부자참가비',
        nonPayerFee: '비납부자참가비',
        attendanceEnabled: '출석관리여부',
        refundEnabled: '환불관리여부',
        fullRefundPolicy: '전액환불정책',
        balanceDistributionEnabled: '결산잔액분배여부',
        applicationStartAt: '신청시작일시',
        applicationEndAt: '신청종료일시',
        eventStartAt: '행사시작일시',
        eventEndAt: '행사종료일시',
        capacity: '신청정원',
        description: '설명',
        createdAt: '등록일시',
        updatedAt: '수정일시',
        evidenceFolderId: '증빙폴더ID'
      },
      primaryKey: ['id'],
      foreignKeys: [
        { field: 'managerId', refDatabase: 'user', refTable: 'users', refField: 'email' }
      ]
    },
    eventForms: {
      name: '행사폼',
      sheetName: OPERATION_TABLES.eventForms,
      fields: {
        id: '행사폼ID',
        eventId: '행사ID',
        googleFormId: 'GoogleFormID',
        responseSheetId: '응답시트ID',
        status: '연동상태',
        lastSyncedAt: '마지막동기화일시',
        createdAt: '등록일시'
      },
      primaryKey: ['id'],
      foreignKeys: [
        { field: 'eventId', refDatabase: 'operation', refTable: 'events', refField: 'id' }
      ]
    },
    eventApplications: {
      name: '행사신청',
      sheetName: OPERATION_TABLES.eventApplications,
      fields: {
        id: '신청ID',
        eventId: '행사ID',
        sourceResponseId: '원본응답ID',
        sourceResponseAt: '원본응답일시',
        studentId: '학번',
        name: '성명',
        department: '학과',
        phone: '연락처',
        applicantType: '신청자구분',
        appliedFee: '적용참가비',
        bankName: '은행',
        accountNumber: '계좌번호',
        accountHolder: '예금주',
        status: '신청상태',
        importedAt: '가져온일시',
        managerId: '담당자ID',
        processedAt: '처리일시',
        studentCardFileId: '학생카드캡쳐파일ID',
        depositFileId: '입금캡쳐파일ID'
      },
      primaryKey: ['id'],
      foreignKeys: [
        { field: 'eventId', refDatabase: 'operation', refTable: 'events', refField: 'id' },
        { field: 'managerId', refDatabase: 'user', refTable: 'users', refField: 'email' }
      ]
    },
    eventExtraAnswers: {
      name: '신청추가답변',
      sheetName: OPERATION_TABLES.eventExtraAnswers,
      fields: {
        id: '추가답변ID',
        applicationId: '신청ID',
        questionId: '질문ID',
        questionTitle: '질문제목',
        answer: '답변값'
      },
      primaryKey: ['id'],
      foreignKeys: [
        { field: 'applicationId', refDatabase: 'operation', refTable: 'eventApplications', refField: 'id' }
      ]
    },
    eventPayments: {
      name: '행사입금',
      sheetName: OPERATION_TABLES.eventPayments,
      fields: {
        id: '행사입금ID',
        applicationId: '신청ID',
        expectedAmount: '납부예정금액',
        paidAmount: '실제입금액',
        paymentDate: '입금일',
        depositorName: '입금자명',
        moneyStatus: '금전처리상태',
        managerId: '담당자ID',
        confirmedAt: '확인일시'
      },
      primaryKey: ['id'],
      foreignKeys: [
        { field: 'applicationId', refDatabase: 'operation', refTable: 'eventApplications', refField: 'id' },
        { field: 'managerId', refDatabase: 'user', refTable: 'users', refField: 'email' }
      ]
    },
    eventAttendance: {
      name: '행사출석',
      sheetName: OPERATION_TABLES.eventAttendance,
      fields: {
        id: '출석ID',
        applicationId: '신청ID',
        status: '출석상태',
        confirmedAt: '확인일시',
        managerId: '담당자ID',
        method: '확인방법'
      },
      primaryKey: ['id'],
      foreignKeys: [
        { field: 'applicationId', refDatabase: 'operation', refTable: 'eventApplications', refField: 'id' },
        { field: 'managerId', refDatabase: 'user', refTable: 'users', refField: 'email' }
      ]
    },
    eventSettlements: {
      name: '행사정산',
      sheetName: OPERATION_TABLES.eventSettlements,
      fields: {
        id: '행사정산ID',
        eventId: '행사ID',
        totalIncome: '입금총액',
        totalExpense: '지출총액',
        firstRefundTotal: '1차환불총액',
        distributableAmount: '분배가능금액',
        recipientCount: '분배대상인원',
        refundPerPerson: '1인당환불액',
        remainder: '절사잔액',
        status: '정산상태',
        managerId: '담당자ID',
        confirmedAt: '확정일시'
      },
      primaryKey: ['id'],
      foreignKeys: [
        { field: 'eventId', refDatabase: 'operation', refTable: 'events', refField: 'id' },
        { field: 'managerId', refDatabase: 'user', refTable: 'users', refField: 'email' }
      ]
    },
    eventRefunds: {
      name: '행사환불',
      sheetName: OPERATION_TABLES.eventRefunds,
      fields: {
        id: '행사환불ID',
        applicationId: '신청ID',
        paymentId: '행사입금ID',
        settlementId: '행사정산ID',
        type: '환불구분',
        baseAmount: '계산기준금액',
        refundAmount: '환불금액',
        moneyStatus: '금전처리상태',
        refundDate: '환불일',
        managerId: '담당자ID',
        resultFileId: '환불결과자료ID',
        createdAt: '등록일시'
      },
      primaryKey: ['id'],
      foreignKeys: [
        { field: 'applicationId', refDatabase: 'operation', refTable: 'eventApplications', refField: 'id' },
        { field: 'paymentId', refDatabase: 'operation', refTable: 'eventPayments', refField: 'id' },
        { field: 'settlementId', refDatabase: 'operation', refTable: 'eventSettlements', refField: 'id' },
        { field: 'managerId', refDatabase: 'user', refTable: 'users', refField: 'email' }
      ]
    },
    ledger: {
      name: '수입지출원장',
      sheetName: OPERATION_TABLES.ledger,
      fields: {
        id: '거래ID',
        bankTransactionId: '계좌거래ID',
        transactionAt: '거래일시',
        description: '거래내용',
        transactionType: '거래구분',
        amount: '거래금액',
        counterparty: '거래상대명',
        source: '유입경로',
        eventId: '행사ID',
        businessType: '업무구분',
        businessId: '업무ID',
        matchStatus: '일치상태',
        recordStatus: '레코드상태',
        managerId: '담당자ID',
        createdAt: '등록일시',
        updatedAt: '수정일시'
      },
      primaryKey: ['id'],
      foreignKeys: [
        { field: 'bankTransactionId', refDatabase: 'operation', refTable: 'bankTransactions', refField: 'id', optional: true },
        { field: 'eventId', refDatabase: 'operation', refTable: 'events', refField: 'id' },
        { field: 'managerId', refDatabase: 'user', refTable: 'users', refField: 'email' }
      ]
    },
    evidence: {
      name: '거래증빙',
      sheetName: OPERATION_TABLES.evidence,
      fields: {
        id: '증빙ID',
        transactionId: '거래ID',
        category: '증빙구분',
        type: '증빙유형',
        evidenceDate: '증빙일자',
        amount: '증빙금액',
        driveFileId: 'Drive파일ID',
        fileName: '파일명',
        ocrStatus: 'OCR상태',
        ocrValidationResult: 'OCR검증결과',
        managerId: '담당자ID',
        createdAt: '등록일시',
        note: '비고'
      },
      primaryKey: ['id'],
      foreignKeys: [
        { field: 'transactionId', refDatabase: 'operation', refTable: 'ledger', refField: 'id' },
        { field: 'managerId', refDatabase: 'user', refTable: 'users', refField: 'email' }
      ]
    },
    bankTransactions: {
      name: '계좌거래',
      sheetName: OPERATION_TABLES.bankTransactions,
      fields: {
        id: '계좌거래ID',
        transactionAt: '거래일시',
        description: '적요',
        bankType: '거래유형',
        institution: '거래기관',
        counterpartyAccountNumber: '상대계좌번호',
        amount: '거래금액',
        balanceAfter: '거래후잔액',
        memo: '메모',
        sourceHash: '원본해시',
        recordStatus: '레코드상태',
        createdAt: '등록일시'
      },
      primaryKey: ['id'],
      foreignKeys: []
    },
    reconciliationItems: {
      name: '감사대사상세',
      sheetName: OPERATION_TABLES.reconciliationItems,
      fields: {
        id: '대사상세ID',
        reconciliationId: '대사ID',
        bankTransactionId: '계좌거래ID',
        ledgerId: '거래ID',
        result: '대사결과',
        differenceAmount: '차이금액',
        validationNote: '검증내용',
        createdAt: '등록일시'
      },
      primaryKey: ['id'],
      foreignKeys: [
        { field: 'reconciliationId', refDatabase: 'operation', refTable: 'reconciliation', refField: 'id' },
        { field: 'bankTransactionId', refDatabase: 'operation', refTable: 'bankTransactions', refField: 'id', optional: true },
        { field: 'ledgerId', refDatabase: 'operation', refTable: 'ledger', refField: 'id', optional: true }
      ]
    },
    settlementReports: {
      name: '결산보고서',
      sheetName: OPERATION_TABLES.settlementReports,
      fields: {
        id: '결산ID',
        name: '결산명',
        startDate: '결산시작일',
        endDate: '결산종료일',
        openingBalance: '기초잔액',
        totalIncome: '총수입',
        totalExpense: '총지출',
        closingBalance: '기말잔액',
        incomeCount: '수입건수',
        expenseCount: '지출건수',
        unreconciledCount: '미대사건수',
        missingEvidenceCount: '증빙미비건수',
        status: '결산상태',
        reportDriveFileId: '보고서Drive파일ID',
        managerId: '담당자ID',
        createdAt: '생성일시',
        confirmedAt: '확정일시',
        note: '비고'
      },
      primaryKey: ['id'],
      foreignKeys: [
        { field: 'managerId', refDatabase: 'user', refTable: 'users', refField: 'email' }
      ]
    },
    reconciliation: {
      name: '감사대사',
      sheetName: OPERATION_TABLES.reconciliation,
      fields: {
        id: '대사ID',
        auditStartDate: '감사시작일',
        auditEndDate: '감사종료일',
        accountOpeningBalance: '계좌기초잔액',
        accountClosingBalance: '계좌기말잔액',
        accountTransactionCount: '계좌거래건수',
        ledgerTransactionCount: '원장거래건수',
        normalCount: '정상건수',
        missingLedgerCount: '원장누락건수',
        unverifiedBankCount: '계좌미확인건수',
        reviewRequiredCount: '확인필요건수',
        status: '대사상태',
        managerId: '담당자ID',
        executedAt: '실행일시',
        confirmedAt: '확인일시',
        confirmation: '확인내용'
      },
      primaryKey: ['id'],
      foreignKeys: [
        { field: 'managerId', refDatabase: 'user', refTable: 'users', refField: 'email' }
      ]
    }
  };
}

// 2. 운영 DB 테이블 스키마 조회
function getOperationDbTableSchema_(tableKey) {
  return getOperationDbSchema_()[tableKey];
}

// 3. 운영 DB 테이블 필드 정의 조회
function getOperationDbFields_(tableKey) {
  return getOperationDbTableSchema_(tableKey).fields;
}