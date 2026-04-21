const SOUND_PATTERN: Array<{ frequency: number; duration: number; volume: number; gap?: number }> = [
  { frequency: 880, duration: 0.1, volume: 0.05, gap: 0.02 },
  { frequency: 1174.66, duration: 0.12, volume: 0.06, gap: 0.03 },
  { frequency: 1567.98, duration: 0.15, volume: 0.07, gap: 0.06 },
  { frequency: 1174.66, duration: 0.1, volume: 0.05, gap: 0.02 },
  { frequency: 1567.98, duration: 0.18, volume: 0.08 },
]

export async function playMatchFoundSound() {
  if (typeof window === 'undefined') return

  const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextCtor) return

  const audioContext = new AudioContextCtor()

  try {
    if (audioContext.state === 'suspended') {
      await audioContext.resume()
    }
  } catch {
    return
  }

  const masterGain = audioContext.createGain()
  masterGain.gain.value = 0.9
  masterGain.connect(audioContext.destination)

  const startTime = audioContext.currentTime + 0.01
  let cursor = startTime

  for (const note of SOUND_PATTERN) {
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()

    oscillator.type = 'triangle'
    oscillator.frequency.setValueAtTime(note.frequency, cursor)

    gainNode.gain.setValueAtTime(0.0001, cursor)
    gainNode.gain.exponentialRampToValueAtTime(note.volume, cursor + 0.015)
    gainNode.gain.exponentialRampToValueAtTime(0.0001, cursor + note.duration)

    oscillator.connect(gainNode)
    gainNode.connect(masterGain)

    oscillator.start(cursor)
    oscillator.stop(cursor + note.duration)

    cursor += note.duration + (note.gap ?? 0)
  }

  window.setTimeout(() => {
    void audioContext.close().catch(() => {})
  }, Math.ceil((cursor - startTime + 0.25) * 1000))
}
