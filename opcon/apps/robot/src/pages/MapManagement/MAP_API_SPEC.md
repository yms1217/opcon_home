# 맵 관리 API 정의서

> **작성일**: 2026-05-14  
> **버전**: v1.0  
> **Base URL**: `/api/v1/web`  
> **인증 방식**: JWT Bearer Token  
> **공통 요청 헤더**:
>
> | 헤더명          | 타입   | 필수 | 설명                                |
> |----------------|--------|------|-------------------------------------|
> | Authorization  | String | Y    | Bearer {accessToken}                |
> | timestamp      | Long   | Y    | Unix Epoch 초 단위 (예: 1715000000) |
> | message-id     | String | Y    | 요청 고유 UUID                       |

---

## 1. 맵 목록 조회

| 항목     | 내용                    |
|----------|-------------------------|
| HTTP Method | GET                  |
| URL      | /api/v1/web/maps        |
| 설명     | 조건별 맵 목록을 페이지 단위로 조회한다 |

### 요청 파라미터 (Query String)

| 파라미터  | 타입    | 필수 | 설명                                          |
|----------|---------|------|-----------------------------------------------|
| groupId  | String  | N    | 그룹 ID 필터 (지정 시 해당 그룹의 맵만 조회)   |
| siteId   | String  | N    | 사이트 ID 필터 (지정 시 해당 사이트의 맵만 조회)|
| status   | String  | N    | 맵 상태 필터 (Active / Draft / Deprecated)    |
| page     | Integer | N    | 페이지 번호 (0-based, 기본값: 0)              |
| size     | Integer | N    | 페이지 크기 (기본값: 100)                      |

### 응답 바디 (200 OK)

```json
{
  "content": [
    {
      "id": "map1",
      "ownerType": "site",
      "ownerRobotId": null,
      "ownerRobotName": null,
      "ownerRobotMacAddress": null,
      "mapType": "SLAM",
      "status": "Active",
      "site": "Site A-1",
      "siteId": "s1",
      "group": "Group A",
      "groupId": "g1",
      "building": null,
      "floor": null,
      "area": null,
      "robotCount": 2,
      "createdAt": "2025-08-15T09:00:00",
      "updatedAt": "2026-03-08T14:30:00"
    }
  ],
  "totalElements": 10,
  "totalPages": 1,
  "size": 100,
  "number": 0
}
```

| 필드                   | 타입    | 설명                                        |
|-----------------------|---------|---------------------------------------------|
| id                    | String  | 맵 고유 ID                                  |
| ownerType             | String  | 맵 소유 구분 (site: 사이트 맵, robot: 로봇 맵) |
| ownerRobotId          | String  | 로봇 맵인 경우 소유 로봇 ID (없으면 null)     |
| ownerRobotName        | String  | 로봇 맵인 경우 소유 로봇 이름 (없으면 null)   |
| ownerRobotMacAddress  | String  | 로봇 맵인 경우 소유 로봇 MAC 주소            |
| mapType               | String  | 맵 타입 (SLAM / Grid / Real Map)            |
| status                | String  | 맵 상태 (Active / Draft / Deprecated)       |
| site                  | String  | 사이트 이름                                  |
| siteId                | String  | 사이트 ID                                   |
| group                 | String  | 그룹 이름                                   |
| groupId               | String  | 그룹 ID                                     |
| building              | String  | 건물명 (사이트 맵에서 사용)                  |
| floor                 | String  | 층 정보 (사이트 맵에서 사용)                 |
| area                  | String  | 구역 정보 (사이트 맵에서 사용)               |
| robotCount            | Integer | 이 맵을 사용 중인 로봇 수                    |
| createdAt             | String  | 생성 일시 (ISO 8601)                        |
| updatedAt             | String  | 최종 수정 일시 (ISO 8601)                   |

---

## 2. 맵 상세 조회

| 항목     | 내용                                |
|----------|-------------------------------------|
| HTTP Method | GET                             |
| URL      | /api/v1/web/maps/{mapId}            |
| 설명     | 특정 맵의 상세 정보(금지구역, 이력, 로봇 목록 포함)를 조회한다 |

### 경로 파라미터

| 파라미터 | 타입   | 필수 | 설명        |
|---------|--------|------|-------------|
| mapId   | String | Y    | 맵 고유 ID  |

### 응답 바디 (200 OK)

```json
{
  "id": "map1",
  "ownerType": "site",
  "ownerRobotId": null,
  "ownerRobotName": null,
  "ownerRobotMacAddress": null,
  "mapType": "SLAM",
  "status": "Active",
  "site": "Site A-1",
  "siteId": "s1",
  "group": "Group A",
  "groupId": "g1",
  "building": null,
  "floor": null,
  "area": null,
  "createdAt": "2025-08-15T09:00:00",
  "updatedAt": "2026-03-08T14:30:00",
  "registeredRobotCount": 3,
  "zones": [
    {
      "id": "z1",
      "name": "출입구 금지구역",
      "type": "no-go",
      "points": [
        { "x": 10, "y": 10 },
        { "x": 25, "y": 10 },
        { "x": 25, "y": 22 },
        { "x": 10, "y": 22 }
      ],
      "memo": "메인 출입구"
    }
  ],
  "updateHistory": [
    {
      "id": "uh1",
      "date": "2025-08-15T09:00:00",
      "type": "초기 등록",
      "description": "맵 초기 등록",
      "operator": "admin"
    }
  ],
  "robots": [
    {
      "id": "r1",
      "name": "robot1",
      "model": "RX-200",
      "macAddress": "AA:BB:CC:01:23:01",
      "status": "운영"
    }
  ]
}
```

| 필드                  | 타입    | 설명                                       |
|----------------------|---------|---------------------------------------------|
| (맵 목록 공통 필드)   | -       | 목록 API 응답의 모든 필드 포함              |
| registeredRobotCount | Integer | 사이트에 등록된 전체 로봇 수               |
| zones                | Array   | 금지구역 목록                              |
| zones[].id           | String  | 금지구역 ID                               |
| zones[].name         | String  | 금지구역 이름                             |
| zones[].type         | String  | 구역 타입 (no-go)                         |
| zones[].points       | Array   | 다각형 꼭짓점 좌표 목록 [{x, y}]          |
| zones[].memo         | String  | 메모 (선택)                               |
| updateHistory        | Array   | 맵 업데이트 이력 목록                      |
| updateHistory[].id   | String  | 이력 ID                                   |
| updateHistory[].date | String  | 업데이트 일시                              |
| updateHistory[].type | String  | 이력 유형 (초기 등록 / 금지구역 변경 / 맵 데이터 갱신 / 상태 변경 / 로봇 배포) |
| updateHistory[].description | String | 상세 설명                        |
| updateHistory[].operator | String | 처리 담당자                          |
| robots               | Array   | 이 맵을 사용 중인 로봇 목록              |
| robots[].id          | String  | 로봇 ID                                   |
| robots[].name        | String  | 로봇 이름                                 |
| robots[].model       | String  | 로봇 모델                                 |
| robots[].macAddress  | String  | MAC 주소                                  |
| robots[].status      | String  | 로봇 상태 (운영 / 오프라인 / 에러 등)     |

---

## 3. 맵 생성

| 항목     | 내용                    |
|----------|-------------------------|
| HTTP Method | POST                 |
| URL      | /api/v1/web/maps        |
| 설명     | 새로운 맵을 등록한다    |

### 요청 바디

```json
{
  "ownerType": "site",
  "ownerRobotId": null,
  "mapType": "SLAM",
  "siteId": "s1",
  "building": null,
  "floor": null,
  "area": null
}
```

| 필드        | 타입   | 필수 | 설명                                     |
|------------|--------|------|------------------------------------------|
| ownerType  | String | Y    | 맵 소유 구분 (site / robot)              |
| ownerRobotId | String | N  | 로봇 맵인 경우 로봇 ID (ownerType=robot 시 필수) |
| mapType    | String | Y    | 맵 타입 (SLAM / Grid / Real Map)         |
| siteId     | String | N    | 사이트 ID (ownerType=site 시 필수)       |
| building   | String | N    | 건물명                                   |
| floor      | String | N    | 층 정보                                  |
| area       | String | N    | 구역 정보                                |

### 응답 바디 (201 Created)

맵 상세 조회 응답과 동일한 구조

---

## 4. 맵 정보 수정

| 항목     | 내용                            |
|----------|---------------------------------|
| HTTP Method | PUT                          |
| URL      | /api/v1/web/maps/{mapId}        |
| 설명     | 맵의 상태 및 기본 정보를 수정한다 |

### 경로 파라미터

| 파라미터 | 타입   | 필수 | 설명        |
|---------|--------|------|-------------|
| mapId   | String | Y    | 맵 고유 ID  |

### 요청 바디

```json
{
  "status": "Deprecated",
  "building": "본관",
  "floor": "1F",
  "area": "A구역"
}
```

| 필드     | 타입   | 필수 | 설명                                       |
|---------|--------|------|--------------------------------------------|
| status  | String | N    | 맵 상태 (Active / Draft / Deprecated)      |
| building | String | N   | 건물명                                     |
| floor   | String | N    | 층 정보                                    |
| area    | String | N    | 구역 정보                                  |

### 응답 바디 (200 OK)

맵 상세 조회 응답과 동일한 구조

---

## 5. 맵 삭제

| 항목     | 내용                    |
|----------|-------------------------|
| HTTP Method | DELETE               |
| URL      | /api/v1/web/maps/{mapId}|
| 설명     | 맵을 삭제한다           |

### 경로 파라미터

| 파라미터 | 타입   | 필수 | 설명        |
|---------|--------|------|-------------|
| mapId   | String | Y    | 맵 고유 ID  |

### 응답 바디 (204 No Content)

없음

---

## 6. 맵 금지구역 수정

| 항목     | 내용                                       |
|----------|--------------------------------------------|
| HTTP Method | PUT                                     |
| URL      | /api/v1/web/maps/{mapId}/zones             |
| 설명     | 맵의 금지구역 전체를 교체한다 (배포 없이 저장만) |

### 경로 파라미터

| 파라미터 | 타입   | 필수 | 설명        |
|---------|--------|------|-------------|
| mapId   | String | Y    | 맵 고유 ID  |

### 요청 바디

```json
{
  "zones": [
    {
      "id": "z1",
      "name": "출입구 금지구역",
      "type": "no-go",
      "points": [
        { "x": 10, "y": 10 },
        { "x": 25, "y": 10 },
        { "x": 25, "y": 22 },
        { "x": 10, "y": 22 }
      ],
      "memo": "메인 출입구"
    }
  ]
}
```

| 필드          | 타입   | 필수 | 설명                               |
|--------------|--------|------|------------------------------------|
| zones        | Array  | Y    | 금지구역 전체 목록 (기존 목록 교체) |
| zones[].id   | String | N    | 기존 구역 ID (신규 시 생략 가능)   |
| zones[].name | String | Y    | 금지구역 이름                      |
| zones[].type | String | Y    | 구역 타입 (no-go)                  |
| zones[].points | Array | Y  | 다각형 꼭짓점 좌표 목록            |
| zones[].memo | String | N    | 메모                               |

### 응답 바디 (200 OK)

맵 상세 조회 응답과 동일한 구조

---

## 7. 맵 배포

| 항목     | 내용                                                    |
|----------|---------------------------------------------------------|
| HTTP Method | POST                                                 |
| URL      | /api/v1/web/maps/{mapId}/deploy                         |
| 설명     | 맵의 금지구역 변경사항을 로봇에 배포(즉시 적용)한다    |

### 경로 파라미터

| 파라미터 | 타입   | 필수 | 설명        |
|---------|--------|------|-------------|
| mapId   | String | Y    | 맵 고유 ID  |

### 요청 바디

```json
{
  "zones": [
    {
      "id": "z1",
      "name": "출입구 금지구역",
      "type": "no-go",
      "points": [
        { "x": 10, "y": 10 },
        { "x": 25, "y": 10 },
        { "x": 25, "y": 22 },
        { "x": 10, "y": 22 }
      ],
      "memo": "메인 출입구"
    }
  ],
  "deployType": "immediate"
}
```

| 필드        | 타입   | 필수 | 설명                                          |
|------------|--------|------|-----------------------------------------------|
| zones      | Array  | Y    | 배포할 금지구역 전체 목록                      |
| deployType | String | Y    | 배포 방식 (immediate: 즉시 적용 / scheduled: 예약 - Phase 2) |

### 응답 바디 (200 OK)

```json
{
  "deployId": "deploy-abc123",
  "status": "success",
  "message": "배포가 완료되었습니다.",
  "appliedRobotCount": 2
}
```

| 필드               | 타입    | 설명                                      |
|-------------------|---------|-------------------------------------------|
| deployId          | String  | 배포 작업 ID                              |
| status            | String  | 배포 결과 (success / failed / processing) |
| message           | String  | 결과 메시지                               |
| appliedRobotCount | Integer | 배포 적용된 로봇 수                       |

---

## 8. 맵 배포 상태 조회

| 항목     | 내용                                            |
|----------|-------------------------------------------------|
| HTTP Method | GET                                          |
| URL      | /api/v1/web/maps/{mapId}/deploy/{deployId}      |
| 설명     | 비동기 배포 작업의 진행 상태를 조회한다         |

### 경로 파라미터

| 파라미터 | 타입   | 필수 | 설명          |
|---------|--------|------|---------------|
| mapId   | String | Y    | 맵 고유 ID    |
| deployId | String | Y   | 배포 작업 ID  |

### 응답 바디 (200 OK)

```json
{
  "deployId": "deploy-abc123",
  "status": "success",
  "message": "배포가 완료되었습니다.",
  "appliedRobotCount": 2,
  "createdAt": "2026-05-14T10:00:00",
  "completedAt": "2026-05-14T10:00:05"
}
```

| 필드               | 타입    | 설명                                      |
|-------------------|---------|-------------------------------------------|
| deployId          | String  | 배포 작업 ID                              |
| status            | String  | 배포 상태 (success / failed / processing) |
| message           | String  | 상태 메시지                               |
| appliedRobotCount | Integer | 배포 적용된 로봇 수                       |
| createdAt         | String  | 배포 요청 일시 (ISO 8601)                 |
| completedAt       | String  | 배포 완료 일시 (ISO 8601, processing 시 null) |

---

## 공통 에러 응답

| HTTP Status | 설명                              |
|-------------|-----------------------------------|
| 400         | 잘못된 요청 파라미터              |
| 401         | 인증 토큰 없음 또는 만료          |
| 403         | 해당 맵에 대한 권한 없음          |
| 404         | 맵을 찾을 수 없음                 |
| 409         | 배포 중인 맵에 중복 배포 요청     |
| 500         | 서버 내부 오류                    |

```json
{
  "code": "MAP_NOT_FOUND",
  "message": "해당 맵을 찾을 수 없습니다.",
  "timestamp": 1715000000
}
```
