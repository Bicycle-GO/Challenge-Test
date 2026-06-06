const STORAGE_KEY = "tangamja-bike-carbon-app";
const CO2_PER_KM = 0.192;
const POINTS_PER_CO2_KG = 100;

const initialState = {
  tab: "home",
  selectedLandmark: 0,
  isNearLandmark: false,
  riding: false,
  ride: {
    seconds: 0,
    distance: 0,
    speed: 0,
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

const landmarks = [
  {
    name: "고창 선운사",
    category: "역사·문화",
    distance: 18.2,
    bonus: 150,
    near: 92,
  },
  {
    name: "덕유산",
    category: "자연",
    distance: 24.7,
    bonus: 180,
    near: 64,
  },
  {
    name: "전주 한옥마을",
    category: "도심·관광",
    distance: 12.45,
    bonus: 150,
    near: 78,
  },
  {
    name: "군산 근대역사거리",
    category: "역사·문화",
    distance: 15.8,
    bonus: 160,
    near: 116,
  },
  {
    name: "익산 미륵사지",
    category: "역사·문화",
    distance: 20.1,
    bonus: 170,
    near: 58,
  },
];

const badgeCatalog = {
  growth: [
    { name: "첫 페달", icon: "P" },
    { name: "탐험가", icon: "⌖" },
    { name: "시즌 정복자", icon: "★" },
  ],
  mission: [
    { name: "지역별 보물", icon: "□" },
    { name: "장소별 보물", icon: "◇" },
    { name: "명소 체크인", icon: "✓" },
  ],
  special: [
    { name: "연속 참여", icon: "7" },
    { name: "베스트 포토", icon: "▣" },
    { name: "그린 라이더", icon: "♧" },
  ],
};

const titles = {
  home: "자전거 챌린지",
  challenge: "서비스 흐름",
  map: "보물찾기 & QR 인증",
  points: "탄소포인트",
  admin: "관리자 검증",
};

let state = loadState();
let rideTimer = null;

const screen = document.querySelector("#screenContent");
const title = document.querySelector("#screenTitle");
const navItems = [...document.querySelectorAll(".nav-item")];
const templates = {
  home: document.querySelector("#homeTemplate"),
  challenge: document.querySelector("#challengeTemplate"),
  map: document.querySelector("#mapTemplate"),
  points: document.querySelector("#pointsTemplate"),
  admin: document.querySelector("#adminTemplate"),
};

render();
registerServiceWorker();

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved ? mergeState(initialState, saved) : structuredClone(initialState);
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
    badges: { ...base.badges, ...saved.badges },
    history: saved.history || base.history,
    requests: saved.requests || base.requests,
  };
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, riding: false }));
}

function render() {
  title.textContent = titles[state.tab];
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

function renderHome() {
  screen.querySelector("[data-weekly-distance]").textContent = state.stats.weeklyDistance.toFixed(0);
  screen.querySelector("[data-weekly-progress]").style.width = `${Math.min((state.stats.weeklyDistance / 200) * 100, 100)}%`;
  screen.querySelector("[data-ride-state]").textContent = state.riding ? "주행 중" : "대기 중";
  screen.querySelector("[data-ride-distance]").textContent = state.ride.distance.toFixed(2);
  screen.querySelector("[data-ride-time]").textContent = formatTime(state.ride.seconds);
  screen.querySelector("[data-ride-speed]").textContent = state.ride.speed.toFixed(1);
  screen.querySelector("[data-action='toggle-ride']").textContent = state.riding ? "라이딩 일시정지" : "라이딩 시작";

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
        element.innerHTML = `<span>${badge.icon}</span>${badge.name}`;
        return element;
      }),
    );
  });
}

function renderMap() {
  const selected = landmarks[state.selectedLandmark];
  screen.querySelectorAll("[data-landmark]").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.landmark) === state.selectedLandmark);
  });

  const panel = screen.querySelector("[data-landmark-panel]");
  panel.innerHTML = `
    <p class="eyebrow">${selected.category}</p>
    <h3>${selected.name}</h3>
    <p>추천 코스로 ${selected.distance.toFixed(1)}km를 주행하면 약 ${(selected.distance * CO2_PER_KM).toFixed(2)}kgCO2e를 절감합니다.</p>
    <div class="landmark-meta">
      <span>예상 거리 ${selected.distance.toFixed(1)}km</span>
      <span>반경 ${selected.near}m</span>
      <span>보너스 ${selected.bonus}P</span>
    </div>
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
      state.selectedLandmark = Number(button.dataset.landmark);
      state.isNearLandmark = false;
      persist();
      render();
    });
  });
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
    setTab(target.dataset.tab);
    return;
  }

  if (target.dataset.action === "toggle-ride") {
    toggleRide();
    return;
  }

  if (target.dataset.action === "save-ride") {
    saveRide();
    return;
  }

  if (target.dataset.action === "move-near") {
    state.isNearLandmark = true;
    persist();
    render();
    showToast("명소 반경 100m 이내로 접근했습니다.");
    return;
  }

  if (target.dataset.action === "scan-qr") {
    scanQr();
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

function setTab(tab) {
  state.tab = tab;
  persist();
  render();
  screen.focus({ preventScroll: true });
}

function toggleRide() {
  state.riding = !state.riding;
  if (state.riding) {
    rideTimer = window.setInterval(tickRide, 1000);
    showToast("라이딩 기록을 시작했습니다.");
  } else {
    window.clearInterval(rideTimer);
    rideTimer = null;
    showToast("라이딩을 일시정지했습니다.");
  }
  render();
}

function tickRide() {
  state.ride.seconds += 1;
  state.ride.speed = 18 + Math.sin(state.ride.seconds / 6) * 2.7;
  state.ride.distance += state.ride.speed / 3600;
  renderHome();
}

function saveRide() {
  if (state.ride.distance < 0.05) {
    showToast("테스트를 위해 최소 0.05km 이상 기록해주세요.");
    return;
  }

  const distance = state.ride.distance;
  const co2 = distance * CO2_PER_KM;
  const points = Math.round(co2 * POINTS_PER_CO2_KG);

  state.stats.totalCo2 += co2;
  state.stats.totalPoints += points;
  state.stats.weeklyDistance += distance;
  state.stats.weeklyPoints[6] += points;
  state.stats.rides += 1;
  state.history.unshift({
    title: "자전거 주행 기록",
    meta: `${distance.toFixed(2)}km · ${co2.toFixed(2)}kgCO2e 절감`,
    points,
    type: "earn",
  });
  state.requests.unshift({
    id: `REQ-${Date.now()}`,
    title: "주행 기록 검증",
    user: "테스트 라이더",
    distance,
    co2,
    points,
    status: "pending",
    evidence: `GPS 경로 저장, 평균속도 ${state.ride.speed.toFixed(1)}km/h, 시간 ${formatTime(state.ride.seconds)}`,
  });
  state.ride = { seconds: 0, distance: 0, speed: 0 };
  state.riding = false;
  window.clearInterval(rideTimer);
  rideTimer = null;
  persist();
  render();
  showToast(`${points}P가 적립되고 관리자 검증 대기열에 등록됐습니다.`);
}

function scanQr() {
  const selected = landmarks[state.selectedLandmark];
  const alreadyChecked = state.history.some((item) => item.title.includes(selected.name));
  const bonus = alreadyChecked ? Math.round(selected.bonus / 3) : selected.bonus;

  state.stats.totalPoints += bonus;
  state.stats.weeklyPoints[6] += bonus;
  state.history.unshift({
    title: `${selected.name} QR 체크인`,
    meta: `반경 ${selected.near}m 현장 인증`,
    points: bonus,
    type: "earn",
  });

  if (!state.badges.mission.includes("명소 체크인")) {
    state.badges.mission.push("명소 체크인");
  }
  if (state.history.filter((item) => item.title.includes("QR 체크인")).length >= 3 && !state.badges.special.includes("그린 라이더")) {
    state.badges.special.push("그린 라이더");
  }

  state.requests.unshift({
    id: `REQ-${Date.now()}`,
    title: `${selected.name} QR 인증`,
    user: "테스트 라이더",
    distance: selected.distance,
    co2: selected.distance * CO2_PER_KM,
    points: bonus,
    status: "pending",
    evidence: `GPS 반경 ${selected.near}m, QR 스캔 성공, 중복 여부 자동 확인`,
  });
  state.isNearLandmark = false;
  persist();
  setTab("points");
  showToast("QR 체크인이 완료됐습니다. 보너스 포인트가 적립됐습니다.");
}

function requestExchange() {
  const amount = Math.min(5000, Math.floor(state.stats.totalPoints / 100) * 100);
  if (amount <= 0) {
    showToast("신청 가능한 포인트가 없습니다.");
    return;
  }

  state.requests.unshift({
    id: `REQ-${Date.now()}`,
    title: "포인트 전환 신청",
    user: "테스트 라이더",
    distance: state.stats.weeklyDistance,
    co2: state.stats.totalCo2,
    points: amount,
    status: "pending",
    evidence: "누적 포인트, QR 체크인, 주행 기록 교차 검증 필요",
  });
  state.history.unshift({
    title: "포인트 전환 신청",
    meta: "관리자 승인 대기",
    points: amount,
    type: "spend",
  });
  persist();
  render();
  showToast("포인트 전환 신청이 관리자 검증으로 넘어갔습니다.");
}

function reviewRequest(id, status) {
  const request = state.requests.find((item) => item.id === id);
  if (!request) return;
  request.status = status;
  state.history.unshift({
    title: status === "approved" ? "관리자 승인 완료" : "관리자 반려",
    meta: `${request.title} · ${request.points}P`,
    points: request.points,
    type: status === "approved" ? "earn" : "spend",
  });
  persist();
  render();
  showToast(status === "approved" ? "검증을 승인했습니다." : "검증 요청을 반려했습니다.");
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
