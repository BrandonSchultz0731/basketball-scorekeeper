/** What viewer phones see the room doing. Values are stored in Firebase. */
export enum LIVE_STATUS {
  /** No game yet in this session. */
  IDLE = 'idle',
  LIVE = 'live',
  FINAL = 'final',
}
