package pro.holychords.offline;

import android.os.Bundle;
import android.util.Log;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;

/**
 * Приложение стартует с готовой базой: при первом запуске файл songs.db из assets
 * копируется в системную папку баз данных как songsSQLite.db — именно этот путь
 * открывает плагин @capacitor-community/sqlite (dbName + "SQLite.db").
 *
 * В APK база лежит как assets/songs.db: Android Gradle Plugin сам распаковывает
 * .gz-ассеты при упаковке, а внутри zip файл всё равно сжимается дефлейтом.
 */
public class MainActivity extends BridgeActivity {

    private static final String TAG = "HolychordsOffline";
    private static final String DB_FILE_NAME = "songsSQLite.db";
    private static final String ASSET_NAME = "songs.db";
    private static final long MIN_FREE_BYTES = 250L * 1024L * 1024L;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        installDatabase();
        super.onCreate(savedInstanceState);
    }

    private void installDatabase() {
        File dbFile = getDatabasePath(DB_FILE_NAME);
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
            Log.e(TAG, "Мало свободного места для базы");
            return;
        }

        File temp = new File(dbFile.getAbsolutePath() + ".tmp");
        try (InputStream in = getAssets().open(ASSET_NAME);
             FileOutputStream out = new FileOutputStream(temp)) {
            byte[] buffer = new byte[1 << 16];
            int read;
            while ((read = in.read(buffer)) > 0) {
                out.write(buffer, 0, read);
            }
        } catch (IOException error) {
            Log.e(TAG, "Не удалось скопировать базу из assets", error);
            temp.delete();
            return;
        }

        if (!temp.renameTo(dbFile)) {
            Log.e(TAG, "Не удалось заменить файл базы");
            temp.delete();
        }
    }
}
