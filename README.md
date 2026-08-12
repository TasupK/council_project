# 학생회 통합 업무관리

Google Apps Script + clasp 웹앱 프로젝트

## API 설계 (1차)

기준 문서: [API 목록 시트](https://docs.google.com/spreadsheets/d/1XUPJO-tY3wI4SSb8lWORL084Y4QNSNGgPmaIU8sgzzE/edit?gid=380487636)

| API ID | 함수명 | 상태 | 비고 |
|--------|--------|------|------|
| COM_API_001 | `apiV1_checkLogin` | ✅ 구현 | 미연결 시 미리보기 모드 |
| COM_API_002 | `apiV1_getCurrentUser` | ✅ 구현 | 역할·메뉴 권한 포함 |
| COM_API_003 | `apiV1_logout` | ✅ 구현 | 클라이언트 세션 정리 안내 |
| COM_API_004 | `apiV1_listUsers` | ✅ 구현 | `getUsers` 래퍼 |
| COM_API_005 | `apiV1_getUser` | ✅ 구현 | |
| COM_API_006 | `apiV1_createUser` | ✅ 구현 | 운영 DB 연결 필요 |
| COM_API_007 | `apiV1_updateUser` | ✅ 구현 | |
| COM_API_008 | `apiV1_processUsers` | ✅ 구현 | activate / deactivate |
| COM_API_009 | `apiV1_listRoles` | ✅ 구현 | |
| COM_API_010 | `apiV1_getRole` | ✅ 구현 | 권한 매트릭스 포함 |
| COM_API_011 | `apiV1_createRole` | ✅ 구현 | |
| COM_API_012 | `apiV1_updateRole` | ✅ 구현 | 보호 역할 제한 |
| COM_API_013 | `apiV1_processRoles` | ✅ 구현 | 배정 사용자 있으면 차단 |
| COM_API_014 | `apiV1_getPermissionMatrix` | ✅ 구현 | |
| COM_API_015 | `apiV1_getRolePermissions` | ✅ 구현 | |
| COM_API_016 | `apiV1_saveRolePermissions` | ✅ 구현 | |
| COM_API_017 | `apiV1_getMyProfile` | ✅ 구현 | |
| COM_API_018 | `apiV1_getMyPermissions` | ✅ 구현 | |
| COM_API_019 | `apiV1_updateMyNotification` | 🔶 스텁 | USER_NOTIFICATION 테이블 대기 |
| COM_API_020 | `apiV1_getAcademicYearList` | ✅ 구현 | 메타 학년도 기준 |
| COM_API_021 | `apiV1_getDepartmentList` | ✅ 구현 | |
| COM_API_022 | `apiV1_listAssignees` | ✅ 구현 | 활성 사용자 필터 |
| COM_API_023 | `apiV1_uploadFile` | ⏳ 예정 | FILE / Drive 테이블 대기 |
| COM_API_024 | `apiV1_getFile` | ⏳ 예정 | |
| COM_API_025 | `apiV1_listCodes` | ✅ 구현 | 상태·역할구분·권한코드 |
| COM_API_026 | `apiV1_listAuditLogs` | 🔶 부분 | 감사이력 시트 자동 생성 |

### 집계 API (프론트 캐시용)

| 함수 | 용도 |
|------|------|
| `loadAllData` | 로그인 후 1회 — 사용자·역할·권한·부서 일괄 로드 |
| `connectDriveFolder` | 운영 Drive 폴더 ID → DB 스프레드시트 연결 |
| `connectSpreadsheet` | 스프레드시트 ID 직접 연결 |
| `disconnectDatabase` | 운영 DB 연결 해제 → 미리보기 모드 |

## DB 연결 정책

- **지금**: 운영 Drive/DB 미정 → **미리보기 모드** (시드 데이터, 저장 불가)
- **나중에**: 실제 Google Drive 폴더 ID 전달 → `connectDriveFolder`로 연결
- 개인 Drive에 임의 생성하던 자동 DB 생성은 **비활성화**

## 로컬 개발

```bash
clasp push
clasp redeploy <deploymentId> -d "설명"
```
