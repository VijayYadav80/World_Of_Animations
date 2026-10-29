import type { Ms } from './scene-time';

/** A line of dialogue shown as a speech bubble. `characterId` is the CharacterInstance.instanceId. */
export interface DialogueClip {
  id: string;
  characterId: string;
  /** Hindi (or any) text shown in the bubble. */
  text: string;
  start: Ms;
  duration: Ms;
  /** Optional linked AudioClip. When set, lip-sync follows the audio and the duration equals the audio length. */
  audioId?: string;
}

/** An imported voice recording placed on the Audio track. `assetId` points to AudioService's decoded data. */
export interface AudioClip {
  id: string;
  name: string;
  assetId: string;
  start: Ms;
  duration: Ms;
  /** Character whose mouth follows this audio (instanceId). Optional. */
  characterId?: string;
}

/** Per-frame mouth state derived from the audio loudness. `open[i] === 1` means open during frame i. */
export interface MouthTrack {
  hopMs: number;
  open: Uint8Array;
}

export interface SpeechData {
  dialogues: DialogueClip[];
  audioClips: AudioClip[];
}
