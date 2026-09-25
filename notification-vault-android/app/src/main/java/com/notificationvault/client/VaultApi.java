package com.notificationvault.client;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

final class VaultApi {
    static final String BASE_URL = "https://notification-vault-6lthey.v2.appdeploy.ai";
    private final TokenStore tokenStore;
    private final NotificationDb db;

    VaultApi(Context context) {
        Context appContext = context.getApplicationContext();
        this.tokenStore = new TokenStore(appContext);
        this.db = new NotificationDb(appContext);
    }

    Profile refreshProfile() throws Exception {
        String token = requireToken();
        JSONObject request = new JSONObject().put("deviceToken", token);
        JSONObject response = post("/api/device/profile", request);
        JSONObject device = response.getJSONObject("device");

        Profile profile = new Profile();
        profile.name = device.optString("name", "This device");
        profile.canRecord = device.optBoolean("canRecord", false);

        JSONArray sources = response.optJSONArray("viewSources");
        if (sources != null) {
            for (int i = 0; i < sources.length(); i++) {
                JSONObject source = sources.getJSONObject(i);
                SourceDevice item = new SourceDevice();
                item.id = source.optString("id");
                item.name = source.optString("name", "Unnamed device");
                item.type = source.optString("type", "other");
                profile.viewSources.add(item);
            }
        }

        tokenStore.setDeviceName(profile.name);
        tokenStore.setCanRecord(profile.canRecord);
        tokenStore.setViewSources(profile.sourceSummary());
        if (!profile.canRecord) db.clearPending();
        return profile;
    }

    void syncPending() throws Exception {
        Profile profile = refreshProfile();
        if (!profile.canRecord) return;

        for (int pass = 0; pass < 4; pass++) {
            List<NotificationDb.PendingEvent> batch = db.getBatch(50);
            if (batch.isEmpty()) break;

            JSONArray events = new JSONArray();
            List<Long> ids = new ArrayList<>();
            for (NotificationDb.PendingEvent event : batch) {
                JSONObject item = new JSONObject();
                item.put("clientEventId", event.clientEventId);
                item.put("notificationKey", event.notificationKey);
                item.put("packageName", event.packageName);
                item.put("appName", event.appName);
                item.put("title", "");
                item.put("body", "");
                item.put("eventType", event.eventType);
                item.put("occurredAt", event.occurredAt);
                events.put(item);
                ids.add(event.id);
            }

            JSONObject request = new JSONObject();
            request.put("deviceToken", requireToken());
            request.put("batchId", UUID.randomUUID().toString());
            request.put("events", events);

            try {
                post("/api/ingest", request);
                db.deleteIds(ids);
                tokenStore.setLastSync(System.currentTimeMillis());
            } catch (ApiException e) {
                if (e.status == 403) {
                    tokenStore.setCanRecord(false);
                    db.clearPending();
                }
                throw e;
            }
        }
    }

    List<RemoteNotification> fetchNotifications() throws Exception {
        JSONObject request = new JSONObject().put("deviceToken", requireToken());
        JSONObject response = post("/api/device/notifications", request);
        JSONArray list = response.optJSONArray("notifications");
        List<RemoteNotification> items = new ArrayList<>();
        if (list == null) return items;

        for (int i = 0; i < list.length(); i++) {
            JSONObject raw = list.getJSONObject(i);
            RemoteNotification item = new RemoteNotification();
            item.id = raw.optString("id");
            item.deviceId = raw.optString("deviceId");
            item.deviceName = raw.optString("deviceName", "Unknown device");
            item.appName = raw.optString("appName", raw.optString("packageName", "Unknown app"));
            item.packageName = raw.optString("packageName", "");
            item.eventType = raw.optString("eventType", "posted");
            item.occurredAt = raw.optLong("occurredAt", 0L);
            items.add(item);
        }
        return items;
    }

    private String requireToken() throws ApiException {
        String token = tokenStore.getToken();
        if (token.isEmpty()) throw new ApiException(401, "No device token saved");
        return token;
    }

    private JSONObject post(String path, JSONObject body) throws Exception {
        URL url = new URL(BASE_URL + path);
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setRequestMethod("POST");
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(15000);
        connection.setDoOutput(true);
        connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("User-Agent", "NotificationVaultAndroid/0.1.0");

        byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
        connection.setFixedLengthStreamingMode(payload.length);
        try (OutputStream out = connection.getOutputStream()) {
            out.write(payload);
        }

        int status = connection.getResponseCode();
        InputStream stream = status >= 200 && status < 300
                ? connection.getInputStream()
                : connection.getErrorStream();
        String text = readAll(stream);
        connection.disconnect();

        if (status < 200 || status >= 300) {
            String message = text;
            try {
                JSONObject parsed = new JSONObject(text);
                message = parsed.optString("error", parsed.optString("message", text));
            } catch (Exception ignored) {}
            throw new ApiException(status, message == null || message.isEmpty() ? "Server error" : message);
        }

        if (text == null || text.isEmpty()) return new JSONObject();
        return new JSONObject(text);
    }

    private static String readAll(InputStream stream) throws Exception {
        if (stream == null) return "";
        StringBuilder builder = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) builder.append(line);
        }
        return builder.toString();
    }

    static final class Profile {
        String name = "This device";
        boolean canRecord;
        final List<SourceDevice> viewSources = new ArrayList<>();

        String sourceSummary() {
            if (viewSources.isEmpty()) return "None";
            StringBuilder builder = new StringBuilder();
            for (int i = 0; i < viewSources.size(); i++) {
                if (i > 0) builder.append(", ");
                builder.append(viewSources.get(i).name);
            }
            return builder.toString();
        }
    }

    static final class SourceDevice {
        String id;
        String name;
        String type;
    }

    static final class RemoteNotification {
        String id;
        String deviceId;
        String deviceName;
        String appName;
        String packageName;
        String eventType;
        long occurredAt;
    }

    static final class ApiException extends Exception {
        final int status;

        ApiException(int status, String message) {
            super(message);
            this.status = status;
        }
    }
}
