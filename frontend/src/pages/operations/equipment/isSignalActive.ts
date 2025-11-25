import type { BinaryRawState, DoorRawState } from '../../../types/models';

export const isSignalActive = (val: DoorRawState | BinaryRawState): boolean =>
  val === 1 || val === 'on' || val === 'open' || val === true;
