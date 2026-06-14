const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;
const SERVER_DIR = process.env.TANGAMJA_SERVER_DIR || "/Users/yangjimin/Documents/Server/Challenge-Test-Server";
const DATA_DIR = path.join(SERVER_DIR, "data");
const STATE_FILE = path.join(DATA_DIR, "state.json");
const PROJECT_SERVER_DIR = path.join(ROOT, "server");
const LEGACY_DATA_DIR = path.join(ROOT, "data");
const PROJECT_STATE_FILE = path.join(PROJECT_SERVER_DIR, "data", "state.json");
const LEGACY_STATE_FILE = path.join(LEGACY_DATA_DIR, "state.json");
const QR_IMAGE_DIR = path.join(SERVER_DIR, "qr-images");
const PROJECT_QR_IMAGE_DIR = path.join(PROJECT_SERVER_DIR, "qr-images");
const LEGACY_QR_IMAGE_DIR = path.join(LEGACY_DATA_DIR, "qr-images");
const PROOF_DIR = path.join(SERVER_DIR, "proofs");
const UPLOAD_DIR = path.join(SERVER_DIR, "uploads");
const FEEDBACK_DIR = path.join(SERVER_DIR, "feedback");
const QR_IMAGE_SEARCH_DIRS = [QR_IMAGE_DIR, PROJECT_QR_IMAGE_DIR, LEGACY_QR_IMAGE_DIR];
const CO2_PER_KM = 0.192;
const POINTS_PER_CO2_KG = 100;
const EARTH_RADIUS_KM = 6371;
const MAX_SAMPLE_COUNT = 1200;
const MAX_QR_FRAME_PIXELS = 900_000;
const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;
const { OFFICIAL_LANDMARKS: landmarks } = require("./landmark-data.js");
const jsQR = loadQrDecoder();

const defaultQrCodes = [
  {
    id: "jeonju-3-1-birthplace",
    landmarkName: "전주3.1운동발상지",
    payload: "TANGAMJA:CHECKIN:JEONJU-3-1-MOVEMENT-BIRTHPLACE:v1",
    imagePath: path.join(QR_IMAGE_DIR, "전주3.1운동발상지.svg"),
    status: "active",
    radiusMeters: 100,
    description: "전주3.1운동발상지 현장 게시용 방문 인증 QR",
    createdAt: "2026-06-13T00:00:00+09:00",
  },
];

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
  qrCodes: defaultQrCodes,
  visitProofs: [],
  uploads: [],
  feedbacks: [],
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

function loadQrDecoder() {
  const decoderPaths = [
    path.join(SERVER_DIR, "vendor", "jsQR.js"),
    path.join(PROJECT_SERVER_DIR, "vendor", "jsQR.js"),
  ];

  for (const decoderPath of decoderPaths) {
    try {
      return require(decoderPath);
    } catch {
      // Try the next configured decoder location.
    }
  }

  throw new Error(`QR 디코더를 찾을 수 없습니다. ${path.join(SERVER_DIR, "vendor", "jsQR.js")} 파일을 확인해주세요.`);
}

async function handleApi(request, response) {
  setApiHeaders(response);
  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, {
      ok: true,
      serverRoot: SERVER_DIR,
      stateFile: STATE_FILE,
      qrImageFolders: QR_IMAGE_SEARCH_DIRS,
      proofFolder: PROOF_DIR,
      uploadFolder: UPLOAD_DIR,
      feedbackFolder: FEEDBACK_DIR,
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/state") {
    sendJson(response, 200, { state: await readState() });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/qr-codes") {
    const state = await readState();
    sendJson(response, 200, { qrCodes: state.qrCodes.map(publicQrCode) });
    return;
  }

  if (request.method === "GET" && /^\/api\/qr-codes\/[^/]+$/.test(url.pathname)) {
    const id = decodeURIComponent(url.pathname.split("/")[3]);
    const state = await readState();
    const qrCode = state.qrCodes.find((item) => item.id === id);
    if (!qrCode) {
      sendJson(response, 404, { error: "등록된 QR 코드를 찾을 수 없습니다." });
      return;
    }
    sendJson(response, 200, { qrCode: publicQrCode(qrCode) });
    return;
  }

  if (request.method === "GET" && /^\/api\/qr-codes\/[^/]+\/image\.svg$/.test(url.pathname)) {
    const id = decodeURIComponent(url.pathname.split("/")[3]);
    await serveQrImage(response, id);
    return;
  }

  if (request.method === "GET" && /^\/api\/uploads\/[^/]+\/file$/.test(url.pathname)) {
    const id = decodeURIComponent(url.pathname.split("/")[3]);
    await serveUploadFile(response, id);
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

  if (request.method === "POST" && url.pathname === "/api/uploads") {
    await saveUpload(response, await readJsonBody(request));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/feedback") {
    await saveFeedback(response, await readJsonBody(request));
    return;
  }

  if (request.method === "PATCH" && url.pathname.startsWith("/api/feedback/")) {
    const id = decodeURIComponent(url.pathname.replace("/api/feedback/", ""));
    await reviewFeedback(response, id, await readJsonBody(request));
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
  const qrCode = findQrCodeForLandmark(state, landmark);
  const qrValidation = await validateQrCapture(qrCode, body);
  if (!qrValidation.ok) {
    sendJson(response, 422, { error: qrValidation.error });
    return;
  }

  const locationValidation = validateCheckinLocation(landmark, qrCode, body.location || body.landmark?.location);
  if (!locationValidation.ok) {
    sendJson(response, 422, { error: locationValidation.error, location: locationValidation });
    return;
  }

  const alreadyChecked = state.history.some((item) => item.title.includes(landmark.name));
  const points = alreadyChecked ? Math.round(landmark.bonus / 3) : landmark.bonus;
  const co2 = round(landmark.distance * CO2_PER_KM, 3);
  const scannedAt = new Date().toISOString();
  const proof = createVisitProof({
    user: body.user || "테스트 라이더",
    landmark,
    qrCode,
    scannedValue: qrValidation.decodedValue,
    qrValidation,
    locationValidation,
    points,
    co2,
    scannedAt,
  });

  state.stats.totalPoints += points;
  state.stats.weeklyPoints[6] += points;
  state.history.unshift({
    title: `${landmark.name} QR 체크인`,
    meta: qrCode ? `서버 QR ${qrCode.id} 현장 인증` : `반경 ${landmark.near}m 현장 인증`,
    points,
    type: "earn",
    proofId: proof.id,
  });
  state.visitProofs.unshift(proof);

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
    proofId: proof.id,
    qrCodeId: qrCode?.id || "legacy-qr",
    evidence: qrCode
      ? `서버 QR 이미지(${qrCode.id})와 촬영 프레임 일치, 기준점 ${locationValidation.distanceMeters}m, 방문 증명 ${proof.id}`
      : `GPS 반경 ${landmark.near}m, QR 스캔 성공, 중복 여부 서버 확인`,
  });

  await writeProofArtifact(proof, { qrValidation, locationValidation });
  trimCollections(state);
  await writeState(state);
  sendJson(response, 201, {
    message: qrCode
      ? `${landmark.name} 서버 QR 이미지와 위치가 일치하여 방문 인증이 저장됐습니다.`
      : "QR 체크인이 서버에 저장되고 보너스 포인트가 적립됐습니다.",
    state,
    proof,
  });
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

async function saveUpload(response, body) {
  const file = body.file || body.upload || {};
  const uploadPayload = decodeUploadPayload(file);
  if (!uploadPayload.ok) {
    sendJson(response, 400, { error: uploadPayload.error });
    return;
  }

  const now = new Date();
  const id = `UP-${now.getTime()}-${Math.random().toString(16).slice(2, 6)}`;
  const folderName = now.toISOString().slice(0, 10).replaceAll("-", "");
  const folderPath = path.join(UPLOAD_DIR, folderName);
  const originalName = sanitizeFileName(file.name || "uploaded-material.bin");
  const storedName = `${id}-${originalName}`;
  const filePath = path.join(folderPath, storedName);

  await fs.mkdir(folderPath, { recursive: true });
  await fs.writeFile(filePath, uploadPayload.buffer);

  const upload = normalizeUpload({
    id,
    user: body.user || "테스트 라이더",
    purpose: body.purpose || "feedback",
    originalName,
    storedName,
    mimeType: uploadPayload.mimeType,
    size: uploadPayload.buffer.length,
    status: "stored",
    filePath: path.relative(SERVER_DIR, filePath),
    url: `/api/uploads/${encodeURIComponent(id)}/file`,
    createdAt: now.toISOString(),
  });

  const state = await readState();
  state.uploads.unshift(upload);
  state.uploads = state.uploads.slice(0, 200);
  await writeState(state);
  sendJson(response, 201, { message: "자료가 서버 업로드 폴더에 저장됐습니다.", state, upload: publicUpload(upload) });
}

async function saveFeedback(response, body) {
  const feedback = normalizeFeedbackInput(body.feedback || body);
  if (!feedback.ok) {
    sendJson(response, 400, { error: feedback.error });
    return;
  }

  const state = await readState();
  const uploadIds = feedback.item.uploadIds.filter((id) => state.uploads.some((upload) => upload.id === id));
  const item = normalizeFeedback({
    ...feedback.item,
    id: `FB-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    uploadIds,
    status: "pending",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  state.feedbacks.unshift(item);
  state.feedbacks = state.feedbacks.slice(0, 200);
  await writeFeedbackArtifact(item, state);
  await writeState(state);
  sendJson(response, 201, { message: "의견과 개선사항이 서버에 등록됐습니다.", state, feedback: item });
}

async function reviewFeedback(response, id, body) {
  const status = String(body.status || "");
  if (!["pending", "in-review", "resolved", "archived"].includes(status)) {
    sendJson(response, 400, { error: "처리 상태는 pending, in-review, resolved, archived 중 하나여야 합니다." });
    return;
  }

  const state = await readState();
  const feedback = state.feedbacks.find((item) => item.id === id);
  if (!feedback) {
    sendJson(response, 404, { error: "등록된 의견을 찾을 수 없습니다." });
    return;
  }

  feedback.status = status;
  feedback.updatedAt = new Date().toISOString();
  if (status === "resolved" || status === "archived") {
    feedback.reviewedAt = feedback.updatedAt;
  }
  if (body.adminNote) {
    feedback.adminNote = String(body.adminNote).trim().slice(0, 400);
  }

  await writeFeedbackArtifact(feedback, state);
  await writeState(state);
  sendJson(response, 200, {
    message: feedbackStatusMessage(status),
    state,
    feedback,
  });
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

  if (relativePath === "server" || relativePath.startsWith(`server${path.sep}`)) {
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

async function serveQrImage(response, id) {
  const state = await readState();
  const qrCode = state.qrCodes.find((item) => item.id === id);
  if (!qrCode) {
    sendJson(response, 404, { error: "등록된 QR 이미지를 찾을 수 없습니다." });
    return;
  }

  try {
    const imagePath = await resolveQrImagePath(qrCode);
    const image = await fs.readFile(imagePath);
    response.writeHead(200, {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(image);
  } catch {
    sendJson(response, 404, { error: "QR 이미지 파일이 서버에 없습니다." });
  }
}

async function serveUploadFile(response, id) {
  const state = await readState();
  const upload = state.uploads.find((item) => item.id === id);
  if (!upload) {
    sendJson(response, 404, { error: "등록된 업로드 자료를 찾을 수 없습니다." });
    return;
  }

  const filePath = path.normalize(path.join(SERVER_DIR, upload.filePath));
  const relativePath = path.relative(UPLOAD_DIR, filePath);
  if (!relativePath || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    sendJson(response, 403, { error: "허용되지 않은 업로드 경로입니다." });
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    response.writeHead(200, {
      "Content-Type": upload.mimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(upload.originalName || upload.id)}`,
      "Cache-Control": "no-store",
    });
    response.end(file);
  } catch {
    sendJson(response, 404, { error: "업로드 파일이 서버 폴더에 없습니다." });
  }
}

async function validateQrCapture(qrCode, body) {
  if (!qrCode) {
    const fallbackValue = normalizeQrPayload(body.qrValue || body.landmark?.qrValue || "");
    if (!fallbackValue) return { ok: false, error: "QR 촬영 정보가 전달되지 않았습니다." };
    return { ok: true, mode: "legacy-client-qr", decodedValue: fallbackValue };
  }

  const frame = normalizeQrFrame(body.qrFrame || body.landmark?.qrFrame);
  if (!frame.ok) return { ok: false, error: frame.error };

  const decodedValue = decodeQrFrame(frame);
  if (!decodedValue) {
    return { ok: false, error: "서버가 촬영 이미지에서 QR을 직접 판독하지 못했습니다. QR을 화면 중앙에 크게 맞춰 다시 스캔해주세요." };
  }

  const expectedValue = normalizeQrPayload(qrCode.payload);
  if (decodedValue !== expectedValue) {
    return { ok: false, error: "촬영한 QR 이미지가 서버에 등록된 QR 이미지와 일치하지 않습니다." };
  }

  const clientValue = normalizeQrPayload(body.qrValue || body.landmark?.qrValue || "");
  if (clientValue && clientValue !== decodedValue) {
    return { ok: false, error: "앱에서 읽은 QR 값과 서버가 촬영 이미지에서 판독한 값이 다릅니다. 다시 스캔해주세요." };
  }

  let storedImagePath;
  let storedImageHash;
  try {
    storedImagePath = await resolveQrImagePath(qrCode);
    storedImageHash = await hashFile(storedImagePath);
  } catch {
    return { ok: false, error: `서버에 등록된 QR 이미지 파일을 찾지 못했습니다. ${QR_IMAGE_DIR} 폴더를 확인해주세요.` };
  }

  return {
    ok: true,
    mode: "server-frame-qr",
    decodedValue,
    frameHash: hashBuffer(frame.rgba),
    frameSize: `${frame.width}x${frame.height}`,
    storedImageHash,
    storedImagePath: path.relative(ROOT, storedImagePath),
  };
}

function normalizeQrFrame(frame) {
  if (!frame || typeof frame !== "object") {
    return { ok: false, error: "서버 판정을 위한 QR 촬영 이미지가 전달되지 않았습니다." };
  }

  const width = Math.round(Number(frame.width));
  const height = Math.round(Number(frame.height));
  const rgbaBase64 = String(frame.rgbaBase64 || "");
  const pixels = width * height;

  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 80 || height < 80) {
    return { ok: false, error: "QR 촬영 이미지 크기가 너무 작습니다. 다시 스캔해주세요." };
  }

  if (pixels > MAX_QR_FRAME_PIXELS) {
    return { ok: false, error: "QR 촬영 이미지가 너무 큽니다. 다시 스캔해주세요." };
  }

  const rgba = Buffer.from(rgbaBase64, "base64");
  if (rgba.length !== pixels * 4) {
    return { ok: false, error: "QR 촬영 이미지 데이터가 올바르지 않습니다." };
  }

  return { ok: true, width, height, rgba };
}

function decodeQrFrame(frame) {
  const data = new Uint8ClampedArray(frame.rgba.buffer, frame.rgba.byteOffset, frame.rgba.byteLength);
  const result = jsQR(data, frame.width, frame.height, { inversionAttempts: "attemptBoth" });
  return normalizeQrPayload(result?.data || "");
}

function validateCheckinLocation(landmark, qrCode, location) {
  const target = normalizeLocation({ lat: landmark.lat, lng: landmark.lng });
  if (!target) {
    return { ok: true, mode: "location-not-configured", distanceMeters: null };
  }

  const current = normalizeLocation(location);
  if (!current) {
    return { ok: false, error: "현재 GPS 좌표가 서버에 전달되지 않았습니다. 위치 권한을 허용한 뒤 다시 스캔해주세요." };
  }

  const accuracy = Number.isFinite(Number(location?.accuracy)) ? Math.max(0, Number(location.accuracy)) : null;
  if (accuracy !== null && accuracy > 100) {
    return { ok: false, error: `GPS 정확도가 낮습니다(±${Math.round(accuracy)}m). 잠시 후 야외에서 다시 스캔해주세요.` };
  }

  const distanceMeters = round(haversineKm(target, current) * 1000, 1);
  const radiusMeters = Math.max(1, Number(qrCode?.radiusMeters || landmark.near || 100));
  const acceptedRadius = radiusMeters + Math.min(50, accuracy || 0);
  const ok = distanceMeters <= acceptedRadius;

  return {
    ok,
    mode: "gps-radius",
    lat: current.lat,
    lng: current.lng,
    targetLat: target.lat,
    targetLng: target.lng,
    accuracy,
    distanceMeters,
    radiusMeters,
    acceptedRadius: round(acceptedRadius, 1),
    error: ok ? "" : `${landmark.name} 기준 위치에서 ${distanceMeters}m 떨어져 있어 인증 반경 ${Math.round(acceptedRadius)}m를 벗어났습니다.`,
  };
}

function normalizeLocation(location) {
  if (!location || typeof location !== "object") return null;
  const lat = Number(location.lat ?? location.latitude);
  const lng = Number(location.lng ?? location.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

async function resolveQrImagePath(qrCode) {
  const candidates = [];
  const imagePath = String(qrCode.imagePath || "").trim();
  const basename = imagePath ? path.basename(imagePath) : "";
  const candidateNames = [...new Set([basename, `${qrCode.id}.svg`, `${qrCode.landmarkName}.svg`].filter(Boolean))];

  if (imagePath) {
    candidates.push(path.isAbsolute(imagePath) ? imagePath : path.join(ROOT, imagePath));
    candidates.push(path.join(SERVER_DIR, imagePath));
  }

  for (const folder of QR_IMAGE_SEARCH_DIRS) {
    candidateNames.forEach((name) => candidates.push(path.join(folder, name)));
  }

  for (const candidate of candidates) {
    const normalized = path.normalize(candidate);
    if (!isPathInAllowedQrFolder(normalized)) continue;
    try {
      const stat = await fs.stat(normalized);
      if (stat.isFile()) return normalized;
    } catch {
      // Try the next registered QR folder/name.
    }
  }

  throw new Error("QR 이미지 파일이 서버에 없습니다.");
}

function isPathInAllowedQrFolder(filePath) {
  return QR_IMAGE_SEARCH_DIRS.some((folder) => {
    const relative = path.relative(folder, filePath);
    return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
  });
}

async function hashFile(filePath) {
  return hashBuffer(await fs.readFile(filePath));
}

function hashBuffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function writeProofArtifact(proof, validation) {
  await fs.mkdir(PROOF_DIR, { recursive: true });
  const filePath = path.join(PROOF_DIR, `${proof.id}.json`);
  await fs.writeFile(filePath, `${JSON.stringify({ proof, validation }, null, 2)}\n`);
}

async function writeFeedbackArtifact(feedback, state) {
  await fs.mkdir(FEEDBACK_DIR, { recursive: true });
  const linkedUploads = feedback.uploadIds
    .map((id) => state.uploads.find((upload) => upload.id === id))
    .filter(Boolean)
    .map(publicUpload);
  const filePath = path.join(FEEDBACK_DIR, `${feedback.id}.json`);
  await fs.writeFile(filePath, `${JSON.stringify({ feedback, uploads: linkedUploads }, null, 2)}\n`);
}

async function readState() {
  await ensureServerDirectories();
  try {
    const raw = await fs.readFile(STATE_FILE, "utf8");
    return normalizeState(JSON.parse(raw));
  } catch {
    for (const fallbackFile of [PROJECT_STATE_FILE, LEGACY_STATE_FILE]) {
      try {
        const raw = await fs.readFile(fallbackFile, "utf8");
        const state = normalizeState(JSON.parse(raw));
        await writeState(state);
        return state;
      } catch {
        // Try the next known state location.
      }
    }

    const state = structuredClone(defaultState);
    await writeState(state);
    return state;
  }
}

async function writeState(state) {
  await ensureServerDirectories();
  await fs.writeFile(STATE_FILE, `${JSON.stringify(normalizeState(state), null, 2)}\n`);
}

async function ensureServerDirectories() {
  await Promise.all([
    fs.mkdir(DATA_DIR, { recursive: true }),
    fs.mkdir(PROOF_DIR, { recursive: true }),
    fs.mkdir(UPLOAD_DIR, { recursive: true }),
    fs.mkdir(FEEDBACK_DIR, { recursive: true }),
    fs.mkdir(QR_IMAGE_DIR, { recursive: true }),
  ]);
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
    qrCodes: mergeQrCodes(state.qrCodes),
    visitProofs: Array.isArray(state.visitProofs)
      ? state.visitProofs.map(normalizeVisitProof).filter(Boolean).slice(0, 100)
      : [],
    uploads: Array.isArray(state.uploads)
      ? state.uploads.map(normalizeUpload).filter(Boolean).slice(0, 200)
      : [],
    feedbacks: Array.isArray(state.feedbacks)
      ? state.feedbacks.map(normalizeFeedback).filter(Boolean).slice(0, 200)
      : [],
    history: Array.isArray(state.history) ? state.history : [...defaultState.history],
    requests: Array.isArray(state.requests) ? state.requests : [...defaultState.requests],
  };
}

function mergeQrCodes(qrCodes) {
  const merged = new Map(defaultQrCodes.map((qrCode) => [qrCode.id, normalizeQrCode(qrCode)]));
  if (Array.isArray(qrCodes)) {
    qrCodes.forEach((qrCode) => {
      const normalized = normalizeQrCode(qrCode);
      if (normalized) merged.set(normalized.id, { ...merged.get(normalized.id), ...normalized });
    });
  }
  return [...merged.values()];
}

function normalizeQrCode(qrCode) {
  if (!qrCode || typeof qrCode !== "object" || !qrCode.id || !qrCode.payload) return null;
  return {
    id: String(qrCode.id).trim(),
    landmarkName: String(qrCode.landmarkName || "").trim(),
    payload: String(qrCode.payload),
    imagePath: String(qrCode.imagePath || ""),
    status: qrCode.status === "inactive" ? "inactive" : "active",
    radiusMeters: Math.max(1, Number(qrCode.radiusMeters) || 100),
    description: String(qrCode.description || ""),
    createdAt: String(qrCode.createdAt || new Date().toISOString()),
  };
}

function publicQrCode(qrCode) {
  return {
    id: qrCode.id,
    landmarkName: qrCode.landmarkName,
    status: qrCode.status,
    radiusMeters: qrCode.radiusMeters,
    description: qrCode.description,
    imageUrl: `/api/qr-codes/${encodeURIComponent(qrCode.id)}/image.svg`,
    createdAt: qrCode.createdAt,
  };
}

function decodeUploadPayload(file) {
  if (!file || typeof file !== "object") {
    return { ok: false, error: "업로드할 자료가 없습니다." };
  }

  let mimeType = String(file.type || "application/octet-stream").trim().slice(0, 120) || "application/octet-stream";
  let base64 = String(file.base64 || file.dataBase64 || "").trim();
  const dataUrl = String(file.dataUrl || "");
  const dataUrlMatch = dataUrl.match(/^data:([^;,]+)?;base64,(.+)$/);
  if (!base64 && dataUrlMatch) {
    mimeType = dataUrlMatch[1] || mimeType;
    base64 = dataUrlMatch[2];
  }

  if (!base64) {
    return { ok: false, error: "업로드 파일 데이터가 전달되지 않았습니다." };
  }

  if (!/^[A-Za-z0-9+/=\s]+$/.test(base64)) {
    return { ok: false, error: "업로드 파일 인코딩이 올바르지 않습니다." };
  }

  const buffer = Buffer.from(base64.replace(/\s/g, ""), "base64");
  if (!buffer.length) {
    return { ok: false, error: "비어 있는 파일은 업로드할 수 없습니다." };
  }

  if (buffer.length > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "업로드 파일은 6MB 이하만 저장할 수 있습니다." };
  }

  return { ok: true, buffer, mimeType };
}

function normalizeUpload(upload) {
  if (!upload || typeof upload !== "object" || !upload.id) return null;
  const filePath = String(upload.filePath || "").replaceAll("\\", "/");
  return {
    id: String(upload.id),
    user: String(upload.user || "테스트 라이더").slice(0, 80),
    purpose: String(upload.purpose || "feedback").slice(0, 40),
    originalName: sanitizeFileName(upload.originalName || upload.name || "uploaded-material.bin"),
    storedName: sanitizeFileName(upload.storedName || upload.originalName || upload.id),
    mimeType: String(upload.mimeType || "application/octet-stream").slice(0, 120),
    size: Math.max(0, Math.round(Number(upload.size) || 0)),
    status: upload.status === "deleted" ? "deleted" : "stored",
    filePath,
    url: upload.url || `/api/uploads/${encodeURIComponent(upload.id)}/file`,
    createdAt: String(upload.createdAt || new Date().toISOString()),
  };
}

function publicUpload(upload) {
  return {
    id: upload.id,
    originalName: upload.originalName,
    mimeType: upload.mimeType,
    size: upload.size,
    status: upload.status,
    url: upload.url,
    createdAt: upload.createdAt,
  };
}

function normalizeFeedbackInput(input) {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "등록할 의견 내용이 없습니다." };
  }

  const title = String(input.title || "").trim().slice(0, 120);
  const message = String(input.message || input.body || "").trim().slice(0, 2000);
  if (!title && !message) {
    return { ok: false, error: "제목 또는 의견 내용을 입력해주세요." };
  }

  const category = normalizeFeedbackCategory(input.category);
  const priority = ["low", "normal", "high"].includes(String(input.priority || "")) ? String(input.priority) : "normal";
  const uploadIds = Array.isArray(input.uploadIds) ? input.uploadIds.map((id) => String(id)).slice(0, 10) : [];

  return {
    ok: true,
    item: {
      category,
      priority,
      title: title || feedbackCategoryLabel(category),
      message: message || "첨부 자료 확인 요청",
      user: String(input.user || "테스트 라이더").trim().slice(0, 80),
      email: String(input.email || "").trim().slice(0, 120),
      uploadIds,
    },
  };
}

function normalizeFeedback(feedback) {
  if (!feedback || typeof feedback !== "object" || !feedback.id) return null;
  const status = ["pending", "in-review", "resolved", "archived"].includes(String(feedback.status))
    ? String(feedback.status)
    : "pending";

  const normalized = {
    id: String(feedback.id),
    category: normalizeFeedbackCategory(feedback.category),
    priority: ["low", "normal", "high"].includes(String(feedback.priority)) ? String(feedback.priority) : "normal",
    title: String(feedback.title || "의견").trim().slice(0, 120),
    message: String(feedback.message || "").trim().slice(0, 2000),
    user: String(feedback.user || "테스트 라이더").trim().slice(0, 80),
    email: String(feedback.email || "").trim().slice(0, 120),
    uploadIds: Array.isArray(feedback.uploadIds) ? feedback.uploadIds.map((id) => String(id)).slice(0, 10) : [],
    status,
    createdAt: String(feedback.createdAt || new Date().toISOString()),
    updatedAt: String(feedback.updatedAt || feedback.createdAt || new Date().toISOString()),
  };

  if (feedback.reviewedAt) normalized.reviewedAt = String(feedback.reviewedAt);
  if (feedback.adminNote) normalized.adminNote = String(feedback.adminNote).trim().slice(0, 400);
  return normalized;
}

function normalizeFeedbackCategory(category) {
  const value = String(category || "").toLowerCase();
  return ["opinion", "improvement", "bug", "upload", "other"].includes(value) ? value : "opinion";
}

function feedbackCategoryLabel(category) {
  return {
    opinion: "의견",
    improvement: "개선사항",
    bug: "오류 제보",
    upload: "자료 업로드",
    other: "기타",
  }[category] || "의견";
}

function feedbackStatusMessage(status) {
  return {
    pending: "의견을 대기 상태로 변경했습니다.",
    "in-review": "의견을 검토 중으로 변경했습니다.",
    resolved: "의견을 완료 처리했습니다.",
    archived: "의견을 보관 처리했습니다.",
  }[status] || "의견 상태를 변경했습니다.";
}

function sanitizeFileName(value) {
  const fallback = "uploaded-material.bin";
  const filename = path.basename(String(value || fallback)).normalize("NFC");
  const sanitized = filename
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return sanitized && sanitized !== "." && sanitized !== ".." ? sanitized : fallback;
}

function findQrCodeForLandmark(state, landmark) {
  if (!landmark?.qrCodeId) return null;
  return state.qrCodes.find((qrCode) => qrCode.id === landmark.qrCodeId && qrCode.status === "active") || null;
}

function normalizeQrPayload(value) {
  return String(value || "").trim();
}

function createVisitProof({ user, landmark, qrCode, scannedValue, qrValidation, locationValidation, points, co2, scannedAt }) {
  const hash = crypto
    .createHash("sha256")
    .update([
      user,
      landmark.id,
      qrCode?.id || "legacy",
      scannedValue,
      qrValidation?.frameHash || "",
      locationValidation?.distanceMeters ?? "",
      scannedAt,
    ].join("|"))
    .digest("hex");

  return {
    id: `PROOF-${Date.now()}-${hash.slice(0, 8)}`,
    user,
    landmarkId: landmark.id,
    landmarkName: landmark.name,
    qrCodeId: qrCode?.id || "legacy-qr",
    scannedAt,
    points,
    co2,
    status: "pending-admin-review",
    qrValidationMode: qrValidation?.mode || "unknown",
    qrFrameHash: qrValidation?.frameHash || "",
    storedQrImageHash: qrValidation?.storedImageHash || "",
    locationMode: locationValidation?.mode || "unknown",
    distanceMeters: locationValidation?.distanceMeters ?? null,
    radiusMeters: locationValidation?.radiusMeters ?? null,
    evidenceHash: hash,
  };
}

function normalizeVisitProof(proof) {
  if (!proof || typeof proof !== "object" || !proof.id) return null;
  return {
    id: String(proof.id),
    user: String(proof.user || "테스트 라이더"),
    landmarkId: String(proof.landmarkId || ""),
    landmarkName: String(proof.landmarkName || ""),
    qrCodeId: String(proof.qrCodeId || "legacy-qr"),
    scannedAt: String(proof.scannedAt || new Date().toISOString()),
    points: Number(proof.points) || 0,
    co2: Number(proof.co2) || 0,
    status: String(proof.status || "pending-admin-review"),
    qrValidationMode: String(proof.qrValidationMode || "unknown"),
    qrFrameHash: String(proof.qrFrameHash || ""),
    storedQrImageHash: String(proof.storedQrImageHash || ""),
    locationMode: String(proof.locationMode || "unknown"),
    distanceMeters: proof.distanceMeters === null ? null : nullableNumber(proof.distanceMeters),
    radiusMeters: proof.radiusMeters === null ? null : nullableNumber(proof.radiusMeters),
    evidenceHash: String(proof.evidenceHash || ""),
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

function setApiHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Cache-Control", "no-store");
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
  if (Array.isArray(state.uploads)) {
    state.uploads = state.uploads.slice(0, 200);
  }
  if (Array.isArray(state.feedbacks)) {
    state.feedbacks = state.feedbacks.slice(0, 200);
  }
  if (Array.isArray(state.visitProofs)) {
    state.visitProofs = state.visitProofs.slice(0, 100);
  }
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
