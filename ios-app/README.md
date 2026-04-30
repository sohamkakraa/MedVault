# UMA iOS App

Ur Medical Assistant — native iOS companion app.

## Requirements

- Xcode 16+
- iOS 18+ deployment target
- Swift 6 strict concurrency
- [XcodeGen](https://github.com/yonaskolb/XcodeGen): `brew install xcodegen`
- [xcbeautify](https://github.com/cpisciotta/xcbeautify) (optional): `brew install xcbeautify`

## Quick Start

```bash
cd ios-app
make generate   # generates UMA.xcodeproj from project.yml
make open       # opens UMA.xcworkspace
make build      # build for simulator
make test       # run unit + UI tests
make clean      # remove derived data + xcodeproj
```

## Entitlements

### UMA.entitlements
```xml
com.apple.security.application-groups = ["group.com.sohamkakra.uma"]
aps-environment = development (Debug) / production (Release)
com.apple.developer.activitykit-push-notifications = YES (for ActivityKit remote push)
```

### UMAWidgets.entitlements
```xml
com.apple.security.application-groups = ["group.com.sohamkakra.uma"]
```

### UMALiveActivity.entitlements
```xml
com.apple.security.application-groups = ["group.com.sohamkakra.uma"]
com.apple.developer.activitykit-push-notifications = YES
```

## App Group

All three targets share `group.com.sohamkakra.uma`.  
Data written via `AppGroupStore` is visible to widgets and the Live Activity.

Register the App Group in Apple Developer Portal → Identifiers → each App ID → App Groups.

## Push Notifications

1. Generate an APNs Auth Key (`.p8`) in Apple Developer Portal → Keys.
2. In Xcode → Signing & Capabilities → push notification entitlement is added automatically via `UMA.entitlements`.
3. For ActivityKit remote push: add `NSSupportsLiveActivities = YES` to Info.plist (already included).

## ActivityKit

- `DoseAttributes` defines the static + dynamic content for the Dose Live Activity.
- Request Live Activity with `ActivityAuthorizationInfo().areActivitiesEnabled`.
- Supported families: Lock Screen, Dynamic Island Compact, Minimal, Expanded.

## Code Signing with Fastlane Match

```bash
# Install fastlane
gem install fastlane

# Initialize match
fastlane match init
# Choose storage: git
# Git URL: git@github.com:sohamkakra/certificates.git

# Create development certificates
fastlane match development --app_identifier "com.sohamkakra.uma,com.sohamkakra.uma.widgets,com.sohamkakra.uma.liveactivity"

# Create distribution certificates
fastlane match appstore --app_identifier "com.sohamkakra.uma,com.sohamkakra.uma.widgets,com.sohamkakra.uma.liveactivity"
```

## API

Base URL: `https://uma.sohamkakra.com/api/`

| Method | Path | Description |
|---|---|---|
| GET | `/patient-store` | Full PatientStore JSON |
| POST | `/extract` | Upload PDF, returns ExtractedDoc |
| POST | `/chat` | Send message, returns streaming SSE |
| GET | `/stream` | SSE event stream for chat tokens |

Authentication: Bearer token in `Authorization` header (OTP session token stored in Keychain).

## Architecture

```
UMAShared (SPM local package)
├── Models        — PatientStore, ExtractedDoc, Medication, Lab, etc.
├── Networking    — UMAClient (actor), SSEParser, Endpoints
├── Auth          — AuthToken (Keychain)
└── Store         — AppGroupStore (UserDefaults App Group)

UMA (main app)
├── App           — UMAApp, AppEnvironment
├── Views         — Today, Records, Chat, Profile, Login, Shared
└── ViewModels    — @Observable, @MainActor

UMAWidgets        — WidgetKit (systemSmall/Medium/Large + accessory)
UMALiveActivity   — ActivityKit Live Activity (DoseAttributes)
Tests             — Swift Testing unit tests + XCUITests
```

## Swift Package Dependencies

| Package | URL | Used for |
|---|---|---|
| swift-async-algorithms | https://github.com/apple/swift-async-algorithms | SSE stream parsing |
| KeychainAccess | https://github.com/kishikawakatsuki/KeychainAccess | OTP token Keychain storage |

> **Note:** Verify the KeychainAccess URL resolves before building. If `make generate` reports
> a package fetch failure, find the current URL via https://swiftpackageindex.com by searching
> "KeychainAccess".

## Liquid Glass (`.glassEffect()`)

`.glassEffect()` is an **iOS 26 API** introduced at WWDC 2025. The `GlassMaterial` modifier
uses `#available(iOS 26.0, *)` so the app compiles and runs cleanly on iOS 18–25 with a
`.regularMaterial` fallback. You need Xcode 26 (beta) or later to build with the Liquid Glass
variant.

## Notes

- Secrets (API keys, push tokens) live in `Config/Debug.xcconfig` and `Config/Release.xcconfig`
  which are git-ignored. Create them locally or pull from CI.
- The `DEVELOPMENT_TEAM` in `project.yml` is set to `SOHAMKAKRA` — replace with your actual
  Apple Developer Team ID before archiving.
- Widget timeline refresh is 15 minutes (900s) plus an immediate reload whenever the SSE
  handler in `TodayViewModel` receives a `PatientStore` update.
