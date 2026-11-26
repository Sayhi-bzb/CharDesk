import Foundation
import AVFoundation
import ImageIO
import UniformTypeIdentifiers
@main struct Mux{
 static func main()async throws{
 let root=URL(fileURLWithPath:#filePath).deletingLastPathComponent().appendingPathComponent("../").standardized,video=AVURLAsset(url:root.appendingPathComponent("port-sol-native-silent.mp4")),audio=AVURLAsset(url:root.appendingPathComponent("soundtrack.wav")),duration=try await video.load(.duration),comp=AVMutableComposition(),vt=comp.addMutableTrack(withMediaType:.video,preferredTrackID:kCMPersistentTrackID_Invalid)!,at=comp.addMutableTrack(withMediaType:.audio,preferredTrackID:kCMPersistentTrackID_Invalid)!
 try vt.insertTimeRange(CMTimeRange(start:.zero,duration:duration),of:try await video.loadTracks(withMediaType:.video)[0],at:.zero);try at.insertTimeRange(CMTimeRange(start:.zero,duration:duration),of:try await audio.loadTracks(withMediaType:.audio)[0],at:.zero)
 let out=root.appendingPathComponent("port-sol-native.mp4");try? FileManager.default.removeItem(at:out);let exporter=AVAssetExportSession(asset:comp,presetName:AVAssetExportPresetHighestQuality)!;try await exporter.export(to:out,as:.mp4)
 let asset=AVURLAsset(url:out),track=try await asset.loadTracks(withMediaType:.video)[0],fps=try await track.load(.nominalFrameRate),size=try await track.load(.naturalSize),length=try await asset.load(.duration);guard abs(Double(fps)-30) < 0.001 && size.width == 1920 && size.height == 1080 && abs(CMTimeGetSeconds(length)-CMTimeGetSeconds(duration)) < 0.001  else{fatalError("Video verification failed")};print("Verified \(out.path): \(size.width)x\(size.height), \(fps)fps, \(CMTimeGetSeconds(length))s")
 let gen=AVAssetImageGenerator(asset:asset);gen.requestedTimeToleranceBefore = .zero;gen.requestedTimeToleranceAfter = .zero
 for t in [0.0,3.0,9.0,CMTimeGetSeconds(duration)-1.0/30]{let frame=try await gen.image(at:CMTime(seconds:t,preferredTimescale:600)),dest=CGImageDestinationCreateWithURL(root.appendingPathComponent("encoded-\(Int(t*10)).png") as CFURL,UTType.png.identifier as CFString,1,nil)!;CGImageDestinationAddImage(dest,frame.image,nil);CGImageDestinationFinalize(dest)}
 }
}
