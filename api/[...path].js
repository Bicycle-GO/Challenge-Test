const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { OFFICIAL_LANDMARKS: landmarks } = require("../landmark-data.js");

const ROOT = path.join(__dirname, "..");
const CO2_PER_KM = 0.192;
const POINTS_PER_CO2_KG = 100;
const EARTH_RADIUS_KM = 6371;
const QR_IMAGE_PATH = path.join(ROOT, "data", "qr-images", "jeonju-3-1-birthplace.svg");
const QR_DECODER_PATH = path.join(ROOT, "server", "vendor", "jsQR.js");
const jsQR = require(QR_DECODER_PATH);

const defaultQrCodes = [
  {
    id: "jeonju-3-1-birthplace",
    landmarkName: "전주3.1운동발상지",
    payload: "TANGAMJA:CHECKIN:JEONJU-3-1-MOVEMENT-BIRTHPLACE:v1",
    imagePath: "data/qr-images/jeonju-3-1-birthplace.svg",
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

const stateStore = globalThis.__TANGAMJA_VERCEL_STATE__ || clone(defaultState);
globalThis.__TANGAMJA_VERCEL_STATE__ = stateStore;

module.exports = async function handler(request, response) {
  setApiHeaders(response);

  if (request.method === "OPTIONS") {
    response.statusCode = 204;
    response.end();
    return;
  }

  try {
    const url = new URL(request.url, `https://${request.headers.host || "localhost"}`);
    const route = url.pathname;

    if (request.method === "GET" && route === "/api/health") {
      sendJson(response, 200, {
        ok: true,
        runtime: "vercel-function",
        persistence: "in-memory-preview",
        qrImage: "data/qr-images/jeonju-3-1-birthplace.svg",
      });
      return;
    }

    if (request.method === "GET" && route === "/api/state") {
      sendJson(response, 200, { state: normalizeState(stateStore) });
      return;
    }

    if (request.method === "GET" && route === "/api/qr-codes") {
      sendJson(response, 200, { qrCodes: stateStore.qrCodes.map(publicQrCode) });
      return;
    }

    const qrImageMatch = route.match(/^\/api\/qr-codes\/([^/]+)\/image\.svg$/);
    if (request.method === "GET" && qrImageMatch) {
      serveQrImage(response, decodeURIComponent(qrImageMatch[1]));
      return;
    }

    const qrDetailMatch = route.match(/^\/api\/qr-codes\/([^/]+)$/);
    if (request.method === "GET" && qrDetailMatch) {
      const qrCode = stateStore.qrCodes.find((item) => item.id === decodeURIComponent(qrDetailMatch[1]));
      if (!qrCode) {
        sendJson(response, 404, { error: "등록된 QR 코드를 찾을 수 없습니다." });
        return;
      }
      sendJson(response, 200, { qrCode: publicQrCode(qrCode) });
      return;
    }

    const uploadFileMatch = route.match(/^\/api\/uploads\/([^/]+)\/file$/);
    if (request.method === "GET" && uploadFileMatch) {
      sendJson(response, 410, { error: "미리보기 API는 업로드 파일 다운로드를 지원하지 않습니다." });
      return;
    }

    if (request.method === "POST" && route === "/api/account") {
      await saveAccount(response, await readJsonBody(request));
      return;
    }

    if (request.method === "POST" && route === "/api/account/logout") {
      stateStore.account = clone(defaultState.account);
      sendJson(response, 200, { message: "서버 계정 세션을 종료했습니다.", state: normalizeState(stateStore) });
      return;
    }

    if (request.method === "POST" && route === "/api/rides/start") {
      await startRideSession(response, await readJsonBody(request));
      return;
    }

    const sampleMatch = route.match(/^\/api\/rides\/([^/]+)\/samples$/);
    if (request.method === "POST" && sampleMatch) {
      await saveRideSamples(response, decodeURIComponent(sampleMatch[1]), await readJsonBody(request));
      return;
    }

    const finishMatch = route.match(/^\/api\/rides\/([^/]+)\/finish$/);
    if (request.method === "POST" && finishMatch) {
      await finishRideSession(response, decodeURIComponent(finishMatch[1]), await readJsonBody(request));
      return;
    }

    if (request.method === "POST" && route === "/api/rides") {
      await saveRide(response, await readJsonBody(request));
      return;
    }

    if (request.method === "POST" && route === "/api/checkins") {
      await saveCheckin(response, await readJsonBody(request));
      return;
    }

    if (request.method === "POST" && route === "/api/uploads") {
      await saveUpload(response, await readJsonBody(request));
      return;
    }

    if (request.method === "POST" && route === "/api/feedback") {
      await saveFeedback(response, await readJsonBody(request));
      return;
    }

    if (request.method === "POST" && route === "/api/exchanges") {
      const amount = Math.min(5000, Math.floor(stateStore.stats.totalPoints / 100) * 100);
      if (amount <= 0) {
        sendJson(response, 400, { error: "신청 가능한 포인트가 없습니다." });
        return;
      }
      stateStore.history.unshift({
        title: "포인트 전환 신청",
        meta: `${amount}P 전환 검토 중`,
        points: -amount,
        type: "spend",
      });
      stateStore.requests.unshift({
        id: createRequestId(),
        title: "포인트 전환 신청",
        user: (await readJsonBody(request)).user || "테스트 라이더",
        distance: 0,
        co2: 0,
        points: amount,
        status: "pending",
        evidence: "Vercel API에서 포인트 전환 신청 접수",
      });
      trimCollections(stateStore);
      sendJson(response, 201, { message: "포인트 전환 신청이 서버에 등록됐습니다.", state: normalizeState(stateStore) });
      return;
    }

    const requestMatch = route.match(/^\/api\/requests\/([^/]+)$/);
    if (request.method === "PATCH" && requestMatch) {
      await reviewRequest(response, decodeURIComponent(requestMatch[1]), await readJsonBody(request));
      return;
    }

    const feedbackMatch = route.match(/^\/api\/feedback\/([^/]+)$/);
    if (request.method === "PATCH" && feedbackMatch) {
      await reviewFeedback(response, decodeURIComponent(feedbackMatch[1]), await readJsonBody(request));
      return;
    }

    if (request.method === "POST" && route === "/api/reset") {
      Object.assign(stateStore, clone(defaultState));
      sendJson(response, 200, { message: "서버 상태를 초기화했습니다.", state: normalizeState(stateStore) });
      return;
    }

    sendJson(response, 404, { error: "API 경로를 찾을 수 없습니다." });
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: "Vercel API 처리 중 오류가 발생했습니다." });
  }
};

function saveAccount(response, body) {
  const account = normalizeAccount(body.account || body);
  if (!account.loggedIn || !["email", "strava"].includes(account.provider)) {
    sendJson(response, 400, { error: "저장 가능한 로그인 계정 정보가 필요합니다." });
    return;
  }

  stateStore.account = account;
  stateStore.accounts.unshift({ ...account, updatedAt: new Date().toISOString() });
  stateStore.accounts = stateStore.accounts.slice(0, 100);
  sendJson(response, 200, {
    message: `${account.provider === "strava" ? "Strava" : "이메일"} 계정이 서버에 등록됐습니다.`,
    state: normalizeState(stateStore),
    account,
  });
}

function saveUpload(response, body) {
  if (!Array.isArray(stateStore.uploads)) stateStore.uploads = [];
  const file = body.file || body.upload || {};
  const id = `UP-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
  const upload = {
    id,
    user: String(body.user || "테스트 라이더").slice(0, 80),
    purpose: String(body.purpose || "feedback").slice(0, 40),
    originalName: sanitizeFileName(file.name || "uploaded-material.bin"),
    storedName: `${id}-${sanitizeFileName(file.name || "uploaded-material.bin")}`,
    mimeType: String(file.type || "application/octet-stream").slice(0, 120),
    size: Math.max(0, Math.round(Number(file.size) || estimateBase64Size(file.dataUrl || file.base64))),
    status: "stored",
    filePath: `memory/${id}`,
    url: `/api/uploads/${encodeURIComponent(id)}/file`,
    createdAt: new Date().toISOString(),
  };

  stateStore.uploads.unshift(upload);
  stateStore.uploads = stateStore.uploads.slice(0, 200);
  sendJson(response, 201, { message: "자료 업로드 메타데이터가 미리보기 서버에 등록됐습니다.", state: normalizeState(stateStore), upload: publicUpload(upload) });
}

function saveFeedback(response, body) {
  if (!Array.isArray(stateStore.feedbacks)) stateStore.feedbacks = [];
  if (!Array.isArray(stateStore.uploads)) stateStore.uploads = [];
  const input = body.feedback || body;
  const title = String(input.title || "").trim().slice(0, 120);
  const message = String(input.message || input.body || "").trim().slice(0, 2000);
  if (!title && !message) {
    sendJson(response, 400, { error: "제목 또는 의견 내용을 입력해주세요." });
    return;
  }

  const uploadIds = Array.isArray(input.uploadIds)
    ? input.uploadIds.map((id) => String(id)).filter((id) => stateStore.uploads.some((upload) => upload.id === id)).slice(0, 10)
    : [];
  const feedback = {
    id: `FB-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    category: normalizeFeedbackCategory(input.category),
    priority: ["low", "normal", "high"].includes(String(input.priority || "")) ? String(input.priority) : "normal",
    title: title || "의견",
    message: message || "첨부 자료 확인 요청",
    user: String(input.user || "테스트 라이더").trim().slice(0, 80),
    email: String(input.email || "").trim().slice(0, 120),
    uploadIds,
    status: "pending",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  stateStore.feedbacks.unshift(feedback);
  stateStore.feedbacks = stateStore.feedbacks.slice(0, 200);
  sendJson(response, 201, { message: "의견과 개선사항이 미리보기 서버에 등록됐습니다.", state: normalizeState(stateStore), feedback });
}

function startRideSession(response, body) {
  const user = body.user || "테스트 라이더";
  const existing = stateStore.liveRides.find((ride) => ride.user === user && ride.status === "active");

  if (existing) {
    sendJson(response, 200, { message: "진행 중인 라이딩 세션을 이어갑니다.", state: normalizeState(stateStore), activeRide: existing });
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

  stateStore.liveRides.unshift(activeRide);
  sendJson(response, 201, { message: "GPS 라이딩 세션이 서버에 생성됐습니다.", state: normalizeState(stateStore), activeRide });
}

function saveRideSamples(response, id, body) {
  const activeRide = stateStore.liveRides.find((ride) => ride.id === id && ride.status === "active");
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
  activeRide.samples = activeRide.samples.slice(-1200);
  activeRide.sampleCount = activeRide.samples.length;
  activeRide.updatedAt = new Date().toISOString();
  sendJson(response, 200, { message: `${acceptedSamples.length}개 GPS 샘플을 서버에 저장했습니다.`, state: normalizeState(stateStore), activeRide });
}

function finishRideSession(response, id, body) {
  const activeRide = stateStore.liveRides.find((ride) => ride.id === id && ride.status === "active");
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

  stateStore.stats.totalCo2 = round(stateStore.stats.totalCo2 + co2, 3);
  stateStore.stats.totalPoints += points;
  stateStore.stats.weeklyDistance = round(stateStore.stats.weeklyDistance + distance, 2);
  stateStore.stats.weeklyPoints[6] += points;
  stateStore.stats.rides += 1;
  stateStore.history.unshift({
    title: "GPS 자전거 주행 기록",
    meta: `${distance.toFixed(2)}km · ${co2.toFixed(2)}kgCO2e 절감 · GPS ${activeRide.samples.length}개`,
    points,
    type: "earn",
  });
  stateStore.requests.unshift({
    id: createRequestId(),
    title: "GPS 주행 기록 검증",
    user: body.user || activeRide.user,
    distance,
    co2,
    points,
    status: "pending",
    evidence: `GPS 샘플 ${activeRide.samples.length}개, 평균속도 ${speed.toFixed(1)}km/h, 시간 ${formatTime(seconds)}`,
  });
  stateStore.liveRides = stateStore.liveRides.filter((ride) => ride.id !== id);
  trimCollections(stateStore);
  sendJson(response, 201, { message: `${points}P가 서버에 자동 등록되고 관리자 검증 대기열에 올라갔습니다.`, state: normalizeState(stateStore) });
}

function saveRide(response, body) {
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
  stateStore.stats.totalCo2 = round(stateStore.stats.totalCo2 + co2, 3);
  stateStore.stats.totalPoints += points;
  stateStore.stats.weeklyDistance = round(stateStore.stats.weeklyDistance + distance, 2);
  stateStore.stats.weeklyPoints[6] += points;
  stateStore.stats.rides += 1;
  stateStore.history.unshift({
    title: "자전거 주행 기록",
    meta: `${distance.toFixed(2)}km · ${co2.toFixed(2)}kgCO2e 절감`,
    points,
    type: "earn",
  });
  stateStore.requests.unshift({
    id: createRequestId(),
    title: "주행 기록 검증",
    user: body.user || "테스트 라이더",
    distance,
    co2,
    points,
    status: "pending",
    evidence: `GPS 경로 저장, 평균속도 ${speed.toFixed(1)}km/h, 시간 ${formatTime(seconds)}`,
  });
  trimCollections(stateStore);
  sendJson(response, 201, { message: `${points}P가 서버에 적립되고 검증 대기열에 등록됐습니다.`, state: normalizeState(stateStore) });
}

function saveCheckin(response, body) {
  const landmark = landmarks[Number(body.landmarkIndex)];
  if (!landmark) {
    sendJson(response, 400, { error: "존재하지 않는 명소입니다." });
    return;
  }

  const qrCode = findQrCodeForLandmark(landmark);
  const qrValidation = validateQrCapture(qrCode, body);
  if (!qrValidation.ok) {
    sendJson(response, 422, { error: qrValidation.error });
    return;
  }

  const locationValidation = validateCheckinLocation(landmark, qrCode, body.location || body.landmark?.location);
  if (!locationValidation.ok) {
    sendJson(response, 422, { error: locationValidation.error, location: locationValidation });
    return;
  }

  const alreadyChecked = stateStore.history.some((item) => item.title.includes(landmark.name));
  const points = alreadyChecked ? Math.round(landmark.bonus / 3) : landmark.bonus;
  const co2 = round(landmark.distance * CO2_PER_KM, 3);
  const proof = createVisitProof({
    user: body.user || "테스트 라이더",
    landmark,
    qrCode,
    scannedValue: qrValidation.decodedValue,
    qrValidation,
    locationValidation,
    points,
    co2,
    scannedAt: new Date().toISOString(),
  });

  stateStore.stats.totalPoints += points;
  stateStore.stats.weeklyPoints[6] += points;
  stateStore.history.unshift({
    title: `${landmark.name} QR 체크인`,
    meta: `서버 QR ${qrCode.id} 현장 인증`,
    points,
    type: "earn",
    proofId: proof.id,
  });
  stateStore.visitProofs.unshift(proof);
  addUnique(stateStore.badges.mission, "명소 체크인");
  stateStore.requests.unshift({
    id: createRequestId(),
    title: `${landmark.name} QR 인증`,
    user: body.user || "테스트 라이더",
    distance: landmark.distance,
    co2,
    points,
    status: "pending",
    proofId: proof.id,
    qrCodeId: qrCode.id,
    evidence: `서버 QR 이미지(${qrCode.id})와 촬영 프레임 일치, 기준점 ${locationValidation.distanceMeters}m, 방문 증명 ${proof.id}`,
  });
  trimCollections(stateStore);
  sendJson(response, 201, {
    message: `${landmark.name} 서버 QR 이미지와 위치가 일치하여 방문 인증이 저장됐습니다.`,
    state: normalizeState(stateStore),
    proof,
  });
}

function reviewRequest(response, id, body) {
  const status = String(body.status || "");
  if (!["approved", "rejected"].includes(status)) {
    sendJson(response, 400, { error: "승인 상태는 approved 또는 rejected 여야 합니다." });
    return;
  }

  const item = stateStore.requests.find((request) => request.id === id);
  if (!item) {
    sendJson(response, 404, { error: "검증 요청을 찾을 수 없습니다." });
    return;
  }

  item.status = status;
  item.reviewedAt = new Date().toISOString();
  sendJson(response, 200, {
    message: status === "approved" ? "관리자 검증을 승인했습니다." : "관리자 검증을 반려했습니다.",
    state: normalizeState(stateStore),
  });
}

function reviewFeedback(response, id, body) {
  if (!Array.isArray(stateStore.feedbacks)) stateStore.feedbacks = [];
  const status = String(body.status || "");
  if (!["pending", "in-review", "resolved", "archived"].includes(status)) {
    sendJson(response, 400, { error: "처리 상태는 pending, in-review, resolved, archived 중 하나여야 합니다." });
    return;
  }

  const feedback = stateStore.feedbacks.find((item) => item.id === id);
  if (!feedback) {
    sendJson(response, 404, { error: "등록된 의견을 찾을 수 없습니다." });
    return;
  }

  feedback.status = status;
  feedback.updatedAt = new Date().toISOString();
  if (status === "resolved" || status === "archived") feedback.reviewedAt = feedback.updatedAt;
  sendJson(response, 200, { message: "의견 상태를 변경했습니다.", state: normalizeState(stateStore), feedback });
}

function validateQrCapture(qrCode, body) {
  if (!qrCode) return { ok: false, error: "등록된 서버 QR을 찾지 못했습니다." };

  const frame = normalizeQrFrame(body.qrFrame || body.landmark?.qrFrame);
  const clientValue = normalizeQrPayload(body.qrValue || body.landmark?.qrValue || "");
  let decodedValue = clientValue;
  let frameHash = "";

  if (frame.ok) {
    decodedValue = decodeQrFrame(frame);
    frameHash = hashBuffer(frame.rgba);
  }

  if (!decodedValue) {
    return { ok: false, error: "서버가 촬영 이미지에서 QR을 직접 판독하지 못했습니다. QR을 화면 중앙에 크게 맞춰 다시 스캔해주세요." };
  }

  if (decodedValue !== normalizeQrPayload(qrCode.payload)) {
    return { ok: false, error: "촬영한 QR 이미지가 서버에 등록된 QR 이미지와 일치하지 않습니다." };
  }

  return {
    ok: true,
    mode: frame.ok ? "server-frame-qr" : "client-qr-fallback",
    decodedValue,
    frameHash,
    frameSize: frame.ok ? `${frame.width}x${frame.height}` : "",
    storedImageHash: fs.existsSync(QR_IMAGE_PATH) ? hashBuffer(fs.readFileSync(QR_IMAGE_PATH)) : "",
    storedImagePath: "data/qr-images/jeonju-3-1-birthplace.svg",
  };
}

function normalizeQrFrame(frame) {
  if (!frame || typeof frame !== "object") return { ok: false };

  const width = Math.round(Number(frame.width));
  const height = Math.round(Number(frame.height));
  const pixels = width * height;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 80 || height < 80 || pixels > 900000) {
    return { ok: false };
  }

  const rgba = Buffer.from(String(frame.rgbaBase64 || ""), "base64");
  if (rgba.length !== pixels * 4) return { ok: false };
  return { ok: true, width, height, rgba };
}

function decodeQrFrame(frame) {
  const data = new Uint8ClampedArray(frame.rgba.buffer, frame.rgba.byteOffset, frame.rgba.byteLength);
  const result = jsQR(data, frame.width, frame.height, { inversionAttempts: "attemptBoth" });
  return normalizeQrPayload(result?.data || "");
}

function validateCheckinLocation(landmark, qrCode, location) {
  const target = normalizeLocation({ lat: landmark.lat, lng: landmark.lng });
  if (!target) return { ok: true, mode: "location-not-configured", distanceMeters: null };

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

function createVisitProof({ user, landmark, qrCode, scannedValue, qrValidation, locationValidation, points, co2, scannedAt }) {
  const evidenceHash = crypto
    .createHash("sha256")
    .update([user, landmark.id, qrCode.id, scannedValue, qrValidation.frameHash || "", locationValidation.distanceMeters ?? "", scannedAt].join("|"))
    .digest("hex");

  return {
    id: `PROOF-${Date.now()}-${evidenceHash.slice(0, 8)}`,
    user,
    landmarkId: landmark.id,
    landmarkName: landmark.name,
    qrCodeId: qrCode.id,
    scannedAt,
    points,
    co2,
    status: "pending-admin-review",
    qrValidationMode: qrValidation.mode,
    qrFrameHash: qrValidation.frameHash || "",
    storedQrImageHash: qrValidation.storedImageHash || "",
    locationMode: locationValidation.mode,
    distanceMeters: locationValidation.distanceMeters ?? null,
    radiusMeters: locationValidation.radiusMeters ?? null,
    evidenceHash,
  };
}

function serveQrImage(response, id) {
  const qrCode = stateStore.qrCodes.find((item) => item.id === id);
  if (!qrCode || !fs.existsSync(QR_IMAGE_PATH)) {
    sendJson(response, 404, { error: "QR 이미지 파일이 서버에 없습니다." });
    return;
  }

  response.statusCode = 200;
  response.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(fs.readFileSync(QR_IMAGE_PATH));
}

function findQrCodeForLandmark(landmark) {
  if (!landmark?.qrCodeId) return null;
  return stateStore.qrCodes.find((qrCode) => qrCode.id === landmark.qrCodeId && qrCode.status === "active") || null;
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

function normalizeUpload(upload) {
  if (!upload || typeof upload !== "object" || !upload.id) return null;
  return {
    id: String(upload.id),
    user: String(upload.user || "테스트 라이더").slice(0, 80),
    purpose: String(upload.purpose || "feedback").slice(0, 40),
    originalName: sanitizeFileName(upload.originalName || upload.name || "uploaded-material.bin"),
    storedName: sanitizeFileName(upload.storedName || upload.originalName || upload.id),
    mimeType: String(upload.mimeType || "application/octet-stream").slice(0, 120),
    size: Math.max(0, Math.round(Number(upload.size) || 0)),
    status: upload.status === "deleted" ? "deleted" : "stored",
    filePath: String(upload.filePath || ""),
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
  return normalized;
}

function normalizeFeedbackCategory(category) {
  const value = String(category || "").toLowerCase();
  return ["opinion", "improvement", "bug", "upload", "other"].includes(value) ? value : "opinion";
}

function sanitizeFileName(value) {
  const filename = path.basename(String(value || "uploaded-material.bin")).normalize("NFC");
  const sanitized = filename
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return sanitized && sanitized !== "." && sanitized !== ".." ? sanitized : "uploaded-material.bin";
}

function estimateBase64Size(value) {
  const text = String(value || "");
  const base64 = text.includes(",") ? text.slice(text.indexOf(",") + 1) : text;
  return Math.max(0, Math.floor((base64.replace(/=+$/, "").length * 3) / 4));
}

function normalizeState(state) {
  return {
    account: normalizeAccount(state.account),
    accounts: Array.isArray(state.accounts) ? state.accounts.map(normalizeAccount).filter((account) => account.loggedIn).slice(0, 100) : [],
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
    liveRides: Array.isArray(state.liveRides) ? state.liveRides : [],
    qrCodes: Array.isArray(state.qrCodes) ? state.qrCodes : clone(defaultQrCodes),
    visitProofs: Array.isArray(state.visitProofs) ? state.visitProofs.slice(0, 100) : [],
    uploads: Array.isArray(state.uploads) ? state.uploads.map(normalizeUpload).filter(Boolean).slice(0, 200) : [],
    feedbacks: Array.isArray(state.feedbacks) ? state.feedbacks.map(normalizeFeedback).filter(Boolean).slice(0, 200) : [],
    history: Array.isArray(state.history) ? state.history : [...defaultState.history],
    requests: Array.isArray(state.requests) ? state.requests : [...defaultState.requests],
  };
}

function normalizeAccount(account) {
  if (!account || typeof account !== "object") return clone(defaultState.account);
  const provider = ["email", "strava"].includes(String(account.provider || "").toLowerCase())
    ? String(account.provider).toLowerCase()
    : "guest";
  const loggedIn = Boolean(account.loggedIn && provider !== "guest");
  return {
    loggedIn,
    provider: loggedIn ? provider : "guest",
    name: loggedIn ? String(account.name || "라이더").slice(0, 80) : "게스트 라이더",
    email: loggedIn ? String(account.email || "").slice(0, 120) : "",
  };
}

function normalizeSample(sample) {
  if (!sample || typeof sample !== "object") return null;
  const lat = Number(sample.lat);
  const lng = Number(sample.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return {
    lat,
    lng,
    accuracy: nullableNumber(sample.accuracy),
    altitude: nullableNumber(sample.altitude),
    heading: nullableNumber(sample.heading),
    speed: nullableNumber(sample.speed),
    timestamp: new Date(sample.timestamp || Date.now()).toISOString(),
    accepted: true,
    incrementKm: 0,
  };
}

function appendSample(ride, sample) {
  const previous = ride.samples[ride.samples.length - 1];
  let incrementKm = 0;
  if (previous) {
    const distanceKm = haversineKm(previous, sample);
    const elapsedSeconds = Math.max(1, (new Date(sample.timestamp).getTime() - new Date(previous.timestamp).getTime()) / 1000);
    const maxPlausibleKm = Math.max(0.03, (elapsedSeconds * 25) / 1000);
    incrementKm = distanceKm <= maxPlausibleKm && distanceKm >= 0.003 ? distanceKm : 0;
  }
  sample.incrementKm = round(incrementKm, 5);
  ride.distance = round((Number(ride.distance) || 0) + incrementKm, 5);
  ride.seconds = Math.max(Number(ride.seconds) || 0, Math.round((new Date(sample.timestamp).getTime() - new Date(ride.startedAt).getTime()) / 1000));
  ride.speed = sample.speed !== null ? round(sample.speed * 3.6, 1) : estimateAverageSpeed(ride);
  ride.samples.push(sample);
}

async function readJsonBody(request) {
  if (request.body && typeof request.body === "object" && !Buffer.isBuffer(request.body)) return request.body;
  if (typeof request.body === "string") return safeJson(request.body);
  if (Buffer.isBuffer(request.body)) return safeJson(request.body.toString("utf8"));

  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return chunks.length ? safeJson(Buffer.concat(chunks).toString("utf8")) : {};
}

function setApiHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Cache-Control", "no-store");
}

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

function trimCollections(state) {
  state.history = state.history.slice(0, 60);
  state.requests = state.requests.slice(0, 60);
  state.visitProofs = state.visitProofs.slice(0, 100);
  state.uploads = Array.isArray(state.uploads) ? state.uploads.slice(0, 200) : [];
  state.feedbacks = Array.isArray(state.feedbacks) ? state.feedbacks.slice(0, 200) : [];
}

function addUnique(list, value) {
  if (!list.includes(value)) list.push(value);
}

function normalizeQrPayload(value) {
  return String(value || "").trim();
}

function normalizeLocation(location) {
  if (!location || typeof location !== "object") return null;
  const lat = Number(location.lat ?? location.latitude);
  const lng = Number(location.lng ?? location.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
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
  return ride.seconds > 0 ? round((ride.distance / (ride.seconds / 3600)), 1) : 0;
}

function nullableNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value, digits) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remain = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`;
}

function createRequestId() {
  return `REQ-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
}

function hashBuffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function safeJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
