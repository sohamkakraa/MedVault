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
        )
    ],
    targets: [
        .target(
            name: "UMAShared",
            dependencies: [
                .product(name: "AsyncAlgorithms", package: "swift-async-algorithms")
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
