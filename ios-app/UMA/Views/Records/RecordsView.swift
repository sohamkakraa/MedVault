// RecordsView.swift — document list with swipe actions

import SwiftUI
import UMAShared

struct RecordsView: View {
    @Environment(RecordsViewModel.self) private var vm
    @Environment(TodayViewModel.self) private var todayVm
    @State private var showUpload = false

    var body: some View {
        NavigationStack {
            Group {
                if vm.filteredDocs.isEmpty {
                    emptyState
                } else {
                    docList
                }
            }
            .navigationTitle("Records")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showUpload = true
                    } label: {
                        Label("Upload", systemImage: "plus.circle.fill")
                    }
                    .accessibilityLabel("Upload a medical document")
                }
            }
            .searchable(text: Binding(
                get: { vm.searchText },
                set: { vm.searchText = $0 }
            ), prompt: "Search records")
            .sheet(isPresented: $showUpload) {
                UploadView()
            }
        }
        .onAppear {
            vm.load(from: todayVm.store)
        }
        .onChange(of: todayVm.store.updatedAtISO) { _, _ in
            vm.load(from: todayVm.store)
        }
    }

    private var docList: some View {
        List {
            // Filter chips
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    filterChip(nil, label: "All")
                    ForEach(ExtractedDoc.DocType.allCases, id: \.self) { type in
                        filterChip(type, label: type.rawValue)
                    }
                }
                .padding(.vertical, 4)
            }
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))

            ForEach(vm.filteredDocs) { doc in
                NavigationLink(value: doc.id) {
                    DocRow(doc: doc)
                }
                .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                    Button(role: .destructive) {
                        Task { await vm.deleteDoc(id: doc.id) }
                    } label: {
                        Label("Delete", systemImage: "trash")
                    }
                }
            }
        }
        .listStyle(.plain)
        .navigationDestination(for: String.self) { id in
            if let doc = vm.docs.first(where: { $0.id == id }) {
                DocumentDetailView(doc: doc)
            }
        }
    }

    private var emptyState: some View {
        ContentUnavailableView {
            Label("No Records", systemImage: "folder.badge.questionmark")
        } description: {
            Text("Upload your medical documents to keep everything in one place.")
        } actions: {
            Button("Upload a Document") {
                showUpload = true
            }
            .buttonStyle(.borderedProminent)
        }
        .accessibilityLabel("No records found. Tap Upload to add a document.")
    }

    @ViewBuilder
    private func filterChip(_ type: ExtractedDoc.DocType?, label: String) -> some View {
        let isSelected = vm.filterType == type
        Button {
            withAnimation {
                vm.filterType = type
            }
            UISelectionFeedbackGenerator().selectionChanged()
        } label: {
            Text(label)
                .font(.caption.weight(.medium))
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(isSelected ? .accentColor : .secondary.opacity(0.12),
                            in: Capsule())
                .foregroundStyle(isSelected ? .white : .primary)
        }
        .accessibilityLabel("Filter: \(label)")
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

// MARK: - DocRow

struct DocRow: View {
    let doc: ExtractedDoc

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: doc.type.systemImage)
                .font(.title3)
                .foregroundStyle(.accentColor)
                .frame(width: 36, height: 36)
                .background(.accentColor.opacity(0.1), in: RoundedRectangle(cornerRadius: 8))

            VStack(alignment: .leading, spacing: 2) {
                Text(doc.title)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                HStack(spacing: 4) {
                    Text(doc.type.rawValue)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    if let provider = doc.provider {
                        Text("·")
                            .foregroundStyle(.secondary)
                        Text(provider)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
                if let date = doc.date {
                    Text(DateFormatter.mediumDate.string(from: date))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }

            Spacer()
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(doc.type.rawValue): \(doc.title), \(doc.provider ?? ""), \(doc.dateISO)")
    }
}

extension DateFormatter {
    static let mediumDate: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeStyle = .none
        return f
    }()
}
