package pro.holychords.offline;

import android.os.Bundle;
import android.util.Log;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.zip.GZIPInputStream;

/**
 * Приложение стартует с готовой базой: при первом запуске архив songs.db.gz
 * из assets распаковывается в системную папку баз данных, откуда его открывает
 * плагин @capacitor-community/sqlite (getDatabasePath("songs")).
 */
public class MainActivity extends BridgeActivity {

    private static final String TAG = "HolychordsOffline";
    private static final String DB_NAME = "songs";
    private static final String ASSET_NAME = "songs.db.gz";
    private static final long MIN_FREE_BYTES = 250L * 1024L * 1024L;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        installDatabase();
        super.onCreate(savedInstanceState);
    }

    private void installDatabase() {
        File dbFile = getDatabasePath(DB_NAME);
        if (dbFile.exists() && dbFile.length() > 0) {
            return;
        }

        File parent = dbFile.getParentFile();
        if (parent == null) {
            Log.e(TAG, "Не удалось получить каталог баз данных");
            return;
        }
        parent.mkdirs();

        if (parent.getUsableSpace() < MIN_FREE_BYTES) {
            Log.e(TAG, "Мало свободного места для распаковки базы");
            return;
        }

        File temp = new File(dbFile.getAbsolutePath() + ".tmp");
        try (InputStream raw = getAssets().open(ASSET_NAME);
             GZIPInputStream gz = new GZIPInputStream(raw);
             FileOutputStream out = new FileOutputStream(temp)) {
            byte[] buffer = new byte[1 << 16];
            int read;
            while ((read = gz.read(buffer)) > 0) {
                out.write(buffer, 0, read);
            }
        } catch (IOException error) {
            Log.e(TAG, "Не удалось распаковать базу из assets", error);
            temp.delete();
            return;
        }

        if (!temp.renameTo(dbFile)) {
            Log.e(TAG, "Не удалось заменить файл базы");
            temp.delete();
        }
    }
}
