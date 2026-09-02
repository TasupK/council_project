function validateRootFolderCandidate_(folder) {
  if (!folder || folder.isTrashed()) {
    throwConnectionValidationError_(
      'RESOURCE_ACCESS_DENIED',
      '사용할 수 없는 Drive 폴더입니다.',
      { resource: 'rootFolder' }
    );
  }

  var probe;
  try {
    probe = folder.createFile('.connection-write-probe', 'connection validation');
    probe.setTrashed(true);
  } catch (error) {
    if (probe) {
      try {
        probe.setTrashed(true);
      } catch (cleanupError) {
        console.error('Folder probe cleanup failed.', cleanupError);
      }
    }
    console.error('Folder write probe failed.', error);
    throwConnectionValidationError_(
      'FOLDER_NOT_WRITABLE',
      '선택한 폴더에 파일을 생성할 수 없습니다.',
      { resource: 'rootFolder' }
    );
  }

  return { valid: true, name: folder.getName() };
}
