package in.zanisheluxe.caprogress.filevault;

import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;

@CapacitorPlugin(name = "FileVault")
public final class FileVaultPlugin extends Plugin {
  private static final String ACCOUNT_PATTERN = "^[A-Za-z0-9:_-]{1,160}$";
  private static final String FILE_PATTERN = "^[A-Za-z0-9_-]{1,160}$";

  private File accountDirectory(String accountId) throws Exception {
    if (accountId == null || !accountId.matches(ACCOUNT_PATTERN)) throw new Exception("Invalid account.");
    String id = accountId;
    File directory = new File(getContext().getFilesDir(), "ca-progress-files/"+id);
    if (!directory.exists() && !directory.mkdirs()) throw new Exception("Account directory unavailable.");
    return directory;
  }

  private File file(PluginCall call) throws Exception {
    String fileId = call.getString("fileId");
    if (fileId == null || !fileId.matches(FILE_PATTERN)) throw new Exception("Invalid file.");
    return new File(accountDirectory(call.getString("accountId")), fileId);
  }

  private static String checksum(byte[] bytes) throws Exception {
    byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
    StringBuilder result = new StringBuilder(digest.length * 2);
    for (byte value : digest) result.append(String.format("%02x", value));
    return result.toString();
  }

  private static void removeTree(File target) throws Exception {
    if (!target.exists()) return;
    File[] children = target.listFiles();
    if (children != null) for (File child : children) removeTree(child);
    if (!target.delete()) throw new Exception("File removal failed.");
  }

  @PluginMethod
  public void write(PluginCall call) {
    File temporary = null;
    try {
      String encoded = call.getString("base64");
      if (encoded == null) throw new Exception("Missing file data.");
      byte[] bytes = Base64.decode(encoded, Base64.DEFAULT);
      File target = file(call);
      temporary = new File(target.getParentFile(), target.getName() + ".part");
      try (FileOutputStream output = new FileOutputStream(temporary)) {
        output.write(bytes);
        output.getFD().sync();
      }
      if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
        Files.move(temporary.toPath(), target.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
      } else {
        if (target.exists() && !target.delete()) throw new Exception("Existing file unavailable.");
        if (!temporary.renameTo(target)) throw new Exception("Atomic file commit failed.");
      }
      JSObject result = new JSObject();
      result.put("fileId", call.getString("fileId"));
      result.put("nativePath", target.getAbsolutePath());
      result.put("byteSize", bytes.length);
      result.put("checksum", checksum(bytes));
      call.resolve(result);
    } catch (Exception error) {
      if (temporary != null) temporary.delete();
      call.reject("File could not be saved.", error);
    }
  }

  @PluginMethod
  public void read(PluginCall call) {
    try {
      byte[] bytes = Files.readAllBytes(file(call).toPath());
      JSObject result = new JSObject();
      result.put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP));
      result.put("byteSize", bytes.length);
      call.resolve(result);
    } catch (Exception error) {
      call.reject("Offline file unavailable.", error);
    }
  }

  @PluginMethod
  public void remove(PluginCall call) {
    try {
      File target = file(call);
      if (target.exists() && !target.delete()) throw new Exception("File removal failed.");
      call.resolve();
    } catch (Exception error) {
      call.reject("Offline file could not be removed.", error);
    }
  }

  @PluginMethod
  public void wipeAccount(PluginCall call) {
    try {
      removeTree(accountDirectory(call.getString("accountId")));
      call.resolve();
    } catch (Exception error) {
      call.reject("Account files could not be removed.", error);
    }
  }
}
