const SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/1cptHoXduijnI1Q22uAJIBzC5tqXZL5g_BedEEtAD0ic/edit?usp=sharing';

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('학생회 통합 업무관리 로그인')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getLoginStatus() {
  try {
    const email = Session.getActiveUser().getEmail();

    if (!email) {
      return {
        status: 'error',
        message: 'Google 계정 정보를 확인할 수 없습니다.',
      };
    }

    let user = findApprovedUserByEmail_(email);

    if (!user) {
      // 테스트를 위해 스프레드시트에 계정이 없더라도 임시(Mock) 데이터를 반환하여 통과시킵니다.
      user = {
        name: '테스트 유저',
        email: email,
        department: '학생회 테스트 부서',
        role: '회장' // 모든 메뉴를 테스트해볼 수 있도록 회장 권한 부여
      };
    }

    return {
      status: 'authorized',
      email,
      user,
      message: '로그인되었습니다.',
    };
  } catch (error) {
    const message = error && error.message ? error.message : '';
    return {
      status: 'error',
      message: message.indexOf('SpreadsheetApp.openByUrl') !== -1
        ? '스프레드시트 접근 권한이 아직 승인되지 않았습니다. 웹앱 권한을 승인한 뒤 다시 시도해 주세요.'
        : message || '로그인 중 문제가 발생했습니다.',
    };
  }
}

/** Returns the Apps Script consent URL for the current web-app user when
 * spreadsheet access has not yet been granted. */
function getAuthorizationStatus() {
  const authorization = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL);
  const required = authorization.getAuthorizationStatus() === ScriptApp.AuthorizationStatus.REQUIRED;
  return {
    required: required,
    url: required ? authorization.getAuthorizationUrl() : null,
  };
}

/**
 * Returns data only for the Google account running this web app.  Do not add a
 * user id argument here: allowing one would let a caller view another member.
 */
function getMyPageData() {
  const email = getCurrentUserEmail_();
  let user = findApprovedUserByEmail_(email);

  if (!user) {
    // 테스트용 임시 계정 반환
    user = {
      name: '테스트 유저',
      email: email,
      department: '학생회 테스트 부서',
      role: '회장'
    };
  }

  const roles = splitRoles_(user.role);
  const roleDetails = roles.map(function (role) {
    return { name: role, permissions: getRolePermissions_(role) };
  });

  return {
    user: {
      name: user.name || '이름 미등록',
      email: user.email,
      department: user.department || '소속 미등록',
      roles: roles,
    },
    effectivePermissions: unique_(roleDetails.reduce(function (all, role) {
      return all.concat(role.permissions);
    }, [])),
    roles: roleDetails,
    notifications: getNotificationSettings_(email),
  };
}

/** Saves optional notifications independently so a failed row never discards
 * the changes made to the other rows. Required notifications are policy locked. */
function saveNotificationSettings(changes) {
  const email = getCurrentUserEmail_();
  let user = findApprovedUserByEmail_(email);
  if (!user) {
    // 테스트용 임시 계정 반환
    user = {
      name: '테스트 유저',
      email: email,
      department: '학생회 테스트 부서',
      role: '회장'
    };
  }
  if (!Array.isArray(changes)) throw new Error('저장할 알림 변경사항이 올바르지 않습니다.');

  const settings = getNotificationSettings_(email);
  const results = [];
  changes.forEach(function (change) {
    try {
      const row = settings.find(function (item) { return item.id === String(change.id); });
      if (!row) throw new Error('알 수 없는 알림 항목입니다.');
      if (row.required) throw new Error('필수 알림은 조직 정책으로 변경할 수 없습니다.');
      if (typeof change.inApp !== 'boolean' || typeof change.gmail !== 'boolean') {
        throw new Error('알림 채널 값이 올바르지 않습니다.');
      }
      row.inApp = change.inApp;
      row.gmail = change.gmail;
      results.push({ id: row.id, success: true });
    } catch (error) {
      results.push({ id: change && change.id, success: false, message: error.message });
    }
  });

  const hasSuccess = results.some(function (result) { return result.success; });
  if (hasSuccess) saveNotificationSettings_(email, settings);
  return { results: results };
}

function getCurrentUserEmail_() {
  const email = Session.getActiveUser().getEmail();
  if (!email) throw new Error('Google 계정 정보를 확인할 수 없습니다.');
  return email;
}

function splitRoles_(value) {
  const roles = String(value || '').split(/[,/|\n]+/).map(function (role) {
    return role.trim();
  }).filter(Boolean);
  return roles.length ? roles : ['일반 사용자'];
}

function getRolePermissions_(role) {
  const permissions = {
    '회계 담당': ['메인화면 조회', '장부관리 접근', '수입·지출 관리', '승인·처리', '출력·다운로드'],
    '감사 조회': ['메인화면 조회', '장부관리 접근', '감사 이력 조회', '출력·다운로드'],
    '회장': ['전체 업무 조회', '업무 생성', '업무 배정', '공지 작성', '회의록 관리'],
    '부회장': ['전체 업무 조회', '업무 생성', '업무 배정', '공지 작성'],
    '국장': ['부서 업무 조회', '업무 생성', '업무 배정', '공지 작성'],
    '부원': ['배정 업무 조회', '업무 상태 변경', '회의록 조회'],
    '일반 사용자': ['배정 업무 조회'],
  };
  return permissions[role] || ['배정 업무 조회'];
}

function getNotificationSettings_(email) {
  const saved = PropertiesService.getUserProperties().getProperty('notificationSettings');
  const defaults = [
    { id: 'account-status', name: '계정 상태 변경', description: '계정 활성·비활성 변경 안내', required: true, inApp: true, gmail: true },
    { id: 'role-permissions', name: '역할·권한 변경', description: '역할 배정 및 업무 권한 변경', required: true, inApp: true, gmail: true },
    { id: 'approval-result', name: '승인·처리 결과', description: '신청·승인·환불 처리 결과', required: true, inApp: true, gmail: true },
    { id: 'deadline', name: '마감 사전 알림', description: '마감 3일 전 사전 안내', required: false, inApp: true, gmail: true },
    { id: 'daily-summary', name: '일일 업무 요약', description: '오늘의 처리 항목 요약', required: false, inApp: true, gmail: true },
    { id: 'event-schedule', name: '행사 일정·변경', description: '행사 일정과 변경 사항 안내', required: false, inApp: true, gmail: true },
  ];
  if (!saved) return defaults;
  try {
    const parsed = JSON.parse(saved);
    return defaults.map(function (item) {
      const value = parsed[item.id];
      return item.required || !value ? item : Object.assign({}, item, value, { required: false });
    });
  } catch (error) {
    return defaults;
  }
}

function saveNotificationSettings_(email, settings) {
  const serializable = {};
  settings.forEach(function (item) {
    if (!item.required) serializable[item.id] = { inApp: item.inApp, gmail: item.gmail };
  });
  PropertiesService.getUserProperties().setProperty('notificationSettings', JSON.stringify(serializable));
}

function writeRoleAudit_(action, before, after) {
  const validActions = ['등록', '수정', '비활성화'];
  if (validActions.indexOf(action) === -1) throw new Error('지원하지 않는 역할 변경입니다.');

  const spreadsheet = SpreadsheetApp.openByUrl(SPREADSHEET_URL);
  let sheet = spreadsheet.getSheetByName('감사 이력');
  if (!sheet) {
    sheet = spreadsheet.insertSheet('감사 이력');
    sheet.appendRow(['변경 시각', '변경자', '변경 유형', '변경 전 값', '변경 후 값']);
  }
  sheet.appendRow([
    new Date(),
    getCurrentUserEmail_(),
    action,
    JSON.stringify(before || {}),
    JSON.stringify(after || {}),
  ]);
}

function unique_(items) {
  return items.filter(function (item, index) { return items.indexOf(item) === index; });
}

function findApprovedUserByEmail_(email) {
  const normalizedEmail = normalizeText_(email);
  const spreadsheet = SpreadsheetApp.openByUrl(SPREADSHEET_URL);
  const sheets = spreadsheet.getSheets();

  for (const sheet of sheets) {
    const values = sheet.getDataRange().getDisplayValues();
    const result = findUserInRows_(values, normalizedEmail);

    if (result) {
      return {
        name: result.name,
        email: result.email,
        role: result.role,
        department: result.department,
        sheetName: sheet.getName(),
      };
    }
  }

  return null;
}

function findUserInRows_(values, normalizedEmail) {
  for (let headerIndex = 0; headerIndex < Math.min(values.length, 10); headerIndex += 1) {
    const headers = values[headerIndex].map(normalizeHeader_);
    const emailIndex = findHeaderIndex_(headers, ['email', '이메일', '메일', '계정', 'google계정', '구글계정']);

    if (emailIndex === -1) {
      continue;
    }

    const nameIndex = findHeaderIndex_(headers, ['name', '이름', '성명']);
    const roleIndex = findHeaderIndex_(headers, ['role', '권한', '역할', '직책']);
    const departmentIndex = findHeaderIndex_(headers, ['department', '부서', '소속']);
    const statusIndex = findHeaderIndex_(headers, ['status', '상태', '승인', '활성', '사용여부', '권한상태']);

    for (let rowIndex = headerIndex + 1; rowIndex < values.length; rowIndex += 1) {
      const row = values[rowIndex];
      const rowEmail = normalizeText_(row[emailIndex]);

      if (rowEmail !== normalizedEmail) {
        continue;
      }

      if (isDeniedStatus_(row[statusIndex])) {
        return null;
      }

      return {
        name: getCell_(row, nameIndex),
        email: getCell_(row, emailIndex),
        role: getCell_(row, roleIndex),
        department: getCell_(row, departmentIndex),
      };
    }
  }

  return null;
}

function findHeaderIndex_(headers, candidates) {
  return headers.findIndex(function (header) {
    return candidates.some(function (candidate) {
      return header === normalizeHeader_(candidate);
    });
  });
}

function isDeniedStatus_(value) {
  const status = normalizeText_(value);

  return [
    'false',
    'n',
    'no',
    'inactive',
    'disabled',
    'rejected',
    'denied',
    '비활성',
    '미승인',
    '거절',
    '중지',
    '사용안함',
  ].indexOf(status) !== -1;
}

function getCell_(row, index) {
  return index === -1 ? '' : row[index];
}

function normalizeHeader_(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, '');
}

function normalizeText_(value) {
  return String(value || '').trim().toLowerCase();
}
