const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const STATE_FILE = path.join(DATA_DIR, "state.json");
const CO2_PER_KM = 0.192;
const POINTS_PER_CO2_KG = 100;
const EARTH_RADIUS_KM = 6371;
const MAX_SAMPLE_COUNT = 1200;
const { OFFICIAL_LANDMARKS: landmarks } = require("./landmark-data.js");

const defaultState = {
  account: {
    loggedIn: false,
    provider: "guest",
    name: "게스트 라이더",
    email: "",
  },
  accounts: [],
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
  liveRides: [],
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

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

const server = http.createServer(async (request, response) => {
  try {
    if (request.url.startsWith("/api/")) {
      await handleApi(request, response);
      return;
    }

    await serveStatic(request, response);
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: "서버 내부 오류가 발생했습니다." });
  }
});

server.listen(PORT, () => {
  console.log(`Tangamja server running at http://localhost:${PORT}`);
});

async function handleApi(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, { ok: true, stateFile: path.relative(ROOT, STATE_FILE) });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/state") {
    sendJson(response, 200, { state: await readState() });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/account") {
    await saveAccount(response, await readJsonBody(request));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/account/logout") {
    await logoutAccount(response);
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/rides/start") {
    await startRideSession(response, await readJsonBody(request));
    return;
  }

  if (request.method === "POST" && /^\/api\/rides\/[^/]+\/samples$/.test(url.pathname)) {
    const id = decodeURIComponent(url.pathname.split("/")[3]);
    await saveRideSamples(response, id, await readJsonBody(request));
    return;
  }

  if (request.method === "POST" && /^\/api\/rides\/[^/]+\/finish$/.test(url.pathname)) {
    const id = decodeURIComponent(url.pathname.split("/")[3]);
    await finishRideSession(response, id, await readJsonBody(request));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/rides") {
    await saveRide(response, await readJsonBody(request));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/checkins") {
    await saveCheckin(response, await readJsonBody(request));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/exchanges") {
    await requestExchange(response, await readJsonBody(request));
    return;
  }

  if (request.method === "PATCH" && url.pathname.startsWith("/api/requests/")) {
    const id = decodeURIComponent(url.pathname.replace("/api/requests/", ""));
    await reviewRequest(response, id, await readJsonBody(request));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/reset") {
    const state = structuredClone(defaultState);
    await writeState(state);
    sendJson(response, 200, { message: "서버 상태를 초기화했습니다.", state });
    return;
  }

  sendJson(response, 404, { error: "API 경로를 찾을 수 없습니다." });
}

async function saveAccount(response, body) {
  const account = normalizeAccount(body.account || body);
  if (!account.loggedIn || !["email", "strava"].includes(account.provider)) {
    sendJson(response, 400, { error: "저장 가능한 로그인 계정 정보가 필요합니다." });
    return;
  }

  const state = await readState();
  account.updatedAt = new Date().toISOString();
  const accountKey = `${account.provider}:${account.email || account.name}`.toLowerCase();
  const existingIndex = state.accounts.findIndex((item) => {
    const key = `${item.provider}:${item.email || item.name}`.toLowerCase();
    return key === accountKey;
  });

  if (existingIndex >= 0) {
    state.accounts[existingIndex] = { ...state.accounts[existingIndex], ...account };
  } else {
    state.accounts.unshift(account);
  }

  state.account = account;
  state.accounts = state.accounts.slice(0, 100);
  await writeState(state);
  sendJson(response, 200, {
    message: `${account.provider === "strava" ? "Strava" : "이메일"} 계정이 서버에 등록됐습니다.`,
    state,
    account,
  });
}

async function logoutAccount(response) {
  const state = await readState();
  state.account = structuredClone(defaultState.account);
  await writeState(state);
  sendJson(response, 200, { message: "서버 계정 세션을 종료했습니다.", state });
}

async function startRideSession(response, body) {
  const state = await readState();
  const user = body.user || "테스트 라이더";
  const existing = state.liveRides.find((ride) => ride.user === user && ride.status === "active");

  if (existing) {
    sendJson(response, 200, { message: "진행 중인 라이딩 세션을 이어갑니다.", state, activeRide: existing });
    return;
  }

  const now = new Date().toISOString();
  const activeRide = {
    id: `RIDE-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    user,
    status: "active",
    startedAt: now,
    updatedAt: now,
    seconds: 0,
    distance: 0,
    speed: 0,
    samples: [],
  };

  state.liveRides.unshift(activeRide);
  await writeState(state);
  sendJson(response, 201, { message: "GPS 라이딩 세션이 서버에 생성됐습니다.", state, activeRide });
}

async function saveRideSamples(response, id, body) {
  const state = await readState();
  const activeRide = state.liveRides.find((ride) => ride.id === id && ride.status === "active");

  if (!activeRide) {
    sendJson(response, 404, { error: "진행 중인 라이딩 세션을 찾을 수 없습니다." });
    return;
  }

  const samples = Array.isArray(body.samples) ? body.samples : [body.sample].filter(Boolean);
  const acceptedSamples = samples.map(normalizeSample).filter(Boolean);

  if (!acceptedSamples.length) {
    sendJson(response, 400, { error: "저장 가능한 GPS 샘플이 없습니다." });
    return;
  }

  acceptedSamples.forEach((sample) => appendSample(activeRide, sample));
  activeRide.samples = activeRide.samples.slice(-MAX_SAMPLE_COUNT);
  activeRide.sampleCount = activeRide.samples.length;
  activeRide.updatedAt = new Date().toISOString();

  await writeState(state);
  sendJson(response, 200, { message: `${acceptedSamples.length}개 GPS 샘플을 서버에 저장했습니다.`, state, activeRide });
}

async function finishRideSession(response, id, body) {
  const state = await readState();
  const activeRide = state.liveRides.find((ride) => ride.id === id && ride.status === "active");

  if (!activeRide) {
    sendJson(response, 404, { error: "진행 중인 라이딩 세션을 찾을 수 없습니다." });
    return;
  }

  if (activeRide.distance < 0.02 || activeRide.samples.length < 2) {
    sendJson(response, 400, { error: "포인트 등록을 위해 GPS 샘플 2개 이상과 최소 0.02km 기록이 필요합니다." });
    return;
  }

  const distance = round(activeRide.distance, 3);
  const seconds = Math.max(0, Math.round(activeRide.seconds || 0));
  const speed = seconds > 0 ? round(distance / (seconds / 3600), 1) : round(activeRide.speed || 0, 1);
  const co2 = round(distance * CO2_PER_KM, 3);
  const points = Math.max(1, Math.round(co2 * POINTS_PER_CO2_KG));
  const acceptedCount = activeRide.samples.filter((sample) => sample.accepted).length;

  state.stats.totalCo2 = round(state.stats.totalCo2 + co2, 3);
  state.stats.totalPoints += points;
  state.stats.weeklyDistance = round(state.stats.weeklyDistance + distance, 2);
  state.stats.weeklyPoints[6] += points;
  state.stats.rides += 1;
  state.history.unshift({
    title: "GPS 자전거 주행 기록",
    meta: `${distance.toFixed(2)}km · ${co2.toFixed(2)}kgCO2e 절감 · GPS ${acceptedCount}개`,
    points,
    type: "earn",
  });
  state.requests.unshift({
    id: createRequestId(),
    title: "GPS 주행 기록 검증",
    user: body.user || activeRide.user,
    distance,
    co2,
    points,
    status: "pending",
    evidence: `GPS 샘플 ${activeRide.samples.length}개, 유효 샘플 ${acceptedCount}개, 평균속도 ${speed.toFixed(1)}km/h, 시간 ${formatTime(seconds)}`,
  });

  state.liveRides = state.liveRides.filter((ride) => ride.id !== id);
  trimCollections(state);
  await writeState(state);
  sendJson(response, 201, { message: `${points}P가 서버에 자동 등록되고 관리자 검증 대기열에 올라갔습니다.`, state });
}

async function saveRide(response, body) {
  const ride = body.ride || {};
  const distance = Number(ride.distance);
  const seconds = Math.max(0, Math.round(Number(ride.seconds) || 0));
  const speed = Number(ride.speed) || 0;

  if (!Number.isFinite(distance) || distance < 0.05) {
    sendJson(response, 400, { error: "최소 0.05km 이상의 주행 기록이 필요합니다." });
    return;
  }

  const co2 = round(distance * CO2_PER_KM, 3);
  const points = Math.max(1, Math.round(co2 * POINTS_PER_CO2_KG));
  const state = await readState();

  state.stats.totalCo2 = round(state.stats.totalCo2 + co2, 3);
  state.stats.totalPoints += points;
  state.stats.weeklyDistance = round(state.stats.weeklyDistance + distance, 2);
  state.stats.weeklyPoints[6] += points;
  state.stats.rides += 1;
  state.history.unshift({
    title: "자전거 주행 기록",
    meta: `${distance.toFixed(2)}km · ${co2.toFixed(2)}kgCO2e 절감`,
    points,
    type: "earn",
  });
  state.requests.unshift({
    id: createRequestId(),
    title: "주행 기록 검증",
    user: body.user || "테스트 라이더",
    distance,
    co2,
    points,
    status: "pending",
    evidence: `GPS 경로 저장, 평균속도 ${speed.toFixed(1)}km/h, 시간 ${formatTime(seconds)}`,
  });

  trimCollections(state);
  await writeState(state);
  sendJson(response, 201, { message: `${points}P가 서버에 적립되고 검증 대기열에 등록됐습니다.`, state });
}

async function saveCheckin(response, body) {
  const landmark = landmarks[Number(body.landmarkIndex)];
  if (!landmark) {
    sendJson(response, 400, { error: "존재하지 않는 명소입니다." });
    return;
  }

  const state = await readState();
  const alreadyChecked = state.history.some((item) => item.title.includes(landmark.name));
  const points = alreadyChecked ? Math.round(landmark.bonus / 3) : landmark.bonus;
  const co2 = round(landmark.distance * CO2_PER_KM, 3);

  state.stats.totalPoints += points;
  state.stats.weeklyPoints[6] += points;
  state.history.unshift({
    title: `${landmark.name} QR 체크인`,
    meta: `반경 ${landmark.near}m 현장 인증`,
    points,
    type: "earn",
  });

  addUnique(state.badges.mission, "명소 체크인");
  if (state.history.filter((item) => item.title.includes("QR 체크인")).length >= 3) {
    addUnique(state.badges.special, "그린 라이더");
  }

  state.requests.unshift({
    id: createRequestId(),
    title: `${landmark.name} QR 인증`,
    user: body.user || "테스트 라이더",
    distance: landmark.distance,
    co2,
    points,
    status: "pending",
    evidence: `GPS 반경 ${landmark.near}m, QR 스캔 성공, 중복 여부 서버 확인`,
  });

  trimCollections(state);
  await writeState(state);
  sendJson(response, 201, { message: "QR 체크인이 서버에 저장되고 보너스 포인트가 적립됐습니다.", state });
}

async function requestExchange(response, body) {
  const state = await readState();
  const amount = Math.min(5000, Math.floor(state.stats.totalPoints / 100) * 100);

  if (amount <= 0) {
    sendJson(response, 400, { error: "신청 가능한 포인트가 없습니다." });
    return;
  }

  state.requests.unshift({
    id: createRequestId(),
    title: "포인트 전환 신청",
    user: body.user || "테스트 라이더",
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

  trimCollections(state);
  await writeState(state);
  sendJson(response, 201, { message: "포인트 전환 신청이 서버에 등록됐습니다.", state });
}

async function reviewRequest(response, id, body) {
  const status = body.status;
  if (!["approved", "rejected"].includes(status)) {
    sendJson(response, 400, { error: "승인 상태는 approved 또는 rejected 여야 합니다." });
    return;
  }

  const state = await readState();
  const request = state.requests.find((item) => item.id === id);
  if (!request) {
    sendJson(response, 404, { error: "검증 요청을 찾을 수 없습니다." });
    return;
  }

  request.status = status;
  request.reviewedAt = new Date().toISOString();
  state.history.unshift({
    title: status === "approved" ? "관리자 승인 완료" : "관리자 반려",
    meta: `${request.title} · ${request.points}P`,
    points: request.points,
    type: status === "approved" ? "earn" : "spend",
  });

  trimCollections(state);
  await writeState(state);
  sendJson(response, 200, {
    message: status === "approved" ? "검증을 승인했습니다." : "검증 요청을 반려했습니다.",
    state,
  });
}

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(ROOT, pathname));
  const relativePath = path.relative(ROOT, filePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    const contentType = mimeTypes[path.extname(filePath)] || "application/octet-stream";
    response.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-cache",
    });
    response.end(file);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

async function readState() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(STATE_FILE, "utf8");
    return normalizeState(JSON.parse(raw));
  } catch {
    const state = structuredClone(defaultState);
    await writeState(state);
    return state;
  }
}

async function writeState(state) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(STATE_FILE, `${JSON.stringify(normalizeState(state), null, 2)}\n`);
}

function normalizeState(state) {
  return {
    account: normalizeAccount(state.account),
    accounts: Array.isArray(state.accounts)
      ? state.accounts.map(normalizeAccount).filter((account) => account.loggedIn).slice(0, 100)
      : [],
    stats: {
      ...defaultState.stats,
      ...(state.stats || {}),
      weeklyPoints: Array.isArray(state.stats?.weeklyPoints)
        ? [...state.stats.weeklyPoints].slice(0, 7).concat(Array(7).fill(0)).slice(0, 7)
        : [...defaultState.stats.weeklyPoints],
    },
    badges: {
      growth: Array.isArray(state.badges?.growth) ? state.badges.growth : [...defaultState.badges.growth],
      mission: Array.isArray(state.badges?.mission) ? state.badges.mission : [...defaultState.badges.mission],
      special: Array.isArray(state.badges?.special) ? state.badges.special : [...defaultState.badges.special],
    },
    liveRides: Array.isArray(state.liveRides)
      ? state.liveRides.map(normalizeRideSession).filter(Boolean).slice(0, 20)
      : [],
    history: Array.isArray(state.history) ? state.history : [...defaultState.history],
    requests: Array.isArray(state.requests) ? state.requests : [...defaultState.requests],
  };
}

function normalizeAccount(account) {
  if (!account || typeof account !== "object") return structuredClone(defaultState.account);

  const rawProvider = String(account.provider || "guest").toLowerCase();
  const provider = ["email", "strava"].includes(rawProvider) ? rawProvider : "guest";
  const loggedIn = Boolean(account.loggedIn && provider !== "guest");
  const name = String(account.name || "").trim().slice(0, 80);
  const email = String(account.email || "").trim().slice(0, 120);
  const normalized = {
    loggedIn,
    provider: loggedIn ? provider : "guest",
    name: loggedIn ? name || "라이더" : "게스트 라이더",
    email: loggedIn ? email : "",
  };

  if (account.updatedAt) {
    normalized.updatedAt = String(account.updatedAt);
  }

  return normalized;
}

function normalizeRideSession(ride) {
  if (!ride || typeof ride !== "object" || !ride.id) return null;
  return {
    id: String(ride.id),
    user: ride.user || "테스트 라이더",
    status: ride.status === "active" ? "active" : "completed",
    startedAt: ride.startedAt || new Date().toISOString(),
    updatedAt: ride.updatedAt || ride.startedAt || new Date().toISOString(),
    seconds: Number(ride.seconds) || 0,
    distance: Number(ride.distance) || 0,
    speed: Number(ride.speed) || 0,
    sampleCount: Number(ride.sampleCount || ride.samples?.length || 0),
    samples: Array.isArray(ride.samples) ? ride.samples.map(normalizeSample).filter(Boolean).slice(-MAX_SAMPLE_COUNT) : [],
  };
}

function normalizeSample(sample) {
  if (!sample || typeof sample !== "object") return null;
  const lat = Number(sample.lat);
  const lng = Number(sample.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return null;
  }

  const date = new Date(sample.timestamp || Date.now());
  const timestamp = Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();

  return {
    lat,
    lng,
    accuracy: nullableNumber(sample.accuracy),
    altitude: nullableNumber(sample.altitude),
    heading: nullableNumber(sample.heading),
    speed: nullableNumber(sample.speed),
    timestamp,
    accepted: sample.accepted === false ? false : true,
    incrementKm: Number(sample.incrementKm) || 0,
  };
}

function appendSample(ride, sample) {
  const previous = ride.samples[ride.samples.length - 1];
  let incrementKm = 0;
  let accepted = true;

  if (previous) {
    const distanceKm = haversineKm(previous, sample);
    const elapsedSeconds = Math.max(1, (new Date(sample.timestamp).getTime() - new Date(previous.timestamp).getTime()) / 1000);
    const maxPlausibleKm = Math.max(0.03, (elapsedSeconds * 25) / 1000);
    accepted = (sample.accuracy === null || sample.accuracy <= 80) && distanceKm <= maxPlausibleKm;
    incrementKm = accepted && distanceKm >= 0.003 ? distanceKm : 0;
  } else {
    accepted = sample.accuracy === null || sample.accuracy <= 100;
  }

  const elapsedFromStart = Math.max(0, (new Date(sample.timestamp).getTime() - new Date(ride.startedAt).getTime()) / 1000);
  const sampleSpeedKmh = sample.speed !== null ? sample.speed * 3.6 : null;

  sample.accepted = accepted;
  sample.incrementKm = round(incrementKm, 5);
  ride.distance = round((Number(ride.distance) || 0) + incrementKm, 5);
  ride.seconds = Math.max(Number(ride.seconds) || 0, Math.round(elapsedFromStart));
  ride.speed = sampleSpeedKmh !== null && accepted ? round(sampleSpeedKmh, 1) : estimateAverageSpeed(ride);
  ride.samples.push(sample);
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function trimCollections(state) {
  state.history = state.history.slice(0, 60);
  state.requests = state.requests.slice(0, 60);
}

function addUnique(list, value) {
  if (!list.includes(value)) list.push(value);
}

function round(value, digits) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function nullableNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function haversineKm(a, b) {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function estimateAverageSpeed(ride) {
  if (!ride.seconds || ride.seconds <= 0) return 0;
  return round((ride.distance / (ride.seconds / 3600)), 1);
}

function createRequestId() {
  return `REQ-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remain = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`;
}
