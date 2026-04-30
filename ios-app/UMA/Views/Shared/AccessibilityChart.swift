// AccessibilityChart.swift — accessibility wrapper for charts

import SwiftUI
import UMAShared

/// Wraps a chart view with accessibilityRepresentation for screen readers.
struct AccessibleLabChart<ChartContent: View>: View {
    let labs: [ExtractedLab]
    let metricName: String
    let chartContent: ChartContent

    init(
        labs: [ExtractedLab],
        metricName: String,
        @ViewBuilder chart: () -> ChartContent
    ) {
        self.labs = labs
        self.metricName = metricName
        self.chartContent = chart()
    }

    var body: some View {
        chartContent
            .accessibilityLabel(accessibilityLabel)
            .accessibilityHint("Double tap to hear individual values.")
            .accessibilityRepresentation {
                accessibilityList
            }
    }

    private var accessibilityLabel: String {
        "\(metricName) trend chart. \(labs.count) data points."
    }

    private var accessibilityList: some View {
        let sorted = labs.sorted { $0.dateISO < $1.dateISO }
        return ForEach(sorted) { lab in
            Text(labAccessibilityText(lab))
        }
    }

    private func labAccessibilityText(_ lab: ExtractedLab) -> String {
        let dateStr = lab.date.map { dateFormatter.string(from: $0) } ?? lab.dateISO
        let flagText = lab.flag?.label.map { ", \($0)" } ?? ""
        return "\(dateStr): \(lab.value) \(lab.unit)\(flagText)"
    }

    private var dateFormatter: DateFormatter {
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeStyle = .none
        return f
    }
}

// MARK: - Accessibility-friendly stat row

struct StatRow: View {
    let label: String
    let value: String
    let unit: String?
    let flag: ExtractedLab.LabFlag?

    var body: some View {
        HStack {
            Text(label)
                .foregroundStyle(.secondary)
            Spacer()
            HStack(spacing: 4) {
                Text(value)
                    .fontWeight(.semibold)
                if let unit {
                    Text(unit)
                        .foregroundStyle(.secondary)
                        .font(.caption)
                }
                if let flag, flag.isAbnormal {
                    Image(systemName: flag == .high ? "arrow.up.circle.fill" : "arrow.down.circle.fill")
                        .foregroundStyle(flag == .critical ? .red : .orange)
                        .font(.caption)
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessLabel)
    }

    private var accessLabel: String {
        var parts = ["\(label): \(value)"]
        if let unit { parts.append(unit) }
        if let flag, flag.isAbnormal { parts.append(flag.label) }
        return parts.joined(separator: ", ")
    }
}
