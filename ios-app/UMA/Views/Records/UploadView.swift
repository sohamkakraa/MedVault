// UploadView.swift — PHPickerViewController UIViewRepresentable for PDF upload

import SwiftUI
import PhotosUI
import UniformTypeIdentifiers
import UMAShared

struct UploadView: View {
    @Environment(RecordsViewModel.self) private var vm
    @Environment(\.dismiss) private var dismiss
    @State private var showPicker = false
    @State private var selectedPDFData: Data?
    @State private var selectedFilename = ""

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Spacer()

                // Upload illustration
                VStack(spacing: 16) {
                    ZStack {
                        Circle()
                            .fill(Color.accentColor.opacity(0.1))
                            .frame(width: 100, height: 100)
                        Image(systemName: "doc.badge.arrow.up.fill")
                            .font(.system(size: 44))
                            .foregroundStyle(Color.accentColor)
                    }
                    Text("Upload a Medical Document")
                        .font(.title2.weight(.semibold))
                        .multilineTextAlignment(.center)
                    Text("Upload lab reports, prescriptions, bills or imaging results. UMA reads them and organises your health data automatically.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                }

                Spacer()

                // File selected preview
                if let _ = selectedPDFData {
                    HStack {
                        Image(systemName: "doc.fill")
                            .foregroundStyle(Color.accentColor)
                        Text(selectedFilename)
                            .font(.subheadline)
                            .lineLimit(1)
                        Spacer()
                        Button {
                            selectedPDFData = nil
                            selectedFilename = ""
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(12)
                    .background(.secondary.opacity(0.1), in: RoundedRectangle(cornerRadius: 10))
                    .padding(.horizontal)
                    .accessibilityLabel("Selected file: \(selectedFilename). Tap X to remove.")
                }

                // Upload progress
                if vm.isUploading {
                    VStack(spacing: 8) {
                        ProgressView(value: vm.uploadProgress)
                            .tint(Color.accentColor)
                            .padding(.horizontal)
                        Text("Analysing your document…")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.horizontal)
                    .accessibilityLabel("Uploading document, \(Int(vm.uploadProgress * 100)) percent complete")
                }

                // Error
                if let err = vm.errorMessage {
                    Text(err)
                        .font(.caption)
                        .foregroundStyle(.red)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                        .accessibilityLabel("Error: \(err)")
                }

                // CTA buttons
                VStack(spacing: 12) {
                    Button {
                        showPicker = true
                    } label: {
                        Label(
                            selectedPDFData == nil ? "Choose PDF" : "Change PDF",
                            systemImage: "folder"
                        )
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.accentColor.opacity(0.1), in: RoundedRectangle(cornerRadius: 14))
                        .foregroundStyle(Color.accentColor)
                        .font(.headline)
                    }
                    .accessibilityLabel("Choose a PDF file from your device")

                    if let data = selectedPDFData {
                        Button {
                            Task {
                                await vm.uploadPDF(data: data, filename: selectedFilename)
                                if vm.uploadSuccess {
                                    dismiss()
                                }
                            }
                        } label: {
                            Label("Upload Document", systemImage: "arrow.up.circle.fill")
                                .frame(maxWidth: .infinity)
                                .padding()
                                .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 14))
                                .foregroundStyle(.white)
                                .font(.headline)
                        }
                        .disabled(vm.isUploading)
                        .accessibilityLabel("Upload the selected document")
                        .accessibilityHint("Double tap to send the document to UMA for analysis")
                    }
                }
                .padding(.horizontal)
                .safeAreaInset(edge: .bottom) {
                    Color.clear.frame(height: 16)
                }
            }
            .navigationTitle("Upload")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") { dismiss() }
                }
            }
            .sheet(isPresented: $showPicker) {
                PDFPickerView { data, name in
                    selectedPDFData = data
                    selectedFilename = name
                }
            }
        }
    }
}

// MARK: - PDF Picker (UIViewControllerRepresentable)

struct PDFPickerView: UIViewControllerRepresentable {
    let onPick: (Data, String) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onPick: onPick)
    }

    func makeUIViewController(context: Context) -> UIDocumentPickerViewController {
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.pdf])
        picker.allowsMultipleSelection = false
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIDocumentPickerViewController, context: Context) {}

    final class Coordinator: NSObject, UIDocumentPickerDelegate, @unchecked Sendable {
        let onPick: (Data, String) -> Void

        init(onPick: @escaping (Data, String) -> Void) {
            self.onPick = onPick
        }

        func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
            guard let url = urls.first else { return }
            guard url.startAccessingSecurityScopedResource() else { return }
            defer { url.stopAccessingSecurityScopedResource() }
            if let data = try? Data(contentsOf: url) {
                onPick(data, url.lastPathComponent)
            }
        }
    }
}
