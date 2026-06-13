const STORAGE_KEY = "tangamja-bike-carbon-app";
const CO2_PER_KM = 0.192;
const API_ORIGIN = location.protocol === "file:" ? "http://localhost:4173" : "";
const API_BASE = `${API_ORIGIN}/api`;
const RIDER_NAME = "테스트 라이더";
const SERVER_RETRY_DELAY = 5000;
const VWORLD_API_KEY = "E958994F-358D-38D8-8F2C-9C44597086CF";
const VWORLD_MAP = {
  center: { lat: 35.72, lng: 127.14 },
  layer: "base",
  tileSize: 256,
  zoom: 8,
};
const VWORLD_LAYERS = {
  base: {
    label: "일반지도",
    tiles: [{ name: "Base", extension: "png" }],
  },
  satellite: {
    label: "항공사진",
    tiles: [
      { name: "Satellite", extension: "jpeg" },
      { name: "Hybrid", extension: "png", overlay: true },
    ],
  },
};

const initialState = {
  tab: "home",
  selectedLandmark: 0,
  isNearLandmark: false,
  riding: false,
  serverOnline: false,
  gpsStatus: "대기 중",
  wakeStatus: "대기 중",
  activeRide: null,
  liveRides: [],
  account: {
    loggedIn: false,
    provider: "guest",
    name: "게스트 라이더",
    email: "",
  },
  permissions: {
    location: "prompt",
    notifications: "default",
  },
  settings: {
    settingsOpen: false,
    rideReminders: true,
    nearbyLandmarks: true,
    rewardUpdates: true,
  },
  map: {
    center: { ...VWORLD_MAP.center },
    zoom: VWORLD_MAP.zoom,
    layer: VWORLD_MAP.layer,
  },
  ride: {
    seconds: 0,
    distance: 0,
    speed: 0,
    samples: 0,
  },
  stats: {
    users: 1250,
    rides: 820,
    totalPoints: 12450,
    totalCo2: 245.6,
    weeklyDistance: 120,
    weeklyPoints: [60, 80, 120, 70, 150, 110, 30],
  },
  badges: {
    growth: ["첫 페달", "탐험가"],
    mission: ["지역별 보물"],
    special: [],
  },
  history: [
    {
      title: "전주 한옥마을 QR 체크인",
      meta: "명소 인증 보너스",
      points: 150,
      type: "earn",
    },
    {
      title: "주간 자전거 챌린지",
      meta: "120km 달성",
      points: 620,
      type: "earn",
    },
  ],
  requests: [
    {
      id: "REQ-2026-001",
      title: "익산 미륵사지 QR 인증",
      user: "김탄소",
      distance: 12.45,
      co2: 2.39,
      points: 389,
      status: "pending",
      evidence: "GPS 반경 84m, QR 1회, 평균속도 20.9km/h",
    },
  ],
};

const landmarks = Array.isArray(window.OFFICIAL_LANDMARKS) ? window.OFFICIAL_LANDMARKS : [];

const badgeCatalog = {
  growth: [
    { name: "첫 페달", icon: "P", clue: "첫 주행 기록을 서버에 남긴 라이더" },
    { name: "동네 개척자", icon: "⌖", clue: "생활권 명소 3곳을 연결한 라이더" },
    { name: "시즌 정복자", icon: "★", clue: "시즌 목표 거리와 보물함을 모두 완성한 라이더" },
  ],
  mission: [
    { name: "지역별 보물", icon: "□", clue: "권역별 대표 단서를 모아 지역 보물함 개방" },
    { name: "장소별 보물", icon: "◇", clue: "자연, 역사, 도심, 코스 유형별 컬렉션 완성" },
    { name: "명소 체크인", icon: "✓", clue: "100m 진입과 현장 QR 인증을 모두 통과" },
  ],
  special: [
    { name: "연속 참여", icon: "7", clue: "7일 연속 주행으로 열리는 꾸준함 배지" },
    { name: "베스트 포토", icon: "▣", clue: "명소 스토리와 사진 미션을 함께 완성" },
    { name: "그린 라이더", icon: "♧", clue: "친환경 누적 거리와 QR 미션을 동시에 달성" },
  ],
};

const treasureLayers = [
  {
    title: "명소 보물",
    icon: "1",
    copy: "한 명소 안에서 GPS 도착, QR 인증, 스토리 단서 3개를 모읍니다.",
  },
  {
    title: "장소 보물",
    icon: "2",
    copy: "비슷한 장소 유형을 묶어 자연, 역사, 도심, 라이딩 코스 컬렉션을 완성합니다.",
  },
  {
    title: "지역 보물",
    icon: "3",
    copy: "권역별 핵심 장소를 연결하면 지역 대표 보물함이 열립니다.",
  },
];

const regionCollections = [
  {
    region: "전주권",
    treasure: "한옥 시간 조각",
    rarity: "희귀",
    progress: 2,
    total: 4,
    places: ["전주 한옥마을", "경기전", "전동성당", "남부시장"],
    rule: "역사·문화 2곳 + 도심 미션 1개 + 총 10km",
    reward: "전주 시간 여행자",
  },
  {
    region: "군산권",
    treasure: "근대 항구 열쇠",
    rarity: "영웅",
    progress: 1,
    total: 4,
    places: ["군산 근대역사거리", "은파호수공원", "선유도", "초원사진관"],
    rule: "근대거리 QR + 물길 코스 1개 + 사진 단서",
    reward: "항구의 기록자",
  },
  {
    region: "익산권",
    treasure: "백제 왕도 인장",
    rarity: "영웅",
    progress: 1,
    total: 3,
    places: ["익산 미륵사지", "왕궁리 유적", "보석박물관"],
    rule: "유적 2곳 체크인 + 스토리 퀴즈 정답",
    reward: "왕도의 수호자",
  },
  {
    region: "고창권",
    treasure: "선운 숲 씨앗",
    rarity: "희귀",
    progress: 1,
    total: 3,
    places: ["고창 선운사", "고창읍성", "운곡람사르습지"],
    rule: "자연 1곳 + 역사 1곳 + QR 2회",
    reward: "초록 순례자",
  },
  {
    region: "무주·진안권",
    treasure: "산바람 나침반",
    rarity: "전설",
    progress: 0,
    total: 3,
    places: ["덕유산", "마이산", "태권도원"],
    rule: "고도 상승 코스 + 산악 명소 2곳",
    reward: "능선 개척자",
  },
];

const placeCollections = [
  {
    type: "자연",
    treasure: "초록 지형도",
    icon: "산",
    progress: 1,
    total: 3,
    logic: "산, 숲, 강·호수 중 서로 다른 지형 3개를 모으면 완성",
  },
  {
    type: "역사·문화",
    treasure: "시간의 지도",
    icon: "史",
    progress: 2,
    total: 4,
    logic: "사찰, 유적, 한옥, 근대건축 단서를 각각 1개씩 수집",
  },
  {
    type: "도심·관광",
    treasure: "도시 탐험 패스",
    icon: "街",
    progress: 1,
    total: 3,
    logic: "거리, 시장, 박물관 계열 명소를 연결해 완성",
  },
  {
    type: "라이딩 코스",
    treasure: "바람길 코어",
    icon: "道",
    progress: 0,
    total: 3,
    logic: "강변길, 해안길, 능선길 중 2개 이상을 GPS 주행으로 인증",
  },
];

const landmarkTreasures = [
  {
    landmark: "고창 선운사",
    region: "고창권",
    pieces: ["100m 진입", "대웅전 QR", "동백숲 단서"],
    mystery: "봄이 오기 전 붉은 숲이 먼저 답한다.",
    reward: "선운 숲 씨앗",
    complete: true,
  },
  {
    landmark: "전주 한옥마을",
    region: "전주권",
    pieces: ["골목 진입", "한옥 QR", "처마 사진"],
    mystery: "지붕의 곡선이 길을 알려준다.",
    reward: "한옥 시간 조각",
    complete: true,
  },
  {
    landmark: "군산 근대역사거리",
    region: "군산권",
    pieces: ["근대거리 진입", "건축물 QR", "항구 기록"],
    mystery: "오래된 창고의 번호가 열쇠가 된다.",
    reward: "근대 항구 열쇠",
    complete: false,
  },
  {
    landmark: "익산 미륵사지",
    region: "익산권",
    pieces: ["탑터 진입", "석탑 QR", "백제 퀴즈"],
    mystery: "돌의 층수가 숨긴 이름을 찾는다.",
    reward: "백제 왕도 인장",
    complete: false,
  },
  {
    landmark: "덕유산",
    region: "무주·진안권",
    pieces: ["고도 기록", "탐방 QR", "능선 스탬프"],
    mystery: "가장 높은 바람이 나침반을 돌린다.",
    reward: "산바람 나침반",
    complete: false,
  },
];

const titles = {
  home: "자전거 챌린지",
  challenge: "서비스 흐름",
  map: "보물찾기 & QR 인증",
  points: "탄소포인트",
  admin: "관리자 검증",
};

let state = loadClientState();
let rideTimer = null;
let locationWatchId = null;
let wakeLock = null;
let sampleQueue = [];
let sampleFlushTimer = null;
let serverRetryTimer = null;
let qrStream = null;
let qrDetector = null;
let qrScanFrame = null;
let qrCompleting = false;
let qrServerProbeAt = 0;
let mapDrag = null;
let pendingStartSample = null;
let pendingQrLocation = null;

const screen = document.querySelector("#screenContent");
const title = document.querySelector("#screenTitle");
const navItems = [...document.querySelectorAll(".nav-item")];
const settingsModal = document.querySelector("[data-settings-modal]");
const settingsButton = document.querySelector("[data-action='open-settings']");
const qrScannerModal = document.querySelector("[data-qr-scanner]");
const templates = {
  home: document.querySelector("#homeTemplate"),
  challenge: document.querySelector("#challengeTemplate"),
  map: document.querySelector("#mapTemplate"),
  points: document.querySelector("#pointsTemplate"),
  admin: document.querySelector("#adminTemplate"),
};

render();
bindShellActions();
hydrateFromServer();
refreshPermissionState();
registerServiceWorker();
window.addEventListener("beforeunload", flushSamplesWithBeacon);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    flushSamplesWithBeacon();
    return;
  }

  if (state.riding) {
    requestWakeLock();
  }
});

window.TangamjaHandleNativeBack = () => {
  if (!qrScannerModal?.hidden || state.settings.settingsOpen || state.tab !== "home") {
    handleAppBack();
    return true;
  }
  return false;
};

function bindShellActions() {
  settingsButton?.addEventListener("click", openSettings);
  settingsModal?.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (!action) return;

    if (action === "close-settings") closeSettings();
    if (action === "email-login") loginWithEmail();
    if (action === "strava-login") loginWithStrava();
    if (action === "logout") logoutAccount();
    if (action === "request-location") requestLocationPermission();
    if (action === "request-notification") requestNotificationPermission();
    if (action === "send-test-notification") sendTestNotification();
  });

  settingsModal?.querySelectorAll("[data-setting]").forEach((input) => {
    input.addEventListener("change", () => {
      state.settings[input.dataset.setting] = input.checked;
      persistClientPrefs();
      renderSettings();
    });
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !qrScannerModal?.hidden) {
      closeQrScanner();
      return;
    }
    if (event.key === "Escape" && state.settings.settingsOpen) {
      closeSettings();
    }
  });
}

function loadClientState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const loaded = saved ? mergeState(initialState, saved) : structuredClone(initialState);
    loaded.settings.settingsOpen = false;
    return loaded;
  } catch {
    return structuredClone(initialState);
  }
}

function mergeState(base, saved) {
  return {
    ...structuredClone(base),
    ...saved,
    stats: { ...base.stats, ...saved.stats },
    ride: { ...base.ride, ...saved.ride },
    account: { ...base.account, ...saved.account },
    permissions: { ...base.permissions, ...saved.permissions },
    settings: { ...base.settings, ...saved.settings },
    map: { ...base.map, ...saved.map, center: { ...base.map.center, ...saved.map?.center } },
    activeRide: saved.activeRide || base.activeRide,
    liveRides: saved.liveRides || base.liveRides,
    badges: { ...base.badges, ...saved.badges },
    history: saved.history || base.history,
    requests: saved.requests || base.requests,
  };
}

function persistClientPrefs() {
  const settingsToStore = {
    rideReminders: state.settings.rideReminders,
    nearbyLandmarks: state.settings.nearbyLandmarks,
    rewardUpdates: state.settings.rewardUpdates,
  };

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      tab: state.tab,
      selectedLandmark: state.selectedLandmark,
      isNearLandmark: state.isNearLandmark,
      activeRide: state.activeRide,
      ride: state.ride,
      account: state.account,
      permissions: state.permissions,
      settings: settingsToStore,
      map: state.map,
    }),
  );
}

async function hydrateFromServer({ silent = false } = {}) {
  try {
    const payload = await apiRequest("/state");
    applyServerState(payload.state);
    if (state.activeRide) {
      startLocalRideLoop();
      startLocationWatch();
      requestWakeLock();
      return;
    }
    if (!silent) showToast("서버 데이터와 연결되었습니다.");
  } catch (error) {
    state.serverOnline = false;
    render();
    scheduleServerReconnect();
  }
}

function applyServerState(serverState, activeRide = null) {
  window.clearTimeout(serverRetryTimer);
  serverRetryTimer = null;
  state = mergeState(state, serverState);
  state.serverOnline = true;
  state.activeRide = activeRide || findActiveRide(state.liveRides);
  state.riding = Boolean(state.activeRide);
  if (state.activeRide) {
    state.ride = rideFromSession(state.activeRide);
  }
  persistClientPrefs();
  render();
}

function findActiveRide(liveRides) {
  return (liveRides || []).find((ride) => ride.status === "active" && ride.user === currentRiderName()) || null;
}

function currentRiderName() {
  return state.account.loggedIn && state.account.name ? state.account.name : RIDER_NAME;
}

function rideFromSession(session) {
  return {
    seconds: Math.max(0, Math.round(session.seconds || 0)),
    distance: Number(session.distance || 0),
    speed: Number(session.speed || 0),
    samples: Number(session.samples?.length || session.sampleCount || 0),
  };
}

async function apiRequest(path, options = {}) {
  if (window.TangamjaNativeApi) {
    const nativePayload = window.TangamjaNativeApi.request(
      path,
      options.method || "GET",
      typeof options.body === "string" ? options.body : JSON.stringify(options.body || {}),
    );
    const parsed = JSON.parse(nativePayload);
    if (parsed.status >= 400) {
      throw new Error(parsed.body?.error || `Native API request failed: ${parsed.status}`);
    }
    return parsed.body;
  }

  const { headers = {}, ...fetchOptions } = options;
  const response = await fetch(`${API_BASE}${path}`, {
    ...fetchOptions,
    cache: "no-store",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...headers },
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : {};

  if (!response.ok) {
    throw new Error(payload.error || `API request failed: ${response.status}`);
  }

  return payload;
}

function scheduleServerReconnect() {
  if (window.TangamjaNativeApi || serverRetryTimer) return;
  serverRetryTimer = window.setTimeout(async () => {
    serverRetryTimer = null;
    await hydrateFromServer({ silent: true });
  }, SERVER_RETRY_DELAY);
}

function markServerOffline(error) {
  const message = error?.message || "";
  const isNetworkError =
    error?.name === "TypeError" || message.includes("Failed to fetch") || message.includes("NetworkError");
  if (!isNetworkError) return false;

  state.serverOnline = false;
  renderWebSummary();
  scheduleServerReconnect();
  return true;
}

async function mutateServer(path, body, successMessage) {
  try {
    const payload = await apiRequest(path, {
      method: "POST",
      body: JSON.stringify(body || {}),
    });
    applyServerState(payload.state, payload.activeRide);
    showToast(payload.message || successMessage);
    return payload;
  } catch (error) {
    markServerOffline(error);
    showToast(error.message || "서버 처리 중 오류가 발생했습니다.");
    return null;
  }
}

function render() {
  title.textContent = titles[state.tab];
  renderWebSummary();
  renderSettings();
  navItems.forEach((item) => {
    item.classList.toggle("active", item.dataset.tab === state.tab);
  });

  screen.replaceChildren(templates[state.tab].content.cloneNode(true));

  if (state.tab === "home") renderHome();
  if (state.tab === "challenge") renderChallenge();
  if (state.tab === "map") renderMap();
  if (state.tab === "points") renderPoints();
  if (state.tab === "admin") renderAdmin();
}

function renderSettings() {
  if (!settingsModal) return;

  settingsModal.hidden = !state.settings.settingsOpen;
  document.body.classList.toggle("settings-open", state.settings.settingsOpen);

  const accountName = settingsModal.querySelector("[data-account-name]");
  const accountCopy = settingsModal.querySelector("[data-account-copy]");
  const accountAvatar = settingsModal.querySelector("[data-account-avatar]");
  const loginStatus = settingsModal.querySelector("[data-login-status]");
  const nameInput = settingsModal.querySelector("[data-login-name]");
  const emailInput = settingsModal.querySelector("[data-login-email]");
  const locationText = settingsModal.querySelector("[data-location-permission]");
  const notificationText = settingsModal.querySelector("[data-notification-permission]");
  const permissionSummary = settingsModal.querySelector("[data-permission-summary]");

  if (accountName) accountName.textContent = state.account.name || "게스트 라이더";
  if (accountCopy) {
    accountCopy.textContent = state.account.loggedIn
      ? `${providerLabel(state.account.provider)} 계정으로 기록을 관리 중입니다.`
      : "라이딩 기록과 포인트를 계정에 묶어 관리합니다.";
  }
  if (accountAvatar) accountAvatar.textContent = (state.account.name || "탄").trim().slice(0, 1);
  if (loginStatus) loginStatus.textContent = state.account.loggedIn ? "로그인됨" : "로그인 전";
  if (nameInput && document.activeElement !== nameInput) nameInput.value = state.account.loggedIn ? state.account.name : "";
  if (emailInput && document.activeElement !== emailInput) emailInput.value = state.account.email || "";
  if (locationText) locationText.textContent = permissionLabel("location", state.permissions.location);
  if (notificationText) notificationText.textContent = permissionLabel("notifications", state.permissions.notifications);
  if (permissionSummary) permissionSummary.textContent = permissionSummaryText();

  settingsModal.querySelectorAll("[data-setting]").forEach((input) => {
    input.checked = Boolean(state.settings[input.dataset.setting]);
  });

  const dot = document.querySelector("[data-settings-dot]");
  if (dot) {
    const needsAttention = !state.account.loggedIn || state.permissions.location !== "granted" || state.permissions.notifications !== "granted";
    dot.hidden = !needsAttention;
  }
}

function providerLabel(provider) {
  return {
    email: "이메일",
    strava: "Strava",
    guest: "게스트",
  }[provider] || provider;
}

function permissionLabel(type, value) {
  const labels = {
    location: {
      granted: "허용됨: 라이딩 GPS와 명소 접근 인증 가능",
      denied: "차단됨: 브라우저 설정에서 위치 권한을 다시 허용해야 합니다",
      prompt: "대기 중: 허용 요청 버튼으로 권한을 요청하세요",
      unsupported: "미지원: 이 환경에서는 위치 권한을 사용할 수 없습니다",
    },
    notifications: {
      granted: "허용됨: 리마인드와 검증 결과 알림 가능",
      denied: "차단됨: 브라우저 설정에서 알림 권한을 다시 허용해야 합니다",
      default: "대기 중: 알림 허용 버튼으로 권한을 요청하세요",
      unsupported: "미지원: 이 환경에서는 알림을 사용할 수 없습니다",
    },
  };
  return labels[type]?.[value] || "확인 중";
}

function permissionSummaryText() {
  const locationReady = state.permissions.location === "granted";
  const notificationReady = state.permissions.notifications === "granted";
  if (locationReady && notificationReady) return "주행 기록과 알림 준비 완료";
  if (locationReady) return "위치 준비, 알림 대기";
  if (notificationReady) return "알림 준비, 위치 대기";
  return "권한 설정 필요";
}

function openSettings() {
  state.settings.settingsOpen = true;
  persistClientPrefs();
  refreshPermissionState();
  renderSettings();
}

function closeSettings() {
  state.settings.settingsOpen = false;
  persistClientPrefs();
  renderSettings();
}

async function refreshPermissionState() {
  if (!("geolocation" in navigator)) {
    state.permissions.location = "unsupported";
  } else if (navigator.permissions?.query) {
    try {
      const location = await navigator.permissions.query({ name: "geolocation" });
      state.permissions.location = location.state;
      location.onchange = () => {
        state.permissions.location = location.state;
        persistClientPrefs();
        renderSettings();
      };
    } catch {
      state.permissions.location = state.permissions.location || "prompt";
    }
  }

  state.permissions.notifications = "Notification" in window ? Notification.permission : "unsupported";
  persistClientPrefs();
  renderSettings();
}

async function loginWithEmail() {
  const name = settingsModal.querySelector("[data-login-name]")?.value.trim() || "테스트 라이더";
  const email = settingsModal.querySelector("[data-login-email]")?.value.trim() || "rider@example.com";
  state.account = { loggedIn: true, provider: "email", name, email };
  persistClientPrefs();
  renderSettings();
  await syncAccountToServer(`${name} 계정으로 로그인했습니다.`);
}

async function loginWithStrava() {
  const name = settingsModal.querySelector("[data-login-name]")?.value.trim() || "Strava 라이더";
  const email = settingsModal.querySelector("[data-login-email]")?.value.trim() || "strava-rider@example.com";
  state.account = { loggedIn: true, provider: "strava", name, email };
  persistClientPrefs();
  renderSettings();
  await syncAccountToServer("Strava 연동형 로그인 상태로 전환했습니다.");
}

async function logoutAccount() {
  state.account = structuredClone(initialState.account);
  persistClientPrefs();
  renderSettings();
  try {
    const payload = await apiRequest("/account/logout", { method: "POST", body: "{}" });
    applyServerState(payload.state);
    showToast(payload.message || "로그아웃했습니다.");
  } catch {
    showToast("로그아웃했습니다.");
  }
}

async function syncAccountToServer(fallbackMessage) {
  try {
    const payload = await apiRequest("/account", {
      method: "POST",
      body: JSON.stringify({ account: state.account }),
    });
    applyServerState(payload.state);
    state.account = payload.account || state.account;
    persistClientPrefs();
    renderSettings();
    showToast(payload.message || fallbackMessage);
  } catch {
    showToast(`${fallbackMessage} 서버 동기화는 나중에 다시 시도합니다.`);
  }
}

function requestLocationPermission() {
  if (!("geolocation" in navigator)) {
    state.permissions.location = "unsupported";
    renderSettings();
    showToast("이 환경에서는 위치 권한을 사용할 수 없습니다.");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      state.permissions.location = "granted";
      state.gpsStatus = position.coords.accuracy ? `위치 권한 허용됨 ±${Math.round(position.coords.accuracy)}m` : "위치 권한 허용됨";
      persistClientPrefs();
      render();
      showToast("위치 권한이 허용되었습니다.");
    },
    (error) => {
      state.permissions.location = error.code === 1 ? "denied" : "prompt";
      persistClientPrefs();
      renderSettings();
      showToast(error.code === 1 ? "위치 권한이 거부되었습니다." : "현재 위치를 확인하지 못했습니다.");
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
  );
}

async function requestNotificationPermission() {
  if (!("Notification" in window)) {
    state.permissions.notifications = "unsupported";
    persistClientPrefs();
    renderSettings();
    showToast("이 환경에서는 알림을 사용할 수 없습니다.");
    return;
  }

  const permission = await Notification.requestPermission();
  state.permissions.notifications = permission;
  persistClientPrefs();
  renderSettings();
  showToast(permission === "granted" ? "알림 권한이 허용되었습니다." : "알림 권한이 허용되지 않았습니다.");
}

async function sendTestNotification() {
  if (state.permissions.notifications !== "granted") {
    await requestNotificationPermission();
  }
  if (state.permissions.notifications !== "granted") return;

  const title = "탄감자 알림 테스트";
  const options = {
    body: "명소 접근, 포인트 적립, 관리자 승인 알림이 이 방식으로 표시됩니다.",
    icon: "assets/icon.svg",
    badge: "assets/icon.svg",
  };

  try {
    const registration = await navigator.serviceWorker?.ready;
    if (registration?.showNotification) {
      await registration.showNotification(title, options);
    } else {
      new Notification(title, options);
    }
    showToast("테스트 알림을 보냈습니다.");
  } catch {
    new Notification(title, options);
    showToast("테스트 알림을 보냈습니다.");
  }
}

function renderWebSummary() {
  const isNative = Boolean(window.TangamjaNativeApi);
  const isHttp = location.protocol === "http:" || location.protocol === "https:";
  const mode = isNative ? "APK 내부 실행" : isHttp ? "웹 서버 실행" : "파일 미리보기";
  const serverText = isNative
    ? "내부 저장소"
    : state.serverOnline
      ? "API 연결됨"
      : isHttp || API_ORIGIN
        ? "연결 재시도"
        : "서버 필요";
  const note = isNative
    ? "APK 안에서는 Android 내부 저장소와 Foreground Service가 웹앱 기능을 대신 처리합니다."
    : isHttp
      ? "현재 웹 서버 주소에서 정적 앱, API, PWA 캐시가 함께 동작합니다."
      : "파일로 열었지만 localhost:4173 서버가 실행 중이면 API 저장과 검증 데이터가 자동 연결됩니다.";

  const webUrl = document.querySelector(".web-actions a:first-child");
  const apiUrl = document.querySelector(".web-actions a:last-child");
  if (webUrl) webUrl.href = isHttp ? `${location.origin}/index.html?web=1` : "http://localhost:4173/index.html?web=1";
  if (apiUrl) apiUrl.href = isHttp ? `${location.origin}/api/state` : `${API_ORIGIN || "http://localhost:4173"}/api/state`;

  const fields = [
    ["[data-web-mode]", mode],
    ["[data-web-server]", serverText],
    ["[data-web-landmarks]", landmarks.length],
    ["[data-web-apk]", "빌드 준비"],
    ["[data-web-note]", note],
  ];

  fields.forEach(([selector, value]) => {
    const element = document.querySelector(selector);
    if (element) element.textContent = value;
  });
}

function renderHome() {
  screen.querySelector("[data-weekly-distance]").textContent = state.stats.weeklyDistance.toFixed(0);
  screen.querySelector("[data-weekly-progress]").style.width = `${Math.min((state.stats.weeklyDistance / 200) * 100, 100)}%`;
  screen.querySelector("[data-ride-state]").textContent = state.riding ? "GPS 기록 중" : "대기 중";
  screen.querySelector("[data-ride-distance]").textContent = state.ride.distance.toFixed(2);
  screen.querySelector("[data-ride-time]").textContent = formatTime(state.ride.seconds);
  screen.querySelector("[data-ride-speed]").textContent = state.ride.speed.toFixed(1);
  screen.querySelector("[data-action='toggle-ride']").textContent = state.riding ? "라이딩 종료" : "라이딩 시작";
  screen.querySelector("[data-action='save-ride']").disabled = !state.riding;
  screen.querySelector("[data-gps-status]").textContent = state.gpsStatus;
  screen.querySelector("[data-wake-status]").textContent = state.wakeStatus;
  screen.querySelector("[data-sample-count]").textContent = formatNumber(state.ride.samples || 0);

  screen.querySelectorAll("[data-tab-target]").forEach((button) => {
    button.addEventListener("click", () => setTab(button.dataset.tabTarget));
  });
}

function renderChallenge() {
  Object.entries(badgeCatalog).forEach(([group, badges]) => {
    const target = screen.querySelector(`[data-badge-group="${group}"]`);
    target.replaceChildren(
      ...badges.map((badge) => {
        const earned = state.badges[group].includes(badge.name);
        const element = document.createElement("div");
        element.className = `badge-token ${earned ? "earned" : ""}`;
        element.innerHTML = `<span>${badge.icon}</span><strong>${badge.name}</strong><small>${badge.clue}</small>`;
        return element;
      }),
    );
  });

  renderTreasureLayers();
  renderRegionCollections();
  renderPlaceCollections();
  renderLandmarkTreasures();
}

function renderTreasureLayers() {
  const target = screen.querySelector("[data-treasure-layers]");
  if (!target) return;

  target.replaceChildren(
    ...treasureLayers.map((layer) => {
      const element = document.createElement("article");
      element.className = "treasure-layer-card";
      element.innerHTML = `
        <span>${layer.icon}</span>
        <div>
          <strong>${layer.title}</strong>
          <p>${layer.copy}</p>
        </div>
      `;
      return element;
    }),
  );
}

function renderRegionCollections() {
  const target = screen.querySelector("[data-region-collections]");
  if (!target) return;

  target.replaceChildren(
    sectionLabel("지역별 보물함", "권역마다 대표 테마와 완성 조건을 다르게 설계합니다."),
    ...regionCollections.map((collection) => {
      const percent = Math.round((collection.progress / collection.total) * 100);
      const element = document.createElement("article");
      element.className = "collection-card region-card";
      element.innerHTML = `
        <div class="collection-top">
          <div>
            <p class="eyebrow">${collection.region}</p>
            <h3>${collection.treasure}</h3>
          </div>
          <span class="rarity rarity-${rarityClass(collection.rarity)}">${collection.rarity}</span>
        </div>
        <div class="collection-progress" aria-label="${collection.region} 진행률">
          <span style="width:${percent}%"></span>
        </div>
        <p class="collection-rule">${collection.rule}</p>
        <div class="place-chip-row">
          ${collection.places.map((place, index) => `<span class="${index < collection.progress ? "unlocked" : ""}">${place}</span>`).join("")}
        </div>
        <strong class="reward-copy">완성 보상: ${collection.reward}</strong>
      `;
      return element;
    }),
  );
}

function renderPlaceCollections() {
  const target = screen.querySelector("[data-place-collections]");
  if (!target) return;

  target.replaceChildren(
    sectionLabel("장소 유형 보물", "사용자가 취향에 맞춰 자연, 역사, 도심, 코스 중 하나를 파고들 수 있게 합니다."),
    ...placeCollections.map((collection) => {
      const percent = Math.round((collection.progress / collection.total) * 100);
      const element = document.createElement("article");
      element.className = "collection-card place-card";
      element.innerHTML = `
        <span class="place-symbol">${collection.icon}</span>
        <div>
          <p class="eyebrow">${collection.type}</p>
          <h3>${collection.treasure}</h3>
          <p>${collection.logic}</p>
          <div class="collection-progress" aria-label="${collection.type} 진행률">
            <span style="width:${percent}%"></span>
          </div>
          <small>${collection.progress} / ${collection.total} 조각 수집</small>
        </div>
      `;
      return element;
    }),
  );
}

function renderLandmarkTreasures() {
  const target = screen.querySelector("[data-landmark-treasures]");
  if (!target) return;

  target.replaceChildren(
    sectionLabel("명소별 보물 조각", "각 명소는 도착, QR, 스토리 단서가 모두 모여야 완성됩니다."),
    ...landmarkTreasures.map((treasure) => {
      const hasHistory = state.history.some((item) => item.title.includes(treasure.landmark));
      const complete = treasure.complete || hasHistory;
      const element = document.createElement("article");
      element.className = `landmark-treasure ${complete ? "complete" : ""}`;
      element.innerHTML = `
        <div class="treasure-stamp">${complete ? "획득" : "잠김"}</div>
        <div>
          <p class="eyebrow">${treasure.region}</p>
          <h3>${treasure.landmark}</h3>
          <p class="mystery">힌트: ${treasure.mystery}</p>
          <div class="piece-row">
            ${treasure.pieces.map((piece, index) => `<span class="${complete || index === 0 ? "unlocked" : ""}">${piece}</span>`).join("")}
          </div>
          <strong>${treasure.reward}</strong>
        </div>
      `;
      return element;
    }),
  );
}

function sectionLabel(title, copy) {
  const element = document.createElement("div");
  element.className = "treasure-section-label";
  element.innerHTML = `<h3>${title}</h3><p>${copy}</p>`;
  return element;
}

function rarityClass(rarity) {
  return {
    희귀: "rare",
    영웅: "hero",
    전설: "legend",
  }[rarity] || "rare";
}

function renderOfficialDirectory() {
  const list = screen.querySelector("[data-official-landmarks]");
  const stats = screen.querySelector("[data-directory-stats]");
  const sourceCopy = screen.querySelector("[data-official-source-copy]");
  if (!list || !stats || !sourceCopy) return;

  const cityCounts = countBy(landmarks.map((landmark) => landmark.city));
  const categoryCounts = countBy(landmarks.map((landmark) => landmark.category));
  const ktoCount = landmarks.filter((landmark) => landmark.sourceLevel === "kto100").length;
  const topCategories = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => `${name} ${count}`)
    .join(" · ");

  sourceCopy.textContent = `문체부·한국관광공사 한국관광 100선 포함 ${ktoCount}곳을 우선 배치하고, 투어전북 관광지정보에서 14개 시군을 균형 있게 보강했습니다.`;
  stats.replaceChildren(
    directoryStat("전체", `${landmarks.length}곳`),
    directoryStat("시군", `${Object.keys(cityCounts).length}개`),
    directoryStat("대표 유형", topCategories),
  );

  list.replaceChildren(
    ...landmarks.map((landmark, index) => {
      const element = document.createElement("button");
      element.type = "button";
      element.dataset.officialLandmark = String(index);
      element.className = `official-landmark-card ${landmark.sourceLevel === "kto100" ? "priority" : ""}`;
      element.setAttribute("aria-pressed", String(index === state.selectedLandmark));
      element.innerHTML = `
        <span>${landmark.rank}</span>
        <div>
          <strong>${landmark.name}</strong>
          <small>${landmark.city} · ${landmark.category}</small>
        </div>
        <em>${landmark.sourceLevel === "kto100" ? "한국관광100선" : "투어전북"}</em>
      `;
      return element;
    }),
  );
}

function directoryStat(label, value) {
  const element = document.createElement("article");
  element.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
  return element;
}

function countBy(items) {
  return items.reduce((counts, item) => {
    counts[item] = (counts[item] || 0) + 1;
    return counts;
  }, {});
}

function formatLandmarkPinName(name) {
  return name
    .replace("국립공원", "")
    .replace("도립공원", "")
    .replace("군립공원", "")
    .replace(/^전주(?!\s)/, "전주 ")
    .trim();
}

function renderVworldMap() {
  const board = screen.querySelector("[data-vworld-map]");
  const layer = screen.querySelector("[data-vworld-tiles]");
  if (!board || !layer) return;

  const layerConfig = currentMapLayer();
  board.classList.remove("api-error");
  board.classList.add("api-fallback");
  const status = board.querySelector("[data-map-api-status]");
  if (status) status.textContent = `V-WORLD ${layerConfig.label} 연결 중`;
  board.querySelectorAll("[data-map-layer]").forEach((button) => {
    const active = button.dataset.mapLayer === state.map.layer;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  renderVworldTileFallback(board, layer, layerConfig);
  renderMapPins(board);
  bindInteractiveMap(board);
}

function renderVworldTileFallback(board, layer, layerConfig) {
  const width = board.clientWidth || 360;
  const height = board.clientHeight || 280;
  const tileSize = VWORLD_MAP.tileSize;
  const zoom = state.map.zoom;
  const center = lonLatToWorldPixel(state.map.center.lng, state.map.center.lat, zoom, tileSize);
  const centerTileX = Math.floor(center.x / tileSize);
  const centerTileY = Math.floor(center.y / tileSize);
  const offsetX = width / 2 - (center.x - centerTileX * tileSize);
  const offsetY = height / 2 - (center.y - centerTileY * tileSize);
  const halfTilesX = Math.ceil(width / tileSize / 2) + 1;
  const halfTilesY = Math.ceil(height / tileSize / 2) + 1;
  const tiles = [];
  let loadedTiles = 0;
  let failedTiles = 0;
  let expectedTiles = 0;
  const status = board.querySelector("[data-map-api-status]");

  const updateTileStatus = () => {
    if (!status) return;
    if (loadedTiles > 0) {
      status.textContent = `V-WORLD ${layerConfig.label} · z${zoom}`;
      board.classList.remove("api-error");
      return;
    }
    if (failedTiles >= expectedTiles) {
      status.textContent = "V-WORLD 지도 연결 확인 필요";
      board.classList.add("api-error");
    }
  };

  for (const tileLayer of layerConfig.tiles) {
    for (let x = centerTileX - halfTilesX; x <= centerTileX + halfTilesX; x += 1) {
      for (let y = centerTileY - halfTilesY; y <= centerTileY + halfTilesY; y += 1) {
        if (y < 0 || y >= 2 ** zoom) continue;
        const image = document.createElement("img");
        image.alt = "";
        image.decoding = "async";
        image.loading = "lazy";
        image.referrerPolicy = "no-referrer";
        image.className = tileLayer.overlay ? "tile-overlay" : "";
        image.src = vworldTileUrl(x, y, zoom, tileLayer);
        image.addEventListener(
          "load",
          () => {
            loadedTiles += 1;
            updateTileStatus();
          },
          { once: true },
        );
        image.addEventListener(
          "error",
          () => {
            failedTiles += 1;
            updateTileStatus();
          },
          { once: true },
        );
        image.style.left = `${Math.round(offsetX + (x - centerTileX) * tileSize)}px`;
        image.style.top = `${Math.round(offsetY + (y - centerTileY) * tileSize)}px`;
        tiles.push(image);
        expectedTiles += 1;
      }
    }
  }

  layer.replaceChildren(...tiles);
}

function renderMapPins(board) {
  const container = board.querySelector("[data-map-pins]");
  if (!container) return;

  const width = board.clientWidth || 360;
  const height = board.clientHeight || 280;
  const selected = landmarks[state.selectedLandmark] || landmarks[0];
  const pinLandmarks = nearbyMapLandmarks(selected);
  const pins = [];

  pinLandmarks.forEach(({ landmark, index }) => {
    const point = projectLandmarkToBoard(landmark, width, height);
    if (!point.visible && index !== state.selectedLandmark) return;

    const button = document.createElement("button");
    button.type = "button";
    button.dataset.landmark = String(index);
    button.className = `map-pin ${index === state.selectedLandmark ? "active" : ""} ${landmark.coordinateLevel === "city-estimate" ? "estimated" : ""}`;
    button.textContent = formatLandmarkPinName(landmark.name);
    button.style.left = `${Math.max(24, Math.min(width - 24, point.x))}px`;
    button.style.top = `${Math.max(44, Math.min(height - 16, point.y))}px`;
    pins.push(button);
  });

  container.replaceChildren(...pins);
}

function nearbyMapLandmarks(selected) {
  const selectedIndex = landmarks.indexOf(selected);
  return landmarks
    .map((landmark, index) => ({
      landmark,
      index,
      score:
        index === selectedIndex
          ? -10
          : landmark.city === selected.city
            ? 0
            : landmark.category === selected.category
              ? 1
              : 2,
    }))
    .sort((a, b) => a.score - b.score || a.landmark.rank - b.landmark.rank)
    .slice(0, 8);
}

function projectLandmarkToBoard(landmark, width, height) {
  const tileSize = VWORLD_MAP.tileSize;
  const zoom = state.map.zoom;
  const center = lonLatToWorldPixel(state.map.center.lng, state.map.center.lat, zoom, tileSize);
  const point = lonLatToWorldPixel(landmark.lng, landmark.lat, zoom, tileSize);
  const x = width / 2 + point.x - center.x;
  const y = height / 2 + point.y - center.y;
  return {
    x,
    y,
    visible: x >= -80 && x <= width + 80 && y >= -80 && y <= height + 80,
  };
}

function lonLatToWorldPixel(lng, lat, zoom, tileSize) {
  const sinLat = Math.sin((Math.max(Math.min(lat, 85.05112878), -85.05112878) * Math.PI) / 180);
  const scale = tileSize * 2 ** zoom;
  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale,
  };
}

function worldPixelToLonLat(x, y, zoom, tileSize) {
  const scale = tileSize * 2 ** zoom;
  const lng = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return {
    lat: Math.max(Math.min(lat, 85.05112878), -85.05112878),
    lng: ((lng + 540) % 360) - 180,
  };
}

function bindInteractiveMap(board) {
  if (board.dataset.mapBound === "true") return;
  board.dataset.mapBound = "true";

  board.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) return;
    if (board.classList.contains("api-ready") && event.target.closest("[data-vworld-api-map]")) return;
    board.setPointerCapture?.(event.pointerId);
    mapDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      center: { ...state.map.center },
      moved: false,
    };
    board.classList.add("dragging");
  });

  board.addEventListener("pointermove", (event) => {
    if (!mapDrag || mapDrag.pointerId !== event.pointerId) return;
    const dx = event.clientX - mapDrag.startX;
    const dy = event.clientY - mapDrag.startY;
    if (Math.abs(dx) + Math.abs(dy) < 4) return;
    mapDrag.moved = true;
    const pixel = lonLatToWorldPixel(mapDrag.center.lng, mapDrag.center.lat, state.map.zoom, VWORLD_MAP.tileSize);
    state.map.center = worldPixelToLonLat(pixel.x - dx, pixel.y - dy, state.map.zoom, VWORLD_MAP.tileSize);
    renderVworldMap();
  });

  const finishDrag = (event) => {
    if (!mapDrag || mapDrag.pointerId !== event.pointerId) return;
    board.releasePointerCapture?.(event.pointerId);
    board.classList.remove("dragging");
    if (mapDrag.moved) {
      persistClientPrefs();
    }
    mapDrag = null;
  };

  board.addEventListener("pointerup", finishDrag);
  board.addEventListener("pointercancel", finishDrag);
}

function updateMapZoom(delta) {
  state.map.zoom = Math.max(7, Math.min(13, state.map.zoom + delta));
  persistClientPrefs();
  render();
}

function currentMapLayer() {
  return VWORLD_LAYERS[state.map.layer] || VWORLD_LAYERS.base;
}

function vworldTileUrl(x, y, zoom, tileLayer = currentMapLayer().tiles[0]) {
  const tileCount = 2 ** zoom;
  const wrappedX = ((x % tileCount) + tileCount) % tileCount;
  return `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_API_KEY}/${tileLayer.name}/${zoom}/${y}/${wrappedX}.${tileLayer.extension}`;
}

function renderMap() {
  const selected = landmarks[state.selectedLandmark] || landmarks[0];
  if (!selected) return;

  renderVworldMap();

  screen.querySelectorAll("[data-landmark]").forEach((button) => {
    const landmark = landmarks[Number(button.dataset.landmark)];
    if (landmark) {
      button.textContent = formatLandmarkPinName(landmark.name);
    }
    button.classList.toggle("active", landmark?.id === selected.id);
  });

  const panel = screen.querySelector("[data-landmark-panel]");
  panel.innerHTML = `
    <p class="eyebrow">${selected.city} · ${selected.category}</p>
    <h3>${selected.name}</h3>
    <p>추천 코스로 ${selected.distance.toFixed(1)}km를 주행하면 약 ${(selected.distance * CO2_PER_KM).toFixed(2)}kgCO2e를 절감합니다.</p>
    <p class="source-copy">공식 출처: ${selected.officialSource}</p>
    <div class="landmark-meta">
      <span>${selected.id}</span>
      <span>${selected.distance.toFixed(1)}km</span>
      <span>QR 반경 ${selected.near}m</span>
      <span>보너스 ${selected.bonus}P</span>
    </div>
    ${renderServerQrCard(selected)}
  `;

  const canScan = state.isNearLandmark || selected.near <= 100;
  const status = screen.querySelector("[data-checkin-status]");
  const help = screen.querySelector("[data-checkin-help]");
  const scanButton = screen.querySelector("[data-action='scan-qr']");

  status.textContent = canScan ? "100m 이내 접근 완료" : "100m 밖에 있습니다";
  help.textContent = canScan
    ? "현장 QR 스캔이 가능합니다. 체크인하면 보너스와 배지가 지급됩니다."
    : "현재 위치 버튼을 눌러 접근 시나리오를 테스트할 수 있습니다.";
  scanButton.disabled = !canScan;

  screen.querySelectorAll("[data-landmark]").forEach((button) => {
    button.addEventListener("click", () => {
      selectLandmark(Number(button.dataset.landmark));
    });
  });

  renderOfficialDirectory();
}

function selectLandmark(index) {
  const landmark = landmarks[index];
  if (!landmark) return;

  state.selectedLandmark = index;
  state.isNearLandmark = false;
  state.map.center = { lat: landmark.lat, lng: landmark.lng };
  state.map.zoom = Math.max(state.map.zoom, landmark.coordinateLevel === "exact" ? 13 : 11);
  persistClientPrefs();
  render();
}

function renderServerQrCard(landmark) {
  if (!landmark.qrCodeId) return "";
  const imageUrl = serverQrImageUrl(landmark);
  return `
    <div class="server-qr-card">
      <div>
        <p class="eyebrow">서버 저장 QR</p>
        <strong>${landmark.name} 방문 인증 이미지</strong>
        <small>현장에 게시된 이 QR을 스캔해야 방문 증명이 생성됩니다.</small>
        <code>${landmark.qrCodeId}</code>
      </div>
      <img src="${imageUrl}" alt="${landmark.name} 방문 인증 QR 이미지" />
    </div>
  `;
}

function serverQrImageUrl(landmark) {
  const imageFile = landmark.qrStaticImageFile || landmark.qrImageFile || `${landmark.qrCodeId}.svg`;
  return `data/qr-images/${encodeURI(imageFile)}`;
}

function renderPoints() {
  const weekly = state.stats.weeklyPoints.reduce((sum, value) => sum + value, 0);
  screen.querySelector("[data-total-points]").textContent = formatNumber(state.stats.totalPoints);
  screen.querySelector("[data-total-co2]").textContent = state.stats.totalCo2.toFixed(1);
  screen.querySelector("[data-tree-effect]").textContent = Math.max(1, Math.round(state.stats.totalCo2 / 8.7));
  screen.querySelector("[data-weekly-points]").textContent = formatNumber(weekly);
  screen.querySelector("[data-weekly-copy]").textContent = "전주 대비 120P 증가했습니다.";

  const max = Math.max(...state.stats.weeklyPoints, 1);
  screen.querySelector("[data-weekly-bars]").replaceChildren(
    ...state.stats.weeklyPoints.map((value) => {
      const bar = document.createElement("span");
      bar.style.height = `${Math.max((value / max) * 100, 12)}%`;
      bar.title = `${value}P`;
      return bar;
    }),
  );

  const history = screen.querySelector("[data-history-list]");
  history.replaceChildren(
    ...state.history.slice(0, 8).map((item) => {
      const element = document.createElement("article");
      element.className = "history-item";
      element.innerHTML = `
        <div>
          <strong>${item.title}</strong>
          <p>${item.meta}</p>
        </div>
        <strong>${item.type === "spend" ? "-" : "+"}${formatNumber(item.points)}P</strong>
      `;
      return element;
    }),
  );
}

function renderAdmin() {
  const pending = state.requests.filter((request) => request.status === "pending");
  screen.querySelector("[data-admin-users]").textContent = formatNumber(state.stats.users);
  screen.querySelector("[data-admin-rides]").textContent = formatNumber(state.stats.rides);
  screen.querySelector("[data-admin-pending]").textContent = pending.length;

  const list = screen.querySelector("[data-admin-list]");
  if (!pending.length) {
    list.innerHTML = `<div class="empty-state">승인 대기 건이 없습니다.</div>`;
    return;
  }

  list.replaceChildren(
    ...pending.map((request) => {
      const element = document.createElement("article");
      element.className = "admin-request";
      element.innerHTML = `
        <h3>${request.title}</h3>
        <p>${request.user} · ${request.distance.toFixed(2)}km · ${request.co2.toFixed(2)}kgCO2e · ${request.points}P</p>
        <p>${request.evidence}</p>
        <div class="request-actions">
          <button class="approve" type="button" data-approve="${request.id}">승인</button>
          <button class="reject" type="button" data-reject="${request.id}">반려</button>
        </div>
      `;
      return element;
    }),
  );
}

document.addEventListener("click", (event) => {
  const target = event.target.closest("button");
  if (!target) return;

  if (target.dataset.tab) {
    closeQrScanner();
    setTab(target.dataset.tab);
    return;
  }

  if (target.dataset.action === "app-back") {
    handleAppBack();
    return;
  }

  if (target.dataset.action === "toggle-ride") {
    toggleRide();
    return;
  }

  if (target.dataset.action === "save-ride") {
    finishRide();
    return;
  }

  if (target.dataset.action === "move-near") {
    state.isNearLandmark = true;
    persistClientPrefs();
    render();
    showToast("명소 반경 100m 이내로 접근했습니다.");
    return;
  }

  if (target.dataset.action === "scan-qr") {
    scanQr();
    return;
  }

  if (target.dataset.action === "close-qr-scanner") {
    closeQrScanner();
    return;
  }

  if (target.dataset.action === "simulate-qr-success") {
    const status = qrScannerModal?.querySelector("[data-qr-status]");
    if (status) status.textContent = "서버 이미지 대조 인증은 실제 카메라 프레임과 GPS 좌표가 필요합니다.";
    showToast("실제 QR을 카메라로 스캔해야 서버 인증이 가능합니다.");
    return;
  }

  if (target.dataset.action === "map-zoom-in") {
    updateMapZoom(1);
    return;
  }

  if (target.dataset.action === "map-zoom-out") {
    updateMapZoom(-1);
    return;
  }

  if (target.dataset.mapLayer) {
    state.map.layer = target.dataset.mapLayer in VWORLD_LAYERS ? target.dataset.mapLayer : VWORLD_MAP.layer;
    persistClientPrefs();
    render();
    return;
  }

  if (target.dataset.officialLandmark) {
    selectLandmark(Number(target.dataset.officialLandmark));
    return;
  }

  if (target.dataset.action === "request-exchange") {
    requestExchange();
    return;
  }

  if (target.dataset.approve) {
    reviewRequest(target.dataset.approve, "approved");
    return;
  }

  if (target.dataset.reject) {
    reviewRequest(target.dataset.reject, "rejected");
  }
});

function handleAppBack() {
  if (!qrScannerModal?.hidden) {
    closeQrScanner();
    return;
  }
  if (state.settings.settingsOpen) {
    closeSettings();
    return;
  }
  if (state.tab !== "home") {
    setTab("home");
    return;
  }
  showToast("홈 화면입니다.");
}

function setTab(tab) {
  state.tab = tab;
  persistClientPrefs();
  render();
  screen.focus({ preventScroll: true });
}

async function toggleRide() {
  if (state.riding) {
    await finishRide();
    return;
  }

  const locationReady = await prepareRideLocation();
  if (!locationReady) return;

  const payload = await mutateServer("/rides/start", { user: currentRiderName() }, "서버에 라이딩 세션을 시작했습니다.");
  if (!payload?.activeRide) {
    pendingStartSample = null;
    state.wakeStatus = "대기 중";
    persistClientPrefs();
    render();
    return;
  }

  state.activeRide = payload.activeRide;
  state.ride = rideFromSession(payload.activeRide);
  state.riding = true;
  state.gpsStatus = "GPS 기록 시작";
  persistClientPrefs();
  render();
  if (pendingStartSample) {
    sampleQueue.push(pendingStartSample);
    pendingStartSample = null;
    flushSamples();
  }
  startLocalRideLoop();
  startLocationWatch();
  requestWakeLock();
}

async function prepareRideLocation() {
  if (!("geolocation" in navigator)) {
    state.permissions.location = "unsupported";
    state.gpsStatus = "GPS 미지원";
    persistClientPrefs();
    render();
    showToast("이 브라우저는 위치 기록을 지원하지 않습니다.");
    return false;
  }

  if (navigator.permissions?.query) {
    try {
      const permission = await navigator.permissions.query({ name: "geolocation" });
      state.permissions.location = permission.state;
      if (permission.state === "denied") {
        state.gpsStatus = "위치 권한 차단";
        persistClientPrefs();
        render();
        openSettings();
        showToast("위치 권한을 허용해야 라이딩 기록을 시작할 수 있습니다.");
        return false;
      }
    } catch {
      state.permissions.location = state.permissions.location || "prompt";
    }
  }

  state.gpsStatus = "GPS 시작 위치 확인 중";
  state.wakeStatus = "화면 꺼짐 준비 중";
  persistClientPrefs();
  render();

  try {
    const position = await getCurrentPositionOnce({
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 0,
    });
    pendingStartSample = createPositionSample(position);
    state.permissions.location = "granted";
    state.gpsStatus = pendingStartSample.accuracy
      ? `GPS 준비 완료 ±${Math.round(pendingStartSample.accuracy)}m`
      : "GPS 준비 완료";
    persistClientPrefs();
    render();
    return true;
  } catch (error) {
    pendingStartSample = null;
    state.permissions.location = error.code === 1 ? "denied" : "prompt";
    state.gpsStatus = positionErrorMessage(error);
    state.wakeStatus = "대기 중";
    persistClientPrefs();
    render();
    if (error.code === 1) openSettings();
    showToast(`${state.gpsStatus} 라이딩 시작을 중단했습니다.`);
    return false;
  }
}

function getCurrentPositionOnce(options) {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

function startLocalRideLoop() {
  window.clearInterval(rideTimer);
  rideTimer = window.setInterval(tickRide, 1000);
}

function tickRide() {
  if (!state.activeRide?.startedAt) return;
  state.ride.seconds = Math.max(0, Math.round((Date.now() - new Date(state.activeRide.startedAt).getTime()) / 1000));
  persistClientPrefs();
  if (state.tab === "home") {
    renderHome();
  } else {
    renderWebSummary();
  }
}

function startLocationWatch() {
  if (!("geolocation" in navigator)) {
    state.gpsStatus = "GPS 미지원";
    render();
    showToast("이 브라우저는 위치 기록을 지원하지 않습니다.");
    return;
  }

  if (locationWatchId !== null) {
    navigator.geolocation.clearWatch(locationWatchId);
  }

  locationWatchId = navigator.geolocation.watchPosition(handlePosition, handlePositionError, {
    enableHighAccuracy: true,
    maximumAge: 2000,
    timeout: 12000,
  });
  state.gpsStatus = "GPS 수신 대기";
  render();
}

function handlePosition(position) {
  const sample = createPositionSample(position);

  state.gpsStatus = sample.accuracy ? `GPS 수신 중 ±${Math.round(sample.accuracy)}m` : "GPS 수신 중";
  sampleQueue.push(sample);
  flushSamples();
}

function createPositionSample(position) {
  return {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracy: position.coords.accuracy,
    altitude: position.coords.altitude,
    heading: position.coords.heading,
    speed: position.coords.speed,
    timestamp: new Date(position.timestamp).toISOString(),
  };
}

function handlePositionError(error) {
  state.gpsStatus = positionErrorMessage(error);
  render();
  showToast(state.gpsStatus);
}

function positionErrorMessage(error) {
  const messages = {
    1: "위치 권한이 거부되었습니다.",
    2: "현재 위치를 확인할 수 없습니다.",
    3: "GPS 응답 시간이 초과되었습니다.",
  };
  return messages[error.code] || "GPS 오류";
}

async function flushSamples() {
  if (!state.activeRide?.id || !sampleQueue.length) return;
  const samples = sampleQueue.splice(0, sampleQueue.length);

  try {
    const payload = await apiRequest(`/rides/${encodeURIComponent(state.activeRide.id)}/samples`, {
      method: "POST",
      body: JSON.stringify({ samples }),
    });
    applyServerState(payload.state, payload.activeRide);
  } catch (error) {
    markServerOffline(error);
    sampleQueue = samples.concat(sampleQueue).slice(-40);
    window.clearTimeout(sampleFlushTimer);
    sampleFlushTimer = window.setTimeout(flushSamples, 5000);
  }
}

function flushSamplesWithBeacon() {
  if (!state.activeRide?.id || !sampleQueue.length || !navigator.sendBeacon) return;
  const samples = sampleQueue.splice(0, sampleQueue.length);
  const blob = new Blob([JSON.stringify({ samples })], { type: "application/json" });
  navigator.sendBeacon(`${API_BASE}/rides/${encodeURIComponent(state.activeRide.id)}/samples`, blob);
}

async function requestWakeLock() {
  if (!("wakeLock" in navigator)) {
    state.wakeStatus = "화면 꺼짐 방지 미지원";
    render();
    return;
  }

  try {
    wakeLock = await navigator.wakeLock.request("screen");
    state.wakeStatus = "화면 꺼짐 방지 활성";
    wakeLock.addEventListener("release", () => {
      state.wakeStatus = state.riding ? "화면 꺼짐 방지 해제됨" : "대기 중";
      render();
    });
    render();
  } catch {
    state.wakeStatus = "화면 꺼짐 방지 실패";
    render();
  }
}

function stopLocalTracking() {
  window.clearInterval(rideTimer);
  rideTimer = null;
  window.clearTimeout(sampleFlushTimer);
  sampleFlushTimer = null;

  if (locationWatchId !== null && "geolocation" in navigator) {
    navigator.geolocation.clearWatch(locationWatchId);
    locationWatchId = null;
  }

  if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}

async function finishRide() {
  if (!state.activeRide?.id) {
    showToast("진행 중인 라이딩이 없습니다.");
    return;
  }

  await flushSamples();
  try {
    const payload = await apiRequest(`/rides/${encodeURIComponent(state.activeRide.id)}/finish`, {
      method: "POST",
      body: JSON.stringify({ user: currentRiderName() }),
    });
    stopLocalTracking();
    state.activeRide = null;
    state.riding = false;
    state.ride = { seconds: 0, distance: 0, speed: 0, samples: 0 };
    state.gpsStatus = "대기 중";
    state.wakeStatus = "대기 중";
    applyServerState(payload.state);
    showToast(payload.message || "라이딩 기록이 서버에 최종 등록됐습니다.");
  } catch (error) {
    markServerOffline(error);
    showToast(error.message || "라이딩 종료 처리 중 오류가 발생했습니다.");
  }
}

async function scanQr() {
  const selected = landmarks[state.selectedLandmark] || landmarks[0];
  if (!selected) return;

  if (!("geolocation" in navigator)) {
    showToast("이 기기에서는 위치 인증을 사용할 수 없습니다.");
    return;
  }

  showToast("현장 위치를 확인하고 있습니다.");
  try {
    const position = await getCurrentPositionOnce({
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 0,
    });
    pendingQrLocation = createPositionSample(position);
    state.permissions.location = "granted";
    state.gpsStatus = pendingQrLocation.accuracy
      ? `QR 위치 확인 ±${Math.round(pendingQrLocation.accuracy)}m`
      : "QR 위치 확인 완료";
    openQrScanner(selected);
  } catch (error) {
    state.permissions.location = error.code === 1 ? "denied" : "prompt";
    state.gpsStatus = positionErrorMessage(error);
    render();
    showToast("위치 권한과 GPS 상태를 확인한 뒤 다시 스캔해주세요.");
  }
}

async function openQrScanner(selected) {
  if (!qrScannerModal) return;

  const title = qrScannerModal.querySelector("[data-qr-title]");
  const status = qrScannerModal.querySelector("[data-qr-status]");
  const video = qrScannerModal.querySelector("[data-qr-video]");
  if (title) title.textContent = `${selected.name} QR 스캔`;
  if (status) status.textContent = "카메라 권한을 요청하고 있습니다.";
  qrScannerModal.hidden = false;
  document.body.classList.add("scanner-open");
  qrCompleting = false;

  if (!navigator.mediaDevices?.getUserMedia) {
    if (status) status.textContent = "이 브라우저에서는 카메라를 사용할 수 없습니다. 서버 인증에는 실제 촬영 프레임이 필요합니다.";
    return;
  }

  try {
    qrStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });
    video.srcObject = qrStream;
    await video.play();
    if (status) status.textContent = "카메라가 켜졌습니다. 현장 QR을 프레임 안에 맞춰주세요.";
    startQrDetectionLoop(video, status);
  } catch (error) {
    if (status) {
      status.textContent = error?.name === "NotAllowedError"
        ? "카메라 권한이 차단되었습니다. 브라우저 설정에서 카메라 권한을 허용해주세요."
        : "카메라를 시작하지 못했습니다. 서버 인증에는 실제 촬영 프레임이 필요합니다.";
    }
    showToast("카메라 권한 또는 장치 상태를 확인해주세요.");
  }
}

async function startQrDetectionLoop(video, status) {
  qrDetector = null;
  if ("BarcodeDetector" in window) {
    try {
    qrDetector = new BarcodeDetector({ formats: ["qr_code"] });
    } catch {
      qrDetector = null;
    }
  }

  if (!qrDetector && status) {
    status.textContent = "카메라가 켜졌습니다. 서버가 촬영 프레임에서 QR을 직접 찾고 있습니다.";
  }

  const tick = async () => {
    if (qrScannerModal?.hidden || qrCompleting) return;
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      try {
        let rawValue = "";
        if (qrDetector) {
          const codes = await qrDetector.detect(video);
          rawValue = codes[0]?.rawValue || "";
        }

        const shouldAskServer = rawValue || Date.now() - qrServerProbeAt > 1200;
        if (shouldAskServer) {
          qrServerProbeAt = Date.now();
          await completeQrScan(rawValue, captureQrFrame(video), { quietRetry: !rawValue });
          return;
        }
      } catch {
        if (status) status.textContent = "QR을 읽는 중입니다. 화면을 조금 더 밝게 비춰주세요.";
      }
    }
    qrScanFrame = requestAnimationFrame(tick);
  };

  qrScanFrame = requestAnimationFrame(tick);
}

function closeQrScanner() {
  if (!qrScannerModal || qrScannerModal.hidden) return;
  if (qrScanFrame) {
    cancelAnimationFrame(qrScanFrame);
    qrScanFrame = null;
  }
  if (qrStream) {
    qrStream.getTracks().forEach((track) => track.stop());
    qrStream = null;
  }
  const video = qrScannerModal.querySelector("[data-qr-video]");
  if (video) {
    video.pause();
    video.srcObject = null;
  }
  qrDetector = null;
  qrCompleting = false;
  qrServerProbeAt = 0;
  pendingQrLocation = null;
  qrScannerModal.hidden = true;
  document.body.classList.remove("scanner-open");
}

async function completeQrScan(rawValue, qrFrame, options = {}) {
  if (qrCompleting) return;
  qrCompleting = true;
  const status = qrScannerModal?.querySelector("[data-qr-status]");
  if (status) status.textContent = "서버가 촬영 이미지와 현재 위치를 검증하고 있습니다.";
  await saveQrCheckin(rawValue, qrFrame, options);
}

async function saveQrCheckin(qrValue, qrFrame, options = {}) {
  const selected = landmarks[state.selectedLandmark] || landmarks[0];
  try {
    const payload = await apiRequest("/checkins", {
      method: "POST",
      body: JSON.stringify({
      landmarkIndex: state.selectedLandmark,
      user: currentRiderName(),
      qrValue,
      qrFrame,
      location: pendingQrLocation
        ? {
            lat: pendingQrLocation.lat,
            lng: pendingQrLocation.lng,
            accuracy: pendingQrLocation.accuracy,
            timestamp: pendingQrLocation.timestamp,
          }
        : null,
      landmark: selected
        ? {
            name: selected.name,
            city: selected.city,
            category: selected.category,
            distance: selected.distance,
            bonus: selected.bonus,
            near: selected.near,
          }
        : null,
      }),
    });
    applyServerState(payload.state, payload.activeRide);
    showToast(payload.message || "QR 이미지와 위치가 서버에서 인증됐습니다.");
    closeQrScanner();
    state.isNearLandmark = false;
    setTab("points");
  } catch (error) {
    markServerOffline(error);
    qrCompleting = false;
    const status = qrScannerModal?.querySelector("[data-qr-status]");
    const quietRetry =
      options.quietRetry &&
      /촬영 이미지에서 QR을 직접 판독하지 못했습니다|촬영한 QR 이미지가 서버에 등록된 QR 이미지와 일치하지 않습니다/.test(
        error.message || "",
      );
    if (quietRetry) {
      if (status) status.textContent = "서버가 QR 이미지를 찾는 중입니다. QR을 화면 중앙에 크게 맞춰주세요.";
      return;
    }
    if (status) status.textContent = error.message || "서버 검증에 실패했습니다. 다시 스캔하거나 뒤로가기를 눌러주세요.";
    showToast(error.message || "서버 검증에 실패했습니다.");
  }
}

function captureQrFrame(video) {
  const sourceWidth = video.videoWidth || 0;
  const sourceHeight = video.videoHeight || 0;
  if (!sourceWidth || !sourceHeight) {
    throw new Error("카메라 프레임을 캡처하지 못했습니다.");
  }

  const scale = Math.min(1, 560 / sourceWidth);
  const width = Math.max(160, Math.round(sourceWidth * scale));
  const height = Math.max(160, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(video, 0, 0, width, height);
  const image = context.getImageData(0, 0, width, height);

  return {
    width,
    height,
    rgbaBase64: bytesToBase64(image.data),
    capturedAt: new Date().toISOString(),
  };
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

async function requestExchange() {
  await mutateServer("/exchanges", { user: currentRiderName() }, "포인트 전환 신청이 서버에 등록됐습니다.");
}

async function reviewRequest(id, status) {
  try {
    const payload = await apiRequest(`/requests/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    applyServerState(payload.state);
    showToast(payload.message || (status === "approved" ? "검증을 승인했습니다." : "검증 요청을 반려했습니다."));
  } catch (error) {
    markServerOffline(error);
    showToast(error.message || "검증 처리 중 오류가 발생했습니다.");
  }
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remain = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`;
}

function formatNumber(number) {
  return new Intl.NumberFormat("ko-KR").format(Math.round(number));
}

function showToast(message) {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.append(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2400);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
