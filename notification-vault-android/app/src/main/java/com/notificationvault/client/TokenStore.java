package com.notificationvault.client;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class TokenStore {
    private static final String PREFS = "vault_prefs";
    private static final String ALIAS = "notification_vault_device_token";
    private static final String TOKEN_CIPHER = "token_cipher";
    private static final String TOKEN_IV = "token_iv";
    private static final String CAN_RECORD = "can_record";
    private static final String DEVICE_NAME = "device_name";
    private static final String VIEW_SOURCES = "view_sources";
    private static final String LAST_SYNC = "last_sync";
    private static final String LAST_ERROR = "last_error";

    private final SharedPreferences prefs;

    TokenStore(Context context) {
        prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    synchronized boolean saveToken(String token) {
        try {
            SecretKey key = getOrCreateKey();
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key);
            byte[] encrypted = cipher.doFinal(token.getBytes(StandardCharsets.UTF_8));
            prefs.edit()
                    .putString(TOKEN_CIPHER, Base64.encodeToString(encrypted, Base64.NO_WRAP))
                    .putString(TOKEN_IV, Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                    .apply();
            return true;
        } catch (Exception e) {
            setLastError("Could not securely save device token");
            return false;
        }
    }

    synchronized String getToken() {
        String encoded = prefs.getString(TOKEN_CIPHER, "");
        String ivEncoded = prefs.getString(TOKEN_IV, "");
        if (encoded.isEmpty() || ivEncoded.isEmpty()) return "";
        try {
            SecretKey key = getOrCreateKey();
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            byte[] iv = Base64.decode(ivEncoded, Base64.NO_WRAP);
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, iv));
            byte[] plain = cipher.doFinal(Base64.decode(encoded, Base64.NO_WRAP));
            return new String(plain, StandardCharsets.UTF_8);
        } catch (Exception e) {
            return "";
        }
    }

    synchronized void clearToken() {
        prefs.edit()
                .remove(TOKEN_CIPHER)
                .remove(TOKEN_IV)
                .remove(DEVICE_NAME)
                .remove(VIEW_SOURCES)
                .putBoolean(CAN_RECORD, false)
                .apply();
    }

    boolean hasToken() {
        return !getToken().isEmpty();
    }

    boolean canRecord() {
        return prefs.getBoolean(CAN_RECORD, false);
    }

    void setCanRecord(boolean value) {
        prefs.edit().putBoolean(CAN_RECORD, value).apply();
    }

    String getDeviceName() {
        return prefs.getString(DEVICE_NAME, "");
    }

    void setDeviceName(String value) {
        prefs.edit().putString(DEVICE_NAME, value == null ? "" : value).apply();
    }

    String getViewSources() {
        return prefs.getString(VIEW_SOURCES, "");
    }

    void setViewSources(String value) {
        prefs.edit().putString(VIEW_SOURCES, value == null ? "" : value).apply();
    }

    long getLastSync() {
        return prefs.getLong(LAST_SYNC, 0L);
    }

    void setLastSync(long value) {
        prefs.edit().putLong(LAST_SYNC, value).remove(LAST_ERROR).apply();
    }

    String getLastError() {
        return prefs.getString(LAST_ERROR, "");
    }

    void setLastError(String value) {
        prefs.edit().putString(LAST_ERROR, value == null ? "" : value).apply();
    }

    private SecretKey getOrCreateKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        if (keyStore.containsAlias(ALIAS)) {
            return (SecretKey) keyStore.getKey(ALIAS, null);
        }

        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(
                ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build());
        return generator.generateKey();
    }
}
