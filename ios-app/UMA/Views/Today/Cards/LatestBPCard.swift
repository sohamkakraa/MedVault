// LatestBPCard.swift — latest blood pressure bento card

import SwiftUI
import UMAShared

struct LatestBPCard: View {
    let store: PatientStore

    private var systolic: ExtractedLab? { store.latestLab(named: "Systolic BP") }
    private var diastolic: ExtractedLab? { store.latestLab(named: "Diastolic BP") }

    var body: some View {
        BentoCard(
            cardId: TodayCard.latestBP.rawValue,
            title: "Blood Pressure",
            systemImage: "heart.fill"
        ) {
            if let sys = systolic, let dia = diastolic {
                bpContent(sys: sys, dia: dia)
            } else {
                emptyState
            }
        }
    }

    @ViewBuilder
    private func bpContent(sys: ExtractedLab, dia: ExtractedLab) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .lastTextBaseline, spacing: 4) {
                Text("\(Int(sys.value))/\(Int(dia.value))")
                    .font(.system(size: 36, weight: .bold, design: .rounded))
                Text("mmHg")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.bottom, 4)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Blood pressure: \(Int(sys.value)) over \(Int(dia.value)) millimeters of mercury")

            bpCategory(sys: sys.value, dia: dia.value)

            if let date = sys.date {
                Text("Recorded \(relativeDate(date))")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder
    private func bpCategory(sys: Double, dia: Double) -> some View {
        let (label, color) = bpClassification(sys: sys, dia: dia)
        Text(label)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(color.opacity(0.15), in: Capsule())
            .foregroundStyle(color)
            .accessibilityLabel("Category: \(label)")
    }

    private func bpClassification(sys: Double, dia: Double) -> (String, Color) {
        switch (sys, dia) {
        case (...119, ...79): return ("Normal", .green)
        case (120...129, ...79): return ("Elevated", .yellow)
        case (130...139, 80...89): return ("High Stage 1", .orange)
        case (140..., 90...): return ("High Stage 2", .red)
        case (...90, ...60): return ("Low", .blue)
        default: return ("Borderline", .orange)
        }
    }

    private var emptyState: some View {
        VStack(spacing: 8) {
            Image(systemName: "heart.slash")
                .font(.largeTitle)
                .foregroundStyle(.secondary)
            Text("No BP readings yet")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .accessibilityLabel("No blood pressure readings recorded yet")
    }

    private func relativeDate(_ date: Date) -> String {
        let f = RelativeDateTimeFormatter()
        f.unitsStyle = .abbreviated
        return f.localizedString(for: date, relativeTo: Date())
    }
}
