.PHONY: generate build test clean open lint

SCHEME = UMA
DESTINATION = "platform=iOS Simulator,name=iPhone 16 Pro,OS=18.0"
DERIVED_DATA = $(PWD)/.derivedData

generate:
	@which xcodegen > /dev/null || (echo "Installing XcodeGen..." && brew install xcodegen)
	xcodegen generate --spec project.yml
	@echo "✓ UMA.xcodeproj generated. Open UMA.xcworkspace."

open: generate
	open UMA.xcworkspace

build: generate
	xcodebuild \
		-workspace UMA.xcworkspace \
		-scheme $(SCHEME) \
		-destination $(DESTINATION) \
		-derivedDataPath $(DERIVED_DATA) \
		-configuration Debug \
		build | xcbeautify || xcodebuild \
		-workspace UMA.xcworkspace \
		-scheme $(SCHEME) \
		-destination $(DESTINATION) \
		-derivedDataPath $(DERIVED_DATA) \
		-configuration Debug \
		build

test: generate
	xcodebuild \
		-workspace UMA.xcworkspace \
		-scheme $(SCHEME) \
		-destination $(DESTINATION) \
		-derivedDataPath $(DERIVED_DATA) \
		-configuration Debug \
		test | xcbeautify || xcodebuild \
		-workspace UMA.xcworkspace \
		-scheme $(SCHEME) \
		-destination $(DESTINATION) \
		-derivedDataPath $(DERIVED_DATA) \
		-configuration Debug \
		test

clean:
	rm -rf $(DERIVED_DATA)
	rm -rf UMA.xcodeproj
	@echo "✓ Clean complete."

lint:
	@which swiftlint > /dev/null || (echo "swiftlint not found. Run: brew install swiftlint" && exit 1)
	swiftlint --config .swiftlint.yml

format:
	@which swiftformat > /dev/null || (echo "swiftformat not found. Run: brew install swiftformat" && exit 1)
	swiftformat . --swiftversion 6.0
