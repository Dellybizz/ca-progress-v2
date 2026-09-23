package in.zanisheluxe.caprogress.localdatabase;

import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.nio.file.Files;

@CapacitorPlugin(name = "LocalDatabase")
public class LocalDatabasePlugin extends Plugin {
    private static final String NAME = "ca-progress-local.db";
    private SQLiteDatabase database;
    private File file() { return getContext().getDatabasePath(NAME); }
    private File backup() { return new File(file().getPath() + ".recovery"); }
    private void closeDatabase() { if (database != null && database.isOpen()) database.close(); database = null; }
    private SQLiteDatabase db() { if (database == null || !database.isOpen()) database = SQLiteDatabase.openOrCreateDatabase(file(), null); return database; }
    private Object[] values(JSArray input) throws Exception { Object[] output = new Object[input.length()]; for (int i=0;i<input.length();i++) { Object value=input.get(i); output[i]=value==JSObject.NULL?null:value; } return output; }

    @PluginMethod public void open(PluginCall call) {
        boolean recovered = false;
        try {
            database = SQLiteDatabase.openOrCreateDatabase(file(), null); database.execSQL("PRAGMA foreign_keys=ON");
            try (Cursor cursor = database.rawQuery("PRAGMA integrity_check", null)) {
                if (!cursor.moveToFirst() || !"ok".equalsIgnoreCase(cursor.getString(0))) throw new IllegalStateException("integrity check failed");
            }
        } catch (Exception error) {
            try { closeDatabase(); if (!backup().exists()) throw error; Files.copy(backup().toPath(), file().toPath(), java.nio.file.StandardCopyOption.REPLACE_EXISTING); database=SQLiteDatabase.openOrCreateDatabase(file(),null); recovered=true; }
            catch (Exception recoveryError) { call.reject("Local database could not be recovered.", recoveryError); return; }
        }
        JSObject result=new JSObject(); result.put("recovered",recovered); call.resolve(result);
    }

    @PluginMethod public void execute(PluginCall call) {
        String sql=call.getString("sql"); JSArray args=call.getArray("args",new JSArray()); if(sql==null){call.reject("SQL is required.");return;}
        try { db().execSQL(sql,values(args)); call.resolve(); } catch(Exception error){call.reject("Local database write failed.",error);}
    }

    @PluginMethod public void transaction(PluginCall call) {
        JSArray statements=call.getArray("statements",new JSArray()); SQLiteDatabase target=db(); target.beginTransaction();
        try { for(int i=0;i<statements.length();i++){JSObject item=statements.getJSObject(i);target.execSQL(item.getString("sql"),values(item.getJSArray("args")));} target.setTransactionSuccessful(); call.resolve(); }
        catch(Exception error){call.reject("Local database transaction failed.",error);} finally {target.endTransaction();}
    }

    @PluginMethod public void query(PluginCall call) {
        String sql=call.getString("sql"); JSArray args=call.getArray("args",new JSArray()); if(sql==null){call.reject("SQL is required.");return;}
        String[] bind=new String[args.length()]; try { for(int i=0;i<args.length();i++){Object value=args.get(i);bind[i]=value==JSObject.NULL?null:String.valueOf(value);} JSArray rows=new JSArray();
            try(Cursor cursor=db().rawQuery(sql,bind)){while(cursor.moveToNext()){JSObject row=new JSObject();for(int column=0;column<cursor.getColumnCount();column++){String name=cursor.getColumnName(column);switch(cursor.getType(column)){case Cursor.FIELD_TYPE_NULL:row.put(name,JSObject.NULL);break;case Cursor.FIELD_TYPE_INTEGER:row.put(name,cursor.getLong(column));break;case Cursor.FIELD_TYPE_FLOAT:row.put(name,cursor.getDouble(column));break;case Cursor.FIELD_TYPE_BLOB:row.put(name,android.util.Base64.encodeToString(cursor.getBlob(column),android.util.Base64.NO_WRAP));break;default:row.put(name,cursor.getString(column));}}rows.put(row);}}
            JSObject result=new JSObject();result.put("rows",rows);call.resolve(result);
        } catch(Exception error){call.reject("Local database query failed.",error);}
    }

    @PluginMethod public void checkpoint(PluginCall call) { try { closeDatabase(); if(file().exists()) Files.copy(file().toPath(),backup().toPath(),java.nio.file.StandardCopyOption.REPLACE_EXISTING); db(); call.resolve(); } catch(Exception error){call.reject("Recovery checkpoint failed.",error);} }
    @PluginMethod public void restore(PluginCall call) { try { closeDatabase(); if(!backup().exists()) throw new IllegalStateException("No recovery checkpoint exists."); Files.copy(backup().toPath(),file().toPath(),java.nio.file.StandardCopyOption.REPLACE_EXISTING); db(); call.resolve(); } catch(Exception error){call.reject("Recovery restore failed.",error);} }
    @PluginMethod public void wipe(PluginCall call) { try { closeDatabase(); Files.deleteIfExists(file().toPath()); Files.deleteIfExists(backup().toPath()); call.resolve(); } catch(Exception error){call.reject("Local database wipe failed.",error);} }
}
