// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "UMAShared",
    platforms: [
        .iOS(.v18),
        .macOS(.v15)
    ],
    products: [
        .library(
            name: "UMAShared",
            targets: ["UMAShared"]
        )
    ],
    dependencies: [
        .package(
            url: "https://github.com/apple/swift-async-algorithms",
            from: "1.0.0"
        ),
        .package(
            url: "https://github.com/kishikawakatsuki/KeychainAccess",
            from: "4.2.2"
        )
    ],
    targets: [
        .target(
            name: "UMAShared",
            dependencies: [
                .product(name: "AsyncAlgorithms", package: "swift-async-algorithms"),
                .product(name: "KeychainAccess", package: "KeychainAccess")
            ],
            swiftSettings: [
                .enableExperimentalFeature("StrictConcurrency"),
                .swiftLanguageMode(.v6)
            ]
        ),
        .testTarget(
            name: "UMASharedTests",
            dependencies: ["UMAShared"],
            swiftSettings: [
                .enableExperimentalFeature("StrictConcurrency"),
                .swiftLanguageMode(.v6)
            ]
        )
    ]
)
