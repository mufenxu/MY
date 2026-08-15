package cn.pxyb.mycontrol.data

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ExternalApplicationParsingTest {
    @Test
    fun `external application list keeps launch and health metadata`() {
        val applications = parseExternalApplications(
            JSONObject(
                """
                {
                  "applications": [
                    {
                      "id": "app-1",
                      "name": "项目 A",
                      "description": "独立部署项目",
                      "launchUrl": "https://a.example.com/auth/my/start",
                      "healthUrl": "https://a.example.com/health",
                      "requiredRole": "operator",
                      "openMode": "webview",
                      "enabled": true,
                      "canAccess": true,
                      "health": {
                        "state": "healthy",
                        "httpStatus": 200,
                        "latencyMs": 38,
                        "checkedAt": "2026-08-15T08:00:00.000Z"
                      }
                    },
                    {
                      "id": "app-2",
                      "name": "项目 B",
                      "description": "",
                      "launchUrl": "https://b.example.com/auth/my/start",
                      "healthUrl": null,
                      "requiredRole": "super_admin",
                      "openMode": "browser",
                      "enabled": true,
                      "canAccess": false,
                      "health": { "state": "unmonitored" }
                    }
                  ]
                }
                """.trimIndent(),
            ),
        )

        assertEquals(2, applications.size)
        assertEquals("项目 A", applications[0].name)
        assertEquals("webview", applications[0].openMode)
        assertTrue(applications[0].canAccess)
        assertEquals("healthy", applications[0].health.state)
        assertEquals(200, applications[0].health.httpStatus)
        assertEquals(38L, applications[0].health.latencyMs)
        assertNull(applications[1].healthUrl)
        assertFalse(applications[1].canAccess)
        assertEquals("unmonitored", applications[1].health.state)
    }

    @Test
    fun `external launch response keeps server selected open mode`() {
        val launch = parseExternalApplicationLaunch(
            JSONObject(
                """
                {
                  "loginUrl": "https://pxyb.cn/console/app-login?ticket=one-time",
                  "openMode": "browser",
                  "expiresAt": "2026-08-15T08:01:00.000Z"
                }
                """.trimIndent(),
            ),
        )

        assertEquals("https://pxyb.cn/console/app-login?ticket=one-time", launch.loginUrl)
        assertEquals("browser", launch.openMode)
        assertEquals("2026-08-15T08:01:00.000Z", launch.expiresAt)
    }
}
