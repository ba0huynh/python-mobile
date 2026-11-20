> Project overview, source map, mobile rules and the **local (no-EAS) build guide** are in the root [`../AGENTS.md`](../AGENTS.md). Read it first.

This is an Expo/React Native mobile application (GoXe — customer + driver in one app). Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

This project uses npm (`package-lock.json`).

```bash
npm run web                 # start Metro for Web (preview instantly in browser without building APK)
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building

This project builds **locally**, without requiring an EAS account. Full guide is in [`ANDROID_BUILD.md`](ANDROID_BUILD.md) and root [`../AGENTS.md`](../AGENTS.md) (section 5).

- `npm run build:apk`: build standalone release `.apk` (fast, arm64).
- `npm run build:apk -- --all`: build release `.apk` for all architectures (emulators, older devices).
- `npm run build:dev:apk`: build Expo development build `.apk` (`expo-dev-client`).
- `npm run android`: build and install development build directly on device/emulator.

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally (MapLibre already requires this — Expo Go will not work).
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
