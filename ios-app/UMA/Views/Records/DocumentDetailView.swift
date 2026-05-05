// DocumentDetailView.swift — individual document detail

import SwiftUI
import UMAShared

struct DocumentDetailView: View {
    let doc: ExtractedDoc

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Header card
                headerCard

                // Summary
                if !doc.summary.isEmpty {
                    sectionCard(title: "Summary", systemImage: "text.bubble") {
                        Text(doc.summary)
                            .font(.body)
                    }
                }

                // Labs
                if !doc.labs.isEmpty {
                    sectionCard(title: "Lab Results", systemImage: "flask") {
                        VStack(spacing: 8) {
                            ForEach(doc.labs) { lab in
                                StatRow(
                                    label: lab.name,
                                    value: String(format: lab.value >= 100 ? "%.0f" : "%.1f", lab.value),
                                    unit: lab.unit,
                                    flag: lab.flag
                                )
                                if lab.id != doc.labs.last?.id {
                                    Divider()
                                }
                            }
                        }
                    }
                }

                // Medications
                if !doc.medications.isEmpty {
                    sectionCard(title: "Medications", systemImage: "pills") {
                        VStack(alignment: .leading, spacing: 10) {
                            ForEach(doc.medications) { med in
                                medRow(med)
                                if med.id != doc.medications.last?.id {
                                    Divider()
                                }
                            }
                        }
                    }
                }

                // Conditions & Allergies
                if !doc.conditions.isEmpty || !doc.allergies.isEmpty {
                    sectionCard(title: "Clinical Notes", systemImage: "stethoscope") {
                        VStack(alignment: .leading, spacing: 8) {
                            if !doc.conditions.isEmpty {
                                tagGroup(label: "Conditions", items: doc.conditions)
                            }
                            if !doc.allergies.isEmpty {
                                tagGroup(label: "Allergies", items: doc.allergies)
                            }
                        }
                    }
                }

                // Sections
                ForEach(doc.sections) { section in
                    sectionCard(title: section.heading, systemImage: "doc.text") {
                        Text(section.body)
                            .font(.body)
                    }
                }

                // Disclaimer
                HStack {
                    Image(systemName: "info.circle")
                        .foregroundStyle(.secondary)
                    Text("Not medical advice. Always consult your doctor.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 8)
                .accessibilityLabel("Disclaimer: Not medical advice. Always consult your doctor.")
            }
            .padding(16)
        }
        .navigationTitle(doc.title)
        .navigationBarTitleDisplayMode(.large)
    }

    private var headerCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Image(systemName: doc.type.systemImage)
                    .font(.title2)
                    .foregroundStyle(Color.accentColor)
                VStack(alignment: .leading) {
                    Text(doc.type.rawValue)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .textCase(.uppercase)
                    if let provider = doc.provider {
                        Text(provider)
                            .font(.subheadline)
                    }
                }
                Spacer()
                if let date = doc.date {
                    Text(DateFormatter.mediumDate.string(from: date))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            if !doc.tags.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(doc.tags, id: \.self) { tag in
                            Text(tag)
                                .font(.caption2.weight(.medium))
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(Color.accentColor.opacity(0.1), in: Capsule())
                                .foregroundStyle(Color.accentColor)
                        }
                    }
                }
            }
        }
        .padding(16)
        .glassCard()
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    @ViewBuilder
    private func sectionCard<Content: View>(
        title: String,
        systemImage: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(title, systemImage: systemImage)
                .font(.headline)
            content()
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .glassCard()
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    @ViewBuilder
    private func medRow(_ med: ExtractedMedication) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(med.name)
                .font(.subheadline.weight(.semibold))
            HStack(spacing: 12) {
                if let dose = med.dose {
                    Label(dose, systemImage: "pills")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                if let freq = med.frequency {
                    Label(freq, systemImage: "clock")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            if let indication = med.indication {
                Text("For: \(indication)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(med.name), \(med.dose ?? ""), \(med.frequency ?? "")")
    }

    @ViewBuilder
    private func tagGroup(label: String, items: [String]) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .textCase(.uppercase)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(items, id: \.self) { item in
                        Text(item)
                            .font(.caption.weight(.medium))
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
                            .background(.secondary.opacity(0.1), in: Capsule())
                    }
                }
            }
        }
        .accessibilityLabel("\(label): \(items.joined(separator: ", "))")
    }
}
