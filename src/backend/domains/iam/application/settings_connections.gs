function extractSpreadsheetIdFromUrl_(value) {
  var match = String(value || '').trim().match(
    /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/
  );
  if (!match) {
    throwSettingsConnectionError_(
      'INVALID_RESOURCE_URL',
      '올바른 Google Sheets URL을 입력해 주세요.'
    );
  }
  return match[1];
}

function extractFolderIdFromUrl_(value) {
  var match = String(value || '').trim().match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (!match) {
    throwSettingsConnectionError_(
      'INVALID_RESOURCE_URL',
      '올바른 Google Drive 폴더 URL을 입력해 주세요.'
    );
  }
  return match[1];
}

function updateSettingsConnection_(resourceType, input, current) {
  var request = input || {};
  var candidateId = resourceType === 'rootFolder'
    ? extractFolderIdFromUrl_(request.resourceUrl)
    : extractSpreadsheetIdFromUrl_(request.resourceUrl);
  var candidate = validateSettingsConnectionCandidate_(
    resourceType,
    candidateId,
    current
  );
  var profile = replaceConnectionResource_(
    resourceType,
    candidate.id,
    current.user.email,
    request.expectedRevision
  );
  return {
    resourceType: resourceType,
    candidate: candidate,
    profile: profile
  };
}

function validateSettingsConnectionCandidate_(resourceType, candidateId, current) {
  if (resourceType === 'operationDb') {
    return validateOperationDbConnectionCandidate_(candidateId);
  }
  if (resourceType === 'userDb') {
    return validateUserDbConnectionCandidate_(candidateId, current);
  }
  if (resourceType === 'rootFolder') {
    return validateRootFolderConnectionCandidate_(candidateId);
  }
  throwSettingsConnectionError_(
    'INVALID_CONNECTION_RESOURCE',
    '지원하지 않는 연결 자원입니다.',
    { resource: resourceType }
  );
}

function validateOperationDbConnectionCandidate_(candidateId) {
  var spreadsheet = openCandidateSpreadsheet_(candidateId, 'operationDb');
  var userTables = readUserDbIntegrityTables_(getUserDbSchema_());
  var result = validateOperationDbSpreadsheetIntegrity_(spreadsheet, userTables);
  requireValidSettingsDbCandidate_('operationDb', result);
  return { id: candidateId, name: spreadsheet.getName(), validation: result };
}

function validateUserDbConnectionCandidate_(candidateId, current) {
  var spreadsheet = openCandidateSpreadsheet_(candidateId, 'userDb');
  var result = validateUserDbSpreadsheetIntegrity_(spreadsheet);
  requireValidSettingsDbCandidate_('userDb', result);
  requireCandidateAdminAccess_(result.tables, current.user.email);

  var operationResult = validateOperationDbSpreadsheetIntegrity_(
    openOperationSpreadsheet_(),
    result.tables
  );
  requireValidSettingsDbCandidate_('userDb', operationResult);
  return { id: candidateId, name: resolveCandidateResourceName_(spreadsheet), validation: result };
}

function validateRootFolderConnectionCandidate_(candidateId) {
  var folder = openCandidateFolder_(candidateId);
  var result = validateRootFolderCandidate_(folder);
  return { id: candidateId, name: result.name, validation: result };
}

function requireCandidateAdminAccess_(tables, email) {
  var schema = getUserDbSchema_();
  var normalizedEmail = normalizeEmail_(email);
  var userFields = schema.users.fields;
  var userRoleFields = schema.userRoles.fields;
  var roleFields = schema.roles.fields;
  var permissionFields = schema.permissions.fields;
  var mappingFields = schema.rolePermissions.fields;
  var activeUser = (tables.users || []).some(function (row) {
    return normalizeEmail_(row[userFields.email]) === normalizedEmail &&
      isActiveStatus_(row[userFields.active]);
  });
  var activeRoleIds = (tables.userRoles || []).filter(function (row) {
    return normalizeEmail_(row[userRoleFields.email]) === normalizedEmail &&
      isActiveStatus_(row[userRoleFields.assignedStatus]);
  }).map(function (row) {
    return normalizeTextValue_(row[userRoleFields.roleId]);
  });
  var enabledRoleIds = {};
  (tables.roles || []).forEach(function (row) {
    var roleId = normalizeTextValue_(row[roleFields.id]);
    if (roleId && isTruthyValue_(row[roleFields.active])) enabledRoleIds[roleId] = true;
  });
  activeRoleIds = activeRoleIds.filter(function (roleId) { return enabledRoleIds[roleId]; });

  var activePermission = (tables.permissions || []).some(function (row) {
    return normalizeTextValue_(row[permissionFields.id]) === 'SYSTEM_CONNECTION_MANAGE' &&
      isTruthyValue_(row[permissionFields.active]);
  });
  var hasMappedPermission = activePermission && (tables.rolePermissions || []).some(function (row) {
    return activeRoleIds.indexOf(normalizeTextValue_(row[mappingFields.roleId])) !== -1 &&
      normalizeTextValue_(row[mappingFields.permissionId]) === 'SYSTEM_CONNECTION_MANAGE';
  });
  var hasAdminRole = activeRoleIds.indexOf(ADMIN_ROLE_ID) !== -1;

  if (!activeUser || (!hasAdminRole && !hasMappedPermission)) {
    throwSettingsConnectionError_(
      'ADMIN_ACCESS_WOULD_BE_LOST',
      '새 사용자 DB에서 현재 관리자의 접근 권한을 확인할 수 없습니다.'
    );
  }
}

function requireValidSettingsDbCandidate_(resourceType, result) {
  if (result && result.valid) return;
  throwSettingsConnectionError_(
    'SCHEMA_INVALID',
    '연결할 DB의 필수 컬럼 또는 무결성이 올바르지 않습니다.',
    { resource: resourceType, issues: result && result.issues ? result.issues : [] }
  );
}

function resolveCandidateResourceName_(resource) {
  return resource && typeof resource.getName === 'function' ? resource.getName() : '';
}

function throwSettingsConnectionError_(code, message, details) {
  var error = new Error(message || code);
  error.code = code;
  error.details = details || {};
  throw error;
}

function getSettingsConnectionCards_(current) {
  var profile = getConnectionProfile_();
  var canManage = canManageSettingsConnections_(current);
  return {
    revision: profile.revision,
    canManage: canManage,
    operationDb: buildSettingsConnectionCard_(
      'operationDb',
      profile.resources.operationDb,
      canManage
    ),
    userDb: buildSettingsConnectionCard_(
      'userDb',
      profile.resources.userDb,
      canManage
    ),
    rootFolder: buildSettingsConnectionCard_(
      'rootFolder',
      profile.resources.rootFolder,
      canManage
    )
  };
}

function buildSettingsConnectionCard_(resourceType, resource, canManage) {
  var id = resource && resource.id ? resource.id : '';
  var card = {
    id: canManage ? id : '',
    status: id ? 'connected' : 'not_connected',
    connected: !!id,
    name: '',
    url: '',
    updatedAt: resource && resource.updatedAt ? resource.updatedAt : '',
    updatedBy: resource && resource.updatedBy ? resource.updatedBy : ''
  };
  if (!id) return card;

  try {
    if (resourceType === 'rootFolder') {
      card.name = DriveApp.getFolderById(id).getName();
      if (canManage) card.url = 'https://drive.google.com/drive/folders/' + id;
    } else {
      card.name = SpreadsheetApp.openById(id).getName();
      if (canManage) card.url = 'https://docs.google.com/spreadsheets/d/' + id + '/edit';
    }
  } catch (error) {
    console.error('Failed to load connection card.', resourceType, error);
    card.status = 'connection_error';
  }
  return card;
}

function canManageSettingsConnections_(current) {
  if (current && current.isAdmin) return true;
  var byScreen = current && current.permissions && current.permissions.byScreen
    ? current.permissions.byScreen
    : {};
  var grant = byScreen.perm_SYSTEM_CONNECTION_MANAGE || {};
  return !!grant.edit;
}
