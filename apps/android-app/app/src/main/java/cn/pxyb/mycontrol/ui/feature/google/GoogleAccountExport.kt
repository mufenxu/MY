package cn.pxyb.mycontrol.ui.feature.google

import android.content.Context
import android.content.Intent
import cn.pxyb.mycontrol.data.GoogleAccountRecord
import org.json.JSONArray
import org.json.JSONObject

internal fun exportGoogleAccounts(context: Context, accounts: List<GoogleAccountRecord>) {
    val payload = JSONObject().apply {
        put("version", 1)
        put("exportedAt", System.currentTimeMillis())
        put("accounts", JSONArray().apply {
            accounts.forEach { account ->
                put(JSONObject().apply {
                    put("id", account.id)
                    put("primaryEmail", account.primaryEmail)
                    put("displayName", account.displayName)
                    put("emailStatus", account.emailStatus)
                    put("openAiStatus", account.openAiStatus)
                    put("note", account.note)
                    put("lastCheckedAt", account.lastCheckedAt ?: JSONObject.NULL)
                    put("nextReviewAt", account.nextReviewAt ?: JSONObject.NULL)
                    put("tags", JSONArray().apply { account.tags.forEach { put(it) } })
                    put("archived", account.archived)
                    put("aliases", JSONArray().apply {
                        account.aliases.forEach { alias ->
                            put(JSONObject().apply {
                                put("id", alias.id)
                                put("address", alias.address)
                                put("aliasType", alias.aliasType)
                                put("aliasStatus", alias.aliasStatus)
                                put("openAiStatus", alias.openAiStatus)
                                put("registeredAt", alias.registeredAt ?: JSONObject.NULL)
                                put("lastVerifiedAt", alias.lastVerifiedAt ?: JSONObject.NULL)
                                put("note", alias.note)
                            })
                        }
                    })
                })
            }
        })
    }
    val shareIntent = Intent(Intent.ACTION_SEND).apply {
        type = "application/json"
        putExtra(Intent.EXTRA_SUBJECT, "Google 邮箱台账备份")
        putExtra(Intent.EXTRA_TEXT, payload.toString(2))
    }
    context.startActivity(Intent.createChooser(shareIntent, "导出邮箱台账"))
}
