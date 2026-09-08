/**
 * Teach the shell's WebView to download files.
 *
 * Android WebView has NO default download handling: a tap on a download link —
 * the receipt PDF included — silently does nothing until the app installs a
 * DownloadListener. This rewrites MainActivity.java with one that handles
 *
 *   data:  URLs — decoded and written to the system Downloads
 *                 (MediaStore on API 29+, the app files dir before that);
 *                 the web app passes the filename as a `;name=` token,
 *                 because the anchor's `download` attribute never reaches
 *                 the listener;
 *   http(s) URLs — handed to DownloadManager with a completion notification.
 *
 * Idempotent: the whole file is generated, so re-running always converges.
 * This is a NATIVE capability — it ships with the APK, not with the site, so
 * it needs one rebuild + versionCode bump to reach users.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'android', 'app', 'src', 'main',
  'java', 'pl', 'lumi24', 'app', 'MainActivity.java');

if (!fs.existsSync(path.dirname(FILE))) {
  console.log('· MainActivity ещё нет — пропускаю (проект Android не создан)');
  process.exit(0);
}

const SRC = `package pl.lumi24.app;

import android.app.DownloadManager;
import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.URLUtil;
import android.widget.Toast;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    // WebView has no default download path — without this listener a tap on
    // any download link (the receipt PDF) silently does nothing.
    this.bridge.getWebView().setDownloadListener((url, ua, contentDisposition, mimetype, len) -> {
      try {
        if (url.startsWith("data:")) {
          saveDataUrl(url, mimetype);
        } else if (url.startsWith("http")) {
          DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
          req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
          req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS,
              URLUtil.guessFileName(url, contentDisposition, mimetype));
          ((DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE)).enqueue(req);
        }
      } catch (Exception e) {
        Toast.makeText(this, "Download failed", Toast.LENGTH_SHORT).show();
      }
    });
  }

  private void saveDataUrl(String url, String mimetype) throws Exception {
    int comma = url.indexOf(',');
    String header = url.substring(5, comma);
    // The anchor's download attribute never reaches this listener, so the web
    // app smuggles the filename in as a ";name=" token of the data URL.
    String name = "lumi-file";
    for (String part : header.split(";")) {
      if (part.startsWith("name=")) name = Uri.decode(part.substring(5));
    }
    String mime = header.contains("/") ? header.split(";")[0] : (mimetype != null ? mimetype : "application/octet-stream");
    byte[] bytes = Base64.decode(url.substring(comma + 1), Base64.DEFAULT);
    if (Build.VERSION.SDK_INT >= 29) {
      ContentValues cv = new ContentValues();
      cv.put(MediaStore.Downloads.DISPLAY_NAME, name);
      cv.put(MediaStore.Downloads.MIME_TYPE, mime);
      Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
      try (OutputStream os = getContentResolver().openOutputStream(uri)) { os.write(bytes); }
    } else {
      // API 24–28: the app's external files dir needs no storage permission.
      File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
      try (FileOutputStream os = new FileOutputStream(new File(dir, name))) { os.write(bytes); }
    }
    Toast.makeText(this, name, Toast.LENGTH_SHORT).show();
  }
}
`;

const before = fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf8') : '';
if (before === SRC) { console.log('✓ MainActivity уже с DownloadListener'); process.exit(0); }
fs.writeFileSync(FILE, SRC);
console.log('✓ MainActivity: DownloadListener установлен (скачивания в приложении работают)');
