/**
 * Builds an Android APK locally: prebuild (generates ./android) then Gradle.
 *
 *   npm run build:apk             # release APK, arm64 phones only (fast, small)
 *   npm run build:apk -- --all    # release APK, every ABI (emulators / older phones)
 *   npm run build:apk -- --clean  # regenerate ./android from scratch first
 *   npm run build:dev:apk         # debug APK with expo-dev-client (Expo development build)
 *
 * Needs the Android SDK and JDK 17. On Windows, native C++ paths get very long:
 * turn on Windows long paths (see ANDROID_BUILD.md) and build from a short folder.
 * EXPO_PUBLIC_* values come from .env and are baked into the APK.
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const isWin = process.platform === 'win32';
const isDev = args.includes('--dev');
const root = path.resolve(__dirname, '..');
const androidDir = path.join(root, 'android');

function run(cmd, cmdArgs, cwd) {
  const executable = isWin ? 'cmd.exe' : cmd;
  const executableArgs = isWin ? ['/c', cmd, ...cmdArgs] : cmdArgs;
  const r = spawnSync(executable, executableArgs, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, CI: '1' },
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (root.length > 40) {
  console.warn(
    `\n! The project path is ${root.length} characters long. Windows may stop the native build with "No such file or directory" (260-character limit).\n  Enable long paths (see ANDROID_BUILD.md) or build from a short folder like C:\\gx.\n`
  );
}

const prebuild = ['expo', 'prebuild', '--platform', 'android'];
if (args.includes('--clean') || !fs.existsSync(androidDir)) {
  prebuild.push('--clean');
}
run('npx', prebuild, root);

const variant = isDev ? 'debug' : 'release';
const gradle = isWin ? 'gradlew.bat' : './gradlew';
const gradleArgs = [isDev ? 'assembleDebug' : 'assembleRelease'];
if (!args.includes('--all')) {
  gradleArgs.push('-PreactNativeArchitectures=arm64-v8a');
}
run(gradle, gradleArgs, androidDir);

const apk = path.join(
  androidDir,
  'app',
  'build',
  'outputs',
  'apk',
  variant,
  `app-${variant}.apk`
);
console.log(
  fs.existsSync(apk)
    ? `\nAPK ready: ${apk}`
    : `\nBuild finished, but app-${variant}.apk was not found in android/app/build/outputs/apk/${variant}.`
);
