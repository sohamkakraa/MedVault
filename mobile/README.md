# ⚠️ DEPRECATED — React Native / Expo App

This directory contains the original Expo + React Native implementation of UMA.

**It is in maintenance-only mode.** No new features will be added here.

## Migration

The active iOS implementation has moved to [`/ios-app`](../ios-app/), which is a
native SwiftUI + Xcode 16 project with full feature parity including:

- Live Activities (medication dose reminders on Lock Screen + Dynamic Island)
- WidgetKit widgets (systemSmall / Medium / Large + accessory families)
- SSE streaming chat
- Swift 6 strict concurrency
- Liquid Glass materials (iOS 26+)

## When will this be deleted?

`/mobile` will be removed once `/ios-app` reaches parity confirmation:

1. All four tabs (Today, Records, Chat, Profile) are feature-complete
2. Live Activity end-to-end tested on device
3. App Store submission approved

Until then, `/mobile` remains checked in but **no pull requests against it will
be merged** unless they fix a critical production regression.

## Running the Expo app (emergency only)

```bash
cd mobile
npm install
npx expo start
```

Requires Expo Go or a development build. See `ARCHITECTURE.md` for the original
design decisions.
