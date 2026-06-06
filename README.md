# Challenge-Test

Tangamja Challenge는 자전거 주행 챌린지, 명소 QR 인증, 탄소포인트 적립,
관리자 검증을 하나의 흐름으로 연결한 PWA 프로토타입입니다.

## 실행

```bash
python3 -m http.server 4173
```

브라우저에서 `http://localhost:4173`을 열면 됩니다.

## 포함 기능

- 자전거 라이딩 시작, 일시정지, 기록 저장
- 주행 거리 기반 예상 CO2 절감량과 탄소포인트 계산
- 전북 명소 선택, 100m 접근 시나리오, QR 체크인
- 성장형, 미션형, 특별형 배지 구조
- 포인트 전환 신청과 관리자 승인/반려 대시보드
- 설치형 앱처럼 사용할 수 있는 PWA manifest와 service worker
