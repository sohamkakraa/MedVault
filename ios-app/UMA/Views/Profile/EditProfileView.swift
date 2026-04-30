// EditProfileView.swift — editable profile form

import SwiftUI
import UMAShared

struct EditProfileView: View {
    @Environment(ProfileViewModel.self) private var vm
    @Environment(\.dismiss) private var dismiss
    @State private var newCondition = ""
    @State private var newAllergy = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("Personal") {
                    @Bindable var vm = vm
                    TextField("Full name", text: $vm.draftProfile.name)
                        .accessibilityLabel("Full name")
                    TextField("Date of birth (YYYY-MM-DD)", text: Binding(
                        get: { vm.draftProfile.dob ?? "" },
                        set: { vm.draftProfile.dob = $0.isEmpty ? nil : $0 }
                    ))
                    .keyboardType(.numbersAndPunctuation)
                    .accessibilityLabel("Date of birth in year-month-day format")

                    Picker("Sex", selection: Binding(
                        get: { vm.draftProfile.sex ?? "Prefer not to say" },
                        set: { vm.draftProfile.sex = $0 }
                    )) {
                        Text("Male").tag("Male")
                        Text("Female").tag("Female")
                        Text("Non-binary").tag("Non-binary")
                        Text("Prefer not to say").tag("Prefer not to say")
                    }
                }

                Section("Contact") {
                    @Bindable var vm = vm
                    TextField("Email", text: Binding(
                        get: { vm.draftProfile.email ?? "" },
                        set: { vm.draftProfile.email = $0.isEmpty ? nil : $0 }
                    ))
                    .keyboardType(.emailAddress)
                    .textContentType(.emailAddress)
                    .autocapitalization(.none)
                    .accessibilityLabel("Email address")

                    TextField("Phone", text: Binding(
                        get: { vm.draftProfile.phone ?? "" },
                        set: { vm.draftProfile.phone = $0.isEmpty ? nil : $0 }
                    ))
                    .keyboardType(.phonePad)
                    .textContentType(.telephoneNumber)
                    .accessibilityLabel("Phone number")
                }

                Section("Healthcare") {
                    @Bindable var vm = vm
                    TextField("Primary care provider", text: Binding(
                        get: { vm.draftProfile.primaryCareProvider ?? "" },
                        set: { vm.draftProfile.primaryCareProvider = $0.isEmpty ? nil : $0 }
                    ))
                    .accessibilityLabel("Primary care provider name")

                    TextField("Next visit (YYYY-MM-DD)", text: Binding(
                        get: { vm.draftProfile.nextVisitDate ?? "" },
                        set: { vm.draftProfile.nextVisitDate = $0.isEmpty ? nil : $0 }
                    ))
                    .keyboardType(.numbersAndPunctuation)
                    .accessibilityLabel("Next doctor visit date in year-month-day format")
                }

                Section("Conditions") {
                    @Bindable var vm = vm
                    ForEach(vm.draftProfile.conditions, id: \.self) { condition in
                        Text(condition)
                    }
                    .onDelete { indices in
                        vm.draftProfile.conditions.remove(atOffsets: indices)
                    }

                    HStack {
                        TextField("Add condition", text: $newCondition)
                            .accessibilityLabel("New condition name")
                        Button("Add") {
                            let trimmed = newCondition.trimmingCharacters(in: .whitespaces)
                            guard !trimmed.isEmpty else { return }
                            vm.draftProfile.conditions.append(trimmed)
                            newCondition = ""
                            UISelectionFeedbackGenerator().selectionChanged()
                        }
                        .disabled(newCondition.trimmingCharacters(in: .whitespaces).isEmpty)
                        .accessibilityLabel("Add condition to list")
                    }
                }

                Section("Allergies") {
                    @Bindable var vm = vm
                    ForEach(vm.draftProfile.allergies, id: \.self) { allergy in
                        Text(allergy)
                    }
                    .onDelete { indices in
                        vm.draftProfile.allergies.remove(atOffsets: indices)
                    }

                    HStack {
                        TextField("Add allergy", text: $newAllergy)
                            .accessibilityLabel("New allergy name")
                        Button("Add") {
                            let trimmed = newAllergy.trimmingCharacters(in: .whitespaces)
                            guard !trimmed.isEmpty else { return }
                            vm.draftProfile.allergies.append(trimmed)
                            newAllergy = ""
                            UISelectionFeedbackGenerator().selectionChanged()
                        }
                        .disabled(newAllergy.trimmingCharacters(in: .whitespaces).isEmpty)
                        .accessibilityLabel("Add allergy to list")
                    }
                }

                Section("Notes") {
                    @Bindable var vm = vm
                    TextField("Any notes for your doctor…", text: Binding(
                        get: { vm.draftProfile.notes ?? "" },
                        set: { vm.draftProfile.notes = $0.isEmpty ? nil : $0 }
                    ), axis: .vertical)
                    .lineLimit(3...6)
                    .accessibilityLabel("Personal health notes")
                }
            }
            .navigationTitle("Edit Profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") {
                        vm.cancelEditing()
                        dismiss()
                    }
                    .accessibilityLabel("Cancel editing")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Save") {
                        Task {
                            await vm.saveProfile()
                            dismiss()
                        }
                    }
                    .fontWeight(.semibold)
                    .disabled(vm.isSaving)
                    .accessibilityLabel("Save profile changes")
                }
            }
            .overlay {
                if vm.isSaving {
                    ProgressView("Saving…")
                        .padding()
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
                }
            }
        }
    }
}
