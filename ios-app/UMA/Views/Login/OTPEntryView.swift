// OTPEntryView.swift — 6-digit OTP entry with auto-advance

import SwiftUI
import UMAShared

struct OTPEntryView: View {
    @Environment(AuthViewModel.self) private var vm
    @State private var digits: [String] = Array(repeating: "", count: 6)
    @FocusState private var focusedIndex: Int?

    private var otpCode: String { digits.joined() }

    var body: some View {
        @Bindable var vm = vm
        return VStack(spacing: 20) {
            VStack(spacing: 6) {
                Text("Check your \(vm.selectedChannel == .email ? "email" : "WhatsApp")")
                    .font(.headline)
                Text("Enter the 6-digit code we sent to **\(vm.email)**")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Enter the 6-digit verification code sent to \(vm.email)")

            // OTP boxes
            HStack(spacing: 10) {
                ForEach(0..<6, id: \.self) { i in
                    otpBox(index: i)
                }
            }
            .padding(.horizontal, 24)

            // Error
            if let error = vm.errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
                    .accessibilityLabel("Error: \(error)")
            }

            // Submit
            Button {
                Task { await vm.verifyOTP(otpCode) }
            } label: {
                HStack {
                    if vm.isLoading {
                        ProgressView().tint(.white)
                    } else {
                        Text("Verify Code")
                            .font(.headline)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding()
                .background(.accentColor, in: RoundedRectangle(cornerRadius: 14))
                .foregroundStyle(.white)
            }
            .disabled(vm.isLoading || otpCode.count < 6)
            .padding(.horizontal, 24)
            .accessibilityLabel("Verify code")
            .accessibilityHint("Double tap to verify the 6-digit code")

            // Resend
            Button {
                digits = Array(repeating: "", count: 6)
                focusedIndex = 0
                Task { await vm.requestOTP() }
            } label: {
                Text("Resend code")
                    .font(.subheadline)
                    .foregroundStyle(.accentColor)
            }
            .disabled(vm.isLoading)
            .accessibilityLabel("Resend verification code")

            Button {
                vm.otpSent = false
                digits = Array(repeating: "", count: 6)
            } label: {
                Text("Use a different email")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .accessibilityLabel("Go back and use a different email address")
        }
        .onAppear { focusedIndex = 0 }
    }

    @ViewBuilder
    private func otpBox(index: Int) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .strokeBorder(
                    focusedIndex == index ? .accentColor : .secondary.opacity(0.3),
                    lineWidth: focusedIndex == index ? 2 : 1
                )
                .background(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .fill(.regularMaterial)
                )

            Text(digits[index].isEmpty ? "·" : digits[index])
                .font(.title2.weight(.semibold))
                .foregroundStyle(digits[index].isEmpty ? .secondary : .primary)
        }
        .frame(width: 44, height: 52)
        .overlay {
            TextField("", text: $digits[index])
                .keyboardType(.numberPad)
                .textContentType(.oneTimeCode)
                .focused($focusedIndex, equals: index)
                .opacity(0.01) // invisible but tappable
                .onChange(of: digits[index]) { old, new in
                    handleInput(at: index, old: old, new: new)
                }
        }
        .onTapGesture { focusedIndex = index }
        .accessibilityLabel("Digit \(index + 1) of 6")
        .accessibilityValue(digits[index].isEmpty ? "empty" : "filled")
    }

    private func handleInput(at index: Int, old: String, new: String) {
        if new.count > 1 {
            // Handle paste: distribute digits
            let pasted = new.filter(\.isNumber)
            for (i, char) in pasted.prefix(6).enumerated() {
                digits[i] = String(char)
            }
            focusedIndex = min(pasted.count, 5)
            return
        }

        if new.isEmpty && !old.isEmpty {
            // Backspace: move back
            if index > 0 { focusedIndex = index - 1 }
        } else if new.count == 1 && old.isEmpty {
            // Filled: move forward
            if index < 5 { focusedIndex = index + 1 }
        }

        // Auto-submit when all 6 filled
        if digits.allSatisfy({ !$0.isEmpty }) {
            focusedIndex = nil
            Task { await vm.verifyOTP(otpCode) }
        }
    }
}
