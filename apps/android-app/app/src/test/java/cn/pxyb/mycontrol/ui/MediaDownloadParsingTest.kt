package cn.pxyb.mycontrol.ui

import cn.pxyb.mycontrol.data.MediaDownloadHistoryEntry
import cn.pxyb.mycontrol.data.decodeMediaDownloadHistory
import cn.pxyb.mycontrol.data.encodeMediaDownloadHistory
import cn.pxyb.mycontrol.data.mergeMediaDownloadHistory
import cn.pxyb.mycontrol.data.parseMediaDownloadTarget
import cn.pxyb.mycontrol.ui.feature.media.formatMediaDuration
import cn.pxyb.mycontrol.ui.feature.media.mediaExpireHint
import cn.pxyb.mycontrol.ui.feature.media.mediaHistorySubtitle
import cn.pxyb.mycontrol.ui.feature.media.mediaHistoryTime
import cn.pxyb.mycontrol.ui.feature.media.mediaFileName
import cn.pxyb.mycontrol.ui.feature.media.mediaLinkExpired
import cn.pxyb.mycontrol.ui.feature.media.mediaPlatformLabel
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
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
        // 服务端没有给出格式信息时退回 MP4，与旧行为一致。
        assertEquals("mp4", target.qualities.single().ext)
        assertEquals("video/mp4", target.qualities.single().mimeType)
    }

    @Test
    fun `media format follows the container reported by the server`() {
        val target = parseMediaDownloadTarget(
            JSONObject(
                """
                {
                  "kind": "video",
                  "qualities": [
                    { "url": "https://cdn.example.com/v.webm", "ext": "WebM", "mimeType": "video/mp4", "label": "720P" },
                    { "url": "https://cdn.example.com/v.bin", "ext": "jpeg2000", "mimeType": "not a mime" }
                  ],
                  "images": [
                    { "url": "https://cdn.example.com/1.webp", "ext": ".WEBP", "mimeType": "image/jpeg" },
                    { "url": "https://cdn.example.com/2.bin" }
                  ]
                }
                """.trimIndent(),
            ),
        )

        // 扩展名决定容器，MIME 跟着扩展名走，避免 webm 被标成 mp4。
        assertEquals("webm", target.qualities[0].ext)
        assertEquals("video/webm", target.qualities[0].mimeType)
        assertEquals("mp4", target.qualities[1].ext)
        assertEquals("video/mp4", target.qualities[1].mimeType)

        assertEquals("webp", target.images[0].ext)
        assertEquals("image/webp", target.images[0].mimeType)
        assertEquals("jpg", target.images[1].ext)
        assertEquals("image/jpeg", target.images[1].mimeType)

        assertEquals("标题.webm", mediaFileName("标题", "", ".webm"))
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

    @Test
    fun `cover and music assets keep their own container and headers`() {
        val target = parseMediaDownloadTarget(
            JSONObject(
                """
                {
                  "kind": "video",
                  "coverAsset": {
                    "url": "https://p3.douyinpic.com/cover~tplv:330.webp",
                    "ext": "webp",
                    "mimeType": "image/jpeg",
                    "headers": { "Referer": "https://www.douyin.com/", "Accept-Encoding": "gzip" }
                  },
                  "music": {
                    "url": "https://sf6-cdn-tos.douyinstatic.com/obj/tos-cn-ve-2774/song",
                    "ext": "m4a",
                    "mimeType": "audio/mp4",
                    "headers": { "Referer": "https://www.douyin.com/", "Cookie": "ttwid=secret" }
                  },
                  "images": [],
                  "qualities": []
                }
                """.trimIndent(),
            ),
        )

        // 扩展名优先，MIME 跟着扩展名走，不允许服务端的旧值覆盖。
        assertEquals("webp", target.coverAsset?.ext)
        assertEquals("image/webp", target.coverAsset?.mimeType)
        assertEquals(mapOf("Referer" to "https://www.douyin.com/"), target.coverAsset?.headers)

        assertEquals("m4a", target.music?.ext)
        assertEquals("audio/mp4", target.music?.mimeType)
        assertEquals(mapOf("Referer" to "https://www.douyin.com/"), target.music?.headers)
    }

    @Test
    fun `missing material assets stay null and audio falls back to m4a`() {
        val empty = parseMediaDownloadTarget(
            JSONObject("""{ "kind": "video", "music": { "url": "" }, "images": [], "qualities": [] }"""),
        )
        assertNull(empty.coverAsset)
        assertNull(empty.music)

        // 原声地址没有扩展名时兜底 m4a，而不是视频用的 mp4。
        val fallback = parseMediaDownloadTarget(
            JSONObject("""{ "kind": "video", "music": { "url": "https://cdn.example.com/song" }, "images": [], "qualities": [] }"""),
        )
        assertEquals("m4a", fallback.music?.ext)
        assertEquals("audio/mp4", fallback.music?.mimeType)
    }

    @Test
    fun `history keeps the newest parse of each link and stays capped`() {
        val entries = listOf(
            MediaDownloadHistoryEntry("旧标题", "douyin", "https://v.douyin.com/a/", 1_000L),
            MediaDownloadHistoryEntry("第二条", "bilibili", "https://v.douyin.com/b/", 2_000L),
        )
        val merged = mergeMediaDownloadHistory(
            entries,
            MediaDownloadHistoryEntry("新标题", "douyin", "https://v.douyin.com/a/", 3_000L),
        )

        assertEquals(2, merged.size)
        assertEquals("新标题", merged[0].title)
        assertEquals("https://v.douyin.com/b/", merged[1].shareText)

        val capped = mergeMediaDownloadHistory(
            entries,
            MediaDownloadHistoryEntry("最新", "douyin", "https://v.douyin.com/c/", 4_000L),
            limit = 2,
        )
        assertEquals(listOf("最新", "旧标题"), capped.map { it.title })
    }

    @Test
    fun `history survives a storage round trip and skips unusable rows`() {
        val entries = listOf(
            MediaDownloadHistoryEntry("标题", "douyin", "https://v.douyin.com/a/", 1_700_000_000_000L),
            MediaDownloadHistoryEntry("", "bilibili", "https://www.bilibili.com/video/BV1", 1_700_000_060_000L),
        )
        assertEquals(entries, decodeMediaDownloadHistory(encodeMediaDownloadHistory(entries)))

        assertTrue(decodeMediaDownloadHistory(null).isEmpty())
        assertTrue(decodeMediaDownloadHistory("").isEmpty())
        assertTrue(decodeMediaDownloadHistory("not json").isEmpty())
        assertTrue(decodeMediaDownloadHistory("""[{"title":"missing share text"}]""").isEmpty())
    }

    @Test
    fun `history rows read as platform plus relative time`() {
        val now = 1_700_000_000_000L

        assertEquals("", mediaHistoryTime(0, now))
        assertEquals("刚刚", mediaHistoryTime(now - 30_000, now))
        assertEquals("5 分钟前", mediaHistoryTime(now - 5 * 60_000, now))
        assertEquals("3 小时前", mediaHistoryTime(now - 3 * 3_600_000, now))
        assertEquals("2 天前", mediaHistoryTime(now - 2 * 86_400_000, now))

        assertEquals(
            "抖音 · 5 分钟前",
            mediaHistorySubtitle(MediaDownloadHistoryEntry("标题", "douyin", "https://v.douyin.com/a/", now - 5 * 60_000), now),
        )
        assertEquals("", mediaHistorySubtitle(MediaDownloadHistoryEntry("标题", "", "https://v.douyin.com/a/", 0L), now))
    }
}
