// BentoCard.swift — glass bento card shell

import SwiftUI

/// Shell for a Today dashboard bento card.
/// Applies Liquid Glass background, min height, and drag affordance.
struct BentoCard<Content: View>: View {
    let cardId: String
    let title: String
    let systemImage: String
    let content: Content
    var minHeight: CGFloat = 160

    @State private var isPressed = false

    init(
        cardId: String,
        title: String,
        systemImage: String,
        minHeight: CGFloat = 160,
        @ViewBuilder content: () -> Content
    ) {
        self.cardId = cardId
        self.title = title
        self.systemImage = systemImage
        self.minHeight = minHeight
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Card header
            HStack(spacing: 6) {
                Image(systemName: systemImage)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Text(title)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .textCase(.uppercase)
                    .tracking(0.5)
                Spacer()
            }

            // Card content
            content
        }
        .padding(16)
        .frame(maxWidth: .infinity, minHeight: minHeight, alignment: .topLeading)
        .glassCard()
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .scaleEffect(isPressed ? 0.97 : 1.0)
        .animation(.spring(response: 0.3), value: isPressed)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(title)
    }
}
