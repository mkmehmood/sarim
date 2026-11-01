package com.gullzubair.sarim;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

public class KeepAliveService extends Service {

    static final String CHANNEL_ID = "sarim_background";
    static final int NOTIFICATION_ID = 4101;
    static volatile boolean running = false;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        try {
            ensureChannel(this);
            Notification note = buildNotification(this);
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(NOTIFICATION_ID, note, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            } else {
                startForeground(NOTIFICATION_ID, note);
            }
            running = true;
        } catch (Exception e) {
            running = false;
            stopSelf();
            return START_NOT_STICKY;
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || nm.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "Running in background", NotificationManager.IMPORTANCE_LOW);
        ch.setDescription("Keeps the app connected so approvals and updates arrive when it is closed.");
        ch.setShowBadge(false);
        nm.createNotificationChannel(ch);
    }

    private static Notification buildNotification(Context ctx) {
        Intent open = new Intent(ctx, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(ctx, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder b = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(ctx, CHANNEL_ID)
            : new Notification.Builder(ctx);
        b.setSmallIcon(R.drawable.ic_stat_background)
            .setContentTitle("Gull & Zubair is running")
            .setContentText("Staying connected so you get approvals and updates.")
            .setContentIntent(tap)
            .setOngoing(true)
            .setShowWhen(false);
        return b.build();
    }
}
