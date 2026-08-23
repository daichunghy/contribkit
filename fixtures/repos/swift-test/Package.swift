// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "SwiftTestFixture",
    products: [
        .library(name: "SwiftTestFixture", targets: ["SwiftTestFixture"]),
    ],
    targets: [
        .target(name: "SwiftTestFixture"),
    ]
)
