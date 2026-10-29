import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import java.security.KeyStore
import java.security.MessageDigest

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
val releaseSigningFingerprint = if (releaseSigningConfigured) {
    val store = KeyStore.getInstance(file(releaseSigningProperties[0]!!), releaseSigningProperties[2]!!.toCharArray())
    val certificate = requireNotNull(store.getCertificate(releaseSigningProperties[1])) { "Release signing certificate is missing." }
    MessageDigest.getInstance("SHA-256").digest(certificate.encoded).joinToString("") { "%02x".format(it) }
} else ""

android {
    namespace = "cn.pxyb.mycontrol"
    compileSdk = 36

    defaultConfig {
        applicationId = "cn.pxyb.mycontrol"
        minSdk = 28
        targetSdk = 36
        versionCode = appVersionCode.get()
        versionName = appVersionName.get()
        // 关键 UI 流程（登录、更新、预约）此前没有任何设备侧回归防护，这里补上入口。
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("String", "APP_SIGNING_CERT_SHA256", "\"$releaseSigningFingerprint\"")

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
            isDebuggable = false
            isMinifyEnabled = true
            isShrinkResources = true
            // ML Kit 的中文 OCR 与条码模型是捆绑原生库，四套 ABI 合计约 61MB。
            // 正式包只服务真机，x86/x86_64 仅供模拟器使用；调试与性能采集变体不受影响，
            // 否则基线配置文件生成会在 x86_64 模拟器上装不上包。
            ndk {
                abiFilters += listOf("arm64-v8a", "armeabi-v7a")
            }
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

androidComponents {
    finalizeDsl { extension ->
        // 性能采集包使用独立数据目录和本机空端口，避免接触真实账号与线上业务。
        listOf("nonMinifiedRelease", "benchmarkRelease").forEach { name ->
            extension.buildTypes.getByName(name).apply {
                applicationIdSuffix = ".benchmark"
                signingConfig = extension.signingConfigs.getByName("debug")
                buildConfigField("String", "PLATFORM_BASE_URL", "\"https://127.0.0.1:9\"")
                buildConfigField("String", "APP_UPDATE_MANIFEST_URL", "\"https://127.0.0.1:9/latest.json\"")
                buildConfigField("String", "APP_UPDATE_MANIFEST_FALLBACK_URL", "\"https://127.0.0.1:9/latest.json\"")
            }
            extension.sourceSets.getByName(name).apply {
                java.srcDir("src/benchmark/java")
                manifest.srcFile("src/benchmark/AndroidManifest.xml")
            }
        }
    }
}

baselineProfile {
    mergeIntoMain = true
    saveInSrc = true
    automaticGenerationDuringBuild = false
    filter { exclude("cn.pxyb.mycontrol.benchmark.**") }
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
    implementation(libs.coil.svg)
    implementation(libs.coil.network.okhttp)
    implementation(project(":core:network"))
    implementation(project(":core:security"))
    implementation(libs.mlkit.barcode.scanning)
    implementation(libs.mlkit.text.recognition.chinese)
    implementation(libs.androidx.profileinstaller)

    debugImplementation(libs.androidx.compose.ui.tooling)
    testImplementation(libs.junit)
    testImplementation(libs.org.json)

    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.test.ext.junit)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.androidx.test.espresso.core)
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    debugImplementation(libs.androidx.compose.ui.test.manifest)

    baselineProfile(project(":baselineprofile"))
}


