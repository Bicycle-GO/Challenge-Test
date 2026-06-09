package kr.tangamja.challenge;

import android.content.Context;
import android.content.Intent;
import android.location.Location;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.time.Instant;
import java.util.Locale;
import java.util.UUID;

public class RideStore {
    private static final String PREFS_NAME = "tangamja_state";
    private static final String STATE_KEY = "state_json";
    private static final double CO2_PER_KM = 0.192;
    private static final int POINTS_PER_CO2_KG = 100;
    private static final int MAX_SAMPLE_COUNT = 1200;
    private static final double EARTH_RADIUS_KM = 6371.0;

    private final Context context;

    public RideStore(Context context) {
        this.context = context.getApplicationContext();
    }

    public synchronized String handleRequest(String path, String method, String bodyText) {
        try {
            JSONObject body = parseBody(bodyText);
            JSONObject payload;

            if ("GET".equalsIgnoreCase(method) && "/health".equals(path)) {
                payload = new JSONObject()
                    .put("ok", true)
                    .put("platform", "android-webview")
                    .put("storage", "SharedPreferences");
                return response(200, payload);
            }

            if ("GET".equalsIgnoreCase(method) && "/state".equals(path)) {
                payload = new JSONObject().put("state", readState());
                return response(200, payload);
            }

            if ("POST".equalsIgnoreCase(method) && "/rides/start".equals(path)) {
                return startRide(body);
            }

            if ("POST".equalsIgnoreCase(method) && path.matches("/rides/[^/]+/samples")) {
                String id = path.split("/")[2];
                return saveRideSamples(id, body);
            }

            if ("POST".equalsIgnoreCase(method) && path.matches("/rides/[^/]+/finish")) {
                String id = path.split("/")[2];
                return finishRide(id, body);
            }

            if ("POST".equalsIgnoreCase(method) && "/checkins".equals(path)) {
                return saveCheckin(body);
            }

            if ("POST".equalsIgnoreCase(method) && "/exchanges".equals(path)) {
                return requestExchange(body);
            }

            if ("PATCH".equalsIgnoreCase(method) && path.startsWith("/requests/")) {
                return reviewRequest(path.replace("/requests/", ""), body);
            }

            return response(404, new JSONObject().put("error", "Native API route not found"));
        } catch (Exception error) {
            try {
                return response(500, new JSONObject().put("error", error.getMessage()));
            } catch (JSONException nested) {
                return "{\"status\":500,\"body\":{\"error\":\"Native API error\"}}";
            }
        }
    }

    public synchronized void appendNativeSample(Location location) {
        try {
            JSONObject state = readState();
            JSONObject activeRide = findActiveRide(state.optJSONArray("liveRides"), null);
            if (activeRide == null) return;

            JSONObject sample = new JSONObject()
                .put("lat", location.getLatitude())
                .put("lng", location.getLongitude())
                .put("accuracy", location.hasAccuracy() ? location.getAccuracy() : JSONObject.NULL)
                .put("altitude", location.hasAltitude() ? location.getAltitude() : JSONObject.NULL)
                .put("heading", location.hasBearing() ? location.getBearing() : JSONObject.NULL)
                .put("speed", location.hasSpeed() ? location.getSpeed() : JSONObject.NULL)
                .put("timestamp", Instant.ofEpochMilli(location.getTime()).toString());

            appendSample(activeRide, sample);
            activeRide.put("sampleCount", activeRide.optJSONArray("samples").length());
            activeRide.put("updatedAt", Instant.now().toString());
            writeState(state);
        } catch (JSONException ignored) {
        }
    }

    private String startRide(JSONObject body) throws JSONException {
        JSONObject state = readState();
        String user = body.optString("user", "테스트 라이더");
        JSONObject existing = findActiveRide(state.optJSONArray("liveRides"), user);

        if (existing != null) {
            RideTrackingService.start(context);
            return response(
                200,
                new JSONObject()
                    .put("message", "진행 중인 라이딩 세션을 이어갑니다.")
                    .put("state", state)
                    .put("activeRide", existing)
            );
        }

        String now = Instant.now().toString();
        JSONObject activeRide = new JSONObject()
            .put("id", "RIDE-" + System.currentTimeMillis() + "-" + UUID.randomUUID().toString().substring(0, 4))
            .put("user", user)
            .put("status", "active")
            .put("startedAt", now)
            .put("updatedAt", now)
            .put("seconds", 0)
            .put("distance", 0)
            .put("speed", 0)
            .put("sampleCount", 0)
            .put("samples", new JSONArray());

        JSONArray liveRides = state.optJSONArray("liveRides");
        if (liveRides == null) liveRides = new JSONArray();
        state.put("liveRides", prepend(liveRides, activeRide, 8));
        writeState(state);
        RideTrackingService.start(context);

        return response(
            201,
            new JSONObject()
                .put("message", "Android GPS 라이딩 세션이 시작됐습니다.")
                .put("state", state)
                .put("activeRide", activeRide)
        );
    }

    private String saveRideSamples(String id, JSONObject body) throws JSONException {
        JSONObject state = readState();
        JSONObject activeRide = findRideById(state.optJSONArray("liveRides"), id);
        if (activeRide == null || !"active".equals(activeRide.optString("status"))) {
            return response(404, new JSONObject().put("error", "진행 중인 라이딩 세션을 찾을 수 없습니다."));
        }

        JSONArray samples = body.optJSONArray("samples");
        if (samples == null) {
            samples = new JSONArray();
            JSONObject single = body.optJSONObject("sample");
            if (single != null) samples.put(single);
        }

        if (samples.length() == 0) {
            return response(400, new JSONObject().put("error", "저장 가능한 GPS 샘플이 없습니다."));
        }

        for (int index = 0; index < samples.length(); index += 1) {
            JSONObject sample = samples.optJSONObject(index);
            if (sample != null) appendSample(activeRide, sample);
        }

        JSONArray currentSamples = activeRide.optJSONArray("samples");
        activeRide.put("sampleCount", currentSamples == null ? 0 : currentSamples.length());
        activeRide.put("updatedAt", Instant.now().toString());
        writeState(state);

        return response(
            200,
            new JSONObject()
                .put("message", samples.length() + "개 GPS 샘플을 Android 저장소에 저장했습니다.")
                .put("state", state)
                .put("activeRide", activeRide)
        );
    }

    private String finishRide(String id, JSONObject body) throws JSONException {
        JSONObject state = readState();
        JSONObject activeRide = findRideById(state.optJSONArray("liveRides"), id);
        if (activeRide == null || !"active".equals(activeRide.optString("status"))) {
            return response(404, new JSONObject().put("error", "진행 중인 라이딩 세션을 찾을 수 없습니다."));
        }

        JSONArray samples = activeRide.optJSONArray("samples");
        double distance = round(activeRide.optDouble("distance", 0), 3);
        if (distance < 0.02 || samples == null || samples.length() < 2) {
            return response(400, new JSONObject().put("error", "포인트 등록을 위해 GPS 샘플 2개 이상과 최소 0.02km 기록이 필요합니다."));
        }

        int seconds = Math.max(0, activeRide.optInt("seconds", 0));
        double speed = seconds > 0 ? round(distance / (seconds / 3600.0), 1) : round(activeRide.optDouble("speed", 0), 1);
        double co2 = round(distance * CO2_PER_KM, 3);
        int points = Math.max(1, (int) Math.round(co2 * POINTS_PER_CO2_KG));
        int acceptedCount = countAccepted(samples);

        JSONObject stats = state.getJSONObject("stats");
        stats.put("totalCo2", round(stats.optDouble("totalCo2", 0) + co2, 3));
        stats.put("totalPoints", stats.optInt("totalPoints", 0) + points);
        stats.put("weeklyDistance", round(stats.optDouble("weeklyDistance", 0) + distance, 2));
        stats.put("rides", stats.optInt("rides", 0) + 1);
        addWeeklyPoints(stats, points);

        state.put(
            "history",
            prepend(
                state.optJSONArray("history"),
                new JSONObject()
                    .put("title", "Android GPS 자전거 주행 기록")
                    .put("meta", String.format(Locale.KOREA, "%.2fkm · %.2fkgCO2e 절감 · GPS %d개", distance, co2, acceptedCount))
                    .put("points", points)
                    .put("type", "earn"),
                30
            )
        );

        state.put(
            "requests",
            prepend(
                state.optJSONArray("requests"),
                new JSONObject()
                    .put("id", createRequestId())
                    .put("title", "Android GPS 주행 기록 검증")
                    .put("user", body.optString("user", activeRide.optString("user", "테스트 라이더")))
                    .put("distance", distance)
                    .put("co2", co2)
                    .put("points", points)
                    .put("status", "pending")
                    .put("evidence", String.format(Locale.KOREA, "GPS 샘플 %d개, 유효 샘플 %d개, 평균속도 %.1fkm/h, 시간 %s", samples.length(), acceptedCount, speed, formatTime(seconds))),
                30
            )
        );

        state.put("liveRides", removeRide(state.optJSONArray("liveRides"), id));
        writeState(state);
        RideTrackingService.stop(context);

        return response(
            201,
            new JSONObject()
                .put("message", points + "P가 Android 앱에 자동 등록되고 관리자 검증 대기열에 올라갔습니다.")
                .put("state", state)
        );
    }

    private String saveCheckin(JSONObject body) throws JSONException {
        JSONObject landmark = body.optJSONObject("landmark");
        if (landmark == null) {
            return response(400, new JSONObject().put("error", "명소 정보가 없습니다."));
        }

        JSONObject state = readState();
        String name = landmark.optString("name", "전북 명소");
        int near = landmark.optInt("near", 100);
        int bonus = landmark.optInt("bonus", 150);
        double distance = landmark.optDouble("distance", 10);
        boolean alreadyChecked = historyContains(state.optJSONArray("history"), name);
        int points = alreadyChecked ? Math.max(1, Math.round(bonus / 3.0f)) : bonus;
        double co2 = round(distance * CO2_PER_KM, 3);

        JSONObject stats = state.getJSONObject("stats");
        stats.put("totalPoints", stats.optInt("totalPoints", 0) + points);
        addWeeklyPoints(stats, points);

        state.put(
            "history",
            prepend(
                state.optJSONArray("history"),
                new JSONObject()
                    .put("title", name + " QR 체크인")
                    .put("meta", "반경 " + near + "m 현장 인증")
                    .put("points", points)
                    .put("type", "earn"),
                30
            )
        );

        JSONObject badges = state.getJSONObject("badges");
        badges.put("mission", addUnique(badges.optJSONArray("mission"), "명소 체크인"));
        if (countQrCheckins(state.optJSONArray("history")) >= 3) {
            badges.put("special", addUnique(badges.optJSONArray("special"), "그린 라이더"));
        }

        state.put(
            "requests",
            prepend(
                state.optJSONArray("requests"),
                new JSONObject()
                    .put("id", createRequestId())
                    .put("title", name + " QR 인증")
                    .put("user", body.optString("user", "테스트 라이더"))
                    .put("distance", distance)
                    .put("co2", co2)
                    .put("points", points)
                    .put("status", "pending")
                    .put("evidence", "GPS 반경 " + near + "m, QR 스캔 성공, Android 저장소 중복 여부 확인"),
                30
            )
        );

        writeState(state);
        return response(201, new JSONObject().put("message", "QR 체크인이 Android 앱에 저장되고 보너스 포인트가 적립됐습니다.").put("state", state));
    }

    private String requestExchange(JSONObject body) throws JSONException {
        JSONObject state = readState();
        JSONObject stats = state.getJSONObject("stats");
        int amount = Math.min(5000, (stats.optInt("totalPoints", 0) / 100) * 100);
        if (amount <= 0) {
            return response(400, new JSONObject().put("error", "신청 가능한 포인트가 없습니다."));
        }

        state.put(
            "requests",
            prepend(
                state.optJSONArray("requests"),
                new JSONObject()
                    .put("id", createRequestId())
                    .put("title", "포인트 전환 신청")
                    .put("user", body.optString("user", "테스트 라이더"))
                    .put("distance", stats.optDouble("weeklyDistance", 0))
                    .put("co2", stats.optDouble("totalCo2", 0))
                    .put("points", amount)
                    .put("status", "pending")
                    .put("evidence", "Android 앱 누적 포인트, QR 체크인, 주행 기록 교차 검증 필요"),
                30
            )
        );

        state.put(
            "history",
            prepend(
                state.optJSONArray("history"),
                new JSONObject()
                    .put("title", "포인트 전환 신청")
                    .put("meta", "관리자 승인 대기")
                    .put("points", amount)
                    .put("type", "spend"),
                30
            )
        );

        writeState(state);
        return response(201, new JSONObject().put("message", "포인트 전환 신청이 Android 앱에 등록됐습니다.").put("state", state));
    }

    private String reviewRequest(String id, JSONObject body) throws JSONException {
        String status = body.optString("status", "");
        if (!"approved".equals(status) && !"rejected".equals(status)) {
            return response(400, new JSONObject().put("error", "승인 상태는 approved 또는 rejected 여야 합니다."));
        }

        JSONObject state = readState();
        JSONArray requests = state.optJSONArray("requests");
        JSONObject request = null;
        if (requests != null) {
            for (int index = 0; index < requests.length(); index += 1) {
                JSONObject item = requests.optJSONObject(index);
                if (item != null && id.equals(item.optString("id"))) {
                    request = item;
                    break;
                }
            }
        }
        if (request == null) {
            return response(404, new JSONObject().put("error", "검증 요청을 찾을 수 없습니다."));
        }

        request.put("status", status);
        request.put("reviewedAt", Instant.now().toString());
        state.put(
            "history",
            prepend(
                state.optJSONArray("history"),
                new JSONObject()
                    .put("title", "approved".equals(status) ? "관리자 승인 완료" : "관리자 반려")
                    .put("meta", request.optString("title") + " · " + request.optInt("points", 0) + "P")
                    .put("points", request.optInt("points", 0))
                    .put("type", "approved".equals(status) ? "earn" : "spend"),
                30
            )
        );
        writeState(state);

        return response(
            200,
            new JSONObject()
                .put("message", "approved".equals(status) ? "검증을 승인했습니다." : "검증 요청을 반려했습니다.")
                .put("state", state)
        );
    }

    private JSONObject readState() throws JSONException {
        String raw = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getString(STATE_KEY, null);
        if (raw == null || raw.isEmpty()) {
            JSONObject state = defaultState();
            writeState(state);
            return state;
        }
        return new JSONObject(raw);
    }

    private void writeState(JSONObject state) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(STATE_KEY, state.toString())
            .apply();
    }

    private JSONObject defaultState() throws JSONException {
        return new JSONObject()
            .put(
                "stats",
                new JSONObject()
                    .put("users", 1250)
                    .put("rides", 820)
                    .put("totalPoints", 12450)
                    .put("totalCo2", 245.6)
                    .put("weeklyDistance", 120)
                    .put("weeklyPoints", new JSONArray().put(60).put(80).put(120).put(70).put(150).put(110).put(30))
            )
            .put(
                "badges",
                new JSONObject()
                    .put("growth", new JSONArray().put("첫 페달").put("탐험가"))
                    .put("mission", new JSONArray().put("지역별 보물"))
                    .put("special", new JSONArray())
            )
            .put("liveRides", new JSONArray())
            .put(
                "history",
                new JSONArray()
                    .put(new JSONObject().put("title", "전주 한옥마을 QR 체크인").put("meta", "명소 인증 보너스").put("points", 150).put("type", "earn"))
                    .put(new JSONObject().put("title", "주간 자전거 챌린지").put("meta", "120km 달성").put("points", 620).put("type", "earn"))
            )
            .put(
                "requests",
                new JSONArray()
                    .put(
                        new JSONObject()
                            .put("id", "REQ-2026-001")
                            .put("title", "익산 미륵사지 QR 인증")
                            .put("user", "김탄소")
                            .put("distance", 12.45)
                            .put("co2", 2.39)
                            .put("points", 389)
                            .put("status", "pending")
                            .put("evidence", "GPS 반경 84m, QR 1회, 평균속도 20.9km/h")
                    )
            );
    }

    private void appendSample(JSONObject activeRide, JSONObject sample) throws JSONException {
        double lat = sample.optDouble("lat", Double.NaN);
        double lng = sample.optDouble("lng", Double.NaN);
        if (!Double.isFinite(lat) || !Double.isFinite(lng)) return;

        JSONArray samples = activeRide.optJSONArray("samples");
        if (samples == null) {
            samples = new JSONArray();
            activeRide.put("samples", samples);
        }

        JSONObject normalized = new JSONObject()
            .put("lat", lat)
            .put("lng", lng)
            .put("accuracy", sample.opt("accuracy"))
            .put("altitude", sample.opt("altitude"))
            .put("heading", sample.opt("heading"))
            .put("speed", sample.opt("speed"))
            .put("timestamp", sample.optString("timestamp", Instant.now().toString()))
            .put("accepted", true);

        JSONObject previous = lastAcceptedSample(samples);
        if (previous != null) {
            double segment = haversine(previous.optDouble("lat"), previous.optDouble("lng"), lat, lng);
            long deltaSeconds = Math.max(1, Math.abs(parseTime(normalized.optString("timestamp")) - parseTime(previous.optString("timestamp"))) / 1000);
            double speed = segment / (deltaSeconds / 3600.0);
            double accuracy = sample.optDouble("accuracy", 0);
            boolean accepted = (accuracy <= 100 || accuracy == 0) && speed <= 55 && segment <= 2;
            normalized.put("accepted", accepted);
            if (accepted) {
                double distance = round(activeRide.optDouble("distance", 0) + segment, 3);
                activeRide.put("distance", distance);
                activeRide.put("speed", round(distance / (Math.max(1, activeRide.optInt("seconds", 0)) / 3600.0), 1));
            }
        }

        int seconds = (int) Math.max(activeRide.optInt("seconds", 0), (parseTime(normalized.optString("timestamp")) - parseTime(activeRide.optString("startedAt"))) / 1000);
        activeRide.put("seconds", Math.max(0, seconds));
        samples.put(normalized);
        if (samples.length() > MAX_SAMPLE_COUNT) {
            JSONArray trimmed = new JSONArray();
            for (int index = samples.length() - MAX_SAMPLE_COUNT; index < samples.length(); index += 1) {
                trimmed.put(samples.get(index));
            }
            activeRide.put("samples", trimmed);
        }
    }

    private JSONObject parseBody(String raw) throws JSONException {
        if (raw == null || raw.trim().isEmpty()) return new JSONObject();
        return new JSONObject(raw);
    }

    private String response(int status, JSONObject body) throws JSONException {
        return new JSONObject().put("status", status).put("body", body).toString();
    }

    private JSONObject findActiveRide(JSONArray rides, String user) {
        if (rides == null) return null;
        for (int index = 0; index < rides.length(); index += 1) {
            JSONObject ride = rides.optJSONObject(index);
            if (ride == null || !"active".equals(ride.optString("status"))) continue;
            if (user == null || user.equals(ride.optString("user"))) return ride;
        }
        return null;
    }

    private JSONObject findRideById(JSONArray rides, String id) {
        if (rides == null) return null;
        for (int index = 0; index < rides.length(); index += 1) {
            JSONObject ride = rides.optJSONObject(index);
            if (ride != null && id.equals(ride.optString("id"))) return ride;
        }
        return null;
    }

    private JSONArray removeRide(JSONArray rides, String id) {
        JSONArray next = new JSONArray();
        if (rides == null) return next;
        for (int index = 0; index < rides.length(); index += 1) {
            JSONObject ride = rides.optJSONObject(index);
            if (ride != null && !id.equals(ride.optString("id"))) next.put(ride);
        }
        return next;
    }

    private JSONArray prepend(JSONArray array, JSONObject item, int limit) {
        JSONArray source = array == null ? new JSONArray() : array;
        JSONArray next = new JSONArray().put(item);
        for (int index = 0; index < source.length() && next.length() < limit; index += 1) {
            next.put(source.opt(index));
        }
        return next;
    }

    private JSONArray addUnique(JSONArray array, String value) {
        JSONArray source = array == null ? new JSONArray() : array;
        for (int index = 0; index < source.length(); index += 1) {
            if (value.equals(source.optString(index))) return source;
        }
        source.put(value);
        return source;
    }

    private void addWeeklyPoints(JSONObject stats, int points) throws JSONException {
        JSONArray weekly = stats.optJSONArray("weeklyPoints");
        if (weekly == null) weekly = new JSONArray().put(0).put(0).put(0).put(0).put(0).put(0).put(0);
        weekly.put(6, weekly.optInt(6, 0) + points);
        stats.put("weeklyPoints", weekly);
    }

    private JSONObject lastAcceptedSample(JSONArray samples) {
        for (int index = samples.length() - 1; index >= 0; index -= 1) {
            JSONObject sample = samples.optJSONObject(index);
            if (sample != null && sample.optBoolean("accepted", true)) return sample;
        }
        return null;
    }

    private int countAccepted(JSONArray samples) {
        int count = 0;
        for (int index = 0; index < samples.length(); index += 1) {
            JSONObject sample = samples.optJSONObject(index);
            if (sample != null && sample.optBoolean("accepted", true)) count += 1;
        }
        return count;
    }

    private boolean historyContains(JSONArray history, String text) {
        if (history == null) return false;
        for (int index = 0; index < history.length(); index += 1) {
            JSONObject item = history.optJSONObject(index);
            if (item != null && item.optString("title").contains(text)) return true;
        }
        return false;
    }

    private int countQrCheckins(JSONArray history) {
        if (history == null) return 0;
        int count = 0;
        for (int index = 0; index < history.length(); index += 1) {
            JSONObject item = history.optJSONObject(index);
            if (item != null && item.optString("title").contains("QR 체크인")) count += 1;
        }
        return count;
    }

    private double haversine(double fromLat, double fromLng, double toLat, double toLng) {
        double dLat = Math.toRadians(toLat - fromLat);
        double dLng = Math.toRadians(toLng - fromLng);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
            + Math.cos(Math.toRadians(fromLat)) * Math.cos(Math.toRadians(toLat))
            * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    private long parseTime(String timestamp) {
        try {
            return Instant.parse(timestamp).toEpochMilli();
        } catch (Exception ignored) {
            return System.currentTimeMillis();
        }
    }

    private double round(double value, int decimals) {
        double scale = Math.pow(10, decimals);
        return Math.round(value * scale) / scale;
    }

    private String createRequestId() {
        return "REQ-" + System.currentTimeMillis() + "-" + UUID.randomUUID().toString().substring(0, 4);
    }

    private String formatTime(int seconds) {
        int minutes = Math.max(0, seconds) / 60;
        int remain = Math.max(0, seconds) % 60;
        return String.format(Locale.KOREA, "%02d:%02d", minutes, remain);
    }
}
