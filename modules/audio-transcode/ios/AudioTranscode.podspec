Pod::Spec.new do |s|
  s.name           = 'AudioTranscode'
  s.version        = '1.0.0'
  s.summary        = 'On-device audio decoding for Wrapup ASR pipeline'
  s.description    = 'Decodes compressed audio (AAC/M4A) to 16-bit PCM WAV for whisper.rn transcription in Wrapup, a privacy-first offline meeting notes app'
  s.author         = 'Wrapup'
  s.homepage       = 'https://github.com/wrapup/wrapup'
  s.platforms      = {
    :ios => '16.4',
    :tvos => '16.4'
  }
  s.source         = { git: 'file://../../' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
