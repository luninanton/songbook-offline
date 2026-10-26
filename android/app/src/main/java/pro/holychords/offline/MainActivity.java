package pro.holychords.offline;

import android.os.Bundle;
import android.util.Log;
import com.getcapacitor.BridgeActivity;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;

/**
 * Приложение стартует с готовой базой: файл songs.db из assets копируется
 * в системную папку баз данных как songsSQLite.db — именно этот путь открывает
 * плагин @capacitor-community/sqlite.
 *
 * Если в APK лежит база с другой схемой (assets/songs.schema), старая база удаляется
 * и копируется заново: иначе после обновления приложения запросы падали бы на
 * несовпадении колонок.
 */
public class MainActivity extends BridgeActivity {

    private static final String TAG = "HolychordsOffline";
    private static final String DB_FILE_NAME = "songsSQLite.db";
    private static final String ASSET_NAME = "songs.db";
    private static final String SCHEMA_ASSET = "songs.schema";
    private static final String SCHEMA_MARKER = "songsSQLite.schema";
    private static final long MIN_FREE_BYTES = 250L * 1024L * 1024L;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        installDatabase();
        super.onCreate(savedInstanceState);
    }

    private String readAssetText(String name, String fallback) {
        try (InputStream in = getAssets().open(name)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[1024];
            int read;
            while ((read = in.read(buffer)) > 0) out.write(buffer, 0, read);
            String value = out.toString("UTF-8").trim();
            return value.isEmpty() ? fallback : value;
        } catch (IOException error) {
            return fallback;
        }
    }

    private void installDatabase() {
        File dbFile = getDatabasePath(DB_FILE_NAME);
        File parent = dbFile.getParentFile();
        if (parent == null) {
            Log.e(TAG, "Не удалось получить каталог баз данных");
            return;
        }
        parent.mkdirs();

        String assetSchema = readAssetText(SCHEMA_ASSET, "1");
        File marker = new File(parent, SCHEMA_MARKER);
        String installedSchema = readMarker(marker);

        boolean needInstall = !dbFile.exists() || dbFile.length() == 0 || !assetSchema.equals(installedSchema);
        if (!needInstall) return;

        if (parent.getUsableSpace() < MIN_FREE_BYTES) {
            Log.e(TAG, "Мало свободного места для базы");
            return;
        }

        File temp = new File(dbFile.getAbsolutePath() + ".tmp");
        try (InputStream in = getAssets().open(ASSET_NAME);
             FileOutputStream out = new FileOutputStream(temp)) {
            byte[] buffer = new byte[1 << 16];
            int read;
            while ((read = in.read(buffer)) > 0) out.write(buffer, 0, read);
        } catch (IOException error) {
            Log.e(TAG, "Не удалось скопировать базу из assets", error);
            temp.delete();
            return;
        }

        // заменяем базу: файл журнала от прошлой версии больше не нужен
        dbFile.delete();
        new File(dbFile.getAbsolutePath() + "-wal").delete();
        new File(dbFile.getAbsolutePath() + "-shm").delete();

        if (!temp.renameTo(dbFile)) {
            Log.e(TAG, "Не удалось заменить файл базы");
            temp.delete();
            return;
        }

        writeMarker(marker, assetSchema);
        Log.i(TAG, "База установлена, схема " + assetSchema);
    }

    private String readMarker(File marker) {
        if (!marker.exists()) return "";
        try {
            return new String(java.nio.file.Files.readAllBytes(marker.toPath()), "UTF-8").trim();
        } catch (IOException error) {
            return "";
        }
    }

    private void writeMarker(File marker, String schema) {
        try (FileOutputStream out = new FileOutputStream(marker)) {
            out.write(schema.getBytes("UTF-8"));
        } catch (IOException error) {
            Log.e(TAG, "Не удалось записать маркер схемы", error);
        }
    }
}
