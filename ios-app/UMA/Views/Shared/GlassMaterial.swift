// GlassMaterial.swift — Liquid Glass modifier with iOS 18 availability check

import SwiftUI

/// Applies .glassEffect() on iOS 18 when reduce transparency is off,
/// otherwise falls back to .regularMaterial background.
struct GlassMaterial: ViewModifier {
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    func body(content: Content) -> some View {
        if #available(iOS 26.0, *), !reduceTransparency {
            content
                .glassEffect()
        } else {
            content
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
    }
}

extension View {
    /// Applies Liquid Glass on iOS 26+ or .regularMaterial on earlier OS / reduce transparency.
    func glassCard() -> some View {
        modifier(GlassMaterial())
    }
}

// MARK: - Glass Card Shape

/// A glass-styled card container.
struct GlassCard<Content: View>: View {
    let content: Content
    var cornerRadius: CGFloat = 16

    init(cornerRadius: CGFloat = 16, @ViewBuilder content: () -> Content) {
        self.content = content()
        self.cornerRadius = cornerRadius
    }

    var body: some View {
        content
            .glassCard()
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
    }
}
