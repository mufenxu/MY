package cn.pxyb.mycontrol.ui

import cn.pxyb.mycontrol.data.parseMediaDownloadTarget
import cn.pxyb.mycontrol.ui.feature.media.formatMediaDuration
import cn.pxyb.mycontrol.ui.feature.media.mediaExpireHint
import cn.pxyb.mycontrol.ui.feature.media.mediaFileName
import cn.pxyb.mycontrol.ui.feature.media.mediaLinkExpired
import cn.pxyb.mycontrol.ui.feature.media.mediaPlatformLabel
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MediaDownloadParsingTest {
    @Test
    fun `platform label falls back to a generic name`() {
        assertEquals("抖音", mediaPlatformLabel("douyin"))
        assertEquals("哔哩哔哩", mediaPlatformLabel("bilibili"))
        assertEquals("", mediaPlatformLabel(""))
        assertEquals("其他平台", mediaPlatformLabel("kuaishou"))
        assertEquals("其他平台", mediaPlatformLabel("unknown_extractor"))
    }

    @Test
    fun `file name keeps a readable base and appends the quality suffix`() {
        assertEquals("从实体店干到线上店铺-720P.mp4", mediaFileName("从实体店干到线上店铺", "720P", ".mp4"))
        assertEquals("a b c-2.jpg", mediaFileName("a/b:c", "2", ".jpg"))
        assertEquals("视频下载.mp4", mediaFileName("   ", "原始画质", ".mp4"))
        assertEquals("${"x".repeat(60)}-720P.mp4", mediaFileName("x".repeat(100), "720P", ".mp4"))
    }

    @Test
    fun `duration and expiry hints stay readable`() {
        assertEquals("", formatMediaDuration(0))
        assertEquals("1:35", formatMediaDuration(95_000))
        assertEquals("60:00", formatMediaDuration(3_600_000))

        assertEquals("下载链接有效期有限，请尽快下载", mediaExpireHint(0))
        val nowSeconds = System.currentTimeMillis() / 1000
        assertEquals("下载链接已过期，请重新解析", mediaExpireHint(nowSeconds - 600))
        assertEquals("下载链接约 30 分钟内有效", mediaExpireHint(nowSeconds + 1_810))
        assertEquals("下载链接约 3 小时内有效", mediaExpireHint(nowSeconds + 3 * 3_600 + 10))
    }

    @Test
    fun `expired direct links are rejected before downloading`() {
        val nowMillis = 1_700_000_000_000L
        val nowSeconds = nowMillis / 1000

        assertTrue(mediaLinkExpired(nowSeconds - 1, nowMillis))
        assertFalse(mediaLinkExpired(nowSeconds, nowMillis))
        assertFalse(mediaLinkExpired(nowSeconds + 1, nowMillis))
        assertFalse(mediaLinkExpired(0, nowMillis))
        assertFalse(mediaLinkExpired(-5, nowMillis))
    }

    @Test
    fun `parsed targets only keep allow listed download headers`() {
        val target = parseMediaDownloadTarget(
            JSONObject(
                """
                {
                  "platform": "douyin",
                  "kind": "video",
                  "title": "从实体店干到线上店铺",
                  "author": "甘肃.鹏鹏",
                  "cover": "https://cdn.example.com/cover.jpg",
                  "durationMs": 95000,
                  "expireAt": 1700000100,
                  "images": [],
                  "qualities": [
                    {
                      "label": "720P · 1200 kbps",
                      "sizeLabel": "22.0 MB",
                      "url": "https://cdn.example.com/video.mp4",
                      "headers": {
                        "Referer": "https://www.douyin.com/",
                        "User-Agent": "ua",
                        "Cookie": "ttwid=secret",
                        "Authorization": "Bearer secret",
                        "Accept-Encoding": "gzip"
                      }
                    }
                  ]
                }
                """.trimIndent(),
            ),
        )

        assertEquals("douyin", target.platform)
        assertEquals("甘肃.鹏鹏", target.author)
        assertEquals(95_000L, target.durationMillis)
        assertEquals(1_700_000_100L, target.expireAtSeconds)
        assertFalse(target.isImageGallery)
        assertEquals(1, target.qualities.size)
        assertEquals(
            mapOf("Referer" to "https://www.douyin.com/", "User-Agent" to "ua"),
            target.qualities.single().headers,
        )
        assertEquals("22.0 MB", target.qualities.single().sizeLabel)
    }

    @Test
    fun `image galleries keep every usable image`() {
        val target = parseMediaDownloadTarget(
            JSONObject(
                """
                {
                  "platform": "douyin",
                  "kind": "images",
                  "title": "图文作品",
                  "images": [
                    { "url": "https://cdn.example.com/1.jpg", "headers": { "Referer": "https://www.douyin.com/" } },
                    { "url": "", "headers": {} }
                  ],
                  "qualities": []
                }
                """.trimIndent(),
            ),
        )

        assertTrue(target.isImageGallery)
        assertEquals(1, target.images.size)
        assertEquals("https://cdn.example.com/1.jpg", target.images.single().url)
    }
}