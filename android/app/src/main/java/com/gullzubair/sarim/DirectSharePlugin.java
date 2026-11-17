package com.gullzubair.sarim;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.provider.Telephony;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSArray;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.util.ArrayList;

@CapacitorPlugin(name = "DirectShare")
public class DirectSharePlugin extends Plugin {
    private static final String[] WHATSAPP_PACKAGES = {"com.whatsapp", "com.whatsapp.w4b"};

    @PluginMethod
    public void shareToWhatsApp(PluginCall call) {
        String mime = call.getString("mime", "*/*");
        String text = call.getString("text");
        String phone = call.getString("phone");
        JSArray list = call.getArray("uris");
        if (list == null || list.length() == 0) {
            call.reject("uris are required");
            return;
        }
        Activity activity = getActivity();
        Context ctx = getContext();
        try {
            ArrayList<Uri> streams = new ArrayList<>();
            for (int i = 0; i < list.length(); i++) {
                String path = Uri.parse(list.getString(i)).getPath();
                File file = path == null ? null : new File(path);
                if (file == null || !file.exists()) {
                    call.reject("A file to share is missing");
                    return;
                }
                streams.add(FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", file));
            }
            String target = installedWhatsApp(ctx);
            if (target == null) {
                call.reject("WhatsApp is not installed", "NOT_INSTALLED");
                return;
            }
            Intent intent;
            if (streams.size() == 1) {
                intent = new Intent(Intent.ACTION_SEND);
                intent.putExtra(Intent.EXTRA_STREAM, streams.get(0));
            } else {
                intent = new Intent(Intent.ACTION_SEND_MULTIPLE);
                intent.putParcelableArrayListExtra(Intent.EXTRA_STREAM, streams);
            }
            intent.setType(mime);
            ClipData clip = ClipData.newRawUri("share", streams.get(0));
            for (int i = 1; i < streams.size(); i++) clip.addItem(new ClipData.Item(streams.get(i)));
            intent.setClipData(clip);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            if (text != null && !text.isEmpty()) intent.putExtra(Intent.EXTRA_TEXT, text);
            if (phone != null && !phone.isEmpty()) intent.putExtra("jid", phone + "@s.whatsapp.net");
            intent.setPackage(target);
            activity.startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("WhatsApp could not be opened", "NOT_INSTALLED");
        } catch (Exception e) {
            call.reject("Share failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void openChat(PluginCall call) {
        String phone = call.getString("phone");
        if (phone == null || phone.isEmpty()) {
            call.reject("phone is required");
            return;
        }
        Context ctx = getContext();
        try {
            String target = installedWhatsApp(ctx);
            if (target == null) {
                call.reject("WhatsApp is not installed", "NOT_INSTALLED");
                return;
            }
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("whatsapp://send?phone=" + Uri.encode(phone)));
            intent.setPackage(target);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("WhatsApp could not be opened", "NOT_INSTALLED");
        } catch (Exception e) {
            call.reject("Could not open WhatsApp: " + e.getMessage());
        }
    }

    @PluginMethod
    public void sendText(PluginCall call) {
        String text = call.getString("text", "");
        String phone = call.getString("phone");
        Context ctx = getContext();
        try {
            String number = (phone != null && !phone.isEmpty()) ? "+" + phone : "";
            Intent intent = new Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:" + number));
            intent.putExtra("sms_body", text);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            String pkg = Telephony.Sms.getDefaultSmsPackage(ctx);
            if (pkg != null) intent.setPackage(pkg);
            getActivity().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("No messages app found", "NOT_INSTALLED");
        } catch (Exception e) {
            call.reject("Could not open messages: " + e.getMessage());
        }
    }

    private String installedWhatsApp(Context ctx) {
        PackageManager pm = ctx.getPackageManager();
        for (String pkg : WHATSAPP_PACKAGES) {
            try {
                pm.getPackageInfo(pkg, 0);
                return pkg;
            } catch (PackageManager.NameNotFoundException ignored) {
            }
        }
        return null;
    }
}
