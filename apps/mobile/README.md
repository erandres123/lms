# LMS mobile (Flutter)

Student app for the K-12 LMS: schedule, section detail (meetings, grades,
attendance), inbox, live-class join, and profile. Android-first; web build is
used for quick verification.

The inbox reads `GET /v1/notifications` and marks items read with
`POST /v1/notifications/:id/read`. FCM registration is wired: on sign-in the app
requests notification permission, obtains a token, and registers it with
`POST /v1/notifications/devices` (`android`/`ios`; `web` in the browser build).
Foreground messages refresh the inbox and show an in-app banner. The API still
skips delivery until its Firebase service-account key is configured.

## Run

Create `env.json` (gitignored) from `env.example.json` and fill in the Supabase
project URL and anon key. The API and web URLs default to localhost. The
`FIREBASE_*` keys only matter for the web build; Android and iOS read
`google-services.json` and `GoogleService-Info.plist` instead.

```sh
flutter pub get
dart run build_runner build
flutter run --dart-define-from-file=env.json
flutter build web --dart-define-from-file=env.json
```

`env.example.json` documents the required keys. The anon key and Firebase client
config are public by design; never put a service-role key or the FCM
service-account private key in the app.

For an Android emulator, set `API_BASE_URL` to `http://10.0.2.2:3001` and add
that origin to the API `CORS_ORIGINS` only if the build also serves web.

## Data and cache

Schedule sections come from the API (`/v1/sections`) and are cached in an
encrypted Drift database on Android/iOS. The database key lives in
`flutter_secure_storage`; the file uses SQLite3 Multiple Ciphers with
SQLCipher-compatible settings (`cipher=sqlcipher`, `legacy=4`). On web the cache
is in memory because Drift's native library is not used there.

## Live class join

1. The app asks the API for a fresh token (`POST /v1/meetings/:id/join`).
2. It opens `WEB_BASE_URL/live-join#url=…&token=…&title=…&role=…` in the
   browser. The fragment is never sent to the web server.
3. The public page reads the fragment, clears it with `history.replaceState`,
   and renders the LiveKit room.
4. Reopening from the app mints a new token, so expired links are not reused.
   A 403 means the teacher has not started the class yet.

The `lms://join/<meetingId>` scheme is registered in
`android/app/src/main/AndroidManifest.xml` and `ios/Runner/Info.plist`.
Android debug builds allow cleartext traffic to reach the local API.
