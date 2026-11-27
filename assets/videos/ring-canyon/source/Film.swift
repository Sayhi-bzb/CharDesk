import Foundation
import AVFoundation
import CoreGraphics
import CoreVideo
import ImageIO
import UniformTypeIdentifiers
struct Phase:Decodable{let start:Double;let file:String;let duration:Double;let label:String}
struct Plan:Decodable{let fps:Int;let width:Int;let height:Int;let duration:Double;let phases:[Phase]}
final class Painter{
 let plan:Plan;var cache:[String:CGImage]=[:]
 init(_ plan:Plan){self.plan=plan}
 func paint(_ ctx:CGContext,_ time:Double,_ width:Int,_ height:Int){let p=plan.phases.last(where:{$0.start<=time}) ?? plan.phases[0];let im:CGImage;if let hit=cache[p.file]{im=hit}else{let src=CGImageSourceCreateWithURL(URL(fileURLWithPath:p.file) as CFURL,nil)!;im=CGImageSourceCreateImageAtIndex(src,0,[kCGImageSourceShouldCacheImmediately:true] as CFDictionary)!;if cache.count>3{cache.removeAll()};cache[p.file]=im};ctx.interpolationQuality = .none;ctx.draw(im,in:CGRect(x:0,y:0,width:width,height:height))}
}
@main struct Film{
 static func main()async throws{
 let name=CommandLine.arguments.dropFirst().first ?? "cell-diffusion-smooth"
 let root=URL(fileURLWithPath:#filePath).deletingLastPathComponent().appendingPathComponent("../").standardized,plan=try JSONDecoder().decode(Plan.self,from:Data(contentsOf:root.appendingPathComponent(name+".json"))),painter=Painter(plan)
 let out=root.appendingPathComponent(name+".mp4");let writer=try AVAssetWriter(outputURL:out,fileType:.mp4),input=AVAssetWriterInput(mediaType:.video,outputSettings:[AVVideoCodecKey:AVVideoCodecType.h264,AVVideoWidthKey:plan.width,AVVideoHeightKey:plan.height,AVVideoColorPropertiesKey:[AVVideoColorPrimariesKey:AVVideoColorPrimaries_ITU_R_709_2,AVVideoTransferFunctionKey:AVVideoTransferFunction_IEC_sRGB,AVVideoYCbCrMatrixKey:AVVideoYCbCrMatrix_ITU_R_709_2],AVVideoCompressionPropertiesKey:[AVVideoAverageBitRateKey:12_000_000,AVVideoProfileLevelKey:AVVideoProfileLevelH264HighAutoLevel]]);writer.add(input)
 let attrs:[String:Any]=[kCVPixelBufferPixelFormatTypeKey as String:kCVPixelFormatType_32ARGB,kCVPixelBufferWidthKey as String:plan.width,kCVPixelBufferHeightKey as String:plan.height,kCVPixelBufferCGImageCompatibilityKey as String:true,kCVPixelBufferCGBitmapContextCompatibilityKey as String:true],adaptor=AVAssetWriterInputPixelBufferAdaptor(assetWriterInput:input,sourcePixelBufferAttributes:attrs)
 guard writer.startWriting()else{throw writer.error!};writer.startSession(atSourceTime:.zero);let count=Int((plan.duration*Double(plan.fps)).rounded())
 for n in 0..<count{while !input.isReadyForMoreMediaData{try await Task.sleep(for:.milliseconds(2));if writer.status == .failed{throw writer.error!}};var p:CVPixelBuffer?;CVPixelBufferPoolCreatePixelBuffer(nil,adaptor.pixelBufferPool!,&p);let buffer=p!;CVBufferSetAttachment(buffer,kCVImageBufferCGColorSpaceKey,CGColorSpace(name:CGColorSpace.sRGB)!, .shouldPropagate);CVBufferSetAttachment(buffer,kCVImageBufferTransferFunctionKey,kCVImageBufferTransferFunction_sRGB,.shouldPropagate);CVBufferSetAttachment(buffer,kCVImageBufferColorPrimariesKey,kCVImageBufferColorPrimaries_ITU_R_709_2,.shouldPropagate);CVBufferSetAttachment(buffer,kCVImageBufferYCbCrMatrixKey,kCVImageBufferYCbCrMatrix_ITU_R_709_2,.shouldPropagate);CVPixelBufferLockBaseAddress(buffer,[]);let ctx=CGContext(data:CVPixelBufferGetBaseAddress(buffer),width:plan.width,height:plan.height,bitsPerComponent:8,bytesPerRow:CVPixelBufferGetBytesPerRow(buffer),space:CGColorSpace(name:CGColorSpace.sRGB)!,bitmapInfo:CGImageAlphaInfo.noneSkipFirst.rawValue)!;painter.paint(ctx,Double(n)/Double(plan.fps),plan.width,plan.height);CVPixelBufferUnlockBaseAddress(buffer,[]);guard adaptor.append(buffer,withPresentationTime:CMTime(value:Int64(n),timescale:Int32(plan.fps)))else{throw writer.error!};if n%(plan.fps*5)==0{print("Encoded \(n)/\(count)")}}
 input.markAsFinished();await writer.finishWriting();guard writer.status == .completed else{throw writer.error!};print("Saved \(out.path), \(plan.duration)s, \(plan.fps)fps")
 }
}
