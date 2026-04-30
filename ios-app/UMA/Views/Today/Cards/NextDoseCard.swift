// NextDoseCard.swift — next medication dose bento card

import SwiftUI
import UMAShared

struct NextDoseCard: View {
    let dose: DoseSchedule?
    let onLog: () async -> Void

    @State private var isLogging = false

    var body: some View {
        BentoCard(
            cardId: TodayCard.nextDose.rawValue,
            title: "Next Dose",
            systemImage: "pills.circle"
        ) {
            if let dose {
                doseContent(dose)
            } else {
                emptyState
            }
        }
    }

    @ViewBuilder
    private func doseContent(_ dose: DoseSchedule) -> some View {
        HStack(alignment: .center, spacing: 16) {
            // Circular progress ring
            ZStack {
                Circle()
                    .stroke(.secondary.opacity(0.2), lineWidth: 4)
                Circle()
                    .trim(from: 0, to: dose.ringProgress)
                    .stroke(.accentColor, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .animation(.easeInOut(duration: 0.4), value: dose.ringProgress)

                Image(systemName: dose.status.systemImage)
                    .font(.title3)
                    .foregroundStyle(dose.status.isTaken ? .green : .accentColor)
            }
            .frame(width: 56, height: 56)
            .accessibilityLabel("Dose progress ring: \(Int(dose.ringProgress * 100)) percent")

            VStack(alignment: .leading, spacing: 4) {
                Text(dose.medicationName)
                    .font(.headline)
                    .lineLimit(1)
                if let doseAmount = dose.dose {
                    Text(doseAmount)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                if let time = dose.scheduledTime {
                    Text(timeFormatter.string(from: time))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Spacer()
        }

        if dose.status == .pending {
            HapticButton(feedbackStyle: .success) {
                Task {
                    isLogging = true
                    await onLog()
                    isLogging = false
                }
            } label: {
                Label("Mark Taken", systemImage: "checkmark.circle.fill")
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background(.accentColor.opacity(0.15), in: RoundedRectangle(cornerRadius: 10))
                    .foregroundStyle(.accentColor)
            }
            .disabled(isLogging)
            .accessibilityLabel("Mark \(dose.medicationName) as taken")
            .accessibilityHint("Double tap to log this dose as taken")
        } else {
            Text(dose.status.label)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.green)
                .padding(.vertical, 4)
        }
    }

    private var emptyState: some View {
        VStack(spacing: 8) {
            Image(systemName: "pills")
                .font(.largeTitle)
                .foregroundStyle(.secondary)
            Text("No doses scheduled today")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .accessibilityLabel("No doses scheduled today")
    }

    private var timeFormatter: DateFormatter {
        let f = DateFormatter()
        f.timeStyle = .short
        f.dateStyle = .none
        return f
    }
}
