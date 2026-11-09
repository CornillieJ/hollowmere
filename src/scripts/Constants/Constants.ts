/**
 * Central tuning values. Grouped in UPPER_SNAKE objects, all `as const` so they
 * can be used as literal types where needed.
 */

/** Default camera and player dimensions, in meters. */
export const PLAYER_DEFAULTS = {
    EYE_HEIGHT: 1.7,
    CROUCH_HEIGHT: 1.1,
    RADIUS: 0.35,
    HEIGHT: 1.8,
    START_POSITION: { x: 0, y: 0, z: 0 },
} as const;

/** Movement speeds and feel, in meters per second. */
export const MOVEMENT = {
    WALK_SPEED: 4,
    SPRINT_SPEED: 7,
    CROUCH_SPEED: 2,
    AIR_CONTROL: 0.35,
    ACCELERATION: 30,
    DECELERATION: 24,
    JUMP_HEIGHT: 1.1,
    GRAVITY: -22,
    /** Turn speed for the character mesh, radians per second. */
    TURN_SPEED: 12,
    /** Head-bob amplitude in meters, 0 disables it. */
    HEAD_BOB: 0.035,
    HEAD_BOB_FREQUENCY: 9,
} as const;

/** Camera behaviour for first-, third- and top-down views. */
export const CAMERA = {
    FOV: 60,
    NEAR: 0.05,
    FAR: 400,
    LOOK_SENSITIVITY: 0.0022,
    MIN_PITCH: -Math.PI / 2 + 0.05,
    MAX_PITCH: Math.PI / 2 - 0.05,
    /** Third person: distance and height behind the character. */
    THIRD_PERSON_DISTANCE: 5,
    THIRD_PERSON_HEIGHT: 2.2,
    THIRD_PERSON_MIN_DISTANCE: 1.2,
    /** How fast the follow camera catches up, higher is snappier. */
    FOLLOW_DAMPING: 9,
    /** Top down: height above the player and pitch angle. */
    TOP_DOWN_HEIGHT: 16,
    TOP_DOWN_PITCH: -Math.PI / 2.6,
    TOP_DOWN_MIN_HEIGHT: 6,
    TOP_DOWN_MAX_HEIGHT: 40,
    FOV_KICK: 0.6,
} as const;

/** Physics world defaults. */
export const PHYSICS_DEFAULTS = {
    GRAVITY: { x: 0, y: -22, z: 0 },
    STEP: 1 / 60,
    MAX_SUB_STEPS: 5,
    /** Small gap kept between a character and its surroundings. */
    CHARACTER_OFFSET: 0.02,
    CHARACTER_MAX_SLOPE_DEGREES: 50,
    CHARACTER_MIN_SLIDE_DEGREES: 40,
    AUTOSTEP_MAX_HEIGHT: 0.45,
    AUTOSTEP_MIN_WIDTH: 0.2,
    SNAP_TO_GROUND_DISTANCE: 0.4,
    /** Default friction and restitution for dynamic bodies. */
    FRICTION: 0.7,
    RESTITUTION: 0.1,
} as const;

/** Interaction and gameplay interaction distances. */
export const GAMEPLAY = {
    INTERACT_RANGE: 3,
    PICKUP_RANGE: 2.5,
    /** Seconds between regenerating health, 0 disables regen. */
    HEALTH_REGEN_DELAY: 0,
    /** Invulnerability window after respawn or taking a hit, in seconds. */
    INVULNERABLE_TIME: 1,
    RESPAWN_DELAY: 1.8,
    STARTING_LIVES: 3,
    MAX_HEALTH: 100,
    /** Damage dealt by falling out of the world. */
    FALL_DAMAGE: 25,
    /** Y coordinate under which the player is considered fallen out of the world. */
    KILL_PLANE_Y: -25,
} as const;

/** Projectile defaults. */
export const PROJECTILE = {
    SPEED: 45,
    RANGE: 90,
    RADIUS: 0.08,
    DAMAGE: 25,
    /** Seconds between shots; a fire rate of 6 means 6 shots per second. */
    FIRE_RATE: 6,
    COOLDOWN: 0.05,
    POOL_SIZE: 64,
    GRAVITY_SCALE: 0,
} as const;

/** Audio volume defaults, all in 0..1. */
export const AUDIO_DEFAULTS = {
    MASTER: 0.85,
    MUSIC: 0.55,
    SFX: 0.8,
    AMBIENT: 0.5,
    UI: 0.6,
    /** Seconds used when fading music in or out. */
    MUSIC_FADE: 1.2,
    /** Max distance a positional sound is audible. */
    MAX_DISTANCE: 40,
    REF_DISTANCE: 6,
    /** Number of voices one-shot sound effects may use. */
    VOICE_LIMIT: 24,
} as const;

/** Timings for the shared tween and overlay helpers. */
export const FEEL = {
    HIT_STOP: 0.06,
    HIT_FLASH: 0.12,
    SHAKE_DECAY: 6,
    TWEEN_DEFAULT: 0.3,
    FADE_DEFAULT: 0.35,
    POP_SCALE: 1.15,
    TOAST_DURATION: 2.2,
    CAMERA_TRANSITION: 0.8,
} as const;

/** UI copy that appears in more than one place. */
export const UI_TEXT = {
    RESUME: 'Resume',
    RESTART: 'Restart',
    MAIN_MENU: 'Main menu',
    QUIT: 'Quit',
    START: 'Start',
    PAUSED: 'Paused',
    YOU_DIED: 'You died',
    VICTORY: 'Level complete',
    CONTINUE: 'Continue',
    CLICK_TO_PLAY: 'Click to play',
} as const;

/** Object names used by helpers to find their own objects again. */
export const NAMES = {
    CROSSHAIR: 'crosshair',
    GROUND: 'ground',
    PLAYER: 'player',
    DEBUG_PHYSICS: 'debug-physics',
} as const;
