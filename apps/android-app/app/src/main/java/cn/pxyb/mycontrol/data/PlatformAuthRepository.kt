package cn.pxyb.mycontrol.data

import android.util.Base64
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

import org.json.JSONObject
import java.nio.charset.StandardCharsets
import java.time.Instant

class PlatformAuthRepository internal constructor(private val http: PlatformHttpClient, private val sessionStore: SessionStore, private val snapshotStore: ResponseSnapshotStore) {
    suspend fun login(
        username: String,
        password: String,
        challengeToken: String = "",
        deviceName: String = "",
    ): PasswordLoginResponse = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("username", username.trim())
            .put("password", password)
        if (challengeToken.isNotBlank()) body.put("challengeToken", challengeToken)
        if (deviceName.isNotBlank()) body.put("deviceName", deviceName)

        val response = http.execute("/api/auth/login", "POST", body, authenticated = false)
        if (response.json.optString("code") in setOf("SECOND_FACTOR_REQUIRED", "MFA_ENROLLMENT_REQUIRED")) {
            val details = response.json.getJSONObject("details")
            return@withContext LoginChallenge(
                challengeId = details.getString("challengeId"),
                expiresAt = details.getString("expiresAt"),
                recoveryCodeAllowed = details.optBoolean("recoveryCodeAllowed"),
                enrollment = details.optJSONObject("enrollment")?.let {
                    TotpEnrollment(it.optString("secret"), it.optString("uri"), it.nullableString("qrDataUrl"), it.nullableString("expiresAt"))
                },
            )
        }
        val user = response.json.optJSONObject("user").toPlatformUser()
        response.toLoginResult(user, response.json.optJSONArray("recoveryCodes").toStringList())
    }

    suspend fun completeLogin(challenge: LoginChallenge, factor: String, recovery: Boolean, deviceName: String): LoginResult = withContext(Dispatchers.IO) {
        val field = if (challenge.enrollment != null) "enrollmentCode" else if (recovery) "recoveryCode" else "totp"
        val response = http.execute(
            "/api/auth/login/complete", "POST",
            JSONObject().put("challengeId", challenge.challengeId).put(field, factor.trim()).put("deviceName", deviceName),
            authenticated = false,
        )
        response.toLoginResult(response.json.optJSONObject("user").toPlatformUser(), response.json.optJSONArray("recoveryCodes").toStringList())
    }

    suspend fun recoverAccount(recoveryToken: String, newPassword: String): String = withContext(Dispatchers.IO) {
        http.execute("/api/auth/recovery", "POST", JSONObject().put("recoveryToken", recoveryToken.trim()).put("newPassword", newPassword), authenticated = false)
            .json.getString("username")
    }

    suspend fun loginCapabilities(): LoginCapabilities = withContext(Dispatchers.IO) {
        val json = http.execute("/api/auth/status", authenticated = false).json
        LoginCapabilities(androidPasskeySupported = json.optBoolean("androidPasskeySupported"))
    }

    suspend fun beginPasskeyLogin(username: String, challengeToken: String = ""): PasskeyChallenge = withContext(Dispatchers.IO) {
        val normalizedUsername = username.trim()
        val json = http.execute(
            "/api/auth/passkey/options",
            "POST",
            JSONObject().put("username", normalizedUsername).put("challengeToken", challengeToken),
            authenticated = false,
        ).json
        PasskeyChallenge(
            username = normalizedUsername,
            challengeId = json.optString("challengeId"),
            optionsJson = json.optJSONObject("options")?.toString()
                ?: throw ApiException("服务器未返回 Passkey 验证参数。", 500, "PASSKEY_OPTIONS_MISSING"),
        )
    }

    suspend fun completePasskeyLogin(
        challenge: PasskeyChallenge,
        responseJson: String,
        deviceName: String = "",
    ): LoginResult = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("username", challenge.username)
            .put("challengeId", challenge.challengeId)
            .put("response", JSONObject(responseJson))
        if (deviceName.isNotBlank()) body.put("deviceName", deviceName)
        val response = http.execute(
            "/api/auth/passkey/verify",
            "POST",
            body,
            authenticated = false,
        )
        response.toLoginResult(response.json.optJSONObject("user").toPlatformUser())
    }

    suspend fun persistLogin(result: LoginResult): Unit = withContext(Dispatchers.IO) {
        sessionStore.writeCookie(
            result.sessionCookie,
            result.sessionExpiresAtMillis,
            result.sessionIdleMinutes,
            result.user.username,
        )
        snapshotStore.setAccount(result.user.username)
    }

    suspend fun discardLogin(result: LoginResult): Unit = withContext(Dispatchers.IO) {
        runCatching {
            http.execute("/api/auth/logout", "POST", JSONObject(), authenticated = false, cookieOverride = result.sessionCookie)
        }.onFailure { if (it is CancellationException) throw it }
    }

    suspend fun scanQrLogin(requestId: String, scanToken: String): QrLoginTarget = withContext(Dispatchers.IO) {
        http.execute(
            "/api/auth/qr/requests/${encodePath(requestId)}/scan",
            "POST",
            JSONObject().put("scanToken", scanToken),
        ).json.toQrLoginTarget()
    }

    suspend fun createQrLoginRequest(): QrLoginRequest = withContext(Dispatchers.IO) {
        val json = http.execute(
            "/api/auth/qr/requests",
            "POST",
            JSONObject()
                .put("clientKind", "android")
                .put("confirmationMethod", "passkey"),
            authenticated = false,
        ).json
        QrLoginRequest(
            requestId = json.optString("requestId"),
            requesterVerifier = json.optString("requesterVerifier"),
            qrDataUrl = json.optString("qrDataUrl"),
            expiresAt = json.optString("expiresAt"),
        )
    }

    suspend fun qrLoginRequestStatus(
        requestId: String,
        requesterVerifier: String,
    ): QrLoginRequestStatus = withContext(Dispatchers.IO) {
        val json = http.execute(
            "/api/auth/qr/requests/${encodePath(requestId)}/status",
            "POST",
            JSONObject().put("requesterVerifier", requesterVerifier),
            authenticated = false,
        ).json
        QrLoginRequestStatus(
            requestId = json.optString("requestId"),
            status = json.optString("status"),
            expiresAt = json.optString("expiresAt"),
        )
    }

    suspend fun consumeQrLoginRequest(
        requestId: String,
        requesterVerifier: String,
        deviceName: String = "",
    ): LoginResult = withContext(Dispatchers.IO) {
        val body = JSONObject().put("requesterVerifier", requesterVerifier)
        if (deviceName.isNotBlank()) body.put("deviceName", deviceName)
        val response = http.execute(
            "/api/auth/qr/requests/${encodePath(requestId)}/consume",
            "POST",
            body,
            authenticated = false,
        )
        val user = response.json.optJSONObject("user").toPlatformUser()
        response.toLoginResult(user, response.json.optJSONArray("recoveryCodes").toStringList())
    }

    suspend fun beginQrPasskey(requestId: String): QrPasskeyChallenge = withContext(Dispatchers.IO) {
        val json = http.execute(
            "/api/auth/qr/requests/${encodePath(requestId)}/passkey/options",
            "POST",
            JSONObject(),
        ).json
        QrPasskeyChallenge(
            challengeId = json.optString("challengeId"),
            optionsJson = json.optJSONObject("options")?.toString()
                ?: throw ApiException("服务端未返回 Passkey 验证参数。", 500, "PASSKEY_OPTIONS_MISSING"),
        )
    }

    suspend fun approveQrWithPasskey(
        requestId: String,
        challenge: QrPasskeyChallenge,
        responseJson: String,
    ): QrLoginTarget = withContext(Dispatchers.IO) {
        http.execute(
            "/api/auth/qr/requests/${encodePath(requestId)}/approve",
            "POST",
            JSONObject().put(
                "passkey",
                JSONObject()
                    .put("challengeId", challenge.challengeId)
                    .put("response", JSONObject(responseJson)),
            ),
        ).json.toQrLoginTarget()
    }

    suspend fun approveQrWithBiometric(requestId: String): QrLoginTarget = withContext(Dispatchers.IO) {
        http.execute(
            "/api/auth/qr/requests/${encodePath(requestId)}/approve",
            "POST",
            JSONObject().put("localConfirmation", true),
        ).json.toQrLoginTarget()
    }

    suspend fun rejectQrLogin(requestId: String): Unit = withContext(Dispatchers.IO) {
        http.execute(
            "/api/auth/qr/requests/${encodePath(requestId)}/reject",
            "POST",
            JSONObject(),
        )
        Unit
    }

    suspend fun createWebLoginLink(redirectUrl: String): WebLoginLink = withContext(Dispatchers.IO) {
        val json = http.execute(
            "/api/auth/web-login-tickets",
            "POST",
            JSONObject().put("redirect", redirectUrl),
        ).json
        WebLoginLink(
            loginUrl = json.optString("loginUrl"),
            redirect = json.optString("redirect", redirectUrl),
            expiresAt = json.nullableString("expiresAt"),
        )
    }

    suspend fun authStatus(): PlatformUser? = withContext(Dispatchers.IO) {
        val session = http.currentSession()
        if (session.cookie == null) return@withContext null
        try {
            val json = http.execute("/api/auth/status", authenticated = true).json
            if (!json.optBoolean("authenticated")) {
                http.invalidateSession(session)
                null
            } else {
                sessionStore.withRequestSession(session) {
                    json.optJSONObject("user").toPlatformUser().also { snapshotStore.setAccount(it.username) }
                }
            }
        } catch (error: ApiException) {
            if (error.status == 401 || error.status == 403) {
                null
            } else {
                throw error
            }
        }
    }

    suspend fun logout(onLocalSessionCleared: () -> Unit) {
        val session = withContext(Dispatchers.IO) {
            http.currentSession().also { session ->
                sessionStore.withRequestSession(session) {
                    snapshotStore.clear(scope = session.accountScope)
                    sessionStore.clear()
                }
            }
        }
        onLocalSessionCleared()
        withContext(Dispatchers.IO) {
            runCatching {
                http.execute("/api/auth/logout", "POST", JSONObject(), authenticated = false, cookieOverride = session.cookie)
            }.onFailure { if (it is CancellationException) throw it }
        }
    }

    suspend fun security(): SecurityData = withContext(Dispatchers.IO) {
        val json = http.execute("/api/security/sessions").json
        val currentNonce = json.optString("currentNonce")
        val security = json.optJSONObject("security") ?: JSONObject()
        SecurityData(
            sessions = json.optJSONArray("sessions").platformObjects().map { item ->
                SecuritySession(
                    nonce = item.optString("nonce"),
                    subject = item.optString("subject"),
                    role = item.optString("role", "viewer"),
                    ip = item.optString("ip", "--"),
                    userAgent = item.optString("userAgent", "未知设备"),
                    deviceName = item.optString("deviceName"),
                    createdAt = item.nullableString("createdAt"),
                    lastSeenAt = item.nullableString("lastSeenAt"),
                    expiresAt = item.nullableString("expiresAt"),
                    sessionKind = item.optString("sessionKind", "browser"),
                    parentSessionNonce = item.nullableString("parentSessionNonce"),
                    deviceId = item.nullableString("deviceId"),
                    current = item.optString("nonce") == currentNonce,
                )
            },
            totpEnabled = security.optBoolean("totpEnabled"),
            passkeyCount = security.optInt("passkeyCount"),
            recoveryCodesRemaining = security.optInt("recoveryCodesRemaining"),
            sessionTtlHours = security.optInt("sessionTtlHours"),
            sessionIdleMinutes = security.optInt("sessionIdleMinutes"),
        )
    }

    suspend fun revokeSession(nonce: String): Boolean = withContext(Dispatchers.IO) {
        http.execute("/api/security/sessions/${encodePath(nonce)}", "DELETE", JSONObject()).json.optBoolean("current")
    }

    suspend fun revokeOtherSessions(): Unit = withContext(Dispatchers.IO) {
        http.execute("/api/security/sessions", "DELETE", JSONObject())
        Unit
    }

    suspend fun beginPasskeyReauthentication(): PasskeyRegistrationChallenge = withContext(Dispatchers.IO) {
        val json = http.execute("/api/auth/reauth/passkey/options", "POST", JSONObject()).json
        PasskeyRegistrationChallenge(json.getString("challengeId"), json.getJSONObject("options").toString())
    }

    suspend fun completePasskeyReauthentication(challengeId: String, responseJson: String): Long = withContext(Dispatchers.IO) {
        val json = http.execute("/api/auth/reauth/passkey/verify", "POST", JSONObject().put("challengeId", challengeId).put("response", JSONObject(responseJson))).json
        Instant.parse(json.getString("expiresAt")).toEpochMilli()
    }

    suspend fun changePassword(password: String, newPassword: String, totp: String = ""): Boolean =
        withContext(Dispatchers.IO) {
            val body = JSONObject()
                .put("password", password)
                .put("newPassword", newPassword)
            if (totp.isNotBlank()) body.put("totp", totp.trim())
            http.execute("/api/security/password", "POST", body).json.optBoolean("currentSessionRevoked")
        }

    suspend fun beginTotpEnrollment(password: String, totp: String = ""): TotpEnrollment =
        withContext(Dispatchers.IO) {
            val body = JSONObject().put("password", password)
            if (totp.isNotBlank()) body.put("totp", totp.trim())
            val enrollment = http.execute("/api/security/totp/enrollment", "POST", body).json
                .optJSONObject("enrollment")
                ?: throw ApiException("服务器未返回动态验证注册参数。", 500, "TOTP_ENROLLMENT_MISSING")
            TotpEnrollment(
                secret = enrollment.optString("secret"),
                uri = enrollment.optString("uri"),
                qrDataUrl = enrollment.nullableString("qrDataUrl"),
                expiresAt = enrollment.nullableString("expiresAt"),
            )
        }

    suspend fun confirmTotpEnrollment(code: String): List<String> = withContext(Dispatchers.IO) {
        http.execute("/api/security/totp/confirm", "POST", JSONObject().put("totp", code.trim())).json
            .optJSONArray("recoveryCodes").toStringList()
    }

    suspend fun regenerateRecoveryCodes(password: String, totp: String = ""): List<String> =
        withContext(Dispatchers.IO) {
            val body = JSONObject().put("password", password)
            if (totp.isNotBlank()) body.put("totp", totp.trim())
            http.execute("/api/security/totp/recovery-codes", "POST", body).json
                .optJSONArray("recoveryCodes").toStringList()
        }

    suspend fun disableTotp(password: String, totp: String = ""): Boolean = withContext(Dispatchers.IO) {
        val body = JSONObject().put("password", password)
        if (totp.isNotBlank()) body.put("totp", totp.trim())
        http.execute("/api/security/totp", "DELETE", body).json.optBoolean("currentSessionRevoked")
    }

    suspend fun passkeys(): List<PlatformPasskey> = withContext(Dispatchers.IO) {
        http.execute("/api/security/passkeys").json.optJSONArray("passkeys").platformObjects().map { item ->
            PlatformPasskey(
                id = item.optString("id"),
                name = item.optString("name", "Passkey"),
                deviceType = item.nullableString("deviceType"),
                createdAt = item.nullableString("createdAt"),
                lastUsedAt = item.nullableString("lastUsedAt"),
            )
        }
    }

    suspend fun beginPasskeyRegistration(password: String, totp: String = ""): PasskeyRegistrationChallenge =
        withContext(Dispatchers.IO) {
            val body = JSONObject().put("password", password)
            if (totp.isNotBlank()) body.put("totp", totp.trim())
            val json = http.execute("/api/security/passkeys/options", "POST", body).json
            PasskeyRegistrationChallenge(
                challengeId = json.optString("challengeId"),
                optionsJson = json.optJSONObject("options")?.toString()
                    ?: throw ApiException("服务器未返回 Passkey 注册参数。", 500, "PASSKEY_OPTIONS_MISSING"),
            )
        }

    suspend fun completePasskeyRegistration(
        challengeId: String,
        responseJson: String,
        name: String,
    ): Unit = withContext(Dispatchers.IO) {
        http.execute(
            "/api/security/passkeys/verify",
            "POST",
            JSONObject()
                .put("challengeId", challengeId)
                .put("response", JSONObject(responseJson))
                .put("name", name),
        )
        Unit
    }

    suspend fun deletePasskey(id: String, password: String, totp: String = ""): Unit =
        withContext(Dispatchers.IO) {
            val body = JSONObject().put("password", password)
            if (totp.isNotBlank()) body.put("totp", totp.trim())
            http.execute("/api/security/passkeys/${encodePath(id)}", "DELETE", body)
            Unit
        }

    private fun PlatformResponse.toLoginResult(
        user: PlatformUser,
        recoveryCodes: List<String> = emptyList(),
    ): LoginResult {
        val cookie = cookie ?: throw ApiException("服务器未返回安全会话。", 500, "SESSION_MISSING")
        val session = json.optJSONObject("session") ?: JSONObject()
        val expiresAtMillis = session.nullableString("expiresAt")
            ?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }
            ?: decodeSessionExpiry(cookie)
        if (expiresAtMillis <= System.currentTimeMillis()) {
            throw ApiException("服务器返回的会话有效期无效。", 500, "SESSION_EXPIRY_INVALID")
        }
        return LoginResult(
            user = user,
            sessionCookie = cookie,
            sessionExpiresAtMillis = expiresAtMillis,
            sessionIdleMinutes = session.optInt("idleTimeoutMinutes", 30).coerceAtLeast(1),
            recoveryCodes = recoveryCodes,
        )
    }

    private fun decodeSessionExpiry(cookie: String): Long {
        return runCatching {
            val token = cookie.substringAfter('=', "")
            val payload = token.substringBefore('.')
            val decoded = Base64.decode(payload, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
            JSONObject(String(decoded, StandardCharsets.UTF_8)).optLong("exp") * 1000L
        }.getOrDefault(0L)
    }

}

private fun JSONObject?.toPlatformUser(): PlatformUser {
    val json = this ?: throw ApiException("登录响应缺少账号信息。", 500, "USER_MISSING")
    return PlatformUser(
        username = json.optString("username", "admin"),
        role = json.optString("role", "viewer"),
        totpEnabled = json.optBoolean("totpEnabled"),
        passkeyCount = json.optInt("passkeyCount"),
        id = json.optString("id"),
    )
}

private fun JSONObject.toQrLoginTarget(): QrLoginTarget {
    val browser = optJSONObject("browser") ?: JSONObject()
    return QrLoginTarget(
        requestId = optString("requestId"),
        status = optString("status", "scanned"),
        verificationCode = optString("verificationCode"),
        browser = QrLoginBrowser(
            label = browser.optString("label", "未知浏览器"),
            ip = browser.optString("ip", "未知 IP"),
            userAgent = browser.optString("userAgent", "未知设备"),
        ),
        expiresAt = optString("expiresAt"),
        confirmationMethod = optString("confirmationMethod", "biometric"),
    )
}

