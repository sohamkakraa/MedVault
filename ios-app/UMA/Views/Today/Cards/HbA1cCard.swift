// HbA1cCard.swift — HbA1c trend bento card

import SwiftUI
import UMAShared

struct HbA1cCard: View {
    let store: PatientStore

    private var latestHbA1c: ExtractedLab? { store.latestLab(named: "HbA1c") }
    private var hba1cHistory: [ExtractedLab] {
        store.labs
            .filter { $0.name.lowercased() == "hba1c" }
            .sorted { $0.dateISO < $1.dateISO }
            .suffix(6)
            .map { $0 }
    }

    var body: some View {
        BentoCard(
            cardId: TodayCard.hba1c.rawValue,
            title: "HbA1c",
            systemImage: "waveform.path.ecg"
        ) {
            if let latest = latestHbA1c {
                hba1cContent(latest: latest)
            } else {
                emptyState
            }
        }
    }

    @ViewBuilder
    private func hba1cContent(latest: ExtractedLab) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .lastTextBaseline, spacing: 4) {
                Text(String(format: "%.1f", latest.value))
                    .font(.system(size: 36, weight: .bold, design: .rounded))
                Text(latest.unit)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.bottom, 4)
                Spacer()
                hba1cBadge(value: latest.value)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("HbA1c: \(String(format: "%.1f", latest.value)) \(latest.unit), \(hba1cCategory(latest.value).0)")

            // Mini sparkline
            if hba1cHistory.count >= 2 {
                AccessibleLabChart(labs: hba1cHistory, metricName: "HbA1c") {
                    SparklineView(values: hba1cHistory.map(\.value), color: sparklineColor(latest.value))
                        .frame(height: 32)
                }
            }

            if let date = latest.date {
                Text("Last measured \(relativeDate(date))")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder
    private func hba1cBadge(value: Double) -> some View {
        let (label, color) = hba1cCategory(value)
        Text(label)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(color.opacity(0.15), in: Capsule())
            .foregroundStyle(color)
    }

    private func hba1cCategory(_ value: Double) -> (String, Color) {
        switch value {
        case ..<5.7: return ("Normal", .green)
        case 5.7..<6.5: return ("Pre-diabetes", .orange)
        default: return ("Diabetes range", .red)
        }
    }

    private func sparklineColor(_ value: Double) -> Color {
        switch value {
        case ..<5.7: return .green
        case 5.7..<6.5: return .orange
        default: return .red
        }
    }

    private var emptyState: some View {
        VStack(spacing: 8) {
            Image(systemName: "waveform.path.ecg.rectangle")
                .font(.largeTitle)
                .foregroundStyle(.secondary)
            Text("No HbA1c data yet")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .accessibilityLabel("No HbA1c readings recorded yet")
    }

    private func relativeDate(_ date: Date) -> String {
        let f = RelativeDateTimeFormatter()
        f.unitsStyle = .abbreviated
        return f.localizedString(for: date, relativeTo: Date())
    }
}

// MARK: - Sparkline

struct SparklineView: View {
    let values: [Double]
    var color: Color = .accentColor

    var body: some View {
        GeometryReader { geo in
            let min = values.min() ?? 0
            let max = values.max() ?? 1
            let range = max - min == 0 ? 1 : max - min

            Path { path in
                for (i, value) in values.enumerated() {
                    let x = geo.size.width * CGFloat(i) / CGFloat(values.count - 1)
                    let y = geo.size.height * (1 - CGFloat((value - min) / range))
                    if i == 0 {
                        path.move(to: CGPoint(x: x, y: y))
                    } else {
                        path.addLine(to: CGPoint(x: x, y: y))
                    }
                }
            }
            .stroke(color, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
        }
    }
}
