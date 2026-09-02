var CONNECTION_RESOURCE_KEYS_ = {
  operationDb: 'OPERATION_DB_ID',
  userDb: 'USER_DB_ID',
  rootFolder: 'ROOT_FOLDER_ID'
};

var CONNECTION_PROFILE_REVISION_KEY_ = 'CONNECTION_PROFILE_REVISION';
var LOGIN_CONTEXT_CACHE_GENERATION_KEY_ = 'LOGIN_CONTEXT_CACHE_GENERATION';

function getConnectionProfile_() {
  var properties = PropertiesService.getScriptProperties().getProperties();
  return {
    operationDbId: properties.OPERATION_DB_ID || '',
    userDbId: properties.USER_DB_ID || '',
    rootFolderId: properties.ROOT_FOLDER_ID || '',
    revision: Number(properties[CONNECTION_PROFILE_REVISION_KEY_] || 0),
    resources: {
      operationDb: buildConnectionResourceMeta_('operationDb', properties),
      userDb: buildConnectionResourceMeta_('userDb', properties),
      rootFolder: buildConnectionResourceMeta_('rootFolder', properties)
    }
  };
}

function getLoginContextCacheGeneration_() {
  return Number(
    PropertiesService.getScriptProperties()
      .getProperty(LOGIN_CONTEXT_CACHE_GENERATION_KEY_) || 0
  );
}

function migrateLegacyConnectionProfile_() {
  var properties = PropertiesService.getScriptProperties();
  var current = properties.getProperties();
  var configuredKeys = Object.keys(CONNECTION_RESOURCE_KEYS_).filter(function (resourceKey) {
    return !!String(current[CONNECTION_RESOURCE_KEYS_[resourceKey]] || '').trim();
  });

  if (configuredKeys.length === 3) {
    ensureSystemConnectionManagePermission_();
    return { status: 'already_migrated', profile: getConnectionProfile_() };
  }
  if (configuredKeys.length > 0) {
    throwConnectionProfileError_(
      'PARTIAL_CONNECTION_PROFILE',
      '연결 프로필 일부만 설정되어 있습니다.',
      { configuredResources: configuredKeys }
    );
  }

  var userSpreadsheet = openCandidateSpreadsheet_(DB_CONFIG.userSpreadsheetId, 'userDb');
  var userResult = validateUserDbSpreadsheetIntegrity_(userSpreadsheet);
  requireValidConnectionMigrationResult_('userDb', userResult);

  var operationSpreadsheet = openCandidateSpreadsheet_(
    DB_CONFIG.operationSpreadsheetId,
    'operationDb'
  );
  var operationResult = validateOperationDbSpreadsheetIntegrity_(
    operationSpreadsheet,
    userResult.tables
  );
  requireValidConnectionMigrationResult_('operationDb', operationResult);

  var folder = openCandidateFolder_(DB_CONFIG.rootFolderId);
  validateRootFolderCandidate_(folder);
  ensureSystemConnectionManagePermission_();

  var entries = {};
  entries[CONNECTION_RESOURCE_KEYS_.operationDb] = DB_CONFIG.operationSpreadsheetId;
  entries[CONNECTION_RESOURCE_KEYS_.userDb] = DB_CONFIG.userSpreadsheetId;
  entries[CONNECTION_RESOURCE_KEYS_.rootFolder] = DB_CONFIG.rootFolderId;
  entries[CONNECTION_PROFILE_REVISION_KEY_] = '1';
  entries[LOGIN_CONTEXT_CACHE_GENERATION_KEY_] = '0';
  properties.setProperties(entries);
  return { status: 'migrated', profile: getConnectionProfile_() };
}

function requireValidConnectionMigrationResult_(resourceKey, result) {
  if (result && result.valid) return;
  throwConnectionProfileError_(
    'SCHEMA_INVALID',
    '연결할 DB의 구조 또는 무결성이 올바르지 않습니다.',
    { resource: resourceKey, issues: result && result.issues ? result.issues : [] }
  );
}

function requireConnectionResourceId_(resourceKey) {
  var propertyKey = requireConnectionPropertyKey_(resourceKey);
  var id = PropertiesService.getScriptProperties().getProperty(propertyKey);
  if (!String(id || '').trim()) {
    throwConnectionProfileError_(
      'NOT_CONNECTED',
      '필요한 시스템 자원이 연결되지 않았습니다.',
      { resource: resourceKey }
    );
  }
  return String(id).trim();
}

function replaceConnectionResource_(resourceKey, candidateId, actorEmail, expectedRevision) {
  var propertyKey = requireConnectionPropertyKey_(resourceKey);
  var normalizedCandidateId = String(candidateId || '').trim();
  if (!normalizedCandidateId) {
    throwConnectionProfileError_(
      'INVALID_CONNECTION_RESOURCE_ID',
      '연결할 자원 ID가 필요합니다.',
      { resource: resourceKey }
    );
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var properties = PropertiesService.getScriptProperties();
    var currentRevision = Number(
      properties.getProperty(CONNECTION_PROFILE_REVISION_KEY_) || 0
    );
    if (currentRevision !== Number(expectedRevision)) {
      throwConnectionProfileError_(
        'CONNECTION_CHANGED',
        '연결 정보가 이미 변경되었습니다.',
        {
          expectedRevision: Number(expectedRevision),
          actualRevision: currentRevision
        }
      );
    }

    var nextRevision = currentRevision + 1;
    var entries = {};
    entries[propertyKey] = normalizedCandidateId;
    entries[propertyKey + '_UPDATED_AT'] = getCurrentIsoDateTime_();
    entries[propertyKey + '_UPDATED_BY'] = normalizeEmail_(actorEmail);
    entries[CONNECTION_PROFILE_REVISION_KEY_] = String(nextRevision);
    if (resourceKey === 'userDb') {
      entries[LOGIN_CONTEXT_CACHE_GENERATION_KEY_] = String(
        Number(properties.getProperty(LOGIN_CONTEXT_CACHE_GENERATION_KEY_) || 0) + 1
      );
    }
    properties.setProperties(entries);
    return getConnectionProfile_();
  } finally {
    lock.releaseLock();
  }
}

function buildConnectionResourceMeta_(resourceKey, properties) {
  var propertyKey = requireConnectionPropertyKey_(resourceKey);
  var id = String(properties[propertyKey] || '').trim();
  return {
    id: id,
    connected: !!id,
    updatedAt: String(properties[propertyKey + '_UPDATED_AT'] || ''),
    updatedBy: String(properties[propertyKey + '_UPDATED_BY'] || '')
  };
}

function requireConnectionPropertyKey_(resourceKey) {
  var propertyKey = CONNECTION_RESOURCE_KEYS_[resourceKey];
  if (!propertyKey) {
    throwConnectionProfileError_(
      'INVALID_CONNECTION_RESOURCE',
      '지원하지 않는 연결 자원입니다.',
      { resource: resourceKey }
    );
  }
  return propertyKey;
}

function throwConnectionProfileError_(code, message, details) {
  var error = new Error(message);
  error.code = code;
  error.details = details || {};
  throw error;
}
