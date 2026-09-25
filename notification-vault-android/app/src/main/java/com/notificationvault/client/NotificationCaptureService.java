package com.notificationvault.client;

import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import java.util.UUID;

public class NotificationCaptureService extends NotificationListenerService {
    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
        SyncScheduler.schedulePeriodic(this);
        SyncScheduler.scheduleNow(this);
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        captureMetadata(sbn, "posted");
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        captureMetadata(sbn, "removed");
    }

    private void captureMetadata(StatusBarNotification sbn, String eventType) {
        if (sbn == null || getPackageName().equals(sbn.getPackageName())) return;

        TokenStore store = new TokenStore(getApplicationContext());
        if (!store.hasToken() || !store.canRecord()) return;

        NotificationDb.PendingEvent event = new NotificationDb.PendingEvent();
        event.clientEventId = UUID.randomUUID().toString();
        event.notificationKey = sbn.getKey() == null ? "" : sbn.getKey();
        event.packageName = sbn.getPackageName() == null ? "" : sbn.getPackageName();
        event.appName = resolveAppName(event.packageName);
        event.title = "";
        event.body = "";
        event.eventType = eventType;
        event.occurredAt = System.currentTimeMillis();

        new NotificationDb(getApplicationContext()).insert(event);
        SyncScheduler.scheduleNow(this);
    }

    private String resolveAppName(String packageName) {
        PackageManager manager = getPackageManager();
        try {
            ApplicationInfo info = manager.getApplicationInfo(packageName, 0);
            CharSequence label = manager.getApplicationLabel(info);
            return label == null ? packageName : label.toString();
        } catch (Exception e) {
            return packageName;
        }
    }
}
