# Challenge-Test

Tangamja Challenge는 자전거 주행 챌린지, 명소 QR 인증, 탄소포인트 적립,
관리자 검증을 하나의 흐름으로 연결한 PWA 프로토타입입니다.

## 실행

```bash
node server.js
```

브라우저에서 `http://localhost:4173`을 열면 됩니다.

서버 운영 데이터의 기본 저장소는 `/Users/yangjimin/Documents/server/Challenge-test-server`입니다. 서버 상태는
`/Users/yangjimin/Documents/server/Challenge-test-server/data/state.json`에 저장되며, 이 파일은 Git에 포함하지 않습니다.
이전 버전의 프로젝트 내부 `server/data/state.json` 또는 `data/state.json`이 있으면 최초 실행 시
외부 서버 저장소로 자동 복사합니다.

`npm`을 사용할 수 있는 환경이라면 `npm start`로도 동일하게 실행할 수 있습니다.

## Android APK

`android/` 폴더에 APK 빌드용 네이티브 WebView 프로젝트를 포함했습니다.

- 앱 정적 파일은 `node scripts/sync-android-assets.mjs`로 `android/app/src/main/assets/www`에 복사합니다.
- APK 안에서는 `TangamjaNativeApi` 브리지를 통해 Android 내부 저장소에 주행, 포인트, 체크인, 검증 요청을 저장합니다.
- Android `RideTrackingService`가 Foreground Service로 동작해 화면이 꺼져도 GPS 샘플을 기록하도록 설계했습니다.
- Android Studio에서 `android` 폴더를 열고 `Build APK(s)`를 실행하면 `android/app/build/outputs/apk/debug/app-debug.apk`가 생성됩니다.
- 휴대용 빌드 도구가 준비된 환경에서는 `node scripts/build-android-debug.mjs`로 debug APK를 생성합니다.

## 서버 API

- `GET /api/health`: 서버 상태 확인
- `GET /api/state`: 앱 상태 조회
- `POST /api/rides`: 주행 기록 저장 및 포인트 계산
- `POST /api/rides/start`: GPS 라이딩 세션 시작
- `POST /api/rides/:id/samples`: GPS 좌표 샘플 저장 및 거리 자동 계산
- `POST /api/rides/:id/finish`: 라이딩 종료, 탄소포인트 등록, 관리자 검증 요청 생성
- `POST /api/checkins`: 명소 QR 체크인 저장
- `POST /api/exchanges`: 포인트 전환 신청
- `PATCH /api/requests/:id`: 관리자 승인 또는 반려
- `POST /api/reset`: 테스트 상태 초기화

## GPS 기록 방식

라이딩 시작 시 브라우저의 위치 권한을 요청하고 `watchPosition`으로 GPS 좌표를
수집합니다. 수집된 좌표는 즉시 `/api/rides/:id/samples`로 전송되어 서버에
저장되고, 서버가 좌표 간 거리를 계산합니다. 라이딩 종료 시 서버가 거리, 시간,
평균 속도, 예상 CO2 절감량, 포인트, 관리자 검증 요청을 생성합니다.

PWA는 기기와 브라우저 정책에 따라 화면이 꺼지거나 앱이 백그라운드로 들어가면
GPS 수집이 중단될 수 있습니다. 그래서 앱은 Screen Wake Lock을 시도해 화면 꺼짐을
방지합니다. 화면이 꺼진 상태에서도 안정적인 백그라운드 GPS 기록이 필요하면
Android Foreground Service 또는 iOS CoreLocation background mode가 포함된
네이티브 앱 래퍼가 필요합니다.

## 서버 QR 인증 저장 구조

QR 인증은 앱이 읽은 문자열만 믿지 않고, 앱이 촬영한 카메라 프레임 픽셀과 현재 GPS
좌표를 서버로 보내면 서버가 직접 판정합니다.

- `/Users/yangjimin/Documents/server/Challenge-test-server/qr-images`: 현장 게시용 QR 이미지 원본 저장소
- `/Users/yangjimin/Documents/server/Challenge-test-server/data/state.json`: 계정, 포인트, 체크인, 검증 요청 등 운영 상태 저장
- `/Users/yangjimin/Documents/server/Challenge-test-server/proofs`: 인증 성공 시 QR 프레임 해시, 서버 QR 이미지 해시, GPS 거리 등 증거 JSON 저장
- `/Users/yangjimin/Documents/server/Challenge-test-server/vendor/jsQR.js`: 서버가 촬영 프레임에서 QR을 직접 판독하기 위한 로컬 디코더

QR 이미지 경로는 `/Users/yangjimin/Documents/server/Challenge-test-server/data/state.json`의 `qrCodes[].imagePath`에
등록합니다. 서버는 등록 경로를 먼저 확인하고, 파일명이 맞으면
`/Users/yangjimin/Documents/server/Challenge-test-server/qr-images`, 프로젝트 내부 `server/qr-images`, 기존 호환 폴더인
`data/qr-images`에서도 자동 탐색합니다. 보안상 컴퓨터 전체를 무제한 검색하지는 않습니다.

## 배지와 보물 시스템

배지는 단순 업적이 아니라 탐험 동선을 만드는 수집 구조로 설계했습니다.

- 명소 보물: 한 명소 안에서 GPS 도착, QR 인증, 스토리 단서를 모읍니다.
- 장소 보물: 자연, 역사·문화, 도심·관광, 라이딩 코스처럼 취향별 장소 유형을 완성합니다.
- 지역 보물: 전주권, 군산권, 익산권, 고창권, 무주·진안권처럼 권역별 대표 명소를 연결해 보물함을 엽니다.

각 컬렉션에는 진행률, 희귀도, 완성 조건, 보상 칭호를 넣어 사용자가 다음 목적지를
스스로 궁금해하고 선택할 수 있게 구성했습니다.

## 전북 100대 명소 선정 기준

명소 데이터는 `landmark-data.js`에서 앱과 서버가 함께 사용합니다.

- 문체부·한국관광공사 `2025~2026 한국관광 100선`에 포함된 전북 대표 명소 8곳을 우선 배치했습니다.
- 전북특별자치도 문화관광 포털인 투어전북의 관광지정보를 기준으로 14개 시군이 빠지지 않게 보강했습니다.
- 자연, 역사·문화, 도심·관광, 강·호수, 체험, 자전거 추천 코스가 섞이도록 구성했습니다.
- `rank`, `id`, `bonus`, `distance`, `near` 값은 앱 챌린지 운영을 위한 내부 메타데이터입니다.

## 포함 기능

- 자전거 라이딩 시작, 일시정지, 기록 저장
- 주행 거리 기반 예상 CO2 절감량과 탄소포인트 계산
- 전북 명소 선택, 100m 접근 시나리오, QR 체크인
- 성장형, 미션형, 특별형 배지 구조
- 포인트 전환 신청과 관리자 승인/반려 대시보드
- 설치형 앱처럼 사용할 수 있는 PWA manifest와 service worker
