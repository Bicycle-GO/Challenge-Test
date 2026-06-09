import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const buildRoot = join(root, ".android-build");
const androidSdk = join(buildRoot, "android-sdk");
const gradle = join(buildRoot, "gradle-8.9", "bin", "gradle");
const entries = await readdir(buildRoot);
const jdkDir = entries.find((entry) => entry.startsWith("jdk-"));

if (!jdkDir) {
  throw new Error("JDK not found in .android-build. Install or download JDK 17 first.");
}

await import("./sync-android-assets.mjs");

const child = spawn(gradle, ["-p", join(root, "android"), "assembleDebug"], {
  cwd: root,
  env: {
    ...process.env,
    ANDROID_HOME: androidSdk,
    ANDROID_SDK_ROOT: androidSdk,
    JAVA_HOME: join(buildRoot, jdkDir, "Contents", "Home"),
  },
  stdio: "inherit",
});

const exitCode = await new Promise((resolve) => child.on("close", resolve));
process.exit(exitCode ?? 1);
