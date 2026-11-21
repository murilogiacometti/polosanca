import type { BinaryRawState, DoorRawState } from '../../../types/models';

export const isSignalActive = (val: DoorRawState | BinaryRawState): boolean =>
  val === 'on' || val === 'open';
