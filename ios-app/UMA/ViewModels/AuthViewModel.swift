// AuthViewModel.swift — OTP authentication flow

import SwiftUI
import UMAShared

@Observable
@MainActor
final class AuthViewModel {
    var isAuthenticated = false
    var isLoading = false
    var errorMessage: String?
    var otpSent = false
    var email = ""
    var selectedChannel: AuthRequest.AuthChannel = .email

    private let client = UMAClient.shared
    private let token = AuthToken.shared

    func checkAuthStatus() async {
        isAuthenticated = await token.isAuthenticated
    }

    func requestOTP() async {
        guard !email.trimmingCharacters(in: .whitespaces).isEmpty else {
            errorMessage = "Please enter your email address."
            return
        }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            try await client.requestOTP(email: email, channel: selectedChannel)
            otpSent = true
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func verifyOTP(_ otp: String) async {
        guard otp.count >= 4 else {
            errorMessage = "Please enter the full verification code."
            return
        }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let response = try await client.verifyOTP(email: email, otp: otp)
            try await token.save(token: response.token, expiresAtISO: response.expiresAtISO)
            isAuthenticated = true
            otpSent = false
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func signOut() async {
        await token.clear()
        isAuthenticated = false
        otpSent = false
        email = ""
    }
}
