import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.kotlin.multiplatform)
    alias(libs.plugins.android.kmp.library)
    alias(libs.plugins.compose.multiplatform)
    alias(libs.plugins.compose.compiler)
}

kotlin {
    androidLibrary {
        namespace = "io.github.littlesurvival.antithreadarmy.shared"
        compileSdk = 36
        minSdk = 24
        compilerOptions { jvmTarget.set(JvmTarget.JVM_17) }
    }
    listOf(iosArm64(), iosSimulatorArm64()).forEach { target ->
        target.binaries.framework {
            baseName = "Shared"
            isStatic = true
        }
    }
    sourceSets {
        commonMain.dependencies {
            implementation(compose.runtime)
            implementation(compose.foundation)
            implementation(compose.material3)
            implementation(compose.ui)
            implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.10.2")
            implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.9.0")
            implementation("io.coil-kt.coil3:coil-compose:3.3.0")
            implementation("io.coil-kt.coil3:coil-network-ktor3:3.3.0")
        }
        androidMain.dependencies { implementation("io.ktor:ktor-client-okhttp:3.2.3") }
        iosMain.dependencies { implementation("io.ktor:ktor-client-darwin:3.2.3") }
        commonMain { kotlin.srcDir(layout.buildDirectory.dir("generated/threads")) }
    }
}

// Bundle the same page-side query into the native apps; no Python or server call.
val querySource = rootProject.file("../../packages/threads-client/page-query.js")
val generatedQuery = layout.buildDirectory.dir("generated/threads")
val generateThreadsQuery by tasks.registering {
    inputs.file(querySource)
    outputs.dir(generatedQuery)
    doLast {
        val source = querySource.readText().removePrefix("export ")
        val literal = source.replace("\\", "\\\\").replace("\"", "\\\"")
            .replace("\r", "").replace("\n", "\\n").replace("$", "\\$")
        generatedQuery.get().file("ThreadsQuery.kt").asFile.apply {
            parentFile.mkdirs()
            writeText("package io.github.littlesurvival.antithreadarmy\ninternal const val pageQuerySource = \"$literal\"\n")
        }
    }
}
tasks.configureEach { if (name.startsWith("compile")) dependsOn(generateThreadsQuery) }
