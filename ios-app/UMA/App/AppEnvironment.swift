// AppEnvironment.swift — custom EnvironmentValues for app-wide dependencies

import SwiftUI
import UMAShared

// MARK: - Haptic feedback environment key

private struct HapticFeedbackKey: @preconcurrency EnvironmentKey {
    @MainActor static let defaultValue: HapticFeedback = HapticFeedback()
}

extension EnvironmentValues {
    var haptics: HapticFeedback {
        get { self[HapticFeedbackKey.self] }
        set { self[HapticFeedbackKey.self] = newValue }
    }
}

/// Centralised haptic feedback provider.
@MainActor
final class HapticFeedback: Sendable {
    private let selection = UISelectionFeedbackGenerator()
    private let notification = UINotificationFeedbackGenerator()
    private let impactGenerator = UIImpactFeedbackGenerator(style: .medium)

    func prepare() {
        selection.prepare()
        notification.prepare()
    }

    func selectionChanged() {
        selection.selectionChanged()
    }

    func success() {
        notification.notificationOccurred(.success)
    }

    func warning() {
        notification.notificationOccurred(.warning)
    }

    func error() {
        notification.notificationOccurred(.error)
    }

    func impact() {
        impactGenerator.impactOccurred()
    }
}

// MARK: - App Group Store environment key

private struct AppGroupStoreKey: EnvironmentKey {
    static let defaultValue: AppGroupStore = .shared
}

extension EnvironmentValues {
    var appGroupStore: AppGroupStore {
        get { self[AppGroupStoreKey.self] }
        set { self[AppGroupStoreKey.self] = newValue }
    }
}

// MARK: - UMA Client environment key

private struct UMAClientKey: EnvironmentKey {
    static let defaultValue: UMAClient = .shared
}

extension EnvironmentValues {
    var umaClient: UMAClient {
        get { self[UMAClientKey.self] }
        set { self[UMAClientKey.self] = newValue }
    }
}
