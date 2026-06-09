# 탄감자 Android APK 빌드

이 폴더는 기존 웹앱을 Android APK로 감싸는 네이티브 WebView 프로젝트입니다.

## 포함된 구조

- `app/src/main/assets/www`: APK 안에 포함되는 웹앱 정적 파일
- `MainActivity`: WebView로 `https://tangamja.local/index.html`을 로드
- `RideStore`: Android 내부 저장소에 주행, 포인트, 체크인, 검증 요청 저장
- `RideTrackingService`: 화면이 꺼져도 GPS를 기록하는 Foreground Service

## APK 만들기

1. Android Studio를 설치합니다.
2. Android Studio에서 이 `android` 폴더를 엽니다.
3. Gradle Sync가 끝나면 `Build > Build Bundle(s) / APK(s) > Build APK(s)`를 실행합니다.
4. 생성 파일은 보통 다음 위치에 생깁니다.

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

CLI 환경이 준비되어 있다면 아래 명령도 사용할 수 있습니다.

```bash
node ../scripts/build-android-debug.mjs
```

현재 저장소에는 워크스페이스 내부 휴대용 빌드 도구를 사용할 수 있는
`scripts/build-android-debug.mjs`가 준비되어 있습니다. 단, Android SDK 라이선스
동의와 SDK 패키지 설치가 먼저 완료되어야 합니다.

## 웹앱 수정 후 반영

웹 파일을 수정한 뒤에는 APK 빌드 전에 프로젝트 루트에서 아래 명령을 실행합니다.

```bash
node scripts/sync-android-assets.mjs
```

## 권한

앱은 다음 권한을 요청합니다.

- 위치 권한: 라이딩 GPS 기록
- 알림 권한: 백그라운드 GPS 기록 중 Foreground Service 알림
- Wake Lock: 화면이 꺼진 상태에서도 서비스가 위치 기록을 유지

릴리스 배포용 APK/AAB는 별도 서명 키를 만들어 `release` 빌드를 구성해야 합니다.
