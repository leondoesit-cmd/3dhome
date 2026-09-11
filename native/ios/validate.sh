#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
destination="${1:?Pass an iOS Simulator destination, for example platform=iOS Simulator,name=iPhone 18 Pro}"
xcodegen generate --spec project.yml
mkdir -p DerivedData
xcodebuild -project ModelForgeSurvey.xcodeproj -scheme ModelForgeSurvey \
  -destination 'generic/platform=iOS' -derivedDataPath DerivedData/device \
  CODE_SIGNING_ALLOWED=NO build > DerivedData/device-build.log 2>&1
xcodebuild -project ModelForgeSurvey.xcodeproj -scheme ModelForgeSurvey \
  -destination "$destination" -derivedDataPath DerivedData/simulator \
  CODE_SIGNING_ALLOWED=NO test > DerivedData/test.log 2>&1
node check-export.mjs DerivedData/test.log
printf '%s\n' 'Device compilation, simulator tests and native-to-planner import passed.'
