// QuickStatsCard.swift — profile quick stats bento card

import SwiftUI
import UMAShared

struct QuickStatsCard: View {
    let profile: HealthProfile
    let activeMedCount: Int
    let docCount: Int

    var body: some View {
        BentoCard(
            cardId: TodayCard.quickStats.rawValue,
            title: "Quick Stats",
            systemImage: "chart.bar"
        ) {
            VStack(spacing: 12) {
                HStack(spacing: 16) {
                    statPill(
                        value: "\(activeMedCount)",
                        label: "Medications",
                        systemImage: "pills",
                        color: .accentColor
                    )
                    statPill(
                        value: "\(docCount)",
                        label: "Records",
                        systemImage: "doc.text",
                        color: .secondary
                    )
                }

                if !profile.conditions.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Conditions")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 6) {
                                ForEach(profile.conditions, id: \.self) { condition in
                                    Text(condition)
                                        .font(.caption2.weight(.medium))
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 4)
                                        .background(.secondary.opacity(0.12), in: Capsule())
                                        .foregroundStyle(.primary)
                                }
                            }
                        }
                    }
                    .accessibilityLabel("Conditions: \(profile.conditions.joined(separator: ", "))")
                }

                if let next = profile.nextVisitDateFormatted {
                    HStack {
                        Image(systemName: "calendar.badge.clock")
                            .foregroundStyle(.accentColor)
                            .font(.caption)
                        Text("Next visit: \(next)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Spacer()
                    }
                    .accessibilityLabel("Next doctor visit: \(next)")
                }
            }
        }
    }

    @ViewBuilder
    private func statPill(value: String, label: String, systemImage: String, color: Color) -> some View {
        VStack(spacing: 4) {
            HStack(spacing: 4) {
                Image(systemName: systemImage)
                    .font(.caption)
                    .foregroundStyle(color)
                Text(value)
                    .font(.title2.weight(.bold))
                    .foregroundStyle(.primary)
            }
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(10)
        .background(.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(value) \(label)")
    }
}
