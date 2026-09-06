import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import com.android.build.api.dsl.ManagedVirtualDevice

plugins {
    alias(libs.plugins.android.test)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.androidx.baselineprofile)
}

android {
    namespace = "cn.pxyb.mycontrol.baselineprofile"

    compileSdk = 36

    defaultConfig {
        minSdk = 28
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    targetProjectPath = ":app"
    experimentalProperties["android.experimental.self-instrumenting"] = true

    testOptions.managedDevices.allDevices.create<ManagedVirtualDevice>("pixel2Api35") {
        device = "Pixel 2"
        apiLevel = 35
        systemImageSource = "aosp"
    }
}

baselineProfile {
    val managed = providers.gradleProperty("useManagedProfileDevice").map(String::toBoolean).getOrElse(false)
    useConnectedDevices = !managed
    if (managed) managedDevices += "pixel2Api35"
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

dependencies {
    implementation(libs.androidx.benchmark.macro.junit4)
    implementation(libs.androidx.test.ext.junit)
    implementation(libs.androidx.test.uiautomator)
}


