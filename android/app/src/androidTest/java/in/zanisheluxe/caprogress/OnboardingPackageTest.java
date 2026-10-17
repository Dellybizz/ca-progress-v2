package in.zanisheluxe.caprogress;

import static org.junit.Assert.*;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.security.MessageDigest;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;
import org.json.JSONArray;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Installed-package and Android SQLite tests. No credentials or production data. */
@RunWith(AndroidJUnit4.class)
public class OnboardingPackageTest {
    private Context target() { return InstrumentationRegistry.getInstrumentation().getTargetContext(); }
    private byte[] asset(Context context, String path) throws Exception {
        try (InputStream stream=context.getAssets().open(path); ByteArrayOutputStream output=new ByteArrayOutputStream()) {
            byte[] buffer=new byte[8192]; int size;
            while ((size=stream.read(buffer))!=-1) output.write(buffer,0,size);
            return output.toByteArray();
        }
    }
    private String text(Context context,String path) throws Exception { return new String(asset(context,path),StandardCharsets.UTF_8); }
    private String hex(byte[] bytes) { StringBuilder value=new StringBuilder(); for(byte item:bytes)value.append(String.format("%02x",item&255)); return value.toString(); }
    private String value(SQLiteDatabase database,String key) {
        try(Cursor cursor=database.rawQuery("SELECT value FROM local_meta WHERE key=?",new String[]{key})) { return cursor.moveToFirst()?cursor.getString(0):null; }
    }
    @Test public void installedPackageContainsVerifiedOfflineAssets() throws Exception {
        assertEquals("in.zanisheluxe.caprogress",target().getPackageName());
        JSONObject config=new JSONObject(text(target(),"capacitor.config.json"));
        assertFalse("APK must use installed assets, not live reload",config.has("server"));
        assertTrue(text(target(),"public/index.html").contains("assets/app.js"));
        assertTrue(asset(target(),"public/assets/app.js").length>100000);
        assertTrue(asset(target(),"public/assets/app.css").length>1000);
        JSONObject manifest=new JSONObject(text(target(),"public/assets/onboarding/manifest.json"));
        JSONArray assets=manifest.getJSONArray("assets"); assertEquals(2,assets.length());
        for(int i=0;i<assets.length();i++){
            JSONObject entry=assets.getJSONObject(i); byte[] bytes=asset(target(),"public/"+entry.getString("path"));
            assertEquals(entry.getLong("bytes"),bytes.length);
            assertEquals(entry.getString("sha256"),hex(MessageDigest.getInstance("SHA-256").digest(bytes)));
        }
    }
    @Test public void androidSqliteRetainsDraftAndGuardsAtomicHandoff() throws Exception {
        JSONObject sql=new JSONObject(text(InstrumentationRegistry.getInstrumentation().getContext(),"onboarding-sql.json"));
        File file=File.createTempFile("onboarding-certification-",".db",target().getCacheDir());
        SQLiteDatabase database=null;
        String source="ca.onboarding.v1:installation", destination="ca.onboarding.v1:account:test-a", other="ca.onboarding.v1:account:test-b";
        String device="{\"localVersion\":1,\"writeId\":\"device\",\"draft\":{\"dailyTargetMinutes\":147}}", account="{\"localVersion\":1,\"writeId\":\"account\"}";
        try {
            database=SQLiteDatabase.openOrCreateDatabase(file,null);
            database.execSQL("CREATE TABLE local_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL)");
            database.execSQL("CREATE TABLE retained_history(value TEXT NOT NULL)");
            database.execSQL("INSERT INTO retained_history VALUES('keep-existing-progress')");
            database.execSQL(sql.getString("setupLocalCasSql"),new Object[]{source,device,"now",null});
            database.execSQL(sql.getString("setupLocalCasSql"),new Object[]{source,"stale-overwrite","now",null});
            assertEquals(device,value(database,source));
            database.close(); database=SQLiteDatabase.openOrCreateDatabase(file,null);
            assertEquals("Draft survives closing and reopening the Android database",device,value(database,source));
            database.execSQL(sql.getString("setupLocalCasSql"),new Object[]{other,"other-account","now",null});
            database.beginTransaction();
            try {
                database.execSQL(sql.getString("setupHandoffSql"),new Object[]{destination,account,"now",null,source,"stale-source"});
                database.execSQL(sql.getString("setupHandoffDeleteSql"),new Object[]{source,device,destination,account});
                database.setTransactionSuccessful();
            } finally { database.endTransaction(); }
            assertNull(value(database,destination)); assertEquals(device,value(database,source));
            database.beginTransaction();
            try {
                database.execSQL(sql.getString("setupHandoffSql"),new Object[]{destination,account,"now",null,source,device});
                database.execSQL(sql.getString("setupHandoffDeleteSql"),new Object[]{source,device,destination,account});
                database.setTransactionSuccessful();
            } finally { database.endTransaction(); }
            assertEquals(account,value(database,destination)); assertNull(value(database,source));
            assertEquals("other-account",value(database,other));
            try(Cursor cursor=database.rawQuery("SELECT value FROM retained_history",null)){assertTrue(cursor.moveToFirst());assertEquals("keep-existing-progress",cursor.getString(0));}
        } finally {
            if(database!=null&&database.isOpen())database.close();
            SQLiteDatabase.deleteDatabase(file);
        }
    }
}
