// HapticButton.swift — button with built-in selection haptic

import SwiftUI

/// A button that fires a selection haptic before executing its action.
struct HapticButton<Label: View>: View {
    let action: () -> Void
    let label: Label
    var feedbackStyle: HapticStyle

    enum HapticStyle: Sendable {
        case selection
        case success
        case warning
        case impact
    }

    init(
        feedbackStyle: HapticStyle = .selection,
        action: @escaping () -> Void,
        @ViewBuilder label: () -> Label
    ) {
        self.action = action
        self.label = label()
        self.feedbackStyle = feedbackStyle
    }

    var body: some View {
        Button {
            fireHaptic()
            action()
        } label: {
            label
        }
    }

    private func fireHaptic() {
        switch feedbackStyle {
        case .selection:
            UISelectionFeedbackGenerator().selectionChanged()
        case .success:
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        case .warning:
            UINotificationFeedbackGenerator().notificationOccurred(.warning)
        case .impact:
            UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        }
    }
}

// MARK: - Convenience initialiser for plain text label

extension HapticButton where Label == Text {
    init(_ title: String, feedbackStyle: HapticStyle = .selection, action: @escaping () -> Void) {
        self.init(feedbackStyle: feedbackStyle, action: action) {
            Text(title)
        }
    }
}
