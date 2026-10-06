package cn.pxyb.mycontrol.ui.feature.authenticator

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import cn.pxyb.mycontrol.AppSessionLifecycle
import cn.pxyb.mycontrol.data.*
import java.util.UUID
import javax.crypto.AEADBadTagException
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import org.json.JSONArray
import org.json.JSONObject

data class VaultHistory(val revision: Int, val updatedAt: Long)
data class AuthenticatorUiState(
  val loading: Boolean = false,
  val entries: List<AuthenticatorEntry> = emptyList(),
  val message: String? = null,
  val error: String? = null,
  val busy: Boolean = false,
  val locked: Boolean = true,
  val cloudEnabled: Boolean = false,
  val cloudExists: Boolean = false,
  val lastSyncedAt: Long = 0,
  val pending: Boolean = false,
  val devices: Int = 0,
  val needsReauthentication: Boolean = false,
  val history: List<VaultHistory> = emptyList(),
)

class AuthenticatorViewModel(application: Application) : AndroidViewModel(application) {
  private val sessions = SessionStore(application)
  private val api = PlatformApi(sessions, ResponseSnapshotStore(application))
  private val mutableState = MutableStateFlow(AuthenticatorUiState())
  val state: StateFlow<AuthenticatorUiState> = mutableState.asStateFlow()
  private var visible = false
  private var generation = 0L
  private var job: Job? = null
  private var processing = false
  private fun online(): Boolean {
    val manager = getApplication<Application>().getSystemService(android.net.ConnectivityManager::class.java)
    val capabilities = manager.getNetworkCapabilities(manager.activeNetwork) ?: return false
    return capabilities.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_VALIDATED)
  }

  fun unlock(authorize: suspend () -> Boolean) {
    visible = true
    perform(authorize) { store, owner, entries ->
      val cloud = store.readCloud()
      if (cloud != null) sync(store, owner, entries, cloud)
      else {
        try {
          val remote = if (online()) api.authenticatorVault().optJSONObject("vault") else null
          mutableState.update { it.copy(cloudExists = remote != null) }
        } catch (error: Exception) { if (error is CancellationException) throw error }
        entries
      }
    }
  }
  fun lock() {
    generation++
    if (processing) job?.cancel()
    mutableState.value.entries.forEach { it.secret.fill(0) }
    mutableState.update { it.copy(locked = true, entries = emptyList(), message = null, error = null) }
  }
  fun leave() { visible = false; lock(); job?.cancel() }
  fun newRecoveryCode(): String {
    val key = AuthenticatorVault.randomKey()
    return try { AuthenticatorVault.recoveryCode(key) } finally { key.fill(0) }
  }
  fun addFromUri(uri: String, authorize: suspend () -> Boolean) = add(authorize) { Authenticator.parseOtpAuthUri(uri) }
  fun addManual(issuer: String, account: String, secret: String, authorize: suspend () -> Boolean) = add(authorize) {
    Authenticator.createEntry(issuer = issuer, account = account, secret = Authenticator.decodeBase32(secret))
  }
  private fun add(authorize: suspend () -> Boolean, parse: () -> AuthenticatorEntry) = perform(authorize) { store, owner, entries ->
    val entry = parse()
    if (entries.any { it.issuer.equals(entry.issuer, true) && it.account.equals(entry.account, true) && it.secret.contentEquals(entry.secret) }) {
      entry.secret.fill(0); error("该验证器条目已存在。")
    }
    saveChange(store, owner, entries + entry, null)
  }
  fun delete(id: String, authorize: suspend () -> Boolean) = perform(authorize) { store, owner, entries ->
    saveChange(store, owner, entries.filterNot { it.id == id }, id)
  }
  private suspend fun saveChange(store: AuthenticatorStore, owner: String, entries: List<AuthenticatorEntry>, deletedId: String?): List<AuthenticatorEntry> {
    val cloud = store.readCloud()
    cloud?.let {
      val removed = deleted(it).toMutableSet().apply { deletedId?.let(::add) }
      it.put("deleted", JSONArray(removed.toList())).put("dirty", true)
      preparePending(owner, entries, it)
    }
    store.write(entries, cloud)
    return if (cloud != null) sync(store, owner, entries, cloud) else entries
  }
  fun synchronize(authorize: suspend () -> Boolean, passkey: suspend (String) -> String) = perform(authorize, if (mutableState.value.needsReauthentication) passkey else null) { store, owner, entries ->
    sync(store, owner, entries, requireNotNull(store.readCloud()) { "请先启用云端备份。" })
  }
  fun enable(code: String, authorize: suspend () -> Boolean, passkey: suspend (String) -> String) = perform(authorize, passkey) { store, owner, entries ->
    require(store.readCloud() == null) { "云端备份已经启用。" }
    require(api.authenticatorVault().optJSONObject("vault") == null) { "账号已有云端备份，请使用恢复密钥恢复。" }
    val master = AuthenticatorVault.randomKey()
    val recovery = AuthenticatorVault.recoveryKey(code)
    val id = UUID.randomUUID().toString()
    try {
      val cloud = JSONObject().put("version", 1).put("vaultId", id).put("keyVersion", 1)
        .put("master", AuthenticatorVault.encode(master)).put("wrappedKey", AuthenticatorVault.wrap(master, recovery, owner, id, 1))
        .put("revision", 0).put("deleted", JSONArray()).put("dirty", true)
      preparePending(owner, entries, cloud)
      store.write(entries, cloud)
      sync(store, owner, entries, cloud)
    } finally { master.fill(0); recovery.fill(0) }
  }
  fun restore(code: String, authorize: suspend () -> Boolean, passkey: suspend (String) -> String) = perform(authorize, passkey) { store, owner, entries ->
    val remote = requireNotNull(api.authenticatorVault().optJSONObject("vault")) { "账号尚无云端备份。" }
    val recovery = AuthenticatorVault.recoveryKey(code)
    val master = try { AuthenticatorVault.unwrap(recovery, owner, remote) } finally { recovery.fill(0) }
    try {
      val payload = AuthenticatorVault.decrypt(master, owner, remote)
      val recovered = AuthenticatorVault.entries(payload.getJSONArray("entries"))
      try {
        val removed = AuthenticatorVault.deleted(payload)
        val merged = merge(entries, recovered, removed)
        api.authenticatorVault("/devices", "POST", JSONObject().put("revision", remote.getInt("revision")))
        val cloud = JSONObject(remote.toString()).put("master", AuthenticatorVault.encode(master))
          .put("deleted", JSONArray(removed.toList())).put("dirty", true)
        preparePending(owner, merged, cloud)
        store.write(merged, cloud)
        sync(store, owner, merged, cloud)
      } finally { recovered.forEach { it.secret.fill(0) } }
    } finally { master.fill(0) }
  }
  fun restoreHistory(revision: Int, authorize: suspend () -> Boolean) = perform(authorize) { store, owner, entries ->
    val cloud = requireNotNull(store.readCloud())
    val remote = api.authenticatorVault("/history/$revision").getJSONObject("vault")
    require(remote.getString("vaultId") == cloud.getString("vaultId") && remote.getInt("keyVersion") == cloud.getInt("keyVersion")) { "历史备份密钥版本不匹配。" }
    val master = AuthenticatorVault.decode(cloud.getString("master"))
    val recovered = try { AuthenticatorVault.entries(AuthenticatorVault.decrypt(master, owner, remote).getJSONArray("entries")) } finally { master.fill(0) }
    try {
      val additions = recovered.filter { old -> entries.none { it.issuer == old.issuer && it.account == old.account && it.secret.contentEquals(old.secret) } }
        .map { it.copy(id = UUID.randomUUID().toString(), secret = it.secret.copyOf()) }
      saveChange(store, owner, entries + additions, null)
    } finally { recovered.forEach { it.secret.fill(0) } }
  }
  fun rotate(code: String, authorize: suspend () -> Boolean, passkey: suspend (String) -> String) = perform(authorize, passkey) { store, owner, entries ->
    val old = requireNotNull(store.readCloud())
    val latest = sync(store, owner, entries, old)
    require(!mutableState.value.pending) { "请先完成同步，再轮换密钥。" }
    val cloud = requireNotNull(store.readCloud())
    val master = AuthenticatorVault.randomKey()
    val recovery = AuthenticatorVault.recoveryKey(code)
    try {
      val version = cloud.getInt("keyVersion") + 1
      cloud.put("keyVersion", version).put("master", AuthenticatorVault.encode(master))
        .put("wrappedKey", AuthenticatorVault.wrap(master, recovery, owner, cloud.getString("vaultId"), version))
        .put("deleted", JSONArray()).put("dirty", true).put("rotating", true)
      preparePending(owner, latest, cloud)
      store.write(latest, cloud)
      sync(store, owner, latest, cloud)
    } finally { master.fill(0); recovery.fill(0) }
  }
  fun deleteCloud(authorize: suspend () -> Boolean, passkey: suspend (String) -> String) = perform(authorize, passkey) { store, _, entries ->
    val remote = api.authenticatorVault().optJSONObject("vault")
    if (remote != null) api.authenticatorVault(method = "DELETE", body = JSONObject().put("revision", remote.getInt("revision")))
    store.write(entries, null)
    mutableState.update { it.copy(cloudEnabled = false, cloudExists = false, pending = false, lastSyncedAt = 0, devices = 0, history = emptyList()) }
    entries
  }
  fun exportFile(uri: android.net.Uri, authorize: suspend () -> Boolean) = perform(authorize) { store, owner, entries ->
    val cloud = requireNotNull(store.readCloud()) { "请先启用加密保险库。" }
    val master = AuthenticatorVault.decode(cloud.getString("master"))
    try {
      val file = JSONObject().put("format", "MY-authenticator-backup").put("version", 1)
        .put("vaultId", cloud.getString("vaultId")).put("keyVersion", cloud.getInt("keyVersion"))
        .put("wrappedKey", cloud.getString("wrappedKey")).put("revision", 1)
        .put("ciphertext", AuthenticatorVault.encrypt(master, owner, cloud, AuthenticatorVault.payload(entries, emptySet()), 1))
      val bytes = file.toString().toByteArray()
      requireNotNull(getApplication<Application>().contentResolver.openOutputStream(uri, "wt")) { "无法写入备份文件。" }.use { it.write(bytes) }
      mutableState.update { it.copy(message = "加密备份已导出，请与对应恢复密钥分开保存。") }
      entries
    } finally { master.fill(0) }
  }
  fun importFile(uri: android.net.Uri, code: String, authorize: suspend () -> Boolean) = perform(authorize) { store, owner, entries ->
    val bytes = requireNotNull(getApplication<Application>().contentResolver.openInputStream(uri)) { "无法读取备份文件。" }.use { input ->
      val output = java.io.ByteArrayOutputStream()
      val buffer = ByteArray(4096)
      while (output.size() <= 128000) {
        val count = input.read(buffer, 0, minOf(buffer.size, 128001 - output.size()))
        if (count < 0) break
        output.write(buffer, 0, count)
      }
      output.toByteArray() }
    require(bytes.size <= 128000) { "备份文件超出大小限制。" }
    val file = JSONObject(String(bytes, Charsets.UTF_8))
    require(file.getString("format") == "MY-authenticator-backup") { "不是受支持的验证器备份。" }
    val recovery = AuthenticatorVault.recoveryKey(code)
    val master = try { AuthenticatorVault.unwrap(recovery, owner, file) } finally { recovery.fill(0) }
    try {
      val imported = AuthenticatorVault.entries(AuthenticatorVault.decrypt(master, owner, file).getJSONArray("entries"))
      try {
        val additions = imported.filter { old -> entries.none { it.issuer == old.issuer && it.account == old.account && it.secret.contentEquals(old.secret) } }
          .map { it.copy(id = UUID.randomUUID().toString(), secret = it.secret.copyOf()) }
        saveChange(store, owner, entries + additions, null)
      } finally { imported.forEach { it.secret.fill(0) } }
    } finally { master.fill(0) }
  }
  private fun deleted(cloud: JSONObject) = AuthenticatorVault.deleted(JSONObject().put("deleted", cloud.optJSONArray("deleted") ?: JSONArray()))
  private fun preparePending(owner: String, entries: List<AuthenticatorEntry>, cloud: JSONObject) {
    val master = AuthenticatorVault.decode(cloud.getString("master"))
    try {
      val body = JSONObject().put("version", 1).put("vaultId", cloud.getString("vaultId"))
        .put("keyVersion", cloud.getInt("keyVersion")).put("revision", cloud.getInt("revision"))
        .put("operationId", UUID.randomUUID().toString()).put("wrappedKey", cloud.getString("wrappedKey"))
        .put("ciphertext", AuthenticatorVault.encrypt(master, owner, cloud, AuthenticatorVault.payload(entries, deleted(cloud)), cloud.getInt("revision") + 1))
      cloud.put("pendingUpload", body)
    } finally { master.fill(0) }
  }
  private fun merge(local: List<AuthenticatorEntry>, remote: List<AuthenticatorEntry>, removed: Set<String>): List<AuthenticatorEntry> {
    val result = linkedMapOf<String, AuthenticatorEntry>()
    (local + remote).forEach { entry ->
      if (entry.id !in removed) {
        require(result[entry.id] == null || result[entry.id] == entry) { "检测到同一条目的内容冲突，已停止覆盖。" }
        result[entry.id] = entry
      }
    }
    return result.values.map { it.copy(secret = it.secret.copyOf()) }
  }
  private suspend fun sync(store: AuthenticatorStore, owner: String, localEntries: List<AuthenticatorEntry>, cloud: JSONObject): List<AuthenticatorEntry> {
    var entries = localEntries
    mutableState.update { it.copy(cloudEnabled = true, pending = cloud.optBoolean("dirty"), needsReauthentication = cloud.getInt("revision") == 0 || cloud.optBoolean("rotating"), lastSyncedAt = cloud.optLong("lastSyncedAt")) }
    if (!online()) {
      mutableState.update { it.copy(pending = true, error = "当前离线，本地验证码可正常使用；联网后解锁或点击同步。") }
      return entries
    }
    val master = AuthenticatorVault.decode(cloud.getString("master"))
    try {
      val remote = api.authenticatorVault().optJSONObject("vault")
      var result: JSONObject? = null
      val pending = cloud.optJSONObject("pendingUpload")
      if (remote != null && pending != null && remote.optString("operationId") == pending.getString("operationId")) {
        require(remote.getString("ciphertext") == pending.getString("ciphertext") && remote.getString("wrappedKey") == pending.getString("wrappedKey") && remote.getInt("revision") == pending.getInt("revision") + 1)
        result = remote
      } else if (cloud.optBoolean("rotating")) {
        require(remote != null && remote.getInt("revision") == cloud.getInt("revision")) { "轮换期间云端有新变化，请使用原恢复密钥恢复后重试。" }
      } else if (remote != null) {
        require(remote.getString("vaultId") == cloud.getString("vaultId") && remote.getInt("keyVersion") == cloud.getInt("keyVersion")) { "云端密钥已变更，请使用最新恢复密钥重新恢复。" }
        require(remote.getInt("revision") >= cloud.getInt("revision")) { "检测到云端版本回退，已停止同步。" }
        if (remote.getInt("revision") == cloud.getInt("revision") && cloud.has("ciphertext")) require(remote.getString("ciphertext") == cloud.getString("ciphertext")) { "云端内容与本地检查点不符。" }
        val payload = AuthenticatorVault.decrypt(master, owner, remote)
        val remoteEntries = AuthenticatorVault.entries(payload.getJSONArray("entries"))
        try {
          val removed = deleted(cloud) + AuthenticatorVault.deleted(payload)
          entries = merge(entries, remoteEntries, removed)
          val changed = entries.toSet() != remoteEntries.toSet() || removed != AuthenticatorVault.deleted(payload)
          cloud.put("revision", remote.getInt("revision")).put("ciphertext", remote.getString("ciphertext")).put("deleted", JSONArray(removed.toList()))
          if (changed) {
            cloud.put("dirty", true)
            preparePending(owner, entries, cloud)
          } else result = remote
        } finally { remoteEntries.forEach { it.secret.fill(0) } }
      } else require(cloud.getInt("revision") == 0) { "云端备份已被删除，已停止自动上传。" }
      if (result == null) {
        store.write(entries, cloud)
        result = api.authenticatorVault(method = "PUT", body = requireNotNull(cloud.optJSONObject("pendingUpload"))).getJSONObject("vault")
      }
      cloud.put("revision", result.getInt("revision")).put("ciphertext", result.getString("ciphertext"))
        .put("dirty", false).put("lastSyncedAt", System.currentTimeMillis())
      cloud.remove("pendingUpload"); cloud.remove("rotating")
      store.write(entries, cloud)
      val history = result.optJSONArray("history") ?: JSONArray()
      mutableState.update { it.copy(cloudEnabled = true, cloudExists = true, pending = false, needsReauthentication = false,
        lastSyncedAt = cloud.getLong("lastSyncedAt"), devices = result.optJSONArray("devices")?.length() ?: 0,
        history = (0 until history.length()).map { i -> history.getJSONObject(i).let { VaultHistory(it.getInt("revision"), it.getLong("updatedAt")) } }.reversed(),
        message = "端到端加密同步已完成。") }
      return entries
    } catch (error: Exception) {
      if (error is CancellationException) throw error
      mutableState.update { it.copy(pending = true, error = "本地数据已保留。${userMessage(error)}") }
      return entries
    } finally { master.fill(0) }
  }
  private fun perform(authorize: suspend () -> Boolean, passkey: (suspend (String) -> String)? = null,
    action: suspend (AuthenticatorStore, String, List<AuthenticatorEntry>) -> List<AuthenticatorEntry>) {
    if (!visible || mutableState.value.busy) return
    mutableState.update { it.copy(busy = true, error = null, message = null) }
    job = viewModelScope.launch {
      var source = emptyList<AuthenticatorEntry>()
      var result = emptyList<AuthenticatorEntry>()
      try {
        val request = sessions.captureRequestSession()
        val owner = requireNotNull(request.username) { "请先登录平台账号。" }
        val store = AuthenticatorStore(getApplication(), owner) { block -> sessions.withRequestSession(request, block = block) }
        withContext(Dispatchers.IO) { RuntimeSecurity.requireSafeEnvironment(); store.prepareProtection() }
        if (passkey != null) {
          val challenge = api.auth.beginPasskeyReauthentication()
          api.auth.completePasskeyReauthentication(challenge.challengeId, passkey(challenge.optionsJson))
        }
        if (!authorize() || !visible || !AppSessionLifecycle.isForeground) return@launch
        val operation = generation
        processing = true
        api.withRequestMetadata(allowCache = false) {
          withContext(Dispatchers.IO) {
            sessions.withRequestSession(request) { source = store.read() }
            result = action(store, owner, source)
            sessions.withRequestSession(request) { }
          }
        }
        if (visible && AppSessionLifecycle.isForeground && operation == generation) {
          mutableState.value.entries.forEach { it.secret.fill(0) }
          mutableState.update { it.copy(locked = false, entries = result) }
        }
      } catch (error: Exception) {
        if (error is CancellationException) throw error
        mutableState.update { it.copy(error = userMessage(error)) }
      } finally {
        processing = false
        val retained = mutableState.value.entries
        (source + result).filter { item -> retained.none { it === item } }.forEach { it.secret.fill(0) }
        mutableState.update { it.copy(busy = false, loading = false) }
      }
    }
  }
  private fun userMessage(error: Throwable): String = when (error) {
    is AEADBadTagException -> "恢复密钥不正确，或备份完整性校验失败。"
    is android.security.keystore.UserNotAuthenticatedException -> "身份验证已过期，请解锁后重新同步。"
    is ApiException -> when (error.code) {
      "PASSKEY_UNAVAILABLE" -> "请先在账号安全中添加 Passkey，并独立保存平台登录恢复码。"
      "REAUTHENTICATION_REQUIRED" -> "账号二次验证已过期，请重新授权后重试。"
      else -> error.message ?: "同步失败，请重试。"
    }
    is IllegalArgumentException, is IllegalStateException -> error.message ?: "保险库数据校验失败。"
    else -> "无法完成操作，请检查网络并重试。"
  }
  override fun onCleared() { leave(); super.onCleared() }
}
