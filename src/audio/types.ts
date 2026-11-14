/** Tipi pubblici del motore audio (ri-esportati da `engine.ts`). */

export type SfxName =
  | 'screw_turn'
  | 'screw_out'
  | 'screw_seat'
  | 'screw_strip'
  | 'screw_drop'
  | 'screw_mat'
  | 'suction_attach'
  | 'suction_pop'
  | 'adhesive_creak'
  | 'adhesive_tear'
  | 'pick_slide'
  | 'connector_snap'
  | 'connector_press'
  | 'part_pickup'
  | 'part_place'
  | 'part_metal'
  | 'display_open'
  | 'display_close'
  | 'pulltab_stretch'
  | 'pulltab_snap'
  | 'glass_crack'
  | 'spark'
  | 'damage'
  | 'brush'
  | 'air_blast'
  | 'ipa_drip'
  | 'toothpick'
  | 'multimeter_beep'
  | 'phone_boot'
  | 'phone_off'
  | 'phone_vibrate'
  | 'phone_speaker_test'
  | 'camera_shutter'
  | 'test_pass'
  | 'test_fail'
  | 'solder_tick'
  | 'chip_place'
  | 'cash'
  | 'coins'
  | 'order_notify'
  | 'customer_bell'
  | 'purchase'
  | 'delivery'
  | 'ui_click'
  | 'ui_hover'
  | 'ui_open'
  | 'ui_close'
  | 'ui_tab'
  | 'error'
  | 'success'
  | 'star'
  | 'unlock'
  | 'day_end'
  | 'day_start'
  | 'tool_select'
  | 'place_decor'
  | 'rotate_decor'
  | 'sell'
  | 'build_hammer'
  | 'build_saw'
  | 'thunder'
  | 'footstep_sand'
  | 'radio_tune'
  | 'flashlight'
  | 'camera_whoosh'
  | 'review_good'
  | 'review_bad';

export type LoopName =
  | 'heatgun'
  | 'solder_sizzle'
  | 'ultrasonic'
  | 'fan'
  | 'screw_spin'
  | 'hot_air'
  | 'brush_scrub'
  | 'microscope_hum';

export type RadioStation = 'auto' | 'island_lofi' | 'thai_khim' | 'sunset_ambient' | 'beach_groove' | 'off';

export interface AudioVolumes {
  master: number;
  music: number;
  ambience: number;
  sfx: number;
  voice: number;
}

export interface AudioEnv {
  /** ore [0, 24) */
  timeOfDay: number;
  rain: number;
  wind: number;
  /** 0..1 vicinanza di una long-tail a motore */
  boat: number;
  /** 0..1 */
  crowd: number;
  /** 0..1: la fase negozio attutisce l'esterno */
  indoors: number;
}

export type VoiceId =
  | 'somchai'
  | 'noi'
  | 'dive_instructor'
  | 'italian_backpacker'
  | 'chai'
  | 'assistant'
  | 'customer_a'
  | 'customer_b'
  | 'customer_c'
  | 'customer_d'
  | 'customer_e'
  | 'customer_f';

export interface SfxOptions {
  /** moltiplicatore di pitch, default 1 (più micro-variazione casuale) */
  pitch?: number;
  volume?: number;
  /** -1..1 */
  pan?: number;
}
