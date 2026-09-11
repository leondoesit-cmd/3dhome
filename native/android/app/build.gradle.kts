plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
android {
    namespace = "local.modelforge.survey"
    compileSdk = 35
    defaultConfig { applicationId = "local.modelforge.survey"; minSdk = 26; targetSdk = 35; versionCode = 1; versionName = "1.0" }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}
dependencies { implementation("com.google.ar:core:1.48.0"); implementation("androidx.core:core-ktx:1.15.0") }
