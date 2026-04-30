// MessageBubble.swift — individual chat message bubble

import SwiftUI
import UMAShared

struct MessageBubble: View {
    let message: ChatMessage

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            if message.isUser { Spacer(minLength: 60) }

            if !message.isUser {
                // Assistant avatar
                Image(systemName: "heart.text.square.fill")
                    .font(.title3)
                    .foregroundStyle(.accentColor)
                    .frame(width: 32, height: 32)
                    .background(.accentColor.opacity(0.1), in: Circle())
                    .accessibilityHidden(true)
            }

            VStack(alignment: message.isUser ? .trailing : .leading, spacing: 4) {
                bubbleContent
                    .frame(maxWidth: .infinity, alignment: message.isUser ? .trailing : .leading)

                HStack(spacing: 4) {
                    Text(timeString)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    if message.isUser {
                        Image(systemName: "checkmark")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: message.isUser ? .trailing : .leading)
            }

            if message.isUser {
                // User avatar placeholder
                Image(systemName: "person.circle.fill")
                    .font(.title3)
                    .foregroundStyle(.secondary)
                    .frame(width: 32, height: 32)
                    .accessibilityHidden(true)
            }

            if !message.isUser { Spacer(minLength: 60) }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(message.isUser ? "You" : "UMA"): \(message.content)")
        .accessibilityHint(timeString)
    }

    @ViewBuilder
    private var bubbleContent: some View {
        ZStack(alignment: .bottomTrailing) {
            Text(message.content.isEmpty && message.isStreaming ? " " : message.content)
                .font(.body)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(
                    message.isUser
                        ? AnyShapeStyle(.accentColor)
                        : AnyShapeStyle(.regularMaterial),
                    in: BubbleShape(isUser: message.isUser)
                )
                .foregroundStyle(message.isUser ? .white : .primary)

            if message.isStreaming {
                TypingIndicator()
                    .padding(8)
            }
        }
    }

    private var timeString: String {
        let f = DateFormatter()
        f.timeStyle = .short
        f.dateStyle = .none
        return f.string(from: message.timestamp)
    }
}

// MARK: - Bubble Shape

struct BubbleShape: Shape {
    let isUser: Bool
    let radius: CGFloat = 18

    func path(in rect: CGRect) -> Path {
        var path = Path()
        let tl = CGPoint(x: rect.minX, y: rect.minY)
        let tr = CGPoint(x: rect.maxX, y: rect.minY)
        let bl = CGPoint(x: rect.minX, y: rect.maxY)
        let br = CGPoint(x: rect.maxX, y: rect.maxY)
        let tailRadius: CGFloat = 4

        path.move(to: CGPoint(x: tl.x + radius, y: tl.y))
        path.addLine(to: CGPoint(x: tr.x - radius, y: tr.y))
        path.addArc(center: CGPoint(x: tr.x - radius, y: tr.y + radius), radius: radius, startAngle: .degrees(-90), endAngle: .degrees(0), clockwise: false)

        if isUser {
            path.addLine(to: CGPoint(x: br.x, y: br.y - tailRadius))
            path.addArc(center: CGPoint(x: br.x - tailRadius, y: br.y - tailRadius), radius: tailRadius, startAngle: .degrees(0), endAngle: .degrees(90), clockwise: false)
        } else {
            path.addLine(to: CGPoint(x: br.x, y: br.y - radius))
            path.addArc(center: CGPoint(x: br.x - radius, y: br.y - radius), radius: radius, startAngle: .degrees(0), endAngle: .degrees(90), clockwise: false)
        }

        path.addLine(to: CGPoint(x: bl.x + (isUser ? radius : tailRadius), y: bl.y))
        if !isUser {
            path.addArc(center: CGPoint(x: bl.x + tailRadius, y: bl.y - tailRadius), radius: tailRadius, startAngle: .degrees(90), endAngle: .degrees(180), clockwise: false)
        } else {
            path.addArc(center: CGPoint(x: bl.x + radius, y: bl.y - radius), radius: radius, startAngle: .degrees(90), endAngle: .degrees(180), clockwise: false)
        }

        path.addLine(to: CGPoint(x: tl.x, y: tl.y + radius))
        path.addArc(center: CGPoint(x: tl.x + radius, y: tl.y + radius), radius: radius, startAngle: .degrees(180), endAngle: .degrees(270), clockwise: false)
        path.closeSubpath()
        return path
    }
}

// MARK: - Typing Indicator

struct TypingIndicator: View {
    @State private var animating = false

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<3, id: \.self) { i in
                Circle()
                    .fill(.secondary)
                    .frame(width: 6, height: 6)
                    .scaleEffect(animating ? 1.0 : 0.4)
                    .animation(
                        .easeInOut(duration: 0.5)
                            .repeatForever(autoreverses: true)
                            .delay(Double(i) * 0.15),
                        value: animating
                    )
            }
        }
        .onAppear { animating = true }
        .accessibilityLabel("UMA is typing")
    }
}
