plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

val appVersionName = providers.gradleProperty("appVersionName").orElse("1.1.0")
val appVersionCode = providers.gradleProperty("appVersionCode").map(String::toInt).orElse(1_001_000)
val releaseSigningProperties = listOf(
    providers.gradleProperty("androidReleaseStoreFile").orNull,
    providers.gradleProperty("androidReleaseKeyAlias").orNull,
    providers.gradleProperty("androidReleaseStorePassword").orNull,
    providers.gradleProperty("androidReleaseKeyPassword").orNull,
)
val releaseSigningConfigured = releaseSigningProperties.all { !it.isNullOrBlank() }
require(releaseSigningConfigured || releaseSigningProperties.all { it.isNullOrBlank() }) {
    "Android release signing properties must either all be configured or all be omitted."
}

android {
    namespace = "cn.pxyb.mycontrol"
    compileSdk = 36

    defaultConfig {
        applicationId = "cn.pxyb.mycontrol"
        minSdk = 28
        targetSdk = 36
        versionCode = appVersionCode.get()
        versionName = appVersionName.get()

        buildConfigField("String", "PLATFORM_BASE_URL", "\"https://pxyb.cn\"")
        buildConfigField(
            "String",
            "APP_UPDATE_MANIFEST_URL",
            "\"https://github.com/mufenxu/MY/releases/latest/download/latest.json\"",
        )
        buildConfigField(
            "String",
            "APP_RELEASES_URL",
            "\"https://github.com/mufenxu/MY/releases\"",
        )
    }

    signingConfigs {
        if (releaseSigningConfigured) {
            create("release") {
                storeFile = file(releaseSigningProperties[0]!!)
                keyAlias = releaseSigningProperties[1]
                storePassword = releaseSigningProperties[2]
                keyPassword = releaseSigningProperties[3]
                enableV1Signing = true
                enableV2Signing = true
                enableV3Signing = true
                enableV4Signing = true
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            if (releaseSigningConfigured) {
                signingConfig = signingConfigs.getByName("release")
            }
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }

    lint {
        // Compose 1.6.1 的检测器无法读取 Kotlin 2.0.21 metadata，会在分析前直接崩溃。
        disable += "StateFlowValueCalledInComposition"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-compose:1.9.2")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.7.0")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.7.0")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.7.0")
    implementation("androidx.navigation:navigation-compose:2.7.7")
    implementation("androidx.work:work-runtime-ktx:2.9.1")
    implementation("androidx.browser:browser:1.8.0")
    implementation("androidx.credentials:credentials:1.6.0")
    implementation("androidx.credentials:credentials-play-services-auth:1.6.0")
    implementation("androidx.camera:camera-camera2:1.4.2")
    implementation("androidx.camera:camera-lifecycle:1.4.2")
    implementation("androidx.camera:camera-view:1.4.2")

    implementation("androidx.compose.ui:ui:1.6.1")
    implementation("androidx.compose.ui:ui-tooling-preview:1.6.1")
    implementation("androidx.compose.foundation:foundation:1.6.1")
    implementation("androidx.compose.material3:material3:1.2.1")
    implementation("androidx.compose.material:material-icons-extended:1.6.0")

    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.google.mlkit:barcode-scanning:17.3.0")

    debugImplementation("androidx.compose.ui:ui-tooling:1.6.1")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}
