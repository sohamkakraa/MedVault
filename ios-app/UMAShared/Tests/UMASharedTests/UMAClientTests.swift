// UMAClientTests.swift — unit tests for networking and SSEParser

import Testing
import Foundation
@testable import UMAShared

// MARK: - SSEParser Tests

@Suite("SSEParser")
struct SSEParserTests {

    @Test("parses valid data line")
    func parsesDataLine() async throws {
        let json = #"{"type":"token","token":"Hello","done":false}"#
        let sseText = "data: \(json)\n\n"
        let data = sseText.data(using: .utf8)!

        // Build a mock URLProtocol response
        let mockSession = makeMockSession(responseData: data, statusCode: 200)
        let parser = SSEParser(session: mockSession)

        var request = URLRequest(url: URL(string: "https://uma.sohamkakra.com/api/stream")!)
        request.httpMethod = "GET"

        var received: [ChatSSEEvent] = []
        for try await event in parser.stream(request: request, maxRetries: 0) {
            received.append(event)
        }

        #expect(received.count == 1)
        #expect(received[0].token == "Hello")
        #expect(received[0].type == .token)
    }

    @Test("handles [DONE] sentinel")
    func handlesDoneSentinel() async throws {
        let sseText = "data: [DONE]\n\n"
        let data = sseText.data(using: .utf8)!
        let mockSession = makeMockSession(responseData: data, statusCode: 200)
        let parser = SSEParser(session: mockSession)

        var request = URLRequest(url: URL(string: "https://uma.sohamkakra.com/api/stream")!)
        request.httpMethod = "GET"

        var received: [ChatSSEEvent] = []
        for try await event in parser.stream(request: request, maxRetries: 0) {
            received.append(event)
        }

        #expect(received.isEmpty)
    }

    @Test("throws on non-200 response")
    func throwsOnBadStatus() async throws {
        let mockSession = makeMockSession(responseData: Data(), statusCode: 401)
        let parser = SSEParser(session: mockSession)

        var request = URLRequest(url: URL(string: "https://uma.sohamkakra.com/api/stream")!)
        request.httpMethod = "GET"

        await #expect(throws: SSEError.self) {
            for try await _ in parser.stream(request: request, maxRetries: 0) {}
        }
    }
}

// MARK: - PatientStore Tests

@Suite("PatientStore")
struct PatientStoreTests {

    @Test("latestLab returns most recent")
    func latestLab() {
        let labs = [
            ExtractedLab(name: "HbA1c", value: 7.2, unit: "%", dateISO: "2024-01-01T00:00:00Z"),
            ExtractedLab(name: "HbA1c", value: 6.8, unit: "%", dateISO: "2025-01-01T00:00:00Z"),
            ExtractedLab(name: "LDL", value: 120, unit: "mg/dL", dateISO: "2025-01-01T00:00:00Z")
        ]
        let store = PatientStore(labs: labs)
        let latest = store.latestLab(named: "HbA1c")
        #expect(latest?.value == 6.8)
    }

    @Test("activeMedications excludes expired")
    func activeMedications() {
        let iso = ISO8601DateFormatter()
        let past = iso.string(from: Date().addingTimeInterval(-86400))
        let future = iso.string(from: Date().addingTimeInterval(86400))

        let meds = [
            ExtractedMedication(name: "Metformin", endDateISO: future),
            ExtractedMedication(name: "OldMed", endDateISO: past),
            ExtractedMedication(name: "OngoingMed")
        ]
        let store = PatientStore(meds: meds)
        let active = store.activeMedications
        #expect(active.count == 2)
        #expect(active.map(\.name).contains("Metformin"))
        #expect(active.map(\.name).contains("OngoingMed"))
    }
}

// MARK: - AppGroupStore Tests

@Suite("AppGroupStore")
struct AppGroupStoreTests {

    @Test("roundtrip PatientStore read/write")
    func roundtrip() async {
        let store = AppGroupStore()
        var profile = HealthProfile()
        profile.name = "Test User"
        let patientStore = PatientStore(profile: profile)

        await store.writeStore(patientStore)
        let read = await store.readStore()
        #expect(read?.profile.name == "Test User")
    }

    @Test("card order persists")
    func cardOrderPersists() async {
        let store = AppGroupStore()
        let order = ["nextDose", "latestBP", "hba1c"]
        await store.writeCardOrder(order)
        let read = await store.readCardOrder()
        #expect(read == order)
    }

    @Test("mark dose taken sets status")
    func markDoseTaken() async {
        let store = AppGroupStore()
        let iso = ISO8601DateFormatter()
        let dose = DoseSchedule(
            medicationId: "med-1",
            medicationName: "Metformin",
            scheduledTimeISO: iso.string(from: Date())
        )
        await store.writeDoseSchedules([dose])
        await store.markDoseTaken(id: dose.id)
        let updated = await store.readDoseSchedules()
        #expect(updated.first?.status.isTaken == true)
    }
}

// MARK: - DoseSchedule Tests

@Suite("DoseSchedule")
struct DoseScheduleTests {

    @Test("ringProgress approaches 1 near due time")
    func ringProgressNearDue() {
        let iso = ISO8601DateFormatter()
        let soon = iso.string(from: Date().addingTimeInterval(60)) // 1 minute away
        let dose = DoseSchedule(
            medicationId: "m1",
            medicationName: "Test",
            scheduledTimeISO: soon
        )
        // Within 1 hour window, 1 min away → progress ≈ 0.983
        #expect(dose.ringProgress > 0.9)
        #expect(dose.ringProgress <= 1.0)
    }

    @Test("ringProgress is 0 for far-future dose")
    func ringProgressFarFuture() {
        let iso = ISO8601DateFormatter()
        let far = iso.string(from: Date().addingTimeInterval(7200)) // 2 hours away
        let dose = DoseSchedule(
            medicationId: "m1",
            medicationName: "Test",
            scheduledTimeISO: far
        )
        #expect(dose.ringProgress == 0.0)
    }
}

// MARK: - Mock URLSession helper

private func makeMockSession(responseData: Data, statusCode: Int) -> URLSession {
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [MockURLProtocol.self]
    MockURLProtocol.responseData = responseData
    MockURLProtocol.statusCode = statusCode
    return URLSession(configuration: config)
}

final class MockURLProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var responseData: Data = Data()
    nonisolated(unsafe) static var statusCode: Int = 200

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: MockURLProtocol.statusCode,
            httpVersion: "HTTP/1.1",
            headerFields: ["Content-Type": "text/event-stream"]
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: MockURLProtocol.responseData)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
