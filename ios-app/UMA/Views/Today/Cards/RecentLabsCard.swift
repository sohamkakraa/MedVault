// RecentLabsCard.swift — most recent labs bento card

import SwiftUI
import UMAShared

struct RecentLabsCard: View {
    let labs: [ExtractedLab]

    var body: some View {
        BentoCard(
            cardId: TodayCard.recentLabs.rawValue,
            title: "Recent Labs",
            systemImage: "flask",
            minHeight: 180
        ) {
            if labs.isEmpty {
                emptyState
            } else {
                labList
            }
        }
    }

    private var labList: some View {
        VStack(spacing: 8) {
            ForEach(labs.prefix(4)) { lab in
                StatRow(
                    label: lab.name,
                    value: String(format: lab.value >= 100 ? "%.0f" : "%.1f", lab.value),
                    unit: lab.unit,
                    flag: lab.flag
                )
                if lab.id != labs.prefix(4).last?.id {
                    Divider()
                }
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 8) {
            Image(systemName: "flask")
                .font(.largeTitle)
                .foregroundStyle(.secondary)
            Text("Upload lab reports to see results here")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .accessibilityLabel("No lab results. Upload a lab report to get started.")
    }
}
