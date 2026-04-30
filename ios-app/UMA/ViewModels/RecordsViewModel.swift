// RecordsViewModel.swift — document list + PDF upload

import SwiftUI
import UMAShared

@Observable
@MainActor
final class RecordsViewModel {
    var docs: [ExtractedDoc] = []
    var isLoading = false
    var isUploading = false
    var uploadProgress: Double = 0
    var errorMessage: String?
    var uploadSuccess = false
    var selectedDocId: String?
    var filterType: ExtractedDoc.DocType?
    var searchText = ""

    private let client = UMAClient.shared
    private let groupStore = AppGroupStore.shared

    func load(from store: PatientStore) {
        docs = store.docs
    }

    var filteredDocs: [ExtractedDoc] {
        var result = docs
        if let filter = filterType {
            result = result.filter { $0.type == filter }
        }
        if !searchText.isEmpty {
            result = result.filter {
                $0.title.localizedCaseInsensitiveContains(searchText) ||
                $0.summary.localizedCaseInsensitiveContains(searchText) ||
                ($0.provider ?? "").localizedCaseInsensitiveContains(searchText)
            }
        }
        return result.sorted { $0.dateISO > $1.dateISO }
    }

    func uploadPDF(data: Data, filename: String) async {
        isUploading = true
        uploadProgress = 0
        uploadSuccess = false
        errorMessage = nil
        defer { isUploading = false }

        do {
            // Simulate progress (server does real extraction)
            uploadProgress = 0.2
            let doc = try await client.uploadPDF(data: data, filename: filename)
            uploadProgress = 1.0
            docs.insert(doc, at: 0)

            // Persist updated store
            var updated = await groupStore.readStore() ?? PatientStore()
            updated.docs.insert(doc, at: 0)
            await groupStore.writeStore(updated)
            uploadSuccess = true
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func deleteDoc(id: String) async {
        docs.removeAll { $0.id == id }
        var updated = await groupStore.readStore() ?? PatientStore()
        updated.docs.removeAll { $0.id == id }
        await groupStore.writeStore(updated)
    }

    var selectedDoc: ExtractedDoc? {
        guard let id = selectedDocId else { return nil }
        return docs.first { $0.id == id }
    }
}
