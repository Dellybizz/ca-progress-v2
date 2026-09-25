package com.notificationvault.client;

import android.app.job.JobParameters;
import android.app.job.JobService;

public class SyncJobService extends JobService {
    private volatile boolean stopped;

    @Override
    public boolean onStartJob(JobParameters params) {
        stopped = false;
        new Thread(() -> {
            TokenStore store = new TokenStore(getApplicationContext());
            try {
                if (!stopped && store.hasToken()) {
                    new VaultApi(getApplicationContext()).syncPending();
                }
            } catch (Exception e) {
                store.setLastError(e.getMessage() == null ? "Sync failed" : e.getMessage());
            } finally {
                jobFinished(params, false);
            }
        }, "vault-sync").start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        stopped = true;
        return true;
    }
}
