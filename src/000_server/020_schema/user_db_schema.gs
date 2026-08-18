// 1. UserDB 테이블 스키마 정의
function getUserDbSchema_() {
  return {
    users: {
      name: '사용자',
      sheetName: '사용자',
      fields: {
        email: 'Google이메일',
        name: '성명',
        studentId: '학번',
        phone: '연락처',
        departmentId: '부서ID',
        status: '계정상태',
        updatedAt: '최종수정일시',
        updatedBy: '등록자이메일'
      },
      primaryKey: ['email'],
      foreignKeys: [
        { field: 'departmentId', refTable: 'departments', refField: 'id' }
      ]
    },
    departments: {
      name: '부서',
      sheetName: '부서',
      fields: {
        id: '부서ID',
        name: '부서명',
        type: '부서유형',
        sortOrder: '정렬순서',
        active: '활성여부'
      },
      primaryKey: ['id'],
      foreignKeys: []
    },
    roles: {
      name: '역할',
      sheetName: '역할',
      fields: {
        id: '역할ID',
        name: '역할명',
        isSystem: '시스템역할여부',
        description: '역할설명',
        active: '활성여부',
        assignedStatus: '배정상태',
        updatedAt: '수정일시',
        updatedBy: '등록자이메일'
      },
      primaryKey: ['id'],
      foreignKeys: []
    },
    permissions: {
      name: '권한',
      sheetName: '권한',
      fields: {
        id: '권한ID',
        area: '업무영역',
        action: '행위',
        name: '권한명',
        description: '권한설명',
        active: '활성여부'
      },
      primaryKey: ['id'],
      foreignKeys: []
    },
    userRoles: {
      name: '사용자역할',
      sheetName: '사용자역할',
      fields: {
        email: 'Google이메일',
        roleId: '역할ID',
        assignedStatus: '배정상태'
      },
      primaryKey: ['email', 'roleId'],
      foreignKeys: [
        { field: 'email', refTable: 'users', refField: 'email' },
        { field: 'roleId', refTable: 'roles', refField: 'id' }
      ]
    },
    rolePermissions: {
      name: '역할권한',
      sheetName: '역할권한',
      fields: {
        roleId: '역할ID',
        permissionId: '권한ID'
      },
      primaryKey: ['roleId', 'permissionId'],
      foreignKeys: [
        { field: 'roleId', refTable: 'roles', refField: 'id' },
        { field: 'permissionId', refTable: 'permissions', refField: 'id' }
      ]
    }
  };
}

// 2. UserDB 테이블 스키마 조회
function getUserDbTableSchema_(tableKey) {
  return getUserDbSchema_()[tableKey];
}

// 3. UserDB 테이블 필드 정의 조회
function getUserDbFields_(tableKey) {
  return getUserDbTableSchema_(tableKey).fields;
}
