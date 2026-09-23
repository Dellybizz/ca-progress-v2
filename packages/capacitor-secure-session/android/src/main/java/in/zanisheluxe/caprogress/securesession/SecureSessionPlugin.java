package in.zanisheluxe.caprogress.securesession;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "SecureSession")
public class SecureSessionPlugin extends Plugin {
    private static final String ALIAS = "ca_progress_native_session";
    private static final String STORE = "ca_progress_secure_session";
    private String storageKey(PluginCall call) {
        String requested = call.getString("key", "session");
        if (!requested.equals("session") && !requested.equals("pkce")) return null;
        return "secure_" + requested;
    }

    private SharedPreferences preferences() { return getContext().getSharedPreferences(STORE, Context.MODE_PRIVATE); }

    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (store.containsAlias(ALIAS)) return ((KeyStore.SecretKeyEntry) store.getEntry(ALIAS, null)).getSecretKey();
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
        return generator.generateKey();
    }

    @PluginMethod public void set(PluginCall call) {
        String storageKey = storageKey(call); if (storageKey == null) { call.reject("Secure storage key is invalid."); return; }
        String value = call.getString("value"); if (value == null || value.isEmpty()) { call.reject("Session token is required."); return; }
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.ENCRYPT_MODE, key());
            String payload = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + "." + Base64.encodeToString(cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
            preferences().edit().putString(storageKey, payload).apply(); call.resolve();
        } catch (Exception error) { call.reject("Secure session storage failed.", error); }
    }

    @PluginMethod public void get(PluginCall call) {
        String storageKey = storageKey(call); if (storageKey == null) { call.reject("Secure storage key is invalid."); return; }
        String payload = preferences().getString(storageKey, null); JSObject result = new JSObject();
        if (payload == null) { result.put("value", JSObject.NULL); call.resolve(result); return; }
        try {
            String[] parts = payload.split("\\.", 2); Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
            result.put("value", new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8)); call.resolve(result);
        } catch (Exception error) { preferences().edit().remove(storageKey).apply(); call.reject("Secure session could not be read.", error); }
    }

    @PluginMethod public void remove(PluginCall call) {
        String storageKey = storageKey(call); if (storageKey == null) { call.reject("Secure storage key is invalid."); return; }
        preferences().edit().remove(storageKey).apply(); call.resolve();
    }
}
