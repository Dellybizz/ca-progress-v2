package com.notificationvault.client;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import java.util.ArrayList;
import java.util.List;

final class NotificationDb extends SQLiteOpenHelper {
    private static final String DB_NAME = "notification_vault.db";
    private static final int DB_VERSION = 1;

    NotificationDb(Context context) {
        super(context, DB_NAME, null, DB_VERSION);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE pending (" +
                "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                "client_event_id TEXT NOT NULL UNIQUE," +
                "notification_key TEXT NOT NULL," +
                "package_name TEXT NOT NULL," +
                "app_name TEXT NOT NULL," +
                "title TEXT NOT NULL," +
                "body TEXT NOT NULL," +
                "event_type TEXT NOT NULL," +
                "occurred_at INTEGER NOT NULL)");
        db.execSQL("CREATE INDEX pending_occurred_at_idx ON pending(occurred_at)");
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        db.execSQL("DROP TABLE IF EXISTS pending");
        onCreate(db);
    }

    synchronized void insert(PendingEvent event) {
        ContentValues values = new ContentValues();
        values.put("client_event_id", event.clientEventId);
        values.put("notification_key", event.notificationKey);
        values.put("package_name", event.packageName);
        values.put("app_name", event.appName);
        values.put("title", event.title);
        values.put("body", event.body);
        values.put("event_type", event.eventType);
        values.put("occurred_at", event.occurredAt);
        getWritableDatabase().insertWithOnConflict(
                "pending", null, values, SQLiteDatabase.CONFLICT_IGNORE);
    }

    synchronized List<PendingEvent> getBatch(int limit) {
        List<PendingEvent> items = new ArrayList<>();
        try (Cursor cursor = getReadableDatabase().query(
                "pending",
                null,
                null,
                null,
                null,
                null,
                "id ASC",
                Integer.toString(limit))) {
            while (cursor.moveToNext()) {
                PendingEvent event = new PendingEvent();
                event.id = cursor.getLong(cursor.getColumnIndexOrThrow("id"));
                event.clientEventId = cursor.getString(cursor.getColumnIndexOrThrow("client_event_id"));
                event.notificationKey = cursor.getString(cursor.getColumnIndexOrThrow("notification_key"));
                event.packageName = cursor.getString(cursor.getColumnIndexOrThrow("package_name"));
                event.appName = cursor.getString(cursor.getColumnIndexOrThrow("app_name"));
                event.title = cursor.getString(cursor.getColumnIndexOrThrow("title"));
                event.body = cursor.getString(cursor.getColumnIndexOrThrow("body"));
                event.eventType = cursor.getString(cursor.getColumnIndexOrThrow("event_type"));
                event.occurredAt = cursor.getLong(cursor.getColumnIndexOrThrow("occurred_at"));
                items.add(event);
            }
        }
        return items;
    }

    synchronized void deleteIds(List<Long> ids) {
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            for (Long id : ids) {
                db.delete("pending", "id = ?", new String[] { Long.toString(id) });
            }
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
    }

    synchronized void clearPending() {
        getWritableDatabase().delete("pending", null, null);
    }

    static final class PendingEvent {
        long id;
        String clientEventId;
        String notificationKey;
        String packageName;
        String appName;
        String title;
        String body;
        String eventType;
        long occurredAt;
    }
}
