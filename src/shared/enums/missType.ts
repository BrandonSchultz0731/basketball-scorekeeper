/** What kind of tricky miss it was. Optional on a miss label. */
export enum MISS_TYPE {
  FRONT_AIRBALL = 'front_airball',
  BEHIND_NET = 'behind_net',
  BACK_RIM_DOWN = 'back_rim_down',
  RIM_OUT = 'rim_out',
  NET_TOUCH = 'net_touch',
  OTHER = 'other',
}
