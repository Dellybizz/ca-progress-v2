package com.notificationvault.client;

import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;

final class SyncScheduler {
    private static final int IMMEDIATE_JOB_ID = 82301;
    private static final int PERIODIC_JOB_ID = 82302;

    private SyncScheduler() {}

    static void scheduleNow(Context context) {
        JobScheduler scheduler = context.getSystemService(JobScheduler.class);
        if (scheduler == null) return;
        JobInfo job = new JobInfo.Builder(
                IMMEDIATE_JOB_ID,
                new ComponentName(context, SyncJobService.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setMinimumLatency(1000L)
                .setOverrideDeadline(15000L)
                .build();
        scheduler.schedule(job);
    }

    static void schedulePeriodic(Context context) {
        JobScheduler scheduler = context.getSystemService(JobScheduler.class);
        if (scheduler == null) return;
        JobInfo job = new JobInfo.Builder(
                PERIODIC_JOB_ID,
                new ComponentName(context, SyncJobService.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPersisted(true)
                .setPeriodic(15L * 60L * 1000L)
                .build();
        scheduler.schedule(job);
    }
}
