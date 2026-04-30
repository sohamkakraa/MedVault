// LoginView.swift — OTP authentication landing

import SwiftUI
import UMAShared

struct LoginView: View {
    @Environment(AuthViewModel.self) private var vm

    var body: some View {
        NavigationStack {
            ZStack {
                // Background gradient
                LinearGradient(
                    colors: [.accentColor.opacity(0.08), .clear],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .ignoresSafeArea()

                VStack(spacing: 32) {
                    Spacer()

                    // Logo
                    VStack(spacing: 12) {
                        ZStack {
                            RoundedRectangle(cornerRadius: 22, style: .continuous)
                                .fill(.accentColor)
                                .frame(width: 88, height: 88)
                            Image(systemName: "heart.text.square.fill")
                                .font(.system(size: 44))
                                .foregroundStyle(.white)
                        }
                        Text("UMA")
                            .font(.system(size: 42, weight: .bold, design: .rounded))
                            .foregroundStyle(.primary)
                        Text("Ur Medical Assistant")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("UMA — Ur Medical Assistant")

                    Spacer()

                    // Form
                    if vm.otpSent {
                        OTPEntryView()
                    } else {
                        emailForm
                    }

                    // Disclaimer
                    Text("UMA does not replace professional medical advice.\nAlways consult your doctor for health decisions.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                        .padding(.bottom, 16)
                        .accessibilityLabel("Disclaimer: UMA does not replace professional medical advice. Always consult your doctor.")
                }
                .safeAreaInset(edge: .bottom) {
                    Color.clear.frame(height: 16)
                }
            }
        }
    }

    private var emailForm: some View {
        @Bindable var vm = vm
        return VStack(spacing: 16) {
            // Email field
            VStack(alignment: .leading, spacing: 6) {
                Text("Email Address")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                TextField("you@example.com", text: $vm.email)
                    .keyboardType(.emailAddress)
                    .textContentType(.emailAddress)
                    .autocapitalization(.none)
                    .autocorrectionDisabled()
                    .padding(14)
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
                    .accessibilityLabel("Email address")
                    .accessibilityHint("Enter the email address you registered with UMA")
            }

            // Channel picker
            VStack(alignment: .leading, spacing: 6) {
                Text("Send code via")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Picker("Send via", selection: $vm.selectedChannel) {
                    Label("Email", systemImage: "envelope").tag(AuthRequest.AuthChannel.email)
                    Label("WhatsApp", systemImage: "message").tag(AuthRequest.AuthChannel.whatsapp)
                }
                .pickerStyle(.segmented)
                .accessibilityLabel("Choose verification code delivery channel")
            }

            // Error
            if let error = vm.errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
                    .accessibilityLabel("Error: \(error)")
            }

            // CTA
            Button {
                Task { await vm.requestOTP() }
            } label: {
                HStack {
                    if vm.isLoading {
                        ProgressView()
                            .tint(.white)
                    } else {
                        Text("Send Verification Code")
                            .font(.headline)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding()
                .background(.accentColor, in: RoundedRectangle(cornerRadius: 14))
                .foregroundStyle(.white)
            }
            .disabled(vm.isLoading || vm.email.isEmpty)
            .accessibilityLabel("Send verification code")
            .accessibilityHint("Double tap to send a one-time code to your email or WhatsApp")
        }
        .padding(.horizontal, 24)
    }
}
