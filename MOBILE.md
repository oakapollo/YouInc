# YouInc Mobile Wrapper

YouInc is wrapped for iOS and Android with Capacitor.

## Build and sync

Use real Firebase values in `.env.local`, then run:

```bash
npm run mobile:sync
```

This does three things:

1. Builds the Next app as a static mobile bundle into `out/`.
2. Copies the bundle into `ios/App/App/public`.
3. Copies the bundle into `android/app/src/main/assets/public`.

The normal web build is unchanged:

```bash
npm run build
```

## Test on iPhone

```bash
npm run mobile:ios
```

Then in Xcode:

1. Select your iPhone as the run target.
2. Set your Apple developer team under Signing & Capabilities.
3. Press Run.

For pre-release testing before the App Store, archive the app in Xcode and upload it to App Store Connect, then use TestFlight.

## Test on Android

```bash
npm run mobile:android
```

Then in Android Studio:

1. Let Gradle sync.
2. Select your phone or emulator.
3. Press Run.

For pre-release testing before Google Play release, build an AAB and upload it to the Play Console internal testing track.

## Release notes

- Capacitor app id: `app.youinc.mobile`
- App name: `YouInc`
- Web bundle directory: `out`
- The legacy `/api/load` route is disabled only during static mobile export. The signed-in app uses Firebase directly.
- Replace generated native icons/splash assets before final store submission if the current defaults are not final brand assets.
