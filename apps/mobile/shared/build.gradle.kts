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
        withHostTestBuilder {}.configure {}
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
        commonTest.dependencies {
            implementation(kotlin("test"))
            implementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.10.2")
        }
        getByName("androidHostTest").dependencies {
            // Compose's Android state implements Parcelable even in pure host-side model tests.
            implementation(files(androidComponents.sdkComponents.bootClasspath))
        }
        androidMain.dependencies {
            implementation("io.ktor:ktor-client-okhttp:3.2.3")
            implementation(libs.androidx.activity.compose)
        }
        iosMain.dependencies { implementation("io.ktor:ktor-client-darwin:3.2.3") }
        commonMain { kotlin.srcDir(layout.buildDirectory.dir("generated/threads")) }
    }
}

// Bundle the same page-side query into the native apps; no Python or server call.
val querySource = rootProject.file("../../packages/threads-client/page-query.js")
val inputSource = rootProject.file("../../packages/threads-client/input.js")
val errorSource = rootProject.file("../../packages/threads-client/error-report.js")
val contactData = rootProject.file("../../packages/threads-client/contact-data.json")
val generatedQuery = layout.buildDirectory.dir("generated/threads")
val generateThreadsQuery by tasks.registering {
    inputs.file(querySource)
    inputs.file(inputSource)
    inputs.file(errorSource)
    inputs.file(contactData)
    outputs.dir(generatedQuery)
    doLast {
        val source =
            "async function(input) {\n" +
                errorSource.readText().replace("export ", "") +
                "\n" +
                inputSource.readText().replace("export ", "") +
                "\n" +
                querySource.readText().removePrefix("export ") +
                "\ntry { return await queryThreads(await resolveThreadsInput(parseThreadsInput(input))); } catch (error) { error.report = createErrorReport(error, {stage: 'resolve-input', context: {input}}); throw error; }\n}"
        val literal =
            source
                .replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\r", "")
                .replace("\n", "\\n")
                .replace("$", "\\$")
        generatedQuery.get().file("ThreadsQuery.kt").asFile.apply {
            parentFile.mkdirs()
            writeText(
                "package io.github.littlesurvival.antithreadarmy\ninternal const val pageQuerySource = \"$literal\"\n"
            )
        }
        val contactLiteral =
            contactData
                .readText(Charsets.UTF_8)
                .replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\r", "")
                .replace("\n", "\\n")
                .replace("$", "\\$")
        generatedQuery
            .get()
            .file("ContactData.kt")
            .asFile
            .writeText(
                "package io.github.littlesurvival.antithreadarmy\ninternal const val contactDataJson = \"$contactLiteral\"\n",
                Charsets.UTF_8,
            )
    }
}

tasks.configureEach { if (name.startsWith("compile")) dependsOn(generateThreadsQuery) }
