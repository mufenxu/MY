package cn.pxyb.mycontrol.data

import android.content.Context
import androidx.compose.runtime.Immutable

@Immutable
data class AssistantButtonPreferences(
    val visible: Boolean = true,
    val xRatio: Float = 1f,
    val yRatio: Float = 1f,
    val collapsedSide: Int = 0,
)

class AssistantPreferences(context: Context) {
    private val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    fun read(): AssistantButtonPreferences = AssistantButtonPreferences(
        visible = preferences.getBoolean(KEY_VISIBLE, true),
        xRatio = preferences.getFloat(KEY_X_RATIO, 1f).coerceIn(0f, 1f),
        yRatio = preferences.getFloat(KEY_Y_RATIO, 1f).coerceIn(0f, 1f),
        collapsedSide = preferences.getInt(KEY_COLLAPSED_SIDE, 0).coerceIn(0, 2),
    )

    fun write(preferencesValue: AssistantButtonPreferences) {
        preferences.edit()
            .putBoolean(KEY_VISIBLE, preferencesValue.visible)
            .putFloat(KEY_X_RATIO, preferencesValue.xRatio.coerceIn(0f, 1f))
            .putFloat(KEY_Y_RATIO, preferencesValue.yRatio.coerceIn(0f, 1f))
            .putInt(KEY_COLLAPSED_SIDE, preferencesValue.collapsedSide.coerceIn(0, 2))
            .apply()
    }

    private companion object {
        const val PREFERENCES_NAME = "assistant_preferences"
        const val KEY_VISIBLE = "button_visible"
        const val KEY_X_RATIO = "button_x_ratio"
        const val KEY_Y_RATIO = "button_y_ratio"
        const val KEY_COLLAPSED_SIDE = "button_collapsed_side"
    }
}
