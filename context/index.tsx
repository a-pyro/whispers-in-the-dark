import { Audio } from 'expo-av'
import { Recording } from 'expo-av/build/Audio'
import { FFmpegKit } from 'ffmpeg-kit-react-native'
import React, {
  PropsWithChildren,
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Platform } from 'react-native'
import RNFS from 'react-native-fs'
import { WhisperContext, initWhisper } from 'whisper.rn'

interface ISTT {
  recognizedText: string
  startRecording: () => Promise<void>
  stopRecording: () => Promise<void>
  isRecording: boolean
  clearText: () => void
  isTranscribing: boolean
}

export const SpeechToTextContext = createContext<ISTT>({
  recognizedText: '',
  startRecording: () => Promise.resolve(),
  stopRecording: () => Promise.resolve(undefined),
  isRecording: false,
  clearText: () => {},
  isTranscribing: false,
})

export const SpeechToTextProvider = ({ children }: PropsWithChildren) => {
  const [isRecording, setIsRecording] = useState(false)
  const [recognizedText, setRecognizedText] = useState<string>('')
  const whisper = useRef<WhisperContext>()
  const [recording, setRecording] = useState<Recording>()
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [permissionResponse, requestPermission] = Audio.usePermissions()

  useEffect(() => {
    ;(async () => {
      if (permissionResponse?.status !== 'granted') await requestPermission()
      const context = await initWhisper({
        filePath: require('@/assets/models/ggml-tiny.bin'),
      })

      whisper.current = context
    })()
  }, [])

  const clearText = useCallback(() => setRecognizedText(''), [])

  const transcribeWithWhisper = (uri: string) =>
    new Promise(async (resolve, reject) => {
      try {
        if (Platform.OS === 'android') {
          const sourceUri = .
          const targetFile = RNFS.DocumentDirectoryPath + '/newFile.wav' // !TODO VEDERE QYUESTO
          await FFmpegKit.execute(
            `-y -i ${sourceUri} -ar 16000 -ac 1 -c:a pcm_s16le ${targetFile}`
          )
          const transcription = whisper.current?.transcribe(targetFile, {
            language: 'en',
            maxLen: 1,
            translate: true,
            onProgress: (cur) => {
              if (cur < 100) {
                setIsTranscribing(true)
              } else {
                setIsTranscribing(false)
              }
            },
          })

          const res = await transcription?.promise

          if (res?.result) {
            const content = res.result.trim().replaceAll('[BLANK_AUDIO]', '')

            setRecognizedText(content)
          }

          resolve(res?.result)
        } else {
          const transcription = whisper.current?.transcribe(uri, {
            language: 'en',
            maxLen: 1,
            translate: true,
            onProgress: (cur) => {
              if (cur < 100) {
                setIsTranscribing(true)
              } else {
                setIsTranscribing(false)
              }
            },
          })

          const res = await transcription?.promise

          if (res?.result) {
            setRecognizedText(res?.result as string)
          }

          resolve(res?.result)
        }
      } catch (error) {
        reject(error)
      }
    })

  const startRecording = async () => {
    clearText()
    setIsRecording(true)
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    })

    const recordingOptions = {
      // Android only, AAC encoding is supported by most browsers and devices
      android: {
        extension: '.wav',
        outputFormat: Audio.RECORDING_OPTION_ANDROID_OUTPUT_FORMAT_DEFAULT, // todo see questo
        audioEncoder: Audio.RECORDING_OPTION_ANDROID_AUDIO_ENCODER_DEFAULT, // todo see questo
        sampleRate: 16000,
        numberOfChannels: 1,
        bitRate: 256000,
      },
      // iOS only, linear PCM encoding (WAV is a container for PCM data)
      ios: {
        extension: '.wav',
        outputFormat: Audio.RECORDING_OPTION_IOS_OUTPUT_FORMAT_LINEARPCM,
        audioQuality: Audio.RECORDING_OPTION_IOS_AUDIO_QUALITY_MAX,
        sampleRate: 16000,
        numberOfChannels: 1,
        bitRate: 256000,
        linearPCMBitDepth: 16,
        linearPCMIsBigEndian: false,
        linearPCMIsFloat: false,
      },
    }

    const { recording } = await Audio.Recording.createAsync(
      recordingOptions as any
    )

    setRecording(recording)
  }

  const stopRecording = async () => {
    await recording?.stopAndUnloadAsync()
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
    })
    const uri = recording?.getURI()
    setIsRecording(false)

    await transcribeWithWhisper(uri as string)
  }

  const contextValue = useMemo(
    () => ({
      recognizedText,
      startRecording,
      stopRecording,
      isRecording,
      clearText,
      isTranscribing,
    }),
    [
      recognizedText,
      isTranscribing,
      startRecording,
      stopRecording,
      isRecording,
      clearText,
    ]
  )

  return (
    <SpeechToTextContext.Provider value={contextValue}>
      {children}
    </SpeechToTextContext.Provider>
  )
}

export const useSpeechToText = () => React.useContext(SpeechToTextContext)
