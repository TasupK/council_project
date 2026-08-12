# 행사복지관리 구현 메모

이 문서는 행사복지관리 전용 구현의 실행 조건과 설계 미확정 범위를 기록한다. 기존 `README.md`, DB/API 설계서, 다른 업무 영역은 변경하지 않는다.

## 실행 전 설정

기존 행사복지 Google Spreadsheet를 사용할 때는 Apps Script 프로젝트의 Script Properties에
`EVENT_WELFARE_SPREADSHEET_ID`를 등록하고 값에 Spreadsheet ID를 입력한다.

Script Property와 Active Spreadsheet가 모두 없으면 최초 실행 시 사용자가 승인한
`Council Project 행사복지 DB` Spreadsheet를 자동 생성하고 ID를 Script Property에 저장한다.
행사 테이블 시트가 없으면 DB 설계서의 물리 필드명으로 다음 시트를 만든다.

- `EVT_01_EVENT`
- `EVT_02_EVENT_PARTICIPANT`
- `EVT_03_ATTENDANCE`

기존 시트의 헤더가 설계서와 다르면 데이터를 덮어쓰지 않고 `PROCESS_FAILED`로 중단한다.

## API 호출 형식

API 설계서의 공통 초안 형식에 맞춰 다음 envelope를 사용한다.

```javascript
{
  auth: { email: '' },
  request: {
    id: '...',
    filter: {},
    payload: {}
  }
}
```

응답은 `{ ok, data, error, meta: { requestId, executedAt } }` 형식이다. 행사복지 API 상세 시트에 Request/Response 필드가 확정되면 `request` 내부 계약을 대조해야 한다.

## 설계 확인 전 실행하지 않는 기능

- Google Forms 신청자 동기화: Form ID와 열 매핑 없음
- 출석 명단 원본 동기화: 원본 ID와 동기화 기준 없음
- 행사 장부 조회/동기화: 행사 장부 DB 테이블과 타 영역 연동 키 없음
- 단체 환불 파일 생성: 은행명·계좌번호의 물리 필드명 없음
- 환불 이체 결과 반영: 처리 상태 필드와 반영 규칙 없음
- 신청자 송금 증빙 업로드: 신청자 파일 저장 필드와 API 없음
- 공통 사용자 권한 검증: USER/ROLE/PERMISSION 계약 확인 필요

위 기능은 임의 데이터를 만들거나 다른 팀 영역을 수정하지 않도록 `PROCESS_FAILED` 또는 비활성 UI로 남겨 두었다.

## 파생 표시값

- 행사 종료 여부: `event_status === '종료'`
- 참가비 입금 완료: `amount_paid >= amount_due`
- KPI 신청/승인/입금/출석 인원: 행사 참가자 및 출석 테이블 집계

## 승인된 행사 참가비 확장

- `fee_amount`: 학생회비 납부자 참가비
- `non_member_fee_amount`: 학생회비 미납부자 참가비

기존 `EVT_01_EVENT` 헤더가 최신 헤더의 앞부분과 정확히 일치하면 기존 데이터는 유지하고
`non_member_fee_amount`, `event_purpose`, `related_materials`, `additional_notes` 중 누락된 마지막 열만 추가한다.

## 행사 설명 및 관련자료

- `event_purpose`: 행사 목적과 취지
- `related_materials`: Google Drive에 업로드된 관련자료 URL
- `additional_notes`: 추가 전달사항 및 특이사항

관련자료는 `EVENT_WELFARE_MATERIAL_FOLDER_ID` Script Property의 Google Drive 폴더에 저장한다.
Property가 없으면 최초 업로드 시 `Council Project 행사복지 관련자료` 폴더를 만들고 ID를 저장한다.
허용 확장자는 PDF, HWP/HWPX, Office 문서, JPG/PNG, ZIP이며 파일당 최대 크기는 5MB이다.

`event_id` 채번 규칙이 설계서에 없어 생성 시 충돌 방지를 위해 UUID를 사용한다. 공식 채번 규칙 확정 후 확인이 필요하다.
