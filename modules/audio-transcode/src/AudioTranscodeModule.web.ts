import { registerWebModule, NativeModule } from 'expo';

class AudioTranscodeModule extends NativeModule<{}> {
  decodeToWavFile(sourcePath: string, targetSampleRate: number, outputPath: string): Promise<void> {
    return Promise.reject(new Error('Audio transcoding is not supported on web'));
  }
}

export default registerWebModule(AudioTranscodeModule, 'AudioTranscode');
