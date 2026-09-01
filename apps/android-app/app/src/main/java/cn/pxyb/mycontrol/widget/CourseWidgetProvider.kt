package cn.pxyb.mycontrol.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.text.format.DateFormat
import android.view.View
import android.widget.RemoteViews
import androidx.core.content.ContextCompat
import cn.pxyb.mycontrol.DeepLinks
import cn.pxyb.mycontrol.R
import cn.pxyb.mycontrol.data.CampusTimetable
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Date

/**
 * 本学期周课表桌面组件：显示当前周次课表，突出当前星期。
 * 数据由 AppViewModel / OperationalSyncWorker 在拿到课表后通过 publish() 持久化，
 * 组件本身只读取本地快照渲染，定时 APPWIDGET_UPDATE 负责跨天刷新。
 */
class CourseWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, widgetIds: IntArray) {
        widgetIds.forEach { manager.updateAppWidget(it, buildViews(context)) }
    }

    companion object {
        private const val PREFERENCES = "course_widget"
        private const val KEY_PAYLOAD = "payload"
        private const val KEY_UPDATED_AT = "updated_at"
        private const val MAX_ROWS = 6
        private const val PALETTE_COUNT = 6

        private val dayNames = arrayOf("周一", "周二", "周三", "周四", "周五", "周六", "周日")
        private val shortDayNames = arrayOf("一", "二", "三", "四", "五", "六", "日")
        private val rowIds = intArrayOf(
            R.id.widget_course_row_1,
            R.id.widget_course_row_2,
            R.id.widget_course_row_3,
            R.id.widget_course_row_4,
            R.id.widget_course_row_5,
            R.id.widget_course_row_6,
        )
        private val sectionIds = intArrayOf(
            R.id.widget_course_section_1,
            R.id.widget_course_section_2,
            R.id.widget_course_section_3,
            R.id.widget_course_section_4,
            R.id.widget_course_section_5,
            R.id.widget_course_section_6,
        )
        private val dayIds = intArrayOf(
            R.id.widget_course_day_1,
            R.id.widget_course_day_2,
            R.id.widget_course_day_3,
            R.id.widget_course_day_4,
            R.id.widget_course_day_5,
            R.id.widget_course_day_6,
            R.id.widget_course_day_7,
        )
        private val cellIds = arrayOf(
            intArrayOf(
                R.id.widget_course_cell_1_1, R.id.widget_course_cell_1_2, R.id.widget_course_cell_1_3,
                R.id.widget_course_cell_1_4, R.id.widget_course_cell_1_5, R.id.widget_course_cell_1_6,
                R.id.widget_course_cell_1_7,
            ),
            intArrayOf(
                R.id.widget_course_cell_2_1, R.id.widget_course_cell_2_2, R.id.widget_course_cell_2_3,
                R.id.widget_course_cell_2_4, R.id.widget_course_cell_2_5, R.id.widget_course_cell_2_6,
                R.id.widget_course_cell_2_7,
            ),
            intArrayOf(
                R.id.widget_course_cell_3_1, R.id.widget_course_cell_3_2, R.id.widget_course_cell_3_3,
                R.id.widget_course_cell_3_4, R.id.widget_course_cell_3_5, R.id.widget_course_cell_3_6,
                R.id.widget_course_cell_3_7,
            ),
            intArrayOf(
                R.id.widget_course_cell_4_1, R.id.widget_course_cell_4_2, R.id.widget_course_cell_4_3,
                R.id.widget_course_cell_4_4, R.id.widget_course_cell_4_5, R.id.widget_course_cell_4_6,
                R.id.widget_course_cell_4_7,
            ),
            intArrayOf(
                R.id.widget_course_cell_5_1, R.id.widget_course_cell_5_2, R.id.widget_course_cell_5_3,
                R.id.widget_course_cell_5_4, R.id.widget_course_cell_5_5, R.id.widget_course_cell_5_6,
                R.id.widget_course_cell_5_7,
            ),
            intArrayOf(
                R.id.widget_course_cell_6_1, R.id.widget_course_cell_6_2, R.id.widget_course_cell_6_3,
                R.id.widget_course_cell_6_4, R.id.widget_course_cell_6_5, R.id.widget_course_cell_6_6,
                R.id.widget_course_cell_6_7,
            ),
        )
        private val lightCellDrawables = intArrayOf(
            R.drawable.widget_course_cell_0_light,
            R.drawable.widget_course_cell_1_light,
            R.drawable.widget_course_cell_2_light,
            R.drawable.widget_course_cell_3_light,
            R.drawable.widget_course_cell_4_light,
            R.drawable.widget_course_cell_5_light,
        )
        private val strongCellDrawables = intArrayOf(
            R.drawable.widget_course_cell_0_strong,
            R.drawable.widget_course_cell_1_strong,
            R.drawable.widget_course_cell_2_strong,
            R.drawable.widget_course_cell_3_strong,
            R.drawable.widget_course_cell_4_strong,
            R.drawable.widget_course_cell_5_strong,
        )
        private val courseColorResources = intArrayOf(
            R.color.widget_course_0,
            R.color.widget_course_1,
            R.color.widget_course_2,
            R.color.widget_course_3,
            R.color.widget_course_4,
            R.color.widget_course_5,
        )
        private val dateFormatter = DateTimeFormatter.ofPattern("M月d日")

        fun publish(context: Context, timetable: CampusTimetable?) {
            if (timetable == null) return
            val payload = toPayloadJson(timetable)
            context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).edit()
                .putString(KEY_PAYLOAD, payload.toString())
                .putLong(KEY_UPDATED_AT, System.currentTimeMillis())
                .apply()
            updateAll(context)
        }

        fun clear(context: Context) {
            context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE).edit().clear().apply()
            updateAll(context)
        }

        fun refresh(context: Context) {
            updateAll(context)
        }

        private fun updateAll(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val component = ComponentName(context, CourseWidgetProvider::class.java)
            manager.getAppWidgetIds(component).forEach { manager.updateAppWidget(it, buildViews(context)) }
        }

        private fun toPayloadJson(timetable: CampusTimetable): JSONObject {
            val courses = JSONArray()
            for (course in timetable.courses) {
                val weeks = JSONArray()
                for (week in course.weeks) weeks.put(week)
                courses.put(
                    JSONObject()
                        .put("name", course.courseName)
                        .put("code", course.courseCode)
                        .put("day", course.day)
                        .put("start", course.startSection)
                        .put("end", course.endSection)
                        .put("weeks", weeks),
                )
            }
            val payload = JSONObject()
                .put("term", timetable.termText)
                .put("calendarText", timetable.currentCalendarText)
                .put("courses", courses)
            val week = timetable.schoolCalendar?.currentWeek
                ?: Regex("第(\\d+)周").find(timetable.currentCalendarText)?.groupValues?.getOrNull(1)?.toIntOrNull()
            if (week != null) payload.put("currentWeek", week)
            return payload
        }

        private data class CourseLite(
            val name: String,
            val code: String,
            val day: Int,
            val start: Int,
            val end: Int,
            val weeks: List<Int>,
        )

        private fun parseCourses(payload: JSONObject): List<CourseLite> {
            val array = payload.optJSONArray("courses") ?: return emptyList()
            val result = ArrayList<CourseLite>(array.length())
            for (index in 0 until array.length()) {
                val item = array.optJSONObject(index) ?: continue
                val weeks = ArrayList<Int>()
                val weeksArray = item.optJSONArray("weeks")
                if (weeksArray != null) {
                    for (weekIndex in 0 until weeksArray.length()) {
                        weeks.add(weeksArray.optInt(weekIndex))
                    }
                }
                result.add(
                    CourseLite(
                        name = item.optString("name", "课程"),
                        code = item.optString("code"),
                        day = item.optInt("day"),
                        start = item.optInt("start"),
                        end = item.optInt("end"),
                        weeks = weeks,
                    ),
                )
            }
            return result
        }

        private fun buildViews(context: Context): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.widget_course_timetable)
            val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
            val payload = preferences.getString(KEY_PAYLOAD, null)
                ?.let { raw -> runCatching { JSONObject(raw) }.getOrNull() }

            val today = LocalDate.now()
            val todayValue = today.dayOfWeek.value
            val week = payload?.optInt("currentWeek")?.takeIf { it > 0 }
            val courses = payload?.let(::parseCourses).orEmpty()

            views.setTextViewText(
                R.id.widget_course_header,
                if (week != null) "第 ${week} 周 · 本周课表" else "本周课表",
            )
            views.setTextViewText(
                R.id.widget_course_term,
                payload?.optString("term").orEmpty().takeIf { it.isNotBlank() } ?: "本学期课表",
            )
            views.setTextViewText(R.id.widget_course_week, if (week != null) "第${week}周" else "本周")
            views.setViewVisibility(R.id.widget_course_week, if (week != null) View.VISIBLE else View.GONE)
            views.setTextViewText(
                R.id.widget_course_today,
                "${dayNames[todayValue - 1]} · ${today.format(dateFormatter)}",
            )

            for (day in 1..7) {
                val dayId = dayIds[day - 1]
                views.setTextViewText(dayId, shortDayNames[day - 1])
                if (day == todayValue) {
                    views.setInt(dayId, "setBackgroundResource", R.drawable.widget_day_today_bg)
                    views.setTextColor(dayId, ContextCompat.getColor(context, R.color.widget_text_on_accent))
                }
            }

            val weekCourses = courses.filter { week == null || it.weeks.isEmpty() || week in it.weeks }
            val todayCourses = weekCourses.filter { it.day == todayValue }
            views.setTextViewText(
                R.id.widget_course_today_summary,
                if (todayCourses.isEmpty()) "今日无课" else "今日 ${todayCourses.size} 节",
            )

            val starts = weekCourses.map(CourseLite::start).distinct().sorted()
            val visibleRows = starts.take(MAX_ROWS)
            visibleRows.forEachIndexed { index, start ->
                val rowIndex = index + 1
                val rowCourses = weekCourses.filter { it.start == start }
                views.setViewVisibility(rowIds[rowIndex - 1], View.VISIBLE)
                val end = rowCourses.maxOf(CourseLite::end)
                views.setTextViewText(sectionIds[rowIndex - 1], if (end > start) "$start-$end" else start.toString())
                for (day in 1..7) {
                    val cellViewId = cellIds[rowIndex - 1][day - 1]
                    val dayCourses = rowCourses.filter { it.day == day }
                    if (dayCourses.isEmpty()) {
                        views.setViewVisibility(cellViewId, View.INVISIBLE)
                        views.setTextViewText(cellViewId, "")
                    } else {
                        views.setViewVisibility(cellViewId, View.VISIBLE)
                        views.setTextViewText(cellViewId, dayCourses.joinToString("\n") { it.name })
                        val palette = stablePaletteIndex(dayCourses.first().code.ifBlank { dayCourses.first().name })
                        val todayCell = day == todayValue
                        views.setInt(
                            cellViewId,
                            "setBackgroundResource",
                            if (todayCell) strongCellDrawables[palette] else lightCellDrawables[palette],
                        )
                        views.setTextColor(
                            cellViewId,
                            ContextCompat.getColor(
                                context,
                                if (todayCell) R.color.widget_text_on_accent else courseColorResources[palette],
                            ),
                        )
                    }
                }
            }
            for (index in visibleRows.size until MAX_ROWS) {
                views.setViewVisibility(rowIds[index], View.GONE)
            }

            val hiddenSections = (starts.size - visibleRows.size).coerceAtLeast(0)
            val footer = buildString {
                if (courses.isEmpty()) {
                    append("尚未同步 · 打开 App 查看课表")
                } else {
                    val updatedAt = preferences.getLong(KEY_UPDATED_AT, 0L)
                    append(if (updatedAt > 0L) "更新 ${DateFormat.getTimeFormat(context).format(Date(updatedAt))}" else "已同步")
                    if (hiddenSections > 0) append(" · 还有 $hiddenSections 个时段未显示")
                    append(" · 点击查看完整课表")
                }
            }
            views.setTextViewText(R.id.widget_course_footer, footer)

            val openIntent = DeepLinks.openIntent(context, destination = "today")
            val openPendingIntent = PendingIntent.getActivity(
                context,
                0,
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            views.setOnClickPendingIntent(R.id.widget_course_root, openPendingIntent)
            return views
        }

        private fun stablePaletteIndex(seed: String): Int {
            var hash = 7
            for (char in seed) hash = hash * 31 + char.code
            return Math.floorMod(hash, PALETTE_COUNT)
        }
    }
}
