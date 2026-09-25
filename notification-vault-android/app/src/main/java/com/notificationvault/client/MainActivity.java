package com.notificationvault.client;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.provider.Settings;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.text.DateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private static final int BLACK = Color.rgb(22, 22, 22);
    private static final int MUTED = Color.rgb(104, 104, 100);
    private static final int PANEL = Color.WHITE;
    private static final int PAGE = Color.rgb(247, 247, 245);
    private static final int GREEN = Color.rgb(49, 103, 61);
    private static final int RED = Color.rgb(160, 52, 43);

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private TokenStore tokenStore;
    private TextView connectionStatus;
    private TextView recordStatus;
    private TextView viewStatus;
    private TextView syncStatus;
    private TextView accessStatus;
    private EditText tokenInput;
    private EditText searchInput;
    private LinearLayout historyContainer;
    private final List<VaultApi.RemoteNotification> currentNotifications = new ArrayList<>();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        tokenStore = new TokenStore(getApplicationContext());
        SyncScheduler.schedulePeriodic(this);
        buildUi();
        updateLocalStatus();
        if (tokenStore.hasToken()) refreshEverything();
    }

    @Override
    protected void onResume() {
        super.onResume();
        updateNotificationAccessStatus();
    }

    @Override
    protected void onDestroy() {
        executor.shutdownNow();
        super.onDestroy();
    }

    private void buildUi() {
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(PAGE);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(24), dp(20), dp(40));
        scroll.addView(root, new ScrollView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        root.addView(text("NOTIFICATION VAULT", 12, MUTED, Typeface.BOLD));
        TextView title = text("This device", 32, BLACK, Typeface.BOLD);
        title.setPadding(0, dp(4), 0, dp(6));
        root.addView(title);
        TextView intro = text("This privacy-safe build records notification metadata only: app, device, time, and posted/removed status. Notification text, message content, and verification codes are not captured.", 15, MUTED, Typeface.NORMAL);
        intro.setLineSpacing(0f, 1.15f);
        root.addView(intro);
        root.addView(space(18));

        LinearLayout connectionCard = card();
        connectionCard.addView(text("Device connection", 18, BLACK, Typeface.BOLD));
        connectionStatus = text("", 14, MUTED, Typeface.NORMAL);
        connectionStatus.setPadding(0, dp(6), 0, dp(10));
        connectionCard.addView(connectionStatus);
        tokenInput = new EditText(this);
        tokenInput.setHint("Paste nv1… device token from admin dashboard");
        tokenInput.setSingleLine(true);
        tokenInput.setTextSize(14);
        tokenInput.setPadding(dp(12), dp(11), dp(12), dp(11));
        tokenInput.setBackgroundColor(Color.rgb(241, 241, 238));
        connectionCard.addView(tokenInput, fullWidth());
        Button connect = button("Connect / replace token", true);
        connect.setOnClickListener(v -> connectToken());
        connectionCard.addView(connect, buttonParams());
        Button forget = button("Forget token on this device", false);
        forget.setOnClickListener(v -> {
            tokenStore.clearToken();
            new NotificationDb(this).clearPending();
            currentNotifications.clear();
            tokenInput.setText("");
            renderHistory("");
            updateLocalStatus();
            toast("Device token removed locally");
        });
        connectionCard.addView(forget, buttonParams());
        root.addView(connectionCard);
        root.addView(space(12));

        LinearLayout permissionCard = card();
        permissionCard.addView(text("Admin permissions", 18, BLACK, Typeface.BOLD));
        recordStatus = statusLine();
        viewStatus = statusLine();
        syncStatus = statusLine();
        permissionCard.addView(recordStatus);
        permissionCard.addView(viewStatus);
        permissionCard.addView(syncStatus);
        Button refresh = button("Refresh permissions & history", true);
        refresh.setOnClickListener(v -> refreshEverything());
        permissionCard.addView(refresh, buttonParams());
        root.addView(permissionCard);
        root.addView(space(12));

        LinearLayout accessCard = card();
        accessCard.addView(text("Android Notification Access", 18, BLACK, Typeface.BOLD));
        accessStatus = statusLine();
        accessCard.addView(accessStatus);
        TextView accessHelp = text("Android requires you to enable Notification Access manually. Notification Vault cannot grant itself this permission.", 13, MUTED, Typeface.NORMAL);
        accessHelp.setPadding(0, 0, 0, dp(8));
        accessCard.addView(accessHelp);
        Button access = button("Open Notification Access settings", false);
        access.setOnClickListener(v -> {
            try {
                startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS));
            } catch (Exception e) {
                startActivity(new Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS"));
            }
        });
        accessCard.addView(access, buttonParams());
        root.addView(accessCard);
        root.addView(space(18));

        root.addView(text("Permitted history", 23, BLACK, Typeface.BOLD));
        TextView historyHelp = text("Only metadata from server-approved source devices appears here. Local queued events are never exposed as history.", 13, MUTED, Typeface.NORMAL);
        historyHelp.setPadding(0, dp(4), 0, dp(10));
        root.addView(historyHelp);
        searchInput = new EditText(this);
        searchInput.setHint("Search device or app");
        searchInput.setSingleLine(true);
        searchInput.setTextSize(14);
        searchInput.setPadding(dp(12), dp(11), dp(12), dp(11));
        searchInput.setBackgroundColor(Color.WHITE);
        root.addView(searchInput, fullWidth());
        searchInput.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) { renderHistory(s == null ? "" : s.toString()); }
            @Override public void afterTextChanged(Editable s) {}
        });
        root.addView(space(10));
        historyContainer = new LinearLayout(this);
        historyContainer.setOrientation(LinearLayout.VERTICAL);
        root.addView(historyContainer, fullWidth());
        setContentView(scroll);
    }

    private void connectToken() {
        String token = tokenInput.getText().toString().trim();
        if (token.isEmpty() || !token.startsWith("nv1.")) {
            toast("Paste a valid device token beginning with nv1.");
            return;
        }
        if (!tokenStore.saveToken(token)) {
            toast("Could not securely save this token");
            return;
        }
        tokenStore.setCanRecord(false);
        SyncScheduler.scheduleNow(this);
        refreshEverything();
    }

    private void refreshEverything() {
        if (!tokenStore.hasToken()) {
            updateLocalStatus();
            toast("Connect this installation to a device first");
            return;
        }
        connectionStatus.setText("Checking server…");
        executor.submit(() -> {
            try {
                VaultApi api = new VaultApi(getApplicationContext());
                VaultApi.Profile profile = api.refreshProfile();
                api.syncPending();
                List<VaultApi.RemoteNotification> notifications = api.fetchNotifications();
                runOnUiThread(() -> {
                    currentNotifications.clear();
                    currentNotifications.addAll(notifications);
                    renderHistory(searchInput.getText().toString());
                    connectionStatus.setText("Connected as " + profile.name);
                    recordStatus.setText(profile.canRecord ? "Record: allowed by admin" : "Record: disabled by admin");
                    recordStatus.setTextColor(profile.canRecord ? GREEN : RED);
                    viewStatus.setText("Can view from: " + profile.sourceSummary());
                    updateSyncStatus();
                });
            } catch (VaultApi.ApiException e) {
                tokenStore.setLastError(e.getMessage());
                runOnUiThread(() -> {
                    connectionStatus.setText(e.status == 401 ? "Token invalid or device revoked" : "Server rejected request (" + e.status + ")");
                    recordStatus.setText("Record: unavailable until permissions refresh");
                    recordStatus.setTextColor(RED);
                    viewStatus.setText("Can view from: unavailable");
                    updateSyncStatus();
                    toast(e.getMessage());
                });
            } catch (Exception e) {
                tokenStore.setLastError(e.getMessage());
                runOnUiThread(() -> {
                    connectionStatus.setText("Offline or server unavailable");
                    updateSyncStatus();
                    toast("Refresh failed");
                });
            }
        });
    }

    private void updateLocalStatus() {
        if (tokenStore.hasToken()) {
            String name = tokenStore.getDeviceName();
            connectionStatus.setText(name.isEmpty() ? "Device token saved" : "Connected as " + name);
            recordStatus.setText(tokenStore.canRecord() ? "Record: allowed (last known)" : "Record: disabled / unknown");
            recordStatus.setTextColor(tokenStore.canRecord() ? GREEN : RED);
            String sources = tokenStore.getViewSources();
            viewStatus.setText("Can view from: " + (sources.isEmpty() ? "unknown" : sources));
        } else {
            connectionStatus.setText("Not connected to the admin dashboard");
            recordStatus.setText("Record: unavailable");
            recordStatus.setTextColor(RED);
            viewStatus.setText("Can view from: none");
        }
        updateSyncStatus();
        updateNotificationAccessStatus();
    }

    private void updateSyncStatus() {
        String error = tokenStore.getLastError();
        long lastSync = tokenStore.getLastSync();
        if (!error.isEmpty()) {
            syncStatus.setText("Sync: " + error);
            syncStatus.setTextColor(RED);
        } else if (lastSync > 0) {
            syncStatus.setText("Last upload: " + DateFormat.getDateTimeInstance().format(new Date(lastSync)));
            syncStatus.setTextColor(MUTED);
        } else {
            syncStatus.setText("Sync: no upload completed yet");
            syncStatus.setTextColor(MUTED);
        }
    }

    private void updateNotificationAccessStatus() {
        if (accessStatus == null) return;
        boolean enabled = isNotificationListenerEnabled();
        accessStatus.setText(enabled ? "Notification Access: enabled" : "Notification Access: not enabled");
        accessStatus.setTextColor(enabled ? GREEN : RED);
    }

    private boolean isNotificationListenerEnabled() {
        String enabled = Settings.Secure.getString(getContentResolver(), "enabled_notification_listeners");
        if (enabled == null) return false;
        String own = new ComponentName(this, NotificationCaptureService.class).flattenToString();
        return enabled.contains(own);
    }

    private void renderHistory(String filterText) {
        if (historyContainer == null) return;
        historyContainer.removeAllViews();
        String query = filterText == null ? "" : filterText.trim().toLowerCase(Locale.ROOT);
        int shown = 0;
        for (VaultApi.RemoteNotification item : currentNotifications) {
            String haystack = (item.deviceName + " " + item.appName + " " + item.packageName).toLowerCase(Locale.ROOT);
            if (!query.isEmpty() && !haystack.contains(query)) continue;
            historyContainer.addView(notificationCard(item));
            historyContainer.addView(space(8));
            shown++;
        }
        if (shown == 0) {
            TextView empty = text(tokenStore.hasToken() ? "No notification metadata is visible to this device under the current admin permissions." : "Connect a device token to load permitted history.", 14, MUTED, Typeface.NORMAL);
            empty.setPadding(dp(4), dp(18), dp(4), dp(18));
            historyContainer.addView(empty);
        }
    }

    private View notificationCard(VaultApi.RemoteNotification item) {
        LinearLayout card = card();
        card.addView(text(item.appName, 16, BLACK, Typeface.BOLD));
        TextView source = text("Source: " + item.deviceName, 13, MUTED, Typeface.NORMAL);
        source.setPadding(0, dp(5), 0, 0);
        card.addView(source);
        String time = item.occurredAt > 0 ? DateFormat.getDateTimeInstance().format(new Date(item.occurredAt)) : "";
        TextView footer = text(item.eventType + (time.isEmpty() ? "" : "  ·  " + time), 12, MUTED, Typeface.NORMAL);
        footer.setPadding(0, dp(6), 0, 0);
        card.addView(footer);
        return card;
    }

    private LinearLayout card() {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(dp(16), dp(16), dp(16), dp(16));
        layout.setBackgroundColor(PANEL);
        return layout;
    }

    private TextView statusLine() {
        TextView view = text("", 14, MUTED, Typeface.NORMAL);
        view.setPadding(0, dp(7), 0, dp(3));
        return view;
    }

    private TextView text(String value, int sp, int color, int style) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(sp);
        view.setTextColor(color);
        view.setTypeface(Typeface.create(Typeface.DEFAULT, style));
        return view;
    }

    private Button button(String value, boolean primary) {
        Button button = new Button(this);
        button.setText(value);
        button.setAllCaps(false);
        button.setTextSize(14);
        button.setTextColor(primary ? Color.WHITE : BLACK);
        button.setBackgroundColor(primary ? BLACK : Color.rgb(238, 238, 235));
        return button;
    }

    private LinearLayout.LayoutParams fullWidth() {
        return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    }

    private LinearLayout.LayoutParams buttonParams() {
        LinearLayout.LayoutParams params = fullWidth();
        params.topMargin = dp(8);
        return params;
    }

    private View space(int valueDp) {
        View view = new View(this);
        view.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(valueDp)));
        return view;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void toast(String message) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
    }
}
