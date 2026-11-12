import { HOOP } from '../enums';

/** Both game baskets, in display order. */
export const HOOPS = [HOOP.LEFT, HOOP.RIGHT] as const;

export const otherHoop = (h: HOOP): HOOP => (h === HOOP.LEFT ? HOOP.RIGHT : HOOP.LEFT);
