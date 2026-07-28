import { NativeModule, requireNativeModule } from "expo";

declare class AudioTranscodeModule extends NativeModule<{}> {
  /**
   * Decodes a compressed audio file (AAC/.m4a in practice) into a 16-bit PCM
   * WAV file at `outputPath`, resampled to `targetSampleRate` mono.
   */
  decodeToWavFile(sourcePath: string, targetSampleRate: number, outputPath: string): Promise<void>;
}

export default requireNativeModule<AudioTranscodeModule>("AudioTranscode");
