// -----------------------------------------------------------------------------
// Constants of the Blitzortung integration.
// -----------------------------------------------------------------------------

/**
 * The live feed of the community network, the one map.blitzortung.org reads.
 * A short name "ws7" stands for wss://ws7.blitzortung.org/.
 */
export const DEFAULT_SERVERS = ['ws1', 'ws7', 'ws8'];
export const serverUrl = (name) => `wss://${name}.blitzortung.org/`;
/** What the map sends once the socket is open to start receiving strikes. */
export const SUBSCRIBE_MESSAGE = '{"a":111}';
/** Sent as the User-Agent of the websocket: the volunteers can see who we are. */
export const USER_AGENT =
  'gladys-blitzortung/0.1 (+https://github.com/LM1LC3N7/gladys-blitzortung)';

/**
 * Reconnection: 5 s, 10 s, 20 s... up to 5 minutes after a failure. The
 * servers close every connection after about 6 minutes (363 s, measured on
 * ws1, ws7 and ws8): after a stable connection the next server is tried after
 * `afterStable` only, so the houses are not blind 5 s every 6 minutes.
 */
export const RECONNECT = { afterStable: 1_000, base: 5_000, max: 5 * 60_000 };
/**
 * A connection is "stable" once it delivered strikes for this long: only then
 * is a drop a recycling (quick reconnection, backoff reset). A server that
 * accepts and drops at once must not be hammered.
 */
export const STABLE_AFTER = 60_000;
/**
 * No message for this long: the connection is dead, reconnect elsewhere. The
 * worldwide feed carries several strikes per second; the longest silence
 * measured on 2026-10-14 was 2.3 s in 30 minutes (see CLAUDE.md).
 */
export const WATCHDOG = 2 * 60_000;
/** How often the watchdog looks at the last message. */
export const WATCHDOG_CHECK = 15_000;

/** The device states are published at most this often (the window is re-read). */
export const PUBLISH_INTERVAL = 15_000;
/** States re-sent unchanged after this long, so a calm value stays dated. */
export const STATE_HEARTBEAT = 10 * 60_000;
/** Memory bound per house: past it the oldest strikes are dropped. */
export const MAX_STRIKES_PER_AREA = 10_000;

/** The distances (km) of the "lightning within" and "storm over" triggers. */
export const DISTANCE_THRESHOLDS = [5, 10, 15, 20, 30, 50, 100, 200];
/**
 * "Storm approaching": the window is cut in three slices; each must hold at
 * least `minStrikes` strikes and its nearest strike must be at least
 * `minStepKm` closer than in the slice before.
 */
export const APPROACH = { slices: 3, minStrikes: 2, minStepKm: 1 };
/** Below this distance (km) the widget turns red. */
export const DANGER_KM = 10;

export const LANGUAGES = ['fr', 'en'];

/** Manifest keys (forever: stored in user scenes and dashboards). */
export const ACTIONS = { TEST: 'test_connection' };
export const SCENE_ACTIONS = { STATUS: 'get_lightning_status' };
export const SCENE_TRIGGERS = {
  NEARBY: 'lightning_nearby',
  OVER: 'storm_over',
  APPROACHING: 'storm_approaching',
};
export const WIDGETS = { STORM: 'storm' };
