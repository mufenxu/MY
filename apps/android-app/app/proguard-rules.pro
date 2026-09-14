-dontwarn okhttp3.**
-dontwarn okio.**

-renamesourcefileattribute SourceFile

-assumenosideeffects class android.util.Log {
    public static int v(...);
    public static int d(...);
    public static int i(...);
}
