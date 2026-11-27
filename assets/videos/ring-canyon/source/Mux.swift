import AVFoundation
import Foundation

enum MuxError: Error {
    case missingTrack
    case durationMismatch(Double, Double)
    case cannotExport
    case invalidExport
}

@main
struct Mux {
    static func main() async throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
        let original = root.appendingPathComponent("cell-diffusion-smooth.mp4")
        let music = root.appendingPathComponent("build/write-sfx.wav")
        let result = root.appendingPathComponent("ring-canyon-smooth.mov")
        let videoAsset = AVURLAsset(url: original)
        let musicAsset = AVURLAsset(url: music)
        let videoDuration = try await videoAsset.load(.duration)
        let musicDuration = try await musicAsset.load(.duration)
        guard abs(videoDuration.seconds - musicDuration.seconds) < 1.0 / 48000 else {
            throw MuxError.durationMismatch(videoDuration.seconds, musicDuration.seconds)
        }
        let composition = AVMutableComposition()
        guard let video = try await videoAsset.loadTracks(withMediaType: .video).first,
              let audio = try await musicAsset.loadTracks(withMediaType: .audio).first,
              let videoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid),
              let audioTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) else {
            throw MuxError.missingTrack
        }
        let interval = CMTimeRange(start: .zero, duration: videoDuration)
        try videoTrack.insertTimeRange(interval, of: video, at: .zero)
        videoTrack.preferredTransform = try await video.load(.preferredTransform)
        try audioTrack.insertTimeRange(interval, of: audio, at: .zero)
        guard let exporter = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetPassthrough) else {
            throw MuxError.cannotExport
        }
        exporter.shouldOptimizeForNetworkUse = true
        if !CommandLine.arguments.contains("--verify") {
            try await exporter.export(to: result, as: .mov)
        }

        let output = AVURLAsset(url: result)
        let outputDuration = try await output.load(.duration)
        print("Container duration \(outputDuration.seconds), original \(videoDuration.seconds)")
        guard abs(outputDuration.seconds - videoDuration.seconds) < 1.0 / 48000,
              let outputVideo = try await output.loadTracks(withMediaType: .video).first,
              let outputAudio = try await output.loadTracks(withMediaType: .audio).first else {
            throw MuxError.invalidExport
        }
        let videoRange = try await outputVideo.load(.timeRange)
        let audioRange = try await outputAudio.load(.timeRange)
        print("Video start \(videoRange.start.seconds), duration \(videoRange.duration.seconds)")
        print("Audio start \(audioRange.start.seconds), duration \(audioRange.duration.seconds)")
        guard abs(videoRange.duration.seconds - audioRange.duration.seconds) < 1.0 / 48000,
              CMTimeCompare(audioRange.start, .zero) == 0 else {
            throw MuxError.invalidExport
        }
        print("Verified \(outputDuration.seconds)s of video and audio, both starting at \(audioRange.start.seconds)s")
        if CommandLine.arguments.contains("--decode") {
            let reader = try AVAssetReader(asset: output)
            let decoded = AVAssetReaderTrackOutput(track: outputAudio, outputSettings: [
                AVFormatIDKey: kAudioFormatLinearPCM,
                AVSampleRateKey: 48000,
                AVNumberOfChannelsKey: 2,
                AVLinearPCMBitDepthKey: 16,
                AVLinearPCMIsFloatKey: false,
            ])
            reader.add(decoded)
            guard reader.startReading() else {
                FileHandle.standardError.write(Data("Decode start failed: \(String(describing: reader.error))\n".utf8))
                throw MuxError.invalidExport
            }
            var samples = 0
            while let buffer = decoded.copyNextSampleBuffer() {
                samples += CMSampleBufferGetNumSamples(buffer)
            }
            guard reader.status == .completed,
                  samples == Int((48000 * videoDuration.seconds).rounded()) else {
                FileHandle.standardError.write(Data("Decoded \(samples) samples, status \(reader.status), error \(String(describing: reader.error))\n".utf8))
                throw MuxError.invalidExport
            }
            print("Decoded \(samples) samples per audio channel")
        }
    }
}
