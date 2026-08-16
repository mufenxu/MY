package cn.pxyb.mycontrol

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import cn.pxyb.mycontrol.data.ResourceExpiry
import cn.pxyb.mycontrol.data.accountStorageScope
import java.security.MessageDigest
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZonedDateTime
import java.util.concurrent.TimeUnit

class ResourceExpiryReminderWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val username = inputData.getString(KEY_USERNAME)?.takeIf(String::isNotBlank) ?: return Result.failure()
        val resource = ResourceExpiry(
            id = inputData.getString(KEY_RESOURCE_ID)?.takeIf(String::isNotBlank) ?: return Result.failure(),
            type = inputData.getString(KEY_RESOURCE_TYPE).orEmpty(),
            name = inputData.getString(KEY_RESOURCE_NAME).orEmpty().ifBlank { "未命名资源" },
            expiresAt = inputData.getString(KEY_EXPIRES_AT)?.takeIf(String::isNotBlank) ?: return Result.failure(),
            advanceNoticeDays = inputData.getInt(KEY_ADVANCE_DAYS, 0).coerceAtLeast(0),
        )
        val notifier = AlertNotifier(applicationContext).apply { setAccount(username) }
        return if (notifier.notifyResourceExpiry(resource)) Result.success() else Result.retry()
    }

    companion object {
        internal const val KEY_USERNAME = "username"
        internal const val KEY_RESOURCE_ID = "resource_id"
        internal const val KEY_RESOURCE_TYPE = "resource_type"
        internal const val KEY_RESOURCE_NAME = "resource_name"
        internal const val KEY_EXPIRES_AT = "expires_at"
        internal const val KEY_ADVANCE_DAYS = "advance_days"
    }
}

object ResourceExpiryReminderScheduler {
    private const val PREFERENCES = "resource_expiry_reminder_schedule"
    private const val WORK_PREFIX = "resource-expiry-reminder"
    private val reminderTime: LocalTime = LocalTime.of(9, 0)

    fun schedule(context: Context, username: String?, resources: List<ResourceExpiry>) {
        val normalizedUsername = username?.trim()?.takeIf(String::isNotEmpty) ?: return
        val scope = accountStorageScope(normalizedUsername) ?: return
        val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
        val previousNames = preferences.getStringSet(scope, emptySet()).orEmpty()
        val nextNames = mutableSetOf<String>()
        val now = ZonedDateTime.now()
        val manager = WorkManager.getInstance(context)

        resources.forEach { resource ->
            val expiresAt = runCatching { LocalDate.parse(resource.expiresAt) }.getOrNull() ?: return@forEach
            val triggerAt = expiresAt
                .minusDays(resource.advanceNoticeDays.coerceIn(0, 3650).toLong())
                .atTime(reminderTime)
                .atZone(now.zone)

            val workName = "$WORK_PREFIX:$scope:${stableId(resource.id)}"
            nextNames += workName
            val delayMillis = (triggerAt.toInstant().toEpochMilli() - now.toInstant().toEpochMilli()).coerceAtLeast(0L)
            val request = OneTimeWorkRequestBuilder<ResourceExpiryReminderWorker>()
                .setInitialDelay(delayMillis, TimeUnit.MILLISECONDS)
                .setInputData(
                    workDataOf(
                        ResourceExpiryReminderWorker.KEY_USERNAME to normalizedUsername,
                        ResourceExpiryReminderWorker.KEY_RESOURCE_ID to resource.id,
                        ResourceExpiryReminderWorker.KEY_RESOURCE_TYPE to resource.type,
                        ResourceExpiryReminderWorker.KEY_RESOURCE_NAME to resource.name,
                        ResourceExpiryReminderWorker.KEY_EXPIRES_AT to resource.expiresAt,
                        ResourceExpiryReminderWorker.KEY_ADVANCE_DAYS to resource.advanceNoticeDays,
                    ),
                )
                .build()
            manager.enqueueUniqueWork(workName, ExistingWorkPolicy.REPLACE, request)
        }

        (previousNames - nextNames).forEach { manager.cancelUniqueWork(it) }
        preferences.edit().putStringSet(scope, nextNames).apply()
    }

    fun cancel(context: Context, username: String?) {
        val scope = accountStorageScope(username) ?: return
        val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
        val manager = WorkManager.getInstance(context)
        preferences.getStringSet(scope, emptySet()).orEmpty().forEach { manager.cancelUniqueWork(it) }
        preferences.edit().remove(scope).apply()
    }

    private fun stableId(value: String): String = MessageDigest.getInstance("SHA-256")
        .digest(value.toByteArray(Charsets.UTF_8))
        .take(12)
        .joinToString(separator = "") { byte -> "%02x".format(byte) }
}
