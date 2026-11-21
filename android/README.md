# Bazaar for Android (Google Play)

This folder is the Android app for Bazaar. It is a **Trusted Web Activity (TWA)**, made with
Google's [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap). The app opens the live site
`https://bazaar-ak.vercel.app` full screen, using the Chrome installed on the phone.

- Every Vercel deploy of `main` updates the app right away. A new Play release is only
  needed when something in this folder changes (name, icon, colours, package version).
- Package name: `com.alokfusion.bazaar`. It is permanent once uploaded to Play.
- Needs Android 7.0+ (minSdk 24) and target SDK 36.
- `twa-manifest.json` is the source of truth. After editing it, run `bubblewrap update`
  to regenerate the Gradle project.

## Tools

- JDK 17: `C:\Program Files\Microsoft\jdk-17.0.14.7-hotspot`
- Android SDK: `%LOCALAPPDATA%\Android\Sdk`
- Bubblewrap CLI: `npm install -g @bubblewrap/cli` (config in `~/.bubblewrap/config.json`)

## 1. Create the upload key (once)

Run this yourself in this folder. It asks you to choose a password. Pick your own and store it
in a password manager.

```powershell
& "C:\Program Files\Microsoft\jdk-17.0.14.7-hotspot\bin\keytool.exe" -genkeypair -v -keystore android.keystore -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

`android.keystore` is git-ignored. **Back it up somewhere safe** (not this repo). Losing it
means asking Google support to reset the upload key.

## 2. Build the release bundle

```powershell
$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-17.0.14.7-hotspot"; bubblewrap build
```

It asks for the keystore and key passwords, then writes:

- `app-release-bundle.aab`: upload this to Play Console.
- `app-release-signed.apk`: install on your own phone to test.

For each later release, raise `appVersionCode` (and `appVersionName`) in `twa-manifest.json`,
then run `bubblewrap update` and `bubblewrap build` again.

## 3. Link the app to the website (Digital Asset Links)

Without this, the app shows a browser address bar at the top. Android checks
`https://bazaar-ak.vercel.app/.well-known/assetlinks.json` for the app's signing
certificate fingerprints.

1. Upload the `.aab` to Play Console (Testing > Internal testing is fine). Play App Signing
   is on by default.
2. In Play Console open **Test and release > App integrity > App signing**. Copy the
   **SHA-256 certificate fingerprint** of both the *App signing key* and the *Upload key*.
3. In this folder, add each fingerprint and generate the file:

   ```powershell
   bubblewrap fingerprint add <APP-SIGNING-SHA256>
   bubblewrap fingerprint add <UPLOAD-KEY-SHA256>
   bubblewrap fingerprint generateAssetLinks --output=..\public\.well-known\assetlinks.json
   ```

4. Commit and push `main`. Vercel serves the file. Check it opens in a browser at
   `https://bazaar-ak.vercel.app/.well-known/assetlinks.json`.
5. Reinstall the app on a phone. The address bar should be gone.

## 4. Play Console checklist

- Developer account: one-time USD 25 fee.
- New **personal** developer accounts must run a closed test with at least 12 testers for
  14 days before they can apply for production access.
- Store listing: 512x512 icon (`store_icon.png` here), a 1024x500 feature graphic, and at
  least 2 phone screenshots.
- Privacy policy URL: `https://bazaar-ak.vercel.app/privacy`
- Data safety form: describe what the game actually sends (player names, chat messages and
  optional voice chat go through the game server and peer connections; no account sign-up).
- Content rating questionnaire and target audience. The game has no real-money gambling.
- Avoid the word "Monopoly" in the store listing (it is a Hasbro trademark).
