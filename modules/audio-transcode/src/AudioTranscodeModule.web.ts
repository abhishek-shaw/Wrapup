import { registerWebModule, NativeModule } from 'expo';

class AudioTranscodeModule extends NativeModule<{}> {}

export default registerWebModule(AudioTranscodeModule, 'AudioTranscodeModule');
