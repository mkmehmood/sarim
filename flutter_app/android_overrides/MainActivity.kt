package com.gullzubair.sarim

import android.content.ActivityNotFoundException
import android.content.ContentValues
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.io.IOException

class MainActivity : FlutterFragmentActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "sarim/native").setMethodCallHandler { call, result ->
            when (call.method) {
                "saveToDownloads" -> try {
                    val filename = call.argument<String>("filename") ?: "file"
                    val mime = call.argument<String>("mime") ?: "application/octet-stream"
                    val data = call.argument<String>("data") ?: ""
                    result.success(saveToDownloads(filename, mime, data))
                } catch (e: Exception) {
                    result.error("SAVE_FAILED", e.message, null)
                }
                "openFile" -> try {
                    val uri = Uri.parse(call.argument<String>("uri") ?: "")
                    val intent = Intent(Intent.ACTION_VIEW).apply {
                        setDataAndType(uri, call.argument<String>("mime") ?: "*/*")
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    startActivity(intent)
                    result.success(null)
                } catch (e: ActivityNotFoundException) {
                    result.error("NO_APP", "No app found to open this file", null)
                } catch (e: Exception) {
                    result.error("OPEN_FAILED", e.message, null)
                }
                "setWindowBackground" -> try {
                    val color = call.argument<String>("color") ?: "#0F172A"
                    window.setBackgroundDrawable(ColorDrawable(Color.parseColor(color)))
                    result.success(null)
                } catch (e: Exception) {
                    result.error("BAD_COLOR", e.message, null)
                }
                else -> result.notImplemented()
            }
        }
    }

    private fun saveToDownloads(filename: String, mime: String, base64: String): Map<String, String> {
        val bytes = Base64.decode(base64, Base64.DEFAULT)
        val folder = "Gull-Zubair"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, filename)
                put(MediaStore.MediaColumns.MIME_TYPE, mime)
                put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + folder)
            }
            val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                ?: throw IOException("Could not create file in Downloads")
            contentResolver.openOutputStream(uri)?.use { it.write(bytes) } ?: throw IOException("Could not open output stream")
            return mapOf("uri" to uri.toString(), "path" to "Downloads/$folder/$filename")
        }
        val dir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), folder)
        if (!dir.exists() && !dir.mkdirs()) throw IOException("Could not create Downloads folder")
        val file = File(dir, filename)
        file.writeBytes(bytes)
        MediaScannerConnection.scanFile(this, arrayOf(file.absolutePath), arrayOf(mime), null)
        return mapOf("uri" to Uri.fromFile(file).toString(), "path" to "Downloads/$folder/$filename")
    }
}
