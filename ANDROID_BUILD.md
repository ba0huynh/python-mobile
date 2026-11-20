# Building the Android APK & Expo Development Build (GoXe)

This guide explains how to build an Android `.apk` and an **Expo Development Build** (`expo-dev-client`) for `mobile/`—both **locally on your machine (no EAS account required)** using [`scripts/build-apk.js`](scripts/build-apk.js), and optionally via **EAS Cloud Build**.

---

## 1. Build an Android APK locally (no EAS)

Using [`scripts/build-apk.js`](scripts/build-apk.js), the build automatically runs `npx expo prebuild --platform android` to generate/update `./android` (Continuous Native Generation) and compiles the APK with Gradle.

### Release APK (Standalone installable APK)

Bakes JS code directly into the APK so it runs independently without needing Metro:

```sh
cd mobile
npm run build:apk              # arm64-v8a phones only: fastest, smallest APK
npm run build:apk -- --all     # all CPU ABIs (x86_64 emulators, older phones)
npm run build:apk -- --clean   # regenerate ./android from scratch first
```

The release APK is output to:
```text
mobile/android/app/build/outputs/apk/release/app-release.apk
```

### Expo Development Build APK (Debug APK with `expo-dev-client`)

Builds an `.apk` containing the native MapLibre module that connects to Metro for live JS reload:

```sh
cd mobile
npm run build:dev:apk          # builds mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

*(You can also pass `-- --all` or `-- --clean`, or run `npm run android` to build and immediately install onto a running emulator or USB device.)*

### Installing & running

- **Install the APK** onto a connected Android phone/emulator:
  ```sh
  # Standalone Release APK:
  adb install -r android/app/build/outputs/apk/release/app-release.apk

  # Development Build APK:
  adb install -r android/app/build/outputs/apk/debug/app-debug.apk
  ```

- **Run Metro for the Development Build:**
  ```sh
  cd mobile
  npm run start
  ```
  Then open the **GoXe** app on the device/emulator to load the bundle.

---

## 2. Local build prerequisites & Windows setup

1. **Android SDK & JDK 17:**
   - JDK 17 (`java -version` should report 17).
   - Android SDK Platform 34/35, Build-Tools, Platform-Tools, CMake, and NDK.
   - `ANDROID_HOME` environment variable pointing to `%LOCALAPPDATA%\Android\Sdk`.
   - Add `%ANDROID_HOME%\platform-tools` to your `PATH` (for `adb`).

2. **Backend connection (`.env`):**
   - Environment variables prefixed with `EXPO_PUBLIC_` are baked into the APK at build time.
   - Copy `.env.example` to `.env`:
     ```sh
     cp .env.example .env
     ```
   - **Android Emulator:** `EXPO_PUBLIC_API_URL=http://10.0.2.2:8000`
   - **Physical Phone over Wi-Fi:** `EXPO_PUBLIC_API_URL=http://<YOUR_PC_LAN_IP>:8000`
   - **Physical Phone over USB:** `adb reverse tcp:8000 tcp:8000` and `EXPO_PUBLIC_API_URL=http://127.0.0.1:8000`

3. **Gradle memory:**
   - Prebuild includes `withGradleMemory.js` in `app.json`, configuring `org.gradle.jvmargs=-Xmx6g` so Gradle does not run out of heap memory when compiling C++ code.

4. **Windows only — Long paths (Required):**
   - React Native 0.88 and native C++ codegen produce paths > 260 characters. Windows can fail with `ninja: error: mkdir(...): No such file or directory` or `Filename longer than 260 characters` if not enabled.
   - Run in an **Administrator PowerShell** once:
     ```powershell
     New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force
     ```
   - Android SDK CMake 3.22.1 ships ninja 1.10.2 which does not support Windows long paths. Install CMake 3.31.6 in Android Studio SDK Tools, then copy `%LOCALAPPDATA%\Android\Sdk\cmake\3.31.6\bin\ninja.exe` over `%LOCALAPPDATA%\Android\Sdk\cmake\3.22.1\bin\ninja.exe`.
   - If building inside a deep OneDrive path causes delays, you can copy/clone the repo to a shorter path (e.g. `C:\gx`).

---

## 3. Optional: Cloud builds via EAS (`eas.json`)

If you want to build in the cloud via Expo Application Services (no local Android SDK / JDK required):

```sh
cd mobile
npx eas-cli login
npx eas-cli init
npm run build:eas:apk     # Preview profile -> Android .apk
npm run build:eas:dev     # Development profile -> Android dev-client .apk
```

---

## 4. Script summary (`mobile/package.json`)

| Script | Command | Purpose |
|---|---|---|
| `npm run build:apk` | `node scripts/build-apk.js` | Local Android release `.apk` (supports `--all`, `--clean`) |
| `npm run build:dev:apk` | `node scripts/build-apk.js --dev` | Local Android Expo Development Build `.apk` (`assembleDebug`) |
| `npm run android` | `expo run:android` | Build & install debug build on connected Android device/emulator |
| `npm run android:release`| `expo run:android --variant release` | Build & install release build on connected device |
| `npm run start` | `expo start --dev-client` | Start Metro bundler for the Expo Development Build |
| `npm run web` | `expo start --web` | Instant vector map and app preview in browser |
| `npm run build:eas:apk` | `npx eas-cli build --profile preview --platform android` | Cloud EAS Android installable `.apk` |
| `npm run build:eas:dev` | `npx eas-cli build --profile development --platform android` | Cloud EAS Android dev-client `.apk` |
