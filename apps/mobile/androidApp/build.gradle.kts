import groovy.json.JsonSlurper
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.compose.compiler)
}

val releaseManifest =
    providers
        .fileContents(rootProject.layout.projectDirectory.file("../../manifest.json"))
        .asText
        .map { JsonSlurper().parseText(it) as Map<*, *> }
        .get()
val androidRelease = releaseManifest["android"] as Map<*, *>

android {
    namespace = "io.github.littlesurvival.antithreadarmy"
    compileSdk = 36
    defaultConfig {
        applicationId = androidRelease["applicationId"] as String
        minSdk = 24
        targetSdk = 36
        versionCode = releaseManifest["versionCode"] as Int
        versionName = releaseManifest["version"] as String
        manifestPlaceholders["appLabel"] = releaseManifest["name"] as String
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    buildFeatures { compose = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin { compilerOptions { jvmTarget.set(JvmTarget.JVM_17) } }

dependencies {
    implementation(project(":shared"))
    implementation(libs.androidx.activity.compose)
    androidTestImplementation("androidx.compose.ui:ui-test-junit4:1.11.2")
    androidTestImplementation("androidx.test.ext:junit:1.3.0")
    androidTestImplementation("androidx.test:runner:1.7.0")
}
