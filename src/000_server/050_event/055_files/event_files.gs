/** 행사 관련자료를 Google Drive에 저장한다. */

var EVENT_MATERIAL_FOLDER_PROPERTY_KEY = 'EVENT_WELFARE_MATERIAL_FOLDER_ID';
var EVENT_MATERIAL_FOLDER_NAME = 'Council Project 행사복지 관련자료';
var EVENT_MAX_MATERIAL_FILE_SIZE_BYTES = 5 * 1024 * 1024;
var EVENT_MATERIAL_FILE_EXTENSIONS = [
  'pdf', 'hwp', 'hwpx', 'doc', 'docx', 'xls', 'xlsx',
  'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'zip'
];

function uploadEventRelatedMaterial_(fileInput, eventId) {
  if (!fileInput || typeof fileInput !== 'object') return '';

  var fileName = requireEventText_(fileInput.name, 'relatedMaterialFile.name');
  var extensionMatch = fileName.toLowerCase().match(/\.([a-z0-9]+)$/);
  var extension = extensionMatch ? extensionMatch[1] : '';
  if (EVENT_MATERIAL_FILE_EXTENSIONS.indexOf(extension) < 0) {
    throwEventError_(
      'VALIDATION_FAILED',
      '지원하지 않는 관련자료 파일 형식입니다.',
      { allowedExtensions: EVENT_MATERIAL_FILE_EXTENSIONS }
    );
  }

  var base64 = requireEventText_(fileInput.base64, 'relatedMaterialFile.base64');
  var bytes;
  try {
    bytes = Utilities.base64Decode(base64);
  } catch (error) {
    throwEventError_('VALIDATION_FAILED', '관련자료 파일을 해석할 수 없습니다.');
  }
  if (!bytes || !bytes.length) {
    throwEventError_('VALIDATION_FAILED', '관련자료 파일이 비어 있습니다.');
  }
  if (bytes.length > EVENT_MAX_MATERIAL_FILE_SIZE_BYTES) {
    throwEventError_('VALIDATION_FAILED', '관련자료 파일은 최대 5MB까지 업로드할 수 있습니다.');
  }

  var safeName = sanitizeEventDriveFileName_(fileName);
  var storedName = String(eventId || 'event') + '_' + new Date().getTime() + '_' + safeName;
  var mimeType = normalizeEventText_(fileInput.mimeType) || 'application/octet-stream';
  var blob = Utilities.newBlob(bytes, mimeType, storedName);
  var file = getEventMaterialFolder_().createFile(blob);
  return file.getUrl();
}

function getEventMaterialFolder_() {
  var properties = PropertiesService.getScriptProperties();
  var folderId = properties.getProperty(EVENT_MATERIAL_FOLDER_PROPERTY_KEY);
  if (folderId) {
    try {
      return DriveApp.getFolderById(folderId);
    } catch (error) {
      throwEventError_(
        'PROCESS_FAILED',
        'EVENT_WELFARE_MATERIAL_FOLDER_ID 폴더를 열 수 없습니다. Script Property를 확인해주세요.'
      );
    }
  }

  if (!DB_CONFIG || !DB_CONFIG.rootFolderId) {
    throwEventError_('PROCESS_FAILED', '통합 앱의 Drive 루트 폴더 ID가 설정되지 않았습니다.');
  }
  var rootFolder = DriveApp.getFolderById(DB_CONFIG.rootFolderId);
  var existingFolders = rootFolder.getFoldersByName(EVENT_MATERIAL_FOLDER_NAME);
  var folder = existingFolders.hasNext()
    ? existingFolders.next()
    : rootFolder.createFolder(EVENT_MATERIAL_FOLDER_NAME);
  properties.setProperty(EVENT_MATERIAL_FOLDER_PROPERTY_KEY, folder.getId());
  return folder;
}

function sanitizeEventDriveFileName_(fileName) {
  var safe = String(fileName || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .trim();
  return safe || 'related_material';
}
