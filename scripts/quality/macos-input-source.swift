import Carbon.HIToolbox
import Foundation

private func inputSourceID(_ source: TISInputSource) -> String? {
  guard let pointer = TISGetInputSourceProperty(source, kTISPropertyInputSourceID) else {
    return nil
  }
  return Unmanaged<CFString>.fromOpaque(pointer).takeUnretainedValue() as String
}

private func currentInputSourceID() -> String {
  let source = TISCopyCurrentKeyboardInputSource().takeRetainedValue()
  guard let identifier = inputSourceID(source) else {
    fputs("Current input source has no identifier.\n", stderr)
    exit(1)
  }
  return identifier
}

private func selectInputSource(_ identifier: String) {
  let filter = [kTISPropertyInputSourceID: identifier] as CFDictionary
  let sources = TISCreateInputSourceList(filter, false).takeRetainedValue() as NSArray
  guard let source = sources.firstObject as! TISInputSource? else {
    fputs("Input source is not installed: \(identifier)\n", stderr)
    exit(2)
  }
  let status = TISSelectInputSource(source)
  guard status == noErr else {
    fputs("Cannot select input source \(identifier): \(status)\n", stderr)
    exit(3)
  }
  print(currentInputSourceID())
}

switch CommandLine.arguments.dropFirst().first {
case "current":
  print(currentInputSourceID())
case "select":
  guard CommandLine.arguments.count == 3 else {
    fputs("Usage: macos-input-source.swift select <input-source-id>\n", stderr)
    exit(64)
  }
  selectInputSource(CommandLine.arguments[2])
default:
  fputs("Usage: macos-input-source.swift current | select <input-source-id>\n", stderr)
  exit(64)
}
