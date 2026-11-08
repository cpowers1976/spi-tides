plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.kiteboardokoboji.spitides"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.kiteboardokoboji.spitides"
        minSdk = 24          // Android 7.0 and newer
        targetSdk = 35
        versionCode = 3
        versionName = "0.3"
    }

    // Use the same signing key on every build so a new APK installs over the old one.
    // This is a debug key kept in the repo on purpose; it is not a secret.
    signingConfigs {
        getByName("debug") {
            storeFile = rootProject.file("debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.12.1")
}
