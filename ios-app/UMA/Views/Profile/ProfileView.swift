// ProfileView.swift — user profile display

import SwiftUI
import UMAShared

struct ProfileView: View {
    @Environment(ProfileViewModel.self) private var vm
    @Environment(TodayViewModel.self) private var todayVm
    @Environment(AuthViewModel.self) private var auth
    @Environment(HealthKitViewModel.self) private var healthKit
    @State private var showEdit = false
    @State private var showSignOutConfirm = false

    var body: some View {
        NavigationStack {
            List {
                // Avatar + name header
                Section {
                    HStack(spacing: 16) {
                        ZStack {
                            Circle()
                                .fill(Color.accentColor.opacity(0.15))
                                .frame(width: 72, height: 72)
                            Text(initials)
                                .font(.title.weight(.semibold))
                                .foregroundStyle(Color.accentColor)
                        }
                        VStack(alignment: .leading, spacing: 4) {
                            Text(vm.profile.name.isEmpty ? "Your Profile" : vm.profile.name)
                                .font(.title3.weight(.semibold))
                            if let age = vm.profile.age {
                                Text("\(age) years old")
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }
                            if let sex = vm.profile.sex {
                                Text(sex)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    .padding(.vertical, 8)
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("Profile: \(vm.profile.name), age \(vm.profile.age.map(String.init) ?? "unknown")")
                }

                // Health info
                Section("Health Information") {
                    if !vm.profile.conditions.isEmpty {
                        profileRow(label: "Conditions", value: vm.conditionsList, icon: "stethoscope")
                    }
                    if !vm.profile.allergies.isEmpty {
                        profileRow(label: "Allergies", value: vm.allergiesList, icon: "allergens")
                    }
                    if let pcp = vm.profile.primaryCareProvider {
                        profileRow(label: "Primary Doctor", value: pcp, icon: "person.text.rectangle")
                    }
                    if let next = vm.profile.nextVisitDateFormatted {
                        profileRow(label: "Next Visit", value: next, icon: "calendar")
                    }
                    if vm.profile.conditions.isEmpty && vm.profile.allergies.isEmpty && vm.profile.primaryCareProvider == nil {
                        Text("No health information added yet.")
                            .foregroundStyle(.secondary)
                            .font(.subheadline)
                    }
                }

                // Contact
                Section("Contact") {
                    if let email = vm.profile.email {
                        profileRow(label: "Email", value: email, icon: "envelope")
                    }
                    if let phone = vm.profile.phone {
                        profileRow(label: "Phone", value: phone, icon: "phone")
                    }
                    if vm.profile.email == nil && vm.profile.phone == nil {
                        Text("No contact information added.")
                            .foregroundStyle(.secondary)
                            .font(.subheadline)
                    }
                }

                // Notes
                if let notes = vm.profile.notes, !notes.isEmpty {
                    Section("Notes") {
                        Text(notes)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .accessibilityLabel("Notes: \(notes)")
                    }
                }

                // Apple Health sync
                Section("Apple Health") {
                    if healthKit.isSyncing {
                        HStack {
                            ProgressView()
                            Text("Syncing health data…")
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    } else {
                        Button {
                            Task { await healthKit.requestAuthorizationAndSync() }
                        } label: {
                            Label("Sync Apple Health Data", systemImage: "heart.fill")
                        }
                        .accessibilityLabel("Sync health data from Apple Health")
                        .accessibilityHint("Imports heart rate, steps, sleep, and vitals")
                    }

                    if let last = healthKit.lastSyncISO {
                        let dateStr = last.prefix(10)
                        Text("Last synced: \(dateStr)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    if healthKit.labsAdded > 0 {
                        Text("\(healthKit.labsAdded) new readings imported")
                            .font(.caption)
                            .foregroundStyle(.green)
                    }
                    if let err = healthKit.errorMessage {
                        Text(err)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                }

                // Actions
                Section {
                    Button {
                        showSignOutConfirm = true
                    } label: {
                        Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                            .foregroundStyle(.red)
                    }
                    .accessibilityLabel("Sign out of UMA")
                    .accessibilityHint("Double tap to sign out")
                }
            }
            .navigationTitle("Profile")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Edit") {
                        vm.startEditing()
                        showEdit = true
                    }
                    .accessibilityLabel("Edit profile")
                }
            }
            .sheet(isPresented: $showEdit) {
                EditProfileView()
            }
            .confirmationDialog("Sign Out", isPresented: $showSignOutConfirm, titleVisibility: .visible) {
                Button("Sign Out", role: .destructive) {
                    Task { await auth.signOut() }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("You will need to sign in again with your OTP.")
            }
        }
        .onAppear {
            vm.load(from: todayVm.store)
        }
        .onChange(of: todayVm.store.updatedAtISO) { _, _ in
            vm.load(from: todayVm.store)
        }
    }

    private var initials: String {
        let parts = vm.profile.name.split(separator: " ")
        return parts.prefix(2).compactMap { $0.first }.map(String.init).joined()
    }

    @ViewBuilder
    private func profileRow(label: String, value: String, icon: String) -> some View {
        HStack {
            Label(label, systemImage: icon)
                .foregroundStyle(.secondary)
                .font(.subheadline)
            Spacer()
            Text(value)
                .font(.subheadline)
                .multilineTextAlignment(.trailing)
                .foregroundStyle(.primary)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(label): \(value)")
    }
}
