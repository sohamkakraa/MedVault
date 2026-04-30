// UMATests.swift — Swift Testing: TodayViewModel, AppGroupStore

import Testing
import Foundation
@testable import UMA
@testable import UMAShared

// MARK: - TodayViewModel tests

@Suite("TodayViewModel")
@MainActor
struct TodayViewModelTests {

    @Test("initial state is empty")
    func initialState() {
        let vm = TodayViewModel()
        #expect(vm.store.docs.isEmpty)
        #expect(vm.store.meds.isEmpty)
        #expect(!vm.isLoading)
        #expect(vm.errorMessage == nil)
    }

    @Test("cardOrder has all default cards")
    func defaultCardOrder() {
        let vm = TodayViewModel()
        let defaults = Set(TodayCard.defaultOrder)
        let order = Set(vm.cardOrder)
        #expect(order == defaults)
    }

    @Test("moveCard updates order")
    func moveCard() {
        let vm = TodayViewModel()
        let original = vm.cardOrder
        vm.moveCard(from: IndexSet(integer: 0), to: 2)
        #expect(vm.cardOrder != original)
        #expect(vm.cardOrder.count == original.count)
    }

    @Test("latestHbA1c returns most recent lab")
    func latestHbA1c() {
        let vm = TodayViewModel()
        vm.store.labs = [
            ExtractedLab(name: "HbA1c", value: 7.0, unit: "%", dateISO: "2024-01-01T00:00:00Z"),
            ExtractedLab(name: "HbA1c", value: 6.5, unit: "%", dateISO: "2025-03-01T00:00:00Z")
        ]
        #expect(vm.latestHbA1c?.value == 6.5)
    }

    @Test("recentLabs returns at most 5")
    func recentLabsLimit() {
        let vm = TodayViewModel()
        vm.store.labs = (1...10).map { i in
            ExtractedLab(name: "Lab\(i)", value: Double(i), unit: "u", dateISO: "2025-0\(min(i,9))-01T00:00:00Z")
        }
        #expect(vm.recentLabs.count <= 5)
    }

    @Test("nextDose returns first pending dose")
    func nextDose() {
        let vm = TodayViewModel()
        let iso = ISO8601DateFormatter()
        vm.todayDoses = [
            DoseSchedule(
                medicationId: "m1",
                medicationName: "Metformin",
                scheduledTimeISO: iso.string(from: Date().addingTimeInterval(3600)),
                status: .pending
            ),
            DoseSchedule(
                medicationId: "m2",
                medicationName: "Aspirin",
                scheduledTimeISO: iso.string(from: Date().addingTimeInterval(7200)),
                status: .pending
            )
        ]
        #expect(vm.nextDose?.medicationName == "Metformin")
    }

    @Test("nextDose is nil when all taken")
    func nextDoseNilWhenAllTaken() {
        let vm = TodayViewModel()
        let iso = ISO8601DateFormatter()
        vm.todayDoses = [
            DoseSchedule(
                medicationId: "m1",
                medicationName: "Metformin",
                scheduledTimeISO: iso.string(from: Date()),
                status: .takenOnTime
            )
        ]
        #expect(vm.nextDose == nil)
    }
}

// MARK: - AppGroupStore tests

@Suite("AppGroupStore write/read")
struct AppGroupStoreIntegrationTests {

    @Test("writeStore and readStore roundtrip")
    func roundtrip() async {
        let store = AppGroupStore()
        var profile = HealthProfile()
        profile.name = "Integration Test User"
        profile.conditions = ["Diabetes Type 2"]
        let patient = PatientStore(profile: profile)

        await store.writeStore(patient)
        let read = await store.readStore()

        #expect(read?.profile.name == "Integration Test User")
        #expect(read?.profile.conditions == ["Diabetes Type 2"])
    }

    @Test("readCardOrder returns saved order")
    func cardOrderRoundtrip() async {
        let store = AppGroupStore()
        let order = ["hba1c", "nextDose", "latestBP"]
        await store.writeCardOrder(order)
        let read = await store.readCardOrder()
        #expect(read == order)
    }

    @Test("writeDoseSchedules persists and reads correctly")
    func doseScheduleRoundtrip() async {
        let store = AppGroupStore()
        let iso = ISO8601DateFormatter()
        let doses = [
            DoseSchedule(
                medicationId: "m1",
                medicationName: "Metformin",
                dose: "500mg",
                scheduledTimeISO: iso.string(from: Date().addingTimeInterval(3600))
            )
        ]
        await store.writeDoseSchedules(doses)
        let read = await store.readDoseSchedules()
        #expect(read.count == 1)
        #expect(read.first?.medicationName == "Metformin")
    }

    @Test("markDoseTaken updates status to takenOnTime for on-schedule dose")
    func markDoseTakenOnTime() async {
        let store = AppGroupStore()
        let iso = ISO8601DateFormatter()
        let now = Date()
        let dose = DoseSchedule(
            medicationId: "m1",
            medicationName: "TestMed",
            scheduledTimeISO: iso.string(from: now) // scheduled now
        )
        await store.writeDoseSchedules([dose])
        await store.markDoseTaken(id: dose.id, at: now)
        let updated = await store.readDoseSchedules()
        #expect(updated.first?.status.isTaken == true)
    }

    @Test("markDoseTaken updates status to takenEarly when taken > 10 min early")
    func markDoseTakenEarly() async {
        let store = AppGroupStore()
        let iso = ISO8601DateFormatter()
        let scheduledTime = Date().addingTimeInterval(1800) // 30 min from now
        let dose = DoseSchedule(
            medicationId: "m2",
            medicationName: "EarlyMed",
            scheduledTimeISO: iso.string(from: scheduledTime)
        )
        await store.writeDoseSchedules([dose])
        // Take it now (30 min early)
        await store.markDoseTaken(id: dose.id, at: Date())
        let updated = await store.readDoseSchedules()
        #expect(updated.first?.status == .takenEarly)
    }
}

// MARK: - ChatViewModel tests

@Suite("ChatViewModel")
@MainActor
struct ChatViewModelTests {

    @Test("initial state is empty")
    func initialState() {
        let vm = ChatViewModel()
        #expect(vm.messages.isEmpty)
        #expect(!vm.isStreaming)
        #expect(vm.unreadCount == 0)
    }

    @Test("canSend is false when input is empty")
    func canSendEmpty() {
        let vm = ChatViewModel()
        vm.inputText = "   "
        #expect(!vm.canSend)
    }

    @Test("canSend is false when streaming")
    func canSendStreaming() {
        let vm = ChatViewModel()
        vm.inputText = "Hello"
        vm.isStreaming = true
        #expect(!vm.canSend)
    }

    @Test("canSend is true when input non-empty and not streaming")
    func canSend() {
        let vm = ChatViewModel()
        vm.inputText = "What is my HbA1c?"
        #expect(vm.canSend)
    }

    @Test("clearHistory resets messages and unreadCount")
    func clearHistory() {
        let vm = ChatViewModel()
        vm.messages = [ChatMessage(role: .user, content: "Hi")]
        vm.unreadCount = 3
        vm.clearHistory()
        #expect(vm.messages.isEmpty)
        #expect(vm.unreadCount == 0)
    }

    @Test("cancelStream stops streaming")
    func cancelStream() {
        let vm = ChatViewModel()
        vm.isStreaming = true
        vm.messages = [
            ChatMessage(role: .assistant, content: "", isStreaming: true)
        ]
        vm.cancelStream()
        #expect(!vm.isStreaming)
        #expect(vm.messages.isEmpty)
    }
}

// MARK: - AuthViewModel tests

@Suite("AuthViewModel")
@MainActor
struct AuthViewModelTests {

    @Test("initial state not authenticated")
    func initialState() {
        let vm = AuthViewModel()
        #expect(!vm.isAuthenticated)
        #expect(!vm.isLoading)
        #expect(!vm.otpSent)
    }

    @Test("requestOTP shows error for empty email")
    func requestOTPEmptyEmail() async {
        let vm = AuthViewModel()
        vm.email = ""
        await vm.requestOTP()
        #expect(vm.errorMessage != nil)
        #expect(!vm.otpSent)
    }

    @Test("verifyOTP shows error for short code")
    func verifyOTPShortCode() async {
        let vm = AuthViewModel()
        await vm.verifyOTP("12")
        #expect(vm.errorMessage != nil)
    }
}

// MARK: - ProfileViewModel tests

@Suite("ProfileViewModel")
@MainActor
struct ProfileViewModelTests {

    @Test("startEditing copies profile to draft")
    func startEditing() {
        let vm = ProfileViewModel()
        vm.profile.name = "Alice"
        vm.startEditing()
        #expect(vm.draftProfile.name == "Alice")
        #expect(vm.isEditing)
    }

    @Test("cancelEditing resets draft and clears editing flag")
    func cancelEditing() {
        let vm = ProfileViewModel()
        vm.profile.name = "Alice"
        vm.startEditing()
        vm.draftProfile.name = "Bob"
        vm.cancelEditing()
        #expect(vm.draftProfile.name == "Alice")
        #expect(!vm.isEditing)
    }

    @Test("conditionsList joins conditions with comma")
    func conditionsList() {
        let vm = ProfileViewModel()
        vm.profile.conditions = ["Diabetes", "Hypertension"]
        #expect(vm.conditionsList == "Diabetes, Hypertension")
    }
}
