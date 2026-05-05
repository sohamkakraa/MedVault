// UMAApp.swift — root SwiftUI app entry point

import SwiftUI
import UMAShared

@main
struct UMAApp: App {
    @State private var authViewModel = AuthViewModel()
    @State private var todayViewModel = TodayViewModel()
    @State private var chatViewModel = ChatViewModel()
    @State private var recordsViewModel = RecordsViewModel()
    @State private var profileViewModel = ProfileViewModel()
    @State private var healthKitViewModel = HealthKitViewModel()

    var body: some Scene {
        WindowGroup {
            AppRootView()
                .environment(authViewModel)
                .environment(todayViewModel)
                .environment(chatViewModel)
                .environment(recordsViewModel)
                .environment(profileViewModel)
                .environment(healthKitViewModel)
                .task {
                    await authViewModel.checkAuthStatus()
                }
        }
    }
}

struct AppRootView: View {
    @Environment(AuthViewModel.self) private var auth

    var body: some View {
        Group {
            if auth.isAuthenticated {
                MainTabView()
            } else {
                LoginView()
            }
        }
        .animation(.easeInOut(duration: 0.3), value: auth.isAuthenticated)
    }
}

struct MainTabView: View {
    @Environment(TodayViewModel.self) private var today
    @Environment(ChatViewModel.self) private var chat

    var body: some View {
        TabView {
            Tab("Today", systemImage: "heart.text.square") {
                TodayView()
            }
            Tab("Records", systemImage: "folder.badge.plus") {
                RecordsView()
            }
            Tab("Chat", systemImage: "bubble.left.and.bubble.right") {
                ChatView()
            }
            .badge(chat.unreadCount > 0 ? chat.unreadCount : 0)
            Tab("Profile", systemImage: "person.crop.circle") {
                ProfileView()
            }
        }
        .tint(Color.accentColor)
    }
}
