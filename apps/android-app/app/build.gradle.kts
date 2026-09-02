import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.androidx.baselineprofile)
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
            "\"https://7n.pxyb.cn/android/latest.json\"",
        )
        buildConfigField(
            "String",
            "APP_UPDATE_MANIFEST_FALLBACK_URL",
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

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.work.runtime.ktx)
    implementation(libs.androidx.browser)
    implementation(libs.androidx.credentials)
    implementation(libs.androidx.credentials.play.services.auth)
    implementation(libs.androidx.camera.camera2)
    implementation(libs.androidx.camera.lifecycle)
    implementation(libs.androidx.camera.view)

    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.foundation)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons.extended)

    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.okhttp)
    implementation(libs.coil.compose)
    implementation(project(":core:network"))
    implementation(project(":core:security"))
    implementation(libs.mlkit.barcode.scanning)
    implementation(libs.androidx.profileinstaller)

    debugImplementation(libs.androidx.compose.ui.tooling)
    testImplementation(libs.junit)
    testImplementation(libs.org.json)

    baselineProfile(project(":baselineprofile"))
}


