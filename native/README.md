# Local survey capture companions

These capture-focused projects share the version 1 `.mfsurvey.json` envelope with the browser editor. Measurements and recovery files stay on the device. Export uses the operating system's share sheet; it does not upload automatically.

## iOS

Requirements: full Xcode, an iOS 17+ SDK, and a signing team for physical devices. Open `ios/ModelForgeSurvey.xcodeproj`. The project is also reproducible from `ios/project.yml` with XcodeGen (`xcodegen generate --spec ios/project.yml`). RoomPlan is offered only when `RoomCaptureSession.isSupported`; other devices retain manual readings and photo selection. Each processed room is retained as source evidence. Repeated rooms are not claimed to have a shared AR origin: align their reference points in the browser.

### Repeatable iOS validation

From the repository root:

```sh
native/ios/validate.sh 'platform=iOS Simulator,name=iPhone 18 Pro'
```

Use an installed simulator from `xcrun simctl list devices available`. If the active developer directory still points at Command Line Tools, supply `DEVELOPER_DIR` for the full Xcode installation, for example:

```sh
DEVELOPER_DIR="$HOME/Downloads/Xcode.app/Contents/Developer" native/ios/validate.sh 'platform=iOS Simulator,name=iPhone 18 Pro'
```

The script generates the project, compiles an unsigned device build, runs native storage and English/Hebrew UI tests, and checks a Swift-exported survey (including its photo) with the planner's actual importer. Logs and build products stay in ignored `ios/DerivedData/`. XCTest results include screenshots. Device compilation with signing disabled does not install an app on a physical phone.

## Android

Open `android` in Android Studio with JDK 17, Android SDK 35 and Gradle 8.9. The app uses ARCore as an optional capability; camera/AR installation failures do not prevent manual capture. ARCore enables horizontal/vertical plane finding and Depth when supported. The screen centre is the aiming point for stable floor-corner capture. Recorded corner loops retain genuine angles. Initial wall heights and thicknesses are explicitly estimates and require measurements. Import photos from the system picker and share the JSON through a scoped FileProvider URI.

### Repeatable Android emulator validation

Build the debug APK with `./gradlew assembleDebug` from `native/android`, then install it on an Android emulator. From the repository root run:

```sh
python3 native/android/validate-emulator.py emulator-5554
```

The script refuses physical-device serials and resets only the companion's data on that emulator. It exercises English/Hebrew entry, app restart recovery, undo, a forced unwritable-storage failure followed by retry, camera denial, and system-share export. The resulting exchange file is written to `/tmp/modelforge-android-export.mfsurvey.json`. Real AR geometry and capture accuracy require physical hardware.

## Required validation before distribution

Android debug assembly has passed using the installed SDK 35, Gradle 8.9 and Android Studio JDK. The API 36.1 emulator passes manual entry, restart recovery, undo, failed-write retry, camera denial and system-share export in English and Hebrew. Its exported readings pass the planner importer. iOS now compiles and links for both the simulator and device with Xcode 27.0 (27A266a), using the iOS 27 SDK and an iOS 17 deployment target. All seven native test executions pass: three storage tests, plus English/Hebrew UI tests on both iPhone 18 Pro and iPad mini (A17 Pro) simulators. The Swift-exported reading and photo also pass the planner importer. No physical iOS or Android device is connected. Neither companion has undergone physical capture validation; these are not validated release builds.

On supported and unsupported devices, test camera denial, interruptions, tracking loss, pause/resume, app termination and local recovery, retake/undo, multiple rooms, large photos and system-share round trips. For accuracy, independently measure a rectangular room, an irregular room, a connected pair, a stair/void and outdoor reference points. Record each reference, captured value, signed error, absolute error, device, OS and lighting condition. No observed capture errors are available yet; do not substitute advertised sensor accuracy for measurements.

English and Hebrew interface strings are included. English/Hebrew manual workflows have simulator/emulator coverage. Device-specific camera layouts still require physical-device verification before release.

API references: [RoomCaptureViewDelegate](https://developer.apple.com/documentation/roomplan/roomcaptureviewdelegate), [ARCore Depth](https://developers.google.com/ar/develop/java/depth/developer-guide), [ARCore session configuration](https://developers.google.com/ar/develop/java/session-config).
