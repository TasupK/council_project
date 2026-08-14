/** 레거시 관련자료 업로드 보조 함수. 현재 행사 생성 화면에서는 사용하지 않는다. */
function ewUploadRelatedMaterial_(fileInput, eventId) {
  if (!fileInput || typeof fileInput !== 'object') return '';

  var config = ewConfig_();
  var fileName = ewRequiredText_(fileInput.name, 'related_material_file.name');
  var extensionMatch = fileName.toLowerCase().match(/\.([a-z0-9]+)$/);
  var extension = extensionMatch ? extensionMatch[1] : '';
  if (config.materialFileExtensions.indexOf(extension) < 0) {
    ewThrow_(
      'VALIDATION_FAILED',
      '지원하지 않는 관련자료 파일 형식입니다.',
      { allowedExtensions: config.materialFileExtensions }
    );
  }

  var base64 = ewRequiredText_(fileInput.base64, 'related_material_file.base64');
  var bytes;
  try {
    bytes = Utilities.base64Decode(base64);
  } catch (error) {
    ewThrow_('VALIDATION_FAILED', '관련자료 파일을 해석할 수 없습니다.');
  }
  if (!bytes || !bytes.length) {
    ewThrow_('VALIDATION_FAILED', '관련자료 파일이 비어 있습니다.');
  }
  if (bytes.length > config.maxMaterialFileSizeBytes) {
    ewThrow_('VALIDATION_FAILED', '관련자료 파일은 최대 5MB까지 업로드할 수 있습니다.');
  }

  var safeName = ewSafeDriveFileName_(fileName);
  var storedName = String(eventId || 'event') + '_' + new Date().getTime() + '_' + safeName;
  var mimeType = ewOptionalText_(fileInput.mimeType) || 'application/octet-stream';
  var blob = Utilities.newBlob(bytes, mimeType, storedName);
  var file = ewGetMaterialFolder_().createFile(blob);
  return file.getUrl();
}

function ewGetMaterialFolder_() {
  var config = ewConfig_();
  var properties = PropertiesService.getScriptProperties();
  var folderId = properties.getProperty(config.materialFolderPropertyKey);
  if (folderId) {
    try {
      return DriveApp.getFolderById(folderId);
    } catch (error) {
      ewThrow_(
        'PROCESS_FAILED',
        'EVENT_WELFARE_MATERIAL_FOLDER_ID 폴더를 열 수 없습니다. Script Property를 확인해주세요.'
      );
    }
  }

  var folder = DriveApp.createFolder(config.materialFolderName);
  properties.setProperty(config.materialFolderPropertyKey, folder.getId());
  return folder;
}

function ewSafeDriveFileName_(fileName) {
  var safe = String(fileName || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .trim();
  return safe || 'related_material';
}
