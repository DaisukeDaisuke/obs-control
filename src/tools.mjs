import { randomUUID } from 'node:crypto';

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    result: { type: 'object' },
    error: { type: 'string' },
  },
  required: ['ok'],
  additionalProperties: false,
};

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false };

function schema(name, title, description, properties = {}, required = [], annotations = WRITE) {
  return {
    name,
    title,
    description,
    inputSchema: { type: 'object', properties, required, additionalProperties: false },
    outputSchema: OUTPUT_SCHEMA,
    annotations,
  };
}

const SCENE_SELECTOR = {
  sceneId: { type: 'string', minLength: 1, description: 'OBS scene UUID.' },
  sceneName: { type: 'string', minLength: 1, description: 'OBS scene name.' },
};
const INPUT_SELECTOR = {
  inputId: { type: 'string', minLength: 1, description: 'OBS input UUID.' },
  inputName: { type: 'string', minLength: 1, description: 'OBS input name.' },
};
const MEDIA_SELECTOR = {
  mediaId: { type: 'string', minLength: 1, description: 'Media ID. This is the OBS input UUID returned by media_add/media_list.' },
  mediaName: { type: 'string', minLength: 1, description: 'OBS media input name.' },
};
const TEXT_SELECTOR = {
  textId: { type: 'string', minLength: 1, description: 'Text source ID. This is the OBS input UUID returned by text_add.' },
  textName: { type: 'string', minLength: 1, description: 'OBS text input name.' },
};
const IMAGE_SELECTOR = {
  imageId: { type: 'string', minLength: 1, description: 'Image source ID. This is the OBS input UUID returned by image_add.' },
  imageName: { type: 'string', minLength: 1, description: 'OBS image input name.' },
};
const COLOR_SELECTOR = {
  colorId: { type: 'string', minLength: 1, description: 'Color source ID. This is the OBS input UUID returned by color_add.' },
  colorName: { type: 'string', minLength: 1, description: 'OBS color input name.' },
};
const SOURCE_SELECTOR = {
  sourceId: { type: 'string', minLength: 1, description: 'OBS source UUID.' },
  sourceName: { type: 'string', minLength: 1, description: 'OBS source name.' },
};
const GROUP_SELECTOR = {
  groupId: { type: 'string', minLength: 1, description: 'OBS group UUID.' },
  groupName: { type: 'string', minLength: 1, description: 'OBS group name.' },
};
const TEXT_STYLE_PROPERTIES = {
  text: { type: 'string', description: 'Displayed text. Empty string is allowed.' },
  fontName: { type: 'string', minLength: 1, description: 'Font face/family, for example Arial or Yu Gothic.' },
  fontStyle: { type: 'string', description: 'Optional OBS/Qt font style name.' },
  fontSize: { type: 'integer', minimum: 1, maximum: 4096 },
  bold: { type: 'boolean' },
  italic: { type: 'boolean' },
  underline: { type: 'boolean' },
  strikeout: { type: 'boolean' },
  textColor: { type: 'string', pattern: '^#?[0-9A-Fa-f]{6}$', description: 'RGB color as #RRGGBB.' },
  textOpacity: { type: 'integer', minimum: 0, maximum: 100 },
  backgroundColor: { type: 'string', pattern: '^#?[0-9A-Fa-f]{6}$', description: 'Background RGB color as #RRGGBB.' },
  backgroundOpacity: { type: 'integer', minimum: 0, maximum: 100 },
  outline: { type: 'boolean' },
  outlineSize: { type: 'integer', minimum: 1, maximum: 20 },
  outlineColor: { type: 'string', pattern: '^#?[0-9A-Fa-f]{6}$', description: 'Outline RGB color as #RRGGBB.' },
  outlineOpacity: { type: 'integer', minimum: 0, maximum: 100 },
  align: { type: 'string', enum: ['left', 'center', 'right'] },
  verticalAlign: { type: 'string', enum: ['top', 'center', 'bottom'] },
  antialiasing: { type: 'boolean' },
};
const TEXT_PLACEMENT_PROPERTIES = {
  x: { type: 'number', minimum: -90000, maximum: 90000 },
  y: { type: 'number', minimum: -90000, maximum: 90000 },
  width: { type: 'number', exclusiveMinimum: 0, maximum: 90000 },
  height: { type: 'number', exclusiveMinimum: 0, maximum: 90000 },
  fit: { type: 'string', enum: ['contain', 'cover', 'stretch'], default: 'contain' },
  rotation: { type: 'number', minimum: -360, maximum: 360 },
};
const SAFE_FILTER_KINDS = [
  'crop_filter',
  'color_filter',
  'sharpness_filter',
  'scale_filter',
  'gain_filter',
  'compressor_filter',
  'limiter_filter',
  'noise_gate_filter',
  'noise_suppress_filter',
  'basic_eq_filter',
];
const BLEND_MODES = ['normal', 'additive', 'subtract', 'screen', 'multiply', 'lighten', 'darken'];

export const TOOL_SCHEMAS = [
  schema('obs_status', 'OBS status', 'Connect to OBS and return OBS/obs-websocket versions plus active range playbacks.', {}, [], READ_ONLY),
  schema('stats_get', 'Get OBS stats', 'Get OBS CPU, memory, render FPS, frame timing, skipped-frame counters, and websocket session statistics.', {}, [], READ_ONLY),
  schema('video_settings_get', 'Get video settings', 'Get OBS canvas/output resolution and FPS. This control MCP intentionally does not expose SetVideoSettings.', {}, [], READ_ONLY),
  schema('scene_list', 'List scenes', 'List OBS scenes and identify the current program/preview scenes.', {}, [], READ_ONLY),
  schema('group_list', 'List groups', 'List OBS groups. Group creation is intentionally not exposed; nested scenes are preferred.', {}, [], READ_ONLY),
  schema('group_item_list', 'List group items', 'List every scene item inside an existing OBS group.', GROUP_SELECTOR, [], READ_ONLY),
  schema('scene_create', 'Create scene', 'Create a new OBS scene.', {
    sceneName: { type: 'string', minLength: 1 },
  }, ['sceneName']),
  schema('scene_delete', 'Delete scene', 'Delete an OBS scene by UUID or name.', SCENE_SELECTOR, [], DESTRUCTIVE),
  schema('scene_set_current', 'Set current scene', 'Switch the current program scene by UUID or name.', SCENE_SELECTOR),
  schema('scene_rename', 'Rename scene', 'Rename an OBS scene by UUID or current name.', {
    ...SCENE_SELECTOR,
    newSceneName: { type: 'string', minLength: 1 },
  }, ['newSceneName']),
  schema('scene_item_list', 'List scene items', 'List every source/item in a scene.', SCENE_SELECTOR, [], READ_ONLY),
  schema('scene_item_add_existing', 'Place existing source', 'Place an existing OBS source into another scene without creating a new input.', {
    ...SCENE_SELECTOR,
    ...SOURCE_SELECTOR,
    enabled: { type: 'boolean', default: true },
    ...TEXT_PLACEMENT_PROPERTIES,
  }),
  schema('scene_item_duplicate', 'Duplicate scene item', 'Duplicate a scene item, preserving transform/crop. Optionally place the duplicate in another scene.', {
    ...SCENE_SELECTOR,
    sceneItemId: { type: 'integer', minimum: 0 },
    destinationSceneId: { type: 'string', minLength: 1 },
    destinationSceneName: { type: 'string', minLength: 1 },
  }, ['sceneItemId']),
  schema('scene_item_remove', 'Remove scene item', 'Remove one scene item without deleting the underlying input.', {
    ...SCENE_SELECTOR,
    sceneItemId: { type: 'integer', minimum: 0 },
  }, ['sceneItemId'], DESTRUCTIVE),
  schema('scene_item_transform_get', 'Get scene item placement', 'Get position, size, scale, crop, rotation, and bounds for a scene item.', {
    ...SCENE_SELECTOR,
    sceneItemId: { type: 'integer', minimum: 0 },
  }, ['sceneItemId'], READ_ONLY),
  schema('scene_item_transform_set', 'Place scene item', 'Set position/size/scale/rotation/crop of a scene item. width+height use OBS bounds; fit=contain preserves the full image, cover fills the box, stretch ignores aspect ratio.', {
    ...SCENE_SELECTOR,
    sceneItemId: { type: 'integer', minimum: 0 },
    x: { type: 'number', minimum: -90000, maximum: 90000 },
    y: { type: 'number', minimum: -90000, maximum: 90000 },
    width: { type: 'number', exclusiveMinimum: 0, maximum: 90000 },
    height: { type: 'number', exclusiveMinimum: 0, maximum: 90000 },
    fit: { type: 'string', enum: ['contain', 'cover', 'stretch'], default: 'contain' },
    scaleX: { type: 'number' },
    scaleY: { type: 'number' },
    rotation: { type: 'number', minimum: -360, maximum: 360 },
    cropLeft: { type: 'integer', minimum: 0, maximum: 100000 },
    cropRight: { type: 'integer', minimum: 0, maximum: 100000 },
    cropTop: { type: 'integer', minimum: 0, maximum: 100000 },
    cropBottom: { type: 'integer', minimum: 0, maximum: 100000 },
  }, ['sceneItemId']),
  schema('scene_item_enabled_set', 'Show/hide scene item', 'Enable or disable a scene item.', {
    ...SCENE_SELECTOR,
    sceneItemId: { type: 'integer', minimum: 0 },
    enabled: { type: 'boolean' },
  }, ['sceneItemId', 'enabled']),
  schema('scene_item_index_set', 'Reorder scene item', 'Set scene item z-order. OBS index 0 is the bottom.', {
    ...SCENE_SELECTOR,
    sceneItemId: { type: 'integer', minimum: 0 },
    index: { type: 'integer', minimum: 0 },
  }, ['sceneItemId', 'index']),
  schema('scene_item_lock_get', 'Get scene item lock', 'Get whether a scene item is locked in the OBS UI.', {
    ...SCENE_SELECTOR,
    sceneItemId: { type: 'integer', minimum: 0 },
  }, ['sceneItemId'], READ_ONLY),
  schema('scene_item_lock_set', 'Set scene item lock', 'Lock or unlock a scene item in the OBS UI.', {
    ...SCENE_SELECTOR,
    sceneItemId: { type: 'integer', minimum: 0 },
    locked: { type: 'boolean' },
  }, ['sceneItemId', 'locked']),
  schema('scene_item_blend_get', 'Get scene item blend mode', 'Get the compositing blend mode of a scene item.', {
    ...SCENE_SELECTOR,
    sceneItemId: { type: 'integer', minimum: 0 },
  }, ['sceneItemId'], READ_ONLY),
  schema('scene_item_blend_set', 'Set scene item blend mode', 'Set scene item blend mode: normal, additive, subtract, screen, multiply, lighten, or darken.', {
    ...SCENE_SELECTOR,
    sceneItemId: { type: 'integer', minimum: 0 },
    blendMode: { type: 'string', enum: BLEND_MODES },
  }, ['sceneItemId', 'blendMode']),
  schema('input_list', 'List inputs', 'List OBS inputs, optionally restricted to one input kind.', {
    inputKind: { type: 'string', minLength: 1 },
  }, [], READ_ONLY),
  schema('input_rename', 'Rename input', 'Rename an OBS input by UUID or current name.', {
    ...INPUT_SELECTOR,
    newInputName: { type: 'string', minLength: 1 },
  }, ['newInputName']),
  schema('input_settings_get', 'Get input settings', 'Get an OBS input kind and its current settings.', INPUT_SELECTOR, [], READ_ONLY),
  schema('input_settings_set', 'Set safe raw input settings', 'Apply only allowlisted settings to known-safe built-in input kinds. Browser/unknown/plugin inputs and path/script settings are rejected.', {
    ...INPUT_SELECTOR,
    settings: { type: 'object' },
    overlay: { type: 'boolean', default: true },
  }, ['settings']),
  schema('input_audio_get', 'Get input audio', 'Get mute and volume state for an OBS input.', INPUT_SELECTOR, [], READ_ONLY),
  schema('input_audio_set', 'Set input audio', 'Set mute and/or volume for an OBS input.', {
    ...INPUT_SELECTOR,
    muted: { type: 'boolean' },
    volumeDb: { type: 'number', minimum: -100, maximum: 26 },
    volumeMul: { type: 'number', minimum: 0, maximum: 20 },
  }),
  schema('audio_mixer_list', 'List audio mixer', 'List all OBS inputs that support audio, including volume, mute, balance, sync offset, monitoring mode, and track routing.', {}, [], READ_ONLY),
  schema('audio_mixer_get', 'Get audio mixer input', 'Get the complete OBS mixer state for one audio-capable input.', INPUT_SELECTOR, [], READ_ONLY),
  schema('audio_mixer_set', 'Set audio mixer input', 'Change one or more OBS mixer properties: volume, mute, stereo balance, sync offset, monitoring mode, and output track routing.', {
    ...INPUT_SELECTOR,
    muted: { type: 'boolean' },
    volumeDb: { type: 'number', minimum: -100, maximum: 26 },
    volumeMul: { type: 'number', minimum: 0, maximum: 20 },
    balance: { type: 'number', minimum: 0, maximum: 1, description: '0.0=left, 0.5=center, 1.0=right.' },
    syncOffsetMs: { type: 'integer', minimum: -950, maximum: 20000 },
    monitorType: { type: 'string', enum: ['none', 'monitor_only', 'monitor_and_output'] },
    tracks: {
      type: 'object',
      description: 'Partial audio track routing object. Keys are "1" through "6" and values are booleans.',
      properties: {
        '1': { type: 'boolean' },
        '2': { type: 'boolean' },
        '3': { type: 'boolean' },
        '4': { type: 'boolean' },
        '5': { type: 'boolean' },
        '6': { type: 'boolean' },
      },
      additionalProperties: false,
    },
  }),
  schema('audio_mixer_mute_toggle', 'Toggle audio mixer mute', 'Toggle mute for one OBS audio input and return its complete mixer state.', INPUT_SELECTOR),
  schema('image_add', 'Add image', 'Create a local OBS Image Source and place it in a scene. Local file access remains subject to the Gateway path allowlist.', {
    ...SCENE_SELECTOR,
    file: { type: 'string', minLength: 1, description: 'Local image file path.' },
    imageName: { type: 'string', minLength: 1 },
    unloadWhenNotShowing: { type: 'boolean', default: false },
    linearAlpha: { type: 'boolean', default: false },
    ...TEXT_PLACEMENT_PROPERTIES,
  }, ['file']),
  schema('image_info', 'Get image info', 'Get Image Source file/settings, active/showing state, and all scene placements.', IMAGE_SELECTOR, [], READ_ONLY),
  schema('image_set', 'Set image', 'Change an Image Source file/settings and optionally move/resize one scene placement.', {
    ...IMAGE_SELECTOR,
    ...SCENE_SELECTOR,
    sceneItemId: { type: 'integer', minimum: 0 },
    file: { type: 'string', minLength: 1, description: 'Local image file path.' },
    unloadWhenNotShowing: { type: 'boolean' },
    linearAlpha: { type: 'boolean' },
    ...TEXT_PLACEMENT_PROPERTIES,
  }),
  schema('image_remove', 'Remove image', 'Delete an Image Source input and all associated scene items.', IMAGE_SELECTOR, [], DESTRUCTIVE),
  schema('color_add', 'Add color rectangle', 'Create a safe built-in OBS Color Source rectangle with RGB color, opacity, size, position, and rotation.', {
    ...SCENE_SELECTOR,
    colorName: { type: 'string', minLength: 1 },
    color: { type: 'string', pattern: '^#?[0-9A-Fa-f]{6}$' },
    opacity: { type: 'integer', minimum: 0, maximum: 100, default: 100 },
    width: { type: 'integer', minimum: 1, maximum: 4096 },
    height: { type: 'integer', minimum: 1, maximum: 4096 },
    x: { type: 'number', minimum: -90000, maximum: 90000 },
    y: { type: 'number', minimum: -90000, maximum: 90000 },
    rotation: { type: 'number', minimum: -360, maximum: 360 },
  }, ['color', 'width', 'height']),
  schema('color_info', 'Get color rectangle info', 'Get Color Source color/opacity/size, active state, and every scene placement.', COLOR_SELECTOR, [], READ_ONLY),
  schema('color_set', 'Set color rectangle', 'Change Color Source color/opacity/size and optionally move/rotate one scene placement.', {
    ...COLOR_SELECTOR,
    ...SCENE_SELECTOR,
    sceneItemId: { type: 'integer', minimum: 0 },
    color: { type: 'string', pattern: '^#?[0-9A-Fa-f]{6}$' },
    opacity: { type: 'integer', minimum: 0, maximum: 100 },
    width: { type: 'integer', minimum: 1, maximum: 4096 },
    height: { type: 'integer', minimum: 1, maximum: 4096 },
    x: { type: 'number', minimum: -90000, maximum: 90000 },
    y: { type: 'number', minimum: -90000, maximum: 90000 },
    rotation: { type: 'number', minimum: -360, maximum: 360 },
  }),
  schema('color_remove', 'Remove color rectangle', 'Delete a Color Source input and all associated scene items.', COLOR_SELECTOR, [], DESTRUCTIVE),
  schema('text_add', 'Add text', 'Create a Windows OBS GDI+ text source and place it in a scene. Text style and scene placement can be specified in the same call.', {
    ...SCENE_SELECTOR,
    textName: { type: 'string', minLength: 1 },
    ...TEXT_STYLE_PROPERTIES,
    ...TEXT_PLACEMENT_PROPERTIES,
  }, ['text']),
  schema('text_info', 'Get text info', 'Get text content, font/style, colors, background, outline, alignment, visibility, and all scene placements for a GDI+ text source.', TEXT_SELECTOR, [], READ_ONLY),
  schema('text_set', 'Set text', 'Change text content/style and optionally move/resize the scene item in one call. If the text source has multiple placements, specify sceneId/sceneName and optionally sceneItemId.', {
    ...TEXT_SELECTOR,
    ...SCENE_SELECTOR,
    sceneItemId: { type: 'integer', minimum: 0 },
    ...TEXT_STYLE_PROPERTIES,
    ...TEXT_PLACEMENT_PROPERTIES,
  }),
  schema('text_remove', 'Remove text', 'Delete a GDI+ text input and all of its associated scene items.', TEXT_SELECTOR, [], DESTRUCTIVE),
  schema('filter_list', 'List source filters', 'List all filters on a source. Read-only listing includes unsafe/third-party filter kinds for observation, but mutation is restricted to the safe allowlist.', SOURCE_SELECTOR, [], READ_ONLY),
  schema('filter_info', 'Get source filter', 'Get one source filter and whether its kind is safe for mutation through this MCP.', {
    ...SOURCE_SELECTOR,
    filterName: { type: 'string', minLength: 1 },
  }, ['filterName'], READ_ONLY),
  schema('filter_add', 'Add safe source filter', 'Add one allowlisted built-in OBS filter. Arbitrary plugin/VST/script/shader filters are rejected.', {
    ...SOURCE_SELECTOR,
    filterName: { type: 'string', minLength: 1 },
    filterKind: { type: 'string', enum: SAFE_FILTER_KINDS },
    settings: { type: 'object' },
  }, ['filterName', 'filterKind']),
  schema('filter_set', 'Set safe source filter', 'Change settings of an existing allowlisted built-in OBS filter.', {
    ...SOURCE_SELECTOR,
    filterName: { type: 'string', minLength: 1 },
    settings: { type: 'object' },
    overlay: { type: 'boolean', default: true },
  }, ['filterName', 'settings']),
  schema('filter_enable', 'Enable safe source filter', 'Enable or disable an existing allowlisted built-in OBS filter.', {
    ...SOURCE_SELECTOR,
    filterName: { type: 'string', minLength: 1 },
    enabled: { type: 'boolean' },
  }, ['filterName', 'enabled']),
  schema('filter_remove', 'Remove safe source filter', 'Remove an existing allowlisted built-in OBS filter.', {
    ...SOURCE_SELECTOR,
    filterName: { type: 'string', minLength: 1 },
  }, ['filterName'], DESTRUCTIVE),
  schema('media_list', 'List media', 'List Media Source (ffmpeg_source) inputs. mediaId is the persistent OBS input UUID.', {
    includeSettings: { type: 'boolean', default: false },
  }, [], READ_ONLY),
  schema('media_add', 'Add media', 'Create an OBS Media Source in a scene. Supports local files and network inputs and can position/size the new scene item immediately.', {
    ...SCENE_SELECTOR,
    source: { type: 'string', minLength: 1, description: 'Local file path or network media URL/input.' },
    sourceMode: { type: 'string', enum: ['auto', 'local', 'network'], default: 'auto' },
    mediaName: { type: 'string', minLength: 1 },
    loop: { type: 'boolean', default: false },
    autoplay: { type: 'boolean', default: false },
    restartOnActivate: { type: 'boolean', default: false },
    clearOnMediaEnd: { type: 'boolean', default: true },
    speedPercent: { type: 'integer', minimum: 1, maximum: 200, default: 100 },
    networkSeekable: { type: 'boolean', default: false },
    inputFormat: { type: 'string' },
    x: { type: 'number', minimum: -90000, maximum: 90000 },
    y: { type: 'number', minimum: -90000, maximum: 90000 },
    width: { type: 'number', exclusiveMinimum: 0, maximum: 90000 },
    height: { type: 'number', exclusiveMinimum: 0, maximum: 90000 },
    fit: { type: 'string', enum: ['contain', 'cover', 'stretch'], default: 'contain' },
    rotation: { type: 'number', minimum: -360, maximum: 360 },
  }, ['source']),
  schema('media_remove', 'Remove media', 'Delete a Media Source input and all of its scene items.', MEDIA_SELECTOR, [], DESTRUCTIVE),
  schema('media_status', 'Get media status', 'Get media playback state, duration, cursor, and active range-playback metadata.', MEDIA_SELECTOR, [], READ_ONLY),
  schema('media_info', 'Get media info', 'Get consolidated Media Source information: source path/URL, source mode, settings, playback status, speed, audio, visibility, and every scene placement/transform.', MEDIA_SELECTOR, [], READ_ONLY),
  schema('media_play', 'Play media', 'Start normal playback. Optionally change playback speed and/or seek to startMs before playing.', {
    ...MEDIA_SELECTOR,
    startMs: { type: 'number', minimum: 0 },
    speedPercent: { type: 'integer', minimum: 1, maximum: 200 },
  }),
  schema('media_speed_set', 'Set media speed', 'Set Media Source playback speed in percent (1-200). OBS restarts/reinitializes the media when this setting changes.', {
    ...MEDIA_SELECTOR,
    speedPercent: { type: 'integer', minimum: 1, maximum: 200 },
  }, ['speedPercent']),
  schema('media_control', 'Control media', 'Play, pause, stop, or restart a Media Source.', {
    ...MEDIA_SELECTOR,
    action: { type: 'string', enum: ['play', 'pause', 'stop', 'restart'] },
  }, ['action']),
  schema('media_seek', 'Seek media', 'Seek a Media Source to an absolute millisecond cursor or offset it relative to the current cursor.', {
    ...MEDIA_SELECTOR,
    mode: { type: 'string', enum: ['absolute', 'relative'], default: 'absolute' },
    milliseconds: { type: 'number' },
  }, ['milliseconds']),
  schema('media_play_range', 'Play media range', 'Play only a specified [startMs,endMs] range. Returns immediately while the server watches the real OBS media cursor; at end it pauses as soon as OBS reports the cursor at/after endMs, or stops.', {
    ...MEDIA_SELECTOR,
    startMs: { type: 'number', minimum: 0 },
    endMs: { type: 'number', exclusiveMinimum: 0 },
    speedPercent: { type: 'integer', minimum: 1, maximum: 200 },
    endAction: { type: 'string', enum: ['pause', 'stop'], default: 'pause' },
    pollIntervalMs: { type: 'integer', minimum: 25, maximum: 2000, default: 50 },
  }, ['startMs', 'endMs']),
  schema('media_range_cancel', 'Cancel media range', 'Cancel active range enforcement for a Media Source, optionally pausing it immediately.', {
    ...MEDIA_SELECTOR,
    pause: { type: 'boolean', default: true },
  }),
  schema('screenshot', 'Capture OBS screenshot', 'Capture a scene or input with OBS GetSourceScreenshot and return it directly as MCP image content for AI vision. If no source is specified, captures the current program scene.', {
    sourceId: { type: 'string', minLength: 1, description: 'OBS source UUID; scene UUID and input UUID both work.' },
    sourceName: { type: 'string', minLength: 1, description: 'OBS scene or input name.' },
    format: { type: 'string', enum: ['png', 'jpeg', 'jpg', 'webp'], default: 'png' },
    width: { type: 'integer', minimum: 8, maximum: 4096, default: 1280 },
    height: { type: 'integer', minimum: 8, maximum: 4096, default: 720 },
    quality: { type: 'integer', minimum: -1, maximum: 100, default: -1 },
  }, [], READ_ONLY),
];

const MEDIA_ACTIONS = {
  play: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY',
  pause: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE',
  stop: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_STOP',
  restart: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART',
};
const MEDIA_TIME_VALID_STATES = new Set([
  'OBS_MEDIA_STATE_PLAYING',
  'OBS_MEDIA_STATE_PAUSED',
]);
const MEDIA_TERMINAL_STATES = new Set([
  'OBS_MEDIA_STATE_STOPPED',
  'OBS_MEDIA_STATE_ENDED',
  'OBS_MEDIA_STATE_NONE',
]);
const MEDIA_STATE_SETTLE_TIMEOUT_MS = 2000;
const MEDIA_STATE_POLL_MS = 25;
const MEDIA_SEEK_TOLERANCE_MS = 1500;
const MEDIA_SEEK_SNAP_TOLERANCE_MS = 5000;
const MEDIA_SEEK_STABLE_DELTA_MS = 50;
const MEDIA_SEEK_STABLE_POLLS = 2;
const MEDIA_RESUME_BACKTRACK_TOLERANCE_MS = 1500;
const MEDIA_RESUME_VERIFY_DELAY_MS = 75;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForMediaStatus(obs, ref, predicate, {
  timeoutMs = MEDIA_STATE_SETTLE_TIMEOUT_MS,
  pollIntervalMs = MEDIA_STATE_POLL_MS,
  description = 'media state change',
} = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = await obs.call('GetMediaInputStatus', ref);
  while (!predicate(lastStatus)) {
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for ${description}; last state=${lastStatus.mediaState ?? 'unknown'}, cursor=${lastStatus.mediaCursor ?? 'null'}`);
    }
    await sleep(pollIntervalMs);
    lastStatus = await obs.call('GetMediaInputStatus', ref);
  }
  return lastStatus;
}

async function waitForMediaCursor(obs, ref, targetMs, options = {}) {
  const toleranceMs = options.toleranceMs ?? MEDIA_SEEK_TOLERANCE_MS;
  const snapToleranceMs = options.snapToleranceMs ?? MEDIA_SEEK_SNAP_TOLERANCE_MS;
  const timeoutMs = options.timeoutMs ?? MEDIA_STATE_SETTLE_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? MEDIA_STATE_POLL_MS;
  const description = options.description ?? `media cursor near ${targetMs}ms`;
  const deadline = Date.now() + timeoutMs;
  let lastStatus = await obs.call('GetMediaInputStatus', ref);
  let previousCursor = null;
  let stablePolls = 0;

  while (true) {
    if (MEDIA_TIME_VALID_STATES.has(lastStatus.mediaState) && Number.isFinite(lastStatus.mediaCursor)) {
      const distance = Math.abs(lastStatus.mediaCursor - targetMs);
      if (distance <= toleranceMs) return lastStatus;

      // OBS/FFmpeg may legally land on the nearest keyframe rather than the
      // requested timestamp. A stable paused cursor within a small keyframe
      // window is a successful seek, not a timeout.
      if (lastStatus.mediaState === 'OBS_MEDIA_STATE_PAUSED' && distance <= snapToleranceMs) {
        if (previousCursor !== null && Math.abs(lastStatus.mediaCursor - previousCursor) <= MEDIA_SEEK_STABLE_DELTA_MS) {
          stablePolls += 1;
        } else {
          stablePolls = 0;
        }
        if (stablePolls >= MEDIA_SEEK_STABLE_POLLS) return lastStatus;
      } else {
        stablePolls = 0;
      }
      previousCursor = lastStatus.mediaCursor;
    }

    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for ${description}; last state=${lastStatus.mediaState ?? 'unknown'}, cursor=${lastStatus.mediaCursor ?? 'null'}`);
    }
    await sleep(pollIntervalMs);
    lastStatus = await obs.call('GetMediaInputStatus', ref);
  }
}

async function resumeMediaAtCursor(obs, ref, expectedCursor, description = 'media resume') {
  await obs.call('TriggerMediaInputAction', { ...ref, mediaAction: MEDIA_ACTIONS.play });
  let status = await waitForMediaStatus(obs, ref,
    (candidate) => candidate.mediaState === 'OBS_MEDIA_STATE_PLAYING' && Number.isFinite(candidate.mediaCursor),
    { description });

  // A speed change can make OBS report PAUSED at the restored cursor while
  // FFmpeg still has a deferred reinitialization pending. The first PLAY then
  // jumps back near zero. Verify once after PLAY and repair that backtrack.
  if (Number.isFinite(expectedCursor)) {
    await sleep(MEDIA_RESUME_VERIFY_DELAY_MS);
    const verified = await obs.call('GetMediaInputStatus', ref);
    if (verified.mediaState === 'OBS_MEDIA_STATE_PLAYING' && Number.isFinite(verified.mediaCursor)) status = verified;
    if (Number.isFinite(status.mediaCursor)
        && status.mediaCursor < expectedCursor - MEDIA_RESUME_BACKTRACK_TOLERANCE_MS) {
      await obs.call('TriggerMediaInputAction', { ...ref, mediaAction: MEDIA_ACTIONS.pause });
      await waitForMediaStatus(obs, ref,
        (candidate) => candidate.mediaState === 'OBS_MEDIA_STATE_PAUSED',
        { description: `${description} correction pause` });
      await obs.call('SetMediaInputCursor', { ...ref, mediaCursor: expectedCursor });
      const correctedSeek = await waitForMediaCursor(obs, ref, expectedCursor, {
        description: `${description} correction seek`,
      });
      await obs.call('TriggerMediaInputAction', { ...ref, mediaAction: MEDIA_ACTIONS.play });
      status = await waitForMediaStatus(obs, ref,
        (candidate) => candidate.mediaState === 'OBS_MEDIA_STATE_PLAYING' && Number.isFinite(candidate.mediaCursor),
        { description: `${description} correction play` });
      if (status.mediaCursor < correctedSeek.mediaCursor - MEDIA_RESUME_BACKTRACK_TOLERANCE_MS) {
        throw new Error(`Media resume lost its cursor after correction; expected near ${correctedSeek.mediaCursor}ms, got ${status.mediaCursor}ms`);
      }
    }
  }
  return status;
}
const FIT_BOUNDS = {
  contain: 'OBS_BOUNDS_SCALE_INNER',
  cover: 'OBS_BOUNDS_SCALE_OUTER',
  stretch: 'OBS_BOUNDS_STRETCH',
};
const BLEND_MODE_TO_OBS = {
  normal: 'OBS_BLEND_NORMAL',
  additive: 'OBS_BLEND_ADDITIVE',
  subtract: 'OBS_BLEND_SUBTRACT',
  screen: 'OBS_BLEND_SCREEN',
  multiply: 'OBS_BLEND_MULTIPLY',
  lighten: 'OBS_BLEND_LIGHTEN',
  darken: 'OBS_BLEND_DARKEN',
};
const OBS_TO_BLEND_MODE = Object.fromEntries(Object.entries(BLEND_MODE_TO_OBS).map(([key, value]) => [value, key]));
const SAFE_FILTER_KIND_SET = new Set(SAFE_FILTER_KINDS);
const SAFE_RAW_INPUT_SETTINGS = new Map([
  ['ffmpeg_source', new Set(['looping', 'restart_on_activate', 'clear_on_media_end', 'speed_percent', 'seekable'])],
  ['image_source', new Set(['unload', 'linear_alpha'])],
  ['color_source', new Set(['color', 'width', 'height'])],
  ['text_gdiplus', new Set([
    'text', 'font', 'color', 'opacity', 'bk_color', 'bk_opacity', 'outline', 'outline_size',
    'outline_color', 'outline_opacity', 'align', 'valign', 'antialiasing',
  ])],
]);
const TOP_LEFT_ALIGNMENT = 5; // OBS_ALIGN_LEFT (1) | OBS_ALIGN_TOP (4)
const OBS_SOURCE_AUDIO_CAP = 1 << 1;
const MONITOR_TYPES = {
  none: 'OBS_MONITORING_TYPE_NONE',
  monitor_only: 'OBS_MONITORING_TYPE_MONITOR_ONLY',
  monitor_and_output: 'OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT',
};
const OBS_FONT_BOLD = 1 << 0;
const OBS_FONT_ITALIC = 1 << 1;
const OBS_FONT_UNDERLINE = 1 << 2;
const OBS_FONT_STRIKEOUT = 1 << 3;
const DEFAULT_MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function positiveIntegerEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

const MAX_IMAGE_BYTES = positiveIntegerEnv('OBS_MCP_MAX_IMAGE_BYTES', DEFAULT_MAX_IMAGE_BYTES);

function argsObject(args) {
  if (args === undefined || args === null) return {};
  if (typeof args !== 'object' || Array.isArray(args)) throw new Error('Tool arguments must be an object');
  return args;
}

function requiredString(args, name) {
  const value = args[name];
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${name} must be a non-empty string`);
  return value;
}

function optionalString(args, name) {
  const value = args[name];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${name} must be a non-empty string`);
  return value;
}

function optionalText(args, name) {
  const value = args[name];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error(`${name} must be a string`);
  return value;
}

function optionalBoolean(args, name, fallback = undefined) {
  const value = args[name];
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new Error(`${name} must be boolean`);
  return value;
}

function requiredNumber(args, name) {
  const value = args[name];
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${name} must be a finite number`);
  return value;
}

function optionalNumber(args, name, fallback = undefined) {
  const value = args[name];
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${name} must be a finite number`);
  return value;
}

function optionalInteger(args, name, fallback = undefined) {
  const value = args[name];
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value)) throw new Error(`${name} must be an integer`);
  return value;
}

function enumValue(args, name, allowed, fallback = undefined) {
  const value = args[name] ?? fallback;
  if (value === undefined) return undefined;
  if (!allowed.includes(value)) throw new Error(`${name} must be one of: ${allowed.join(', ')}`);
  return value;
}

function plainObject(args, name) {
  const value = args[name];
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be an object`);
  return value;
}

function optionalPlainObject(args, name, fallback = undefined) {
  const value = args[name];
  if (value === undefined) return fallback;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be an object`);
  return value;
}

function selector(args, idKey, nameKey, obsIdKey, obsNameKey, label, { required = true } = {}) {
  const id = optionalString(args, idKey);
  const name = optionalString(args, nameKey);
  if (id && name) throw new Error(`Specify only one of ${idKey} or ${nameKey}`);
  if (!id && !name) {
    if (required) throw new Error(`Specify ${idKey} or ${nameKey}`);
    return null;
  }
  return id ? { [obsIdKey]: id } : { [obsNameKey]: name };
}

function sceneSelector(args, options) {
  return selector(args, 'sceneId', 'sceneName', 'sceneUuid', 'sceneName', 'scene', options);
}

function inputSelector(args) {
  return selector(args, 'inputId', 'inputName', 'inputUuid', 'inputName', 'input');
}

function sourceSelector(args) {
  return selector(args, 'sourceId', 'sourceName', 'sourceUuid', 'sourceName', 'source');
}

function groupSelector(args) {
  return selector(args, 'groupId', 'groupName', 'sceneUuid', 'sceneName', 'group');
}

function destinationSceneSelector(args) {
  const id = optionalString(args, 'destinationSceneId');
  const name = optionalString(args, 'destinationSceneName');
  if (id && name) throw new Error('Specify only one of destinationSceneId or destinationSceneName');
  if (id) return { destinationSceneUuid: id };
  if (name) return { destinationSceneName: name };
  return {};
}

async function resolveInputReference(obs, args) {
  const ref = inputSelector(args);
  const data = await obs.call('GetInputList', {});
  const found = (data.inputs ?? []).find((item) => ref.inputUuid ? item.inputUuid === ref.inputUuid : item.inputName === ref.inputName);
  if (!found) throw new Error(`OBS input not found: ${ref.inputUuid ?? ref.inputName}`);
  return { ref: { inputUuid: found.inputUuid }, input: found };
}

function safeInputKind(input) {
  return input?.unversionedInputKind ?? input?.inputKind?.replace(/_v\d+$/, '') ?? null;
}

function validateSafeRawInputSettings(input, settings) {
  const kind = safeInputKind(input);
  const allowed = SAFE_RAW_INPUT_SETTINGS.get(kind);
  if (!allowed) {
    throw new Error(`Raw input settings are not permitted for input kind ${input?.inputKind ?? 'unknown'}. Use a dedicated safe tool instead.`);
  }
  for (const key of Object.keys(settings)) {
    if (!allowed.has(key)) {
      throw new Error(`Raw setting ${key} is not permitted for ${kind}. Use a dedicated safe tool instead.`);
    }
  }
}

function mediaSelector(args) {
  return selector(args, 'mediaId', 'mediaName', 'inputUuid', 'inputName', 'media');
}

async function resolveMediaReference(obs, args) {
  const ref = mediaSelector(args);
  const data = await obs.call('GetInputList', {});
  const found = (data.inputs ?? []).find((item) => ref.inputUuid ? item.inputUuid === ref.inputUuid : item.inputName === ref.inputName);
  if (!found) throw new Error(`Media input not found: ${ref.inputUuid ?? ref.inputName}`);
  if (found.inputKind !== 'ffmpeg_source' && found.unversionedInputKind !== 'ffmpeg_source') {
    throw new Error(`Input is not a Media Source: ${ref.inputUuid ?? ref.inputName}`);
  }
  return { ref: { inputUuid: found.inputUuid }, mediaId: found.inputUuid, mediaName: found.inputName };
}

function textSelector(args) {
  return selector(args, 'textId', 'textName', 'inputUuid', 'inputName', 'text');
}

function imageSelector(args) {
  return selector(args, 'imageId', 'imageName', 'inputUuid', 'inputName', 'image');
}

function colorSelector(args) {
  return selector(args, 'colorId', 'colorName', 'inputUuid', 'inputName', 'color');
}

function isImageInput(input) {
  return input?.unversionedInputKind === 'image_source' || input?.inputKind === 'image_source';
}

function isColorInput(input) {
  return input?.unversionedInputKind === 'color_source' || /^color_source(?:_v\d+)?$/.test(input?.inputKind ?? '');
}

async function resolveTypedInput(obs, rawRef, predicate, label) {
  const data = await obs.call('GetInputList', {});
  const found = (data.inputs ?? []).find((item) => rawRef.inputUuid ? item.inputUuid === rawRef.inputUuid : item.inputName === rawRef.inputName);
  if (!found) throw new Error(`${label} input not found: ${rawRef.inputUuid ?? rawRef.inputName}`);
  if (!predicate(found)) throw new Error(`Input is not ${label}: ${rawRef.inputUuid ?? rawRef.inputName}`);
  return { ref: { inputUuid: found.inputUuid }, input: found };
}

async function resolveImageReference(obs, args) {
  const resolved = await resolveTypedInput(obs, imageSelector(args), isImageInput, 'an Image Source');
  return { ...resolved, imageId: resolved.input.inputUuid, imageName: resolved.input.inputName };
}

async function resolveColorReference(obs, args) {
  const resolved = await resolveTypedInput(obs, colorSelector(args), isColorInput, 'a Color Source');
  return { ...resolved, colorId: resolved.input.inputUuid, colorName: resolved.input.inputName };
}

function isGdiTextInput(input) {
  return input?.unversionedInputKind === 'text_gdiplus' || /^text_gdiplus(?:_v\d+)?$/.test(input?.inputKind ?? '');
}

async function resolveTextReference(obs, args) {
  const ref = textSelector(args);
  const data = await obs.call('GetInputList', {});
  const found = (data.inputs ?? []).find((item) => ref.inputUuid ? item.inputUuid === ref.inputUuid : item.inputName === ref.inputName);
  if (!found) throw new Error(`Text input not found: ${ref.inputUuid ?? ref.inputName}`);
  if (!isGdiTextInput(found)) throw new Error(`Input is not a Windows GDI+ text source: ${ref.inputUuid ?? ref.inputName}`);
  return { ref: { inputUuid: found.inputUuid }, input: found, textId: found.inputUuid, textName: found.inputName };
}

async function latestGdiTextInputKind(obs) {
  const data = await obs.call('GetInputKindList', {});
  const kinds = (data.inputKinds ?? []).filter((kind) => /^text_gdiplus(?:_v\d+)?$/.test(kind));
  if (kinds.length === 0) {
    throw new Error('OBS GDI+ text source is unavailable. The Windows obs-text plugin must be loaded.');
  }
  kinds.sort((a, b) => {
    const av = Number(/^text_gdiplus_v(\d+)$/.exec(a)?.[1] ?? 0);
    const bv = Number(/^text_gdiplus_v(\d+)$/.exec(b)?.[1] ?? 0);
    return bv - av;
  });
  return kinds[0];
}

async function latestColorInputKind(obs) {
  const data = await obs.call('GetInputKindList', {});
  const kinds = (data.inputKinds ?? []).filter((kind) => /^color_source(?:_v\d+)?$/.test(kind));
  if (kinds.length === 0) throw new Error('OBS Color Source is unavailable. The image-source plugin must be loaded.');
  kinds.sort((a, b) => {
    const av = Number(/^color_source_v(\d+)$/.exec(a)?.[1] ?? 0);
    const bv = Number(/^color_source_v(\d+)$/.exec(b)?.[1] ?? 0);
    return bv - av;
  });
  return kinds[0];
}

function textNameFor(text) {
  const compact = text.replace(/[\u0000-\u001f]+/g, ' ').trim().replace(/\s+/g, ' ').slice(0, 32);
  return `${compact || 'Text'} [${randomUUID().slice(0, 8)}]`;
}

function inputNameForFile(file, prefix) {
  const tail = file.split(/[\\/]/).filter(Boolean).at(-1) || prefix;
  const cleaned = tail.replace(/[\u0000-\u001f]/g, '').slice(0, 48) || prefix;
  return `${cleaned} [${randomUUID().slice(0, 8)}]`;
}

function colorArgument(args, name) {
  const value = args[name];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !/^#?[0-9A-Fa-f]{6}$/.test(value)) {
    throw new Error(`${name} must be an RGB color in #RRGGBB form`);
  }
  const rgb = Number.parseInt(value.replace(/^#/, ''), 16);
  const red = (rgb >> 16) & 0xFF;
  const green = (rgb >> 8) & 0xFF;
  const blue = rgb & 0xFF;
  return (blue << 16) | (green << 8) | red;
}

function colorString(value, fallback) {
  const bgr = (Number.isFinite(value) ? Number(value) : fallback) & 0xFFFFFF;
  const red = bgr & 0xFF;
  const green = (bgr >> 8) & 0xFF;
  const blue = (bgr >> 16) & 0xFF;
  const rgb = (red << 16) | (green << 8) | blue;
  return `#${rgb.toString(16).padStart(6, '0').toUpperCase()}`;
}

function colorSourcePacked(args, currentValue = 0xFFFFFFFF, { creating = false } = {}) {
  const rgb = colorArgument(args, 'color');
  const opacity = optionalInteger(args, 'opacity');
  validatePercent(opacity, 'opacity');
  if (rgb === undefined && opacity === undefined && !creating) return undefined;
  const current = Number.isFinite(currentValue) ? Number(currentValue) >>> 0 : 0xFFFFFFFF;
  const low = rgb ?? (current & 0xFFFFFF);
  const currentAlpha = (current >>> 24) & 0xFF;
  const alpha = opacity === undefined ? currentAlpha : Math.round(opacity * 255 / 100);
  return (((alpha & 0xFF) << 24) | low) >>> 0;
}

function normalizeColorSourceSettings(settings = {}) {
  const packed = Number.isFinite(settings.color) ? Number(settings.color) >>> 0 : 0xFFFFFFFF;
  return {
    color: colorString(packed, 0xFFFFFF),
    opacity: Math.round(((packed >>> 24) & 0xFF) * 100 / 255),
    width: settings.width ?? null,
    height: settings.height ?? null,
  };
}

function validatePercent(value, name) {
  if (value !== undefined && (value < 0 || value > 100)) throw new Error(`${name} must be from 0 through 100`);
}

function buildTextInputSettings(args, currentSettings = null, { creating = false } = {}) {
  const settings = {};
  const text = optionalText(args, 'text');
  if (text !== undefined) settings.text = text;

  const fontName = optionalString(args, 'fontName');
  const fontStyle = optionalText(args, 'fontStyle');
  const fontSize = optionalInteger(args, 'fontSize');
  const bold = optionalBoolean(args, 'bold');
  const italic = optionalBoolean(args, 'italic');
  const underline = optionalBoolean(args, 'underline');
  const strikeout = optionalBoolean(args, 'strikeout');
  const fontChanged = [fontName, fontStyle, fontSize, bold, italic, underline, strikeout].some((value) => value !== undefined);
  if (fontSize !== undefined && (fontSize < 1 || fontSize > 4096)) throw new Error('fontSize must be from 1 through 4096');
  if (fontChanged) {
    const previous = currentSettings?.font ?? {};
    let flags = Number.isSafeInteger(previous.flags) ? previous.flags : 0;
    const applyFlag = (value, mask) => {
      if (value === undefined) return;
      flags = value ? (flags | mask) : (flags & ~mask);
    };
    applyFlag(bold, OBS_FONT_BOLD);
    applyFlag(italic, OBS_FONT_ITALIC);
    applyFlag(underline, OBS_FONT_UNDERLINE);
    applyFlag(strikeout, OBS_FONT_STRIKEOUT);
    settings.font = {
      face: fontName ?? previous.face ?? 'Arial',
      style: fontStyle ?? previous.style ?? '',
      size: fontSize ?? previous.size ?? 256,
      flags,
    };
  }

  const textColor = colorArgument(args, 'textColor');
  const textOpacity = optionalInteger(args, 'textOpacity');
  const backgroundColor = colorArgument(args, 'backgroundColor');
  let backgroundOpacity = optionalInteger(args, 'backgroundOpacity');
  const outline = optionalBoolean(args, 'outline');
  const outlineSize = optionalInteger(args, 'outlineSize');
  const outlineColor = colorArgument(args, 'outlineColor');
  const outlineOpacity = optionalInteger(args, 'outlineOpacity');
  const align = enumValue(args, 'align', ['left', 'center', 'right']);
  const verticalAlign = enumValue(args, 'verticalAlign', ['top', 'center', 'bottom']);
  const antialiasing = optionalBoolean(args, 'antialiasing');

  validatePercent(textOpacity, 'textOpacity');
  validatePercent(backgroundOpacity, 'backgroundOpacity');
  validatePercent(outlineOpacity, 'outlineOpacity');
  if (outlineSize !== undefined && (outlineSize < 1 || outlineSize > 20)) throw new Error('outlineSize must be from 1 through 20');
  if (creating && backgroundColor !== undefined && backgroundOpacity === undefined) backgroundOpacity = 100;

  if (textColor !== undefined) settings.color = textColor;
  if (textOpacity !== undefined) settings.opacity = textOpacity;
  if (backgroundColor !== undefined) settings.bk_color = backgroundColor;
  if (backgroundOpacity !== undefined) settings.bk_opacity = backgroundOpacity;
  if (outline !== undefined) settings.outline = outline;
  else if (creating && (outlineSize !== undefined || outlineColor !== undefined || outlineOpacity !== undefined)) settings.outline = true;
  if (outlineSize !== undefined) settings.outline_size = outlineSize;
  if (outlineColor !== undefined) settings.outline_color = outlineColor;
  if (outlineOpacity !== undefined) settings.outline_opacity = outlineOpacity;
  if (align !== undefined) settings.align = align;
  if (verticalAlign !== undefined) settings.valign = verticalAlign;
  if (antialiasing !== undefined) settings.antialiasing = antialiasing;
  return settings;
}

function normalizeTextSettings(settings = {}) {
  const font = settings.font ?? {};
  const flags = Number.isSafeInteger(font.flags) ? font.flags : 0;
  return {
    text: settings.text ?? '',
    font: {
      name: font.face ?? null,
      style: font.style ?? '',
      size: font.size ?? null,
      bold: (flags & OBS_FONT_BOLD) !== 0,
      italic: (flags & OBS_FONT_ITALIC) !== 0,
      underline: (flags & OBS_FONT_UNDERLINE) !== 0,
      strikeout: (flags & OBS_FONT_STRIKEOUT) !== 0,
    },
    textColor: colorString(settings.color, 0xFFFFFF),
    textOpacity: settings.opacity ?? 100,
    backgroundColor: colorString(settings.bk_color, 0x000000),
    backgroundOpacity: settings.bk_opacity ?? 0,
    outline: {
      enabled: settings.outline ?? false,
      size: settings.outline_size ?? 2,
      color: colorString(settings.outline_color, 0xFFFFFF),
      opacity: settings.outline_opacity ?? 100,
    },
    align: settings.align ?? 'left',
    verticalAlign: settings.valign ?? 'top',
    antialiasing: settings.antialiasing ?? true,
  };
}

async function getSourcePlacements(obs, sourceId) {
  const sceneData = await obs.call('GetSceneList');
  const sceneLists = await Promise.all((sceneData.scenes ?? []).map(async (scene) => {
    const items = await obs.call('GetSceneItemList', { sceneUuid: scene.sceneUuid });
    return { scene, items: items.sceneItems ?? [] };
  }));
  const placements = [];
  for (const { scene, items } of sceneLists) {
    for (const item of items) {
      if (item.sourceUuid !== sourceId) continue;
      placements.push({
        sceneId: scene.sceneUuid,
        sceneName: scene.sceneName,
        sceneItemId: item.sceneItemId,
        sceneItemIndex: item.sceneItemIndex,
        enabled: item.sceneItemEnabled,
        locked: item.sceneItemLocked,
        transform: item.sceneItemTransform,
      });
    }
  }
  return placements;
}

async function resolveSourcePlacement(obs, sourceId, args, label = 'source') {
  const requestedScene = sceneSelector(args, { required: false });
  const requestedItemId = optionalInteger(args, 'sceneItemId');
  if (requestedItemId !== undefined && requestedItemId < 0) throw new Error('sceneItemId must be >= 0');
  if (requestedScene) {
    const data = await obs.call('GetSceneItemList', requestedScene);
    let matches = (data.sceneItems ?? []).filter((item) => item.sourceUuid === sourceId);
    if (requestedItemId !== undefined) matches = matches.filter((item) => item.sceneItemId === requestedItemId);
    if (matches.length === 0) throw new Error(`The ${label} is not placed in the specified scene/sceneItemId`);
    if (matches.length > 1) throw new Error(`The ${label} appears multiple times in that scene; specify sceneItemId`);
    return { sceneRef: requestedScene, sceneItemId: matches[0].sceneItemId };
  }
  let placements = await getSourcePlacements(obs, sourceId);
  if (requestedItemId !== undefined) placements = placements.filter((item) => item.sceneItemId === requestedItemId);
  if (placements.length === 0) throw new Error(`No scene placement was found for this ${label}`);
  if (placements.length > 1) throw new Error(`The ${label} has multiple scene placements; specify sceneId/sceneName and optionally sceneItemId`);
  return { sceneRef: { sceneUuid: placements[0].sceneId }, sceneItemId: placements[0].sceneItemId };
}

async function resolveTextPlacement(obs, textId, args) {
  return resolveSourcePlacement(obs, textId, args, 'text source');
}

async function getVisualInputInfo(obs, resolved, normalizer) {
  const [settingsData, active, placements] = await Promise.all([
    obs.call('GetInputSettings', resolved.ref),
    obs.call('GetSourceActive', { sourceUuid: resolved.input.inputUuid }),
    getSourcePlacements(obs, resolved.input.inputUuid),
  ]);
  const settings = settingsData.inputSettings ?? {};
  return {
    inputKind: settingsData.inputKind ?? resolved.input.inputKind,
    ...normalizer(settings),
    videoActive: active.videoActive,
    videoShowing: active.videoShowing,
    placements,
    settings,
  };
}

function assertSafeFilterKind(kind) {
  if (!SAFE_FILTER_KIND_SET.has(kind)) {
    throw new Error(`Filter kind ${kind ?? 'unknown'} is not permitted by obs-control. Allowed kinds: ${SAFE_FILTER_KINDS.join(', ')}`);
  }
}

async function getFilter(obs, ref, filterName) {
  return obs.call('GetSourceFilter', { ...ref, filterName });
}

async function getTextInfo(obs, resolved) {
  const [settingsData, active, placements] = await Promise.all([
    obs.call('GetInputSettings', resolved.ref),
    obs.call('GetSourceActive', { sourceUuid: resolved.textId }),
    getSourcePlacements(obs, resolved.textId),
  ]);
  const settings = settingsData.inputSettings ?? {};
  return {
    textId: resolved.textId,
    textName: resolved.textName,
    inputKind: resolved.input.inputKind,
    ...normalizeTextSettings(settings),
    videoActive: active.videoActive,
    videoShowing: active.videoShowing,
    placements,
    settings,
  };
}

function normalizedScene(scene) {
  return {
    sceneId: scene.sceneUuid,
    sceneName: scene.sceneName,
    sceneIndex: scene.sceneIndex,
  };
}

function normalizedInput(input) {
  return {
    inputId: input.inputUuid,
    inputName: input.inputName,
    inputKind: input.inputKind,
    unversionedInputKind: input.unversionedInputKind,
    inputKindCaps: input.inputKindCaps,
  };
}

function audioTracks(args) {
  const value = args.tracks;
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('tracks must be an object');
  const result = {};
  for (const [key, enabled] of Object.entries(value)) {
    if (!/^[1-6]$/.test(key)) throw new Error('tracks keys must be from "1" through "6"');
    if (typeof enabled !== 'boolean') throw new Error(`tracks.${key} must be boolean`);
    result[key] = enabled;
  }
  if (Object.keys(result).length === 0) throw new Error('tracks must contain at least one track');
  return result;
}

async function getAudioMixerState(obs, ref, input = {}) {
  const [mute, volume, balance, syncOffset, monitor, tracks] = await Promise.all([
    obs.call('GetInputMute', ref),
    obs.call('GetInputVolume', ref),
    obs.call('GetInputAudioBalance', ref),
    obs.call('GetInputAudioSyncOffset', ref),
    obs.call('GetInputAudioMonitorType', ref),
    obs.call('GetInputAudioTracks', ref),
  ]);
  return {
    inputId: input.inputUuid ?? ref.inputUuid ?? null,
    inputName: input.inputName ?? ref.inputName ?? null,
    inputKind: input.inputKind ?? null,
    muted: mute.inputMuted,
    volumeDb: volume.inputVolumeDb,
    volumeMul: volume.inputVolumeMul,
    balance: balance.inputAudioBalance,
    syncOffsetMs: syncOffset.inputAudioSyncOffset,
    monitorType: monitor.monitorType,
    tracks: tracks.inputAudioTracks,
  };
}

function mediaNameFor(source) {
  const withoutQuery = source.split(/[?#]/, 1)[0];
  const tail = withoutQuery.split(/[\\/]/).filter(Boolean).at(-1) || 'media';
  const cleaned = tail.replace(/[\u0000-\u001f]/g, '').slice(0, 48) || 'media';
  return `${cleaned} [${randomUUID().slice(0, 8)}]`;
}

function sourceMode(source, requested) {
  if (requested !== 'auto') return requested;
  return /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(source) ? 'network' : 'local';
}

function buildTransform(args) {
  const transform = {};
  const x = optionalNumber(args, 'x');
  const y = optionalNumber(args, 'y');
  const width = optionalNumber(args, 'width');
  const height = optionalNumber(args, 'height');
  const scaleX = optionalNumber(args, 'scaleX');
  const scaleY = optionalNumber(args, 'scaleY');
  const rotation = optionalNumber(args, 'rotation');
  if ((width === undefined) !== (height === undefined)) throw new Error('width and height must be provided together');
  if (width !== undefined && (width <= 0 || height <= 0)) throw new Error('width and height must be > 0');
  if (x !== undefined) transform.positionX = x;
  if (y !== undefined) transform.positionY = y;
  if (scaleX !== undefined) transform.scaleX = scaleX;
  if (scaleY !== undefined) transform.scaleY = scaleY;
  if (rotation !== undefined) transform.rotation = rotation;
  if (width !== undefined) {
    const fit = enumValue(args, 'fit', ['contain', 'cover', 'stretch'], 'contain');
    transform.boundsType = FIT_BOUNDS[fit];
    transform.boundsWidth = width;
    transform.boundsHeight = height;
    transform.alignment = TOP_LEFT_ALIGNMENT;
    transform.boundsAlignment = TOP_LEFT_ALIGNMENT;
  }
  for (const field of ['cropLeft', 'cropRight', 'cropTop', 'cropBottom']) {
    const value = optionalInteger(args, field);
    if (value !== undefined) transform[field] = value;
  }
  return transform;
}

function parsePng(bytes) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(signature) || bytes.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { mimeType: 'image/png', width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function parseJpeg(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const frames = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 3 < bytes.length) {
    while (offset < bytes.length && bytes[offset] !== 0xff) offset += 1;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) break;
    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 1 >= bytes.length) break;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) break;
    if (frames.has(marker) && length >= 7) {
      return { mimeType: 'image/jpeg', height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5) };
    }
    offset += length;
  }
  return null;
}

function parseWebp(bytes) {
  if (bytes.length < 30 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') return null;
  const type = bytes.toString('ascii', 12, 16);
  if (type === 'VP8X') return { mimeType: 'image/webp', width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
  if (type === 'VP8L' && bytes[20] === 0x2f) {
    const bits = bytes.readUInt32LE(21);
    return { mimeType: 'image/webp', width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (type === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return { mimeType: 'image/webp', width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  }
  return null;
}

function decodeScreenshot(imageData) {
  if (typeof imageData !== 'string') throw new Error('OBS returned screenshot data in an unexpected format');
  const match = /^data:(image\/[A-Za-z0-9.+-]+);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(imageData);
  if (!match) throw new Error('OBS returned an invalid screenshot data URL');
  const encoded = match[2].replace(/[\r\n]/g, '');
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length === 0) throw new Error('OBS returned an empty screenshot');
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error(`OBS screenshot exceeds the ${MAX_IMAGE_BYTES}-byte MCP image limit`);
  const detected = parsePng(bytes) ?? parseJpeg(bytes) ?? parseWebp(bytes);
  if (!detected || detected.width <= 0 || detected.height <= 0) throw new Error('OBS screenshot is not a supported PNG, JPEG, or WebP image');
  return { bytes, ...detected };
}

function okResult(result) {
  const structuredContent = { ok: true, result };
  return {
    content: [{ type: 'text', text: JSON.stringify(structuredContent) }],
    structuredContent,
    isError: false,
  };
}

function imageResult(result, bytes, mimeType) {
  const structuredContent = { ok: true, result };
  return {
    content: [
      { type: 'text', text: JSON.stringify(structuredContent) },
      { type: 'image', data: bytes.toString('base64'), mimeType },
    ],
    structuredContent,
    isError: false,
  };
}

export function errorResult(error) {
  const message = error instanceof Error ? error.message : String(error);
  const structuredContent = { ok: false, error: message };
  return {
    content: [{ type: 'text', text: JSON.stringify(structuredContent) }],
    structuredContent,
    isError: true,
  };
}

export function createToolHandler({ obs, ranges }) {
  return async (toolName, rawArgs) => {
    const args = argsObject(rawArgs);
    switch (toolName) {
      case 'obs_status': {
        const connection = await obs.connect();
        const version = await obs.call('GetVersion');
        return okResult({ url: obs.url, connection, ...version, activeRanges: ranges.list() });
      }
      case 'stats_get': {
        return okResult(await obs.call('GetStats'));
      }
      case 'video_settings_get': {
        const data = await obs.call('GetVideoSettings');
        const fps = Number.isFinite(data.fpsNumerator) && Number.isFinite(data.fpsDenominator) && data.fpsDenominator !== 0
          ? data.fpsNumerator / data.fpsDenominator
          : null;
        return okResult({ ...data, fps });
      }
      case 'scene_list': {
        const data = await obs.call('GetSceneList');
        return okResult({
          currentProgramSceneId: data.currentProgramSceneUuid ?? null,
          currentProgramSceneName: data.currentProgramSceneName ?? null,
          currentPreviewSceneId: data.currentPreviewSceneUuid ?? null,
          currentPreviewSceneName: data.currentPreviewSceneName ?? null,
          scenes: (data.scenes ?? []).map(normalizedScene),
        });
      }
      case 'group_list': {
        const data = await obs.call('GetGroupList');
        return okResult({ groups: data.groups ?? [] });
      }
      case 'group_item_list': {
        const ref = groupSelector(args);
        const data = await obs.call('GetGroupSceneItemList', ref);
        return okResult({ ...ref, sceneItems: data.sceneItems ?? [] });
      }
      case 'scene_create': {
        const sceneName = requiredString(args, 'sceneName');
        const data = await obs.call('CreateScene', { sceneName });
        return okResult({ sceneId: data.sceneUuid, sceneName });
      }
      case 'scene_delete': {
        const ref = sceneSelector(args);
        await obs.call('RemoveScene', ref);
        return okResult({ removed: true, ...ref });
      }
      case 'scene_set_current': {
        const ref = sceneSelector(args);
        await obs.call('SetCurrentProgramScene', ref);
        return okResult({ current: true, ...ref });
      }
      case 'scene_rename': {
        const ref = sceneSelector(args);
        const newSceneName = requiredString(args, 'newSceneName');
        await obs.call('SetSceneName', { ...ref, newSceneName });
        return okResult({ renamed: true, ...ref, newSceneName });
      }
      case 'scene_item_list': {
        const ref = sceneSelector(args);
        const data = await obs.call('GetSceneItemList', ref);
        return okResult({ ...ref, sceneItems: data.sceneItems ?? [] });
      }
      case 'scene_item_add_existing': {
        const sceneRef = sceneSelector(args);
        const sourceRef = sourceSelector(args);
        const enabled = optionalBoolean(args, 'enabled', true);
        const created = await obs.call('CreateSceneItem', {
          ...sceneRef,
          ...sourceRef,
          sceneItemEnabled: enabled,
        });
        const placement = buildTransform(args);
        if (Object.keys(placement).length > 0) {
          await obs.call('SetSceneItemTransform', {
            ...sceneRef,
            sceneItemId: created.sceneItemId,
            sceneItemTransform: placement,
          });
        }
        const transform = await obs.call('GetSceneItemTransform', { ...sceneRef, sceneItemId: created.sceneItemId });
        return okResult({ ...sceneRef, ...sourceRef, sceneItemId: created.sceneItemId, enabled, transform: transform.sceneItemTransform });
      }
      case 'scene_item_duplicate': {
        const sceneRef = sceneSelector(args);
        const sceneItemId = optionalInteger(args, 'sceneItemId');
        if (sceneItemId === undefined || sceneItemId < 0) throw new Error('sceneItemId must be >= 0');
        const destination = destinationSceneSelector(args);
        const duplicated = await obs.call('DuplicateSceneItem', { ...sceneRef, sceneItemId, ...destination });
        let targetRef = sceneRef;
        if (destination.destinationSceneUuid) targetRef = { sceneUuid: destination.destinationSceneUuid };
        else if (destination.destinationSceneName) targetRef = { sceneName: destination.destinationSceneName };
        const transform = await obs.call('GetSceneItemTransform', { ...targetRef, sceneItemId: duplicated.sceneItemId });
        return okResult({ sourceSceneItemId: sceneItemId, sceneItemId: duplicated.sceneItemId, ...targetRef, transform: transform.sceneItemTransform });
      }
      case 'scene_item_remove': {
        const ref = sceneSelector(args);
        const sceneItemId = optionalInteger(args, 'sceneItemId');
        if (sceneItemId === undefined || sceneItemId < 0) throw new Error('sceneItemId must be >= 0');
        await obs.call('RemoveSceneItem', { ...ref, sceneItemId });
        return okResult({ removed: true, sceneItemId, ...ref });
      }
      case 'scene_item_transform_get': {
        const ref = sceneSelector(args);
        const sceneItemId = optionalInteger(args, 'sceneItemId');
        if (sceneItemId === undefined || sceneItemId < 0) throw new Error('sceneItemId must be >= 0');
        const data = await obs.call('GetSceneItemTransform', { ...ref, sceneItemId });
        return okResult({ sceneItemId, ...ref, transform: data.sceneItemTransform });
      }
      case 'scene_item_transform_set': {
        const ref = sceneSelector(args);
        const sceneItemId = optionalInteger(args, 'sceneItemId');
        if (sceneItemId === undefined || sceneItemId < 0) throw new Error('sceneItemId must be >= 0');
        const sceneItemTransform = buildTransform(args);
        if (Object.keys(sceneItemTransform).length === 0) throw new Error('No transform fields were provided');
        await obs.call('SetSceneItemTransform', { ...ref, sceneItemId, sceneItemTransform });
        const data = await obs.call('GetSceneItemTransform', { ...ref, sceneItemId });
        return okResult({ sceneItemId, ...ref, transform: data.sceneItemTransform });
      }
      case 'scene_item_enabled_set': {
        const ref = sceneSelector(args);
        const sceneItemId = optionalInteger(args, 'sceneItemId');
        const enabled = optionalBoolean(args, 'enabled');
        if (sceneItemId === undefined || sceneItemId < 0) throw new Error('sceneItemId must be >= 0');
        if (enabled === undefined) throw new Error('enabled is required');
        await obs.call('SetSceneItemEnabled', { ...ref, sceneItemId, sceneItemEnabled: enabled });
        return okResult({ sceneItemId, enabled, ...ref });
      }
      case 'scene_item_index_set': {
        const ref = sceneSelector(args);
        const sceneItemId = optionalInteger(args, 'sceneItemId');
        const index = optionalInteger(args, 'index');
        if (sceneItemId === undefined || sceneItemId < 0) throw new Error('sceneItemId must be >= 0');
        if (index === undefined || index < 0) throw new Error('index must be >= 0');
        await obs.call('SetSceneItemIndex', { ...ref, sceneItemId, sceneItemIndex: index });
        return okResult({ sceneItemId, index, ...ref });
      }
      case 'scene_item_lock_get': {
        const ref = sceneSelector(args);
        const sceneItemId = optionalInteger(args, 'sceneItemId');
        if (sceneItemId === undefined || sceneItemId < 0) throw new Error('sceneItemId must be >= 0');
        const data = await obs.call('GetSceneItemLocked', { ...ref, sceneItemId });
        return okResult({ ...ref, sceneItemId, locked: data.sceneItemLocked });
      }
      case 'scene_item_lock_set': {
        const ref = sceneSelector(args);
        const sceneItemId = optionalInteger(args, 'sceneItemId');
        const locked = optionalBoolean(args, 'locked');
        if (sceneItemId === undefined || sceneItemId < 0) throw new Error('sceneItemId must be >= 0');
        if (locked === undefined) throw new Error('locked is required');
        await obs.call('SetSceneItemLocked', { ...ref, sceneItemId, sceneItemLocked: locked });
        return okResult({ ...ref, sceneItemId, locked });
      }
      case 'scene_item_blend_get': {
        const ref = sceneSelector(args);
        const sceneItemId = optionalInteger(args, 'sceneItemId');
        if (sceneItemId === undefined || sceneItemId < 0) throw new Error('sceneItemId must be >= 0');
        const data = await obs.call('GetSceneItemBlendMode', { ...ref, sceneItemId });
        return okResult({
          ...ref,
          sceneItemId,
          blendMode: OBS_TO_BLEND_MODE[data.sceneItemBlendMode] ?? data.sceneItemBlendMode,
          obsBlendMode: data.sceneItemBlendMode,
        });
      }
      case 'scene_item_blend_set': {
        const ref = sceneSelector(args);
        const sceneItemId = optionalInteger(args, 'sceneItemId');
        const blendMode = enumValue(args, 'blendMode', BLEND_MODES);
        if (sceneItemId === undefined || sceneItemId < 0) throw new Error('sceneItemId must be >= 0');
        await obs.call('SetSceneItemBlendMode', { ...ref, sceneItemId, sceneItemBlendMode: BLEND_MODE_TO_OBS[blendMode] });
        return okResult({ ...ref, sceneItemId, blendMode, obsBlendMode: BLEND_MODE_TO_OBS[blendMode] });
      }
      case 'input_list': {
        const inputKind = optionalString(args, 'inputKind');
        const data = await obs.call('GetInputList', inputKind ? { inputKind } : {});
        return okResult({ inputs: (data.inputs ?? []).map(normalizedInput) });
      }
      case 'input_rename': {
        const resolved = await resolveInputReference(obs, args);
        const newInputName = requiredString(args, 'newInputName');
        await obs.call('SetInputName', { ...resolved.ref, newInputName });
        return okResult({ inputId: resolved.input.inputUuid, oldInputName: resolved.input.inputName, inputName: newInputName });
      }
      case 'input_settings_get': {
        const ref = inputSelector(args);
        const data = await obs.call('GetInputSettings', ref);
        return okResult({ ...ref, inputKind: data.inputKind, settings: data.inputSettings });
      }
      case 'input_settings_set': {
        const resolved = await resolveInputReference(obs, args);
        const settings = plainObject(args, 'settings');
        const overlay = optionalBoolean(args, 'overlay', true);
        validateSafeRawInputSettings(resolved.input, settings);
        await obs.call('SetInputSettings', { ...resolved.ref, inputSettings: settings, overlay });
        const data = await obs.call('GetInputSettings', resolved.ref);
        return okResult({ inputId: resolved.input.inputUuid, inputName: resolved.input.inputName, inputKind: data.inputKind, settings: data.inputSettings });
      }
      case 'input_audio_get': {
        const ref = inputSelector(args);
        const [mute, volume] = await Promise.all([obs.call('GetInputMute', ref), obs.call('GetInputVolume', ref)]);
        return okResult({ ...ref, muted: mute.inputMuted, volumeDb: volume.inputVolumeDb, volumeMul: volume.inputVolumeMul });
      }
      case 'input_audio_set': {
        const ref = inputSelector(args);
        const muted = optionalBoolean(args, 'muted');
        const volumeDb = optionalNumber(args, 'volumeDb');
        const volumeMul = optionalNumber(args, 'volumeMul');
        if (muted === undefined && volumeDb === undefined && volumeMul === undefined) throw new Error('Provide muted, volumeDb, or volumeMul');
        if (volumeDb !== undefined && volumeMul !== undefined) throw new Error('Specify only one of volumeDb or volumeMul');
        if (muted !== undefined) await obs.call('SetInputMute', { ...ref, inputMuted: muted });
        if (volumeDb !== undefined) await obs.call('SetInputVolume', { ...ref, inputVolumeDb: volumeDb });
        if (volumeMul !== undefined) await obs.call('SetInputVolume', { ...ref, inputVolumeMul: volumeMul });
        const [mute, volume] = await Promise.all([obs.call('GetInputMute', ref), obs.call('GetInputVolume', ref)]);
        return okResult({ ...ref, muted: mute.inputMuted, volumeDb: volume.inputVolumeDb, volumeMul: volume.inputVolumeMul });
      }
      case 'audio_mixer_list': {
        const data = await obs.call('GetInputList', {});
        const audioInputs = (data.inputs ?? []).filter((input) => (input.inputKindCaps & OBS_SOURCE_AUDIO_CAP) !== 0);
        const inputs = await Promise.all(audioInputs.map((input) => getAudioMixerState(obs, { inputUuid: input.inputUuid }, input)));
        return okResult({ inputs });
      }
      case 'audio_mixer_get': {
        const resolved = await resolveInputReference(obs, args);
        if ((resolved.input.inputKindCaps & OBS_SOURCE_AUDIO_CAP) === 0) {
          throw new Error(`Input does not support audio: ${resolved.input.inputName}`);
        }
        return okResult(await getAudioMixerState(obs, resolved.ref, resolved.input));
      }
      case 'audio_mixer_set': {
        const resolved = await resolveInputReference(obs, args);
        if ((resolved.input.inputKindCaps & OBS_SOURCE_AUDIO_CAP) === 0) {
          throw new Error(`Input does not support audio: ${resolved.input.inputName}`);
        }
        const muted = optionalBoolean(args, 'muted');
        const volumeDb = optionalNumber(args, 'volumeDb');
        const volumeMul = optionalNumber(args, 'volumeMul');
        const balance = optionalNumber(args, 'balance');
        const syncOffsetMs = optionalInteger(args, 'syncOffsetMs');
        const monitorType = enumValue(args, 'monitorType', Object.keys(MONITOR_TYPES));
        const tracks = audioTracks(args);
        if (
          muted === undefined && volumeDb === undefined && volumeMul === undefined && balance === undefined
          && syncOffsetMs === undefined && monitorType === undefined && tracks === undefined
        ) {
          throw new Error('Provide at least one mixer property to change');
        }
        if (volumeDb !== undefined && volumeMul !== undefined) throw new Error('Specify only one of volumeDb or volumeMul');
        if (volumeDb !== undefined && (volumeDb < -100 || volumeDb > 26)) throw new Error('volumeDb must be from -100 through 26');
        if (volumeMul !== undefined && (volumeMul < 0 || volumeMul > 20)) throw new Error('volumeMul must be from 0 through 20');
        if (balance !== undefined && (balance < 0 || balance > 1)) throw new Error('balance must be from 0 through 1');
        if (syncOffsetMs !== undefined && (syncOffsetMs < -950 || syncOffsetMs > 20000)) {
          throw new Error('syncOffsetMs must be from -950 through 20000');
        }
        if (muted !== undefined) await obs.call('SetInputMute', { ...resolved.ref, inputMuted: muted });
        if (volumeDb !== undefined) await obs.call('SetInputVolume', { ...resolved.ref, inputVolumeDb: volumeDb });
        if (volumeMul !== undefined) await obs.call('SetInputVolume', { ...resolved.ref, inputVolumeMul: volumeMul });
        if (balance !== undefined) await obs.call('SetInputAudioBalance', { ...resolved.ref, inputAudioBalance: balance });
        if (syncOffsetMs !== undefined) await obs.call('SetInputAudioSyncOffset', { ...resolved.ref, inputAudioSyncOffset: syncOffsetMs });
        if (monitorType !== undefined) await obs.call('SetInputAudioMonitorType', { ...resolved.ref, monitorType: MONITOR_TYPES[monitorType] });
        if (tracks !== undefined) await obs.call('SetInputAudioTracks', { ...resolved.ref, inputAudioTracks: tracks });
        return okResult(await getAudioMixerState(obs, resolved.ref, resolved.input));
      }
      case 'audio_mixer_mute_toggle': {
        const resolved = await resolveInputReference(obs, args);
        if ((resolved.input.inputKindCaps & OBS_SOURCE_AUDIO_CAP) === 0) {
          throw new Error(`Input does not support audio: ${resolved.input.inputName}`);
        }
        await obs.call('ToggleInputMute', resolved.ref);
        return okResult(await getAudioMixerState(obs, resolved.ref, resolved.input));
      }
      case 'image_add': {
        const sceneRef = sceneSelector(args);
        const file = requiredString(args, 'file');
        if (/^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(file)) throw new Error('image_add only accepts local files, not URLs');
        const imageName = optionalString(args, 'imageName') ?? inputNameForFile(file, 'Image');
        const unloadWhenNotShowing = optionalBoolean(args, 'unloadWhenNotShowing', false);
        const linearAlpha = optionalBoolean(args, 'linearAlpha', false);
        const created = await obs.call('CreateInput', {
          ...sceneRef,
          inputName: imageName,
          inputKind: 'image_source',
          inputSettings: { file, unload: unloadWhenNotShowing, linear_alpha: linearAlpha },
          sceneItemEnabled: true,
        });
        const placement = buildTransform(args);
        if (Object.keys(placement).length > 0) {
          await obs.call('SetSceneItemTransform', {
            ...sceneRef,
            sceneItemId: created.sceneItemId,
            sceneItemTransform: placement,
          });
        }
        const transform = await obs.call('GetSceneItemTransform', { ...sceneRef, sceneItemId: created.sceneItemId });
        return okResult({
          imageId: created.inputUuid,
          imageName,
          sceneItemId: created.sceneItemId,
          file,
          unloadWhenNotShowing,
          linearAlpha,
          transform: transform.sceneItemTransform,
        });
      }
      case 'image_info': {
        const resolved = await resolveImageReference(obs, args);
        const info = await getVisualInputInfo(obs, resolved, (settings) => ({
          file: settings.file ?? null,
          unloadWhenNotShowing: settings.unload ?? false,
          linearAlpha: settings.linear_alpha ?? false,
        }));
        return okResult({ imageId: resolved.imageId, imageName: resolved.imageName, ...info });
      }
      case 'image_set': {
        const resolved = await resolveImageReference(obs, args);
        const file = optionalString(args, 'file');
        if (file && /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(file)) throw new Error('image_set only accepts local files, not URLs');
        const unloadWhenNotShowing = optionalBoolean(args, 'unloadWhenNotShowing');
        const linearAlpha = optionalBoolean(args, 'linearAlpha');
        const settings = {};
        if (file !== undefined) settings.file = file;
        if (unloadWhenNotShowing !== undefined) settings.unload = unloadWhenNotShowing;
        if (linearAlpha !== undefined) settings.linear_alpha = linearAlpha;
        const placement = buildTransform(args);
        if (Object.keys(settings).length === 0 && Object.keys(placement).length === 0) {
          throw new Error('Provide at least one image setting or placement property to change');
        }
        if (Object.keys(settings).length > 0) {
          await obs.call('SetInputSettings', { ...resolved.ref, inputSettings: settings, overlay: true });
        }
        if (Object.keys(placement).length > 0) {
          const target = await resolveSourcePlacement(obs, resolved.imageId, args, 'image source');
          await obs.call('SetSceneItemTransform', {
            ...target.sceneRef,
            sceneItemId: target.sceneItemId,
            sceneItemTransform: placement,
          });
        }
        const info = await getVisualInputInfo(obs, resolved, (current) => ({
          file: current.file ?? null,
          unloadWhenNotShowing: current.unload ?? false,
          linearAlpha: current.linear_alpha ?? false,
        }));
        return okResult({ imageId: resolved.imageId, imageName: resolved.imageName, ...info });
      }
      case 'image_remove': {
        const resolved = await resolveImageReference(obs, args);
        await obs.call('RemoveInput', resolved.ref);
        return okResult({ removed: true, imageId: resolved.imageId, imageName: resolved.imageName });
      }
      case 'color_add': {
        const sceneRef = sceneSelector(args);
        const userColor = requiredString(args, 'color');
        const width = optionalInteger(args, 'width');
        const height = optionalInteger(args, 'height');
        const opacity = optionalInteger(args, 'opacity', 100);
        if (width === undefined || width < 1 || width > 4096) throw new Error('width must be from 1 through 4096');
        if (height === undefined || height < 1 || height > 4096) throw new Error('height must be from 1 through 4096');
        validatePercent(opacity, 'opacity');
        const colorName = optionalString(args, 'colorName') ?? `Color ${userColor} [${randomUUID().slice(0, 8)}]`;
        const inputKind = await latestColorInputKind(obs);
        const packed = colorSourcePacked({ color: userColor, opacity }, 0xFFFFFFFF, { creating: true });
        const created = await obs.call('CreateInput', {
          ...sceneRef,
          inputName: colorName,
          inputKind,
          inputSettings: { color: packed, width, height },
          sceneItemEnabled: true,
        });
        const sceneItemTransform = {};
        const x = optionalNumber(args, 'x');
        const y = optionalNumber(args, 'y');
        const rotation = optionalNumber(args, 'rotation');
        if (x !== undefined) sceneItemTransform.positionX = x;
        if (y !== undefined) sceneItemTransform.positionY = y;
        if (rotation !== undefined) sceneItemTransform.rotation = rotation;
        if (Object.keys(sceneItemTransform).length > 0) {
          sceneItemTransform.alignment = TOP_LEFT_ALIGNMENT;
          await obs.call('SetSceneItemTransform', { ...sceneRef, sceneItemId: created.sceneItemId, sceneItemTransform });
        }
        const transform = await obs.call('GetSceneItemTransform', { ...sceneRef, sceneItemId: created.sceneItemId });
        return okResult({
          colorId: created.inputUuid,
          colorName,
          inputKind,
          sceneItemId: created.sceneItemId,
          color: userColor.startsWith('#') ? userColor.toUpperCase() : `#${userColor.toUpperCase()}`,
          opacity,
          width,
          height,
          transform: transform.sceneItemTransform,
        });
      }
      case 'color_info': {
        const resolved = await resolveColorReference(obs, args);
        const info = await getVisualInputInfo(obs, resolved, normalizeColorSourceSettings);
        return okResult({ colorId: resolved.colorId, colorName: resolved.colorName, ...info });
      }
      case 'color_set': {
        const resolved = await resolveColorReference(obs, args);
        const current = await obs.call('GetInputSettings', resolved.ref);
        const settings = {};
        const packed = colorSourcePacked(args, current.inputSettings?.color);
        if (packed !== undefined) settings.color = packed;
        const width = optionalInteger(args, 'width');
        const height = optionalInteger(args, 'height');
        if (width !== undefined) {
          if (width < 1 || width > 4096) throw new Error('width must be from 1 through 4096');
          settings.width = width;
        }
        if (height !== undefined) {
          if (height < 1 || height > 4096) throw new Error('height must be from 1 through 4096');
          settings.height = height;
        }
        const sceneItemTransform = {};
        const x = optionalNumber(args, 'x');
        const y = optionalNumber(args, 'y');
        const rotation = optionalNumber(args, 'rotation');
        if (x !== undefined) sceneItemTransform.positionX = x;
        if (y !== undefined) sceneItemTransform.positionY = y;
        if (rotation !== undefined) sceneItemTransform.rotation = rotation;
        if (Object.keys(settings).length === 0 && Object.keys(sceneItemTransform).length === 0) {
          throw new Error('Provide at least one color/size or placement property to change');
        }
        if (Object.keys(settings).length > 0) {
          await obs.call('SetInputSettings', { ...resolved.ref, inputSettings: settings, overlay: true });
        }
        if (Object.keys(sceneItemTransform).length > 0) {
          const target = await resolveSourcePlacement(obs, resolved.colorId, args, 'color source');
          sceneItemTransform.alignment = TOP_LEFT_ALIGNMENT;
          await obs.call('SetSceneItemTransform', {
            ...target.sceneRef,
            sceneItemId: target.sceneItemId,
            sceneItemTransform,
          });
        }
        const info = await getVisualInputInfo(obs, resolved, normalizeColorSourceSettings);
        return okResult({ colorId: resolved.colorId, colorName: resolved.colorName, ...info });
      }
      case 'color_remove': {
        const resolved = await resolveColorReference(obs, args);
        await obs.call('RemoveInput', resolved.ref);
        return okResult({ removed: true, colorId: resolved.colorId, colorName: resolved.colorName });
      }
      case 'text_add': {
        const sceneRef = sceneSelector(args);
        const text = optionalText(args, 'text');
        if (text === undefined) throw new Error('text is required');
        const textName = optionalString(args, 'textName') ?? textNameFor(text);
        const inputKind = await latestGdiTextInputKind(obs);
        const settings = buildTextInputSettings(args, null, { creating: true });
        settings.read_from_file = false;
        const created = await obs.call('CreateInput', {
          ...sceneRef,
          inputName: textName,
          inputKind,
          inputSettings: settings,
          sceneItemEnabled: true,
        });
        const placement = buildTransform(args);
        if (Object.keys(placement).length > 0) {
          await obs.call('SetSceneItemTransform', {
            ...sceneRef,
            sceneItemId: created.sceneItemId,
            sceneItemTransform: placement,
          });
        }
        const [settingsData, transformData] = await Promise.all([
          obs.call('GetInputSettings', { inputUuid: created.inputUuid }),
          obs.call('GetSceneItemTransform', { ...sceneRef, sceneItemId: created.sceneItemId }),
        ]);
        return okResult({
          textId: created.inputUuid,
          textName,
          inputKind: settingsData.inputKind ?? inputKind,
          sceneItemId: created.sceneItemId,
          ...normalizeTextSettings(settingsData.inputSettings ?? settings),
          transform: transformData.sceneItemTransform,
        });
      }
      case 'text_info': {
        const resolved = await resolveTextReference(obs, args);
        return okResult(await getTextInfo(obs, resolved));
      }
      case 'text_set': {
        const resolved = await resolveTextReference(obs, args);
        const current = await obs.call('GetInputSettings', resolved.ref);
        const settings = buildTextInputSettings(args, current.inputSettings ?? {});
        const placement = buildTransform(args);
        if (Object.keys(settings).length === 0 && Object.keys(placement).length === 0) {
          throw new Error('Provide at least one text style/content or placement property to change');
        }
        if (Object.keys(settings).length > 0) {
          await obs.call('SetInputSettings', { ...resolved.ref, inputSettings: settings, overlay: true });
        }
        if (Object.keys(placement).length > 0) {
          const target = await resolveTextPlacement(obs, resolved.textId, args);
          await obs.call('SetSceneItemTransform', {
            ...target.sceneRef,
            sceneItemId: target.sceneItemId,
            sceneItemTransform: placement,
          });
        }
        return okResult(await getTextInfo(obs, resolved));
      }
      case 'text_remove': {
        const resolved = await resolveTextReference(obs, args);
        await obs.call('RemoveInput', resolved.ref);
        return okResult({ removed: true, textId: resolved.textId, textName: resolved.textName });
      }
      case 'filter_list': {
        const ref = sourceSelector(args);
        const data = await obs.call('GetSourceFilterList', ref);
        return okResult({
          ...ref,
          filters: (data.filters ?? []).map((filter) => ({
            ...filter,
            safeForMutation: SAFE_FILTER_KIND_SET.has(filter.filterKind),
          })),
        });
      }
      case 'filter_info': {
        const ref = sourceSelector(args);
        const filterName = requiredString(args, 'filterName');
        const data = await getFilter(obs, ref, filterName);
        return okResult({ ...ref, filterName, ...data, safeForMutation: SAFE_FILTER_KIND_SET.has(data.filterKind) });
      }
      case 'filter_add': {
        const ref = sourceSelector(args);
        const filterName = requiredString(args, 'filterName');
        const filterKind = requiredString(args, 'filterKind');
        assertSafeFilterKind(filterKind);
        const settings = optionalPlainObject(args, 'settings', {});
        await obs.call('CreateSourceFilter', { ...ref, filterName, filterKind, filterSettings: settings });
        const data = await getFilter(obs, ref, filterName);
        return okResult({ ...ref, filterName, ...data, safeForMutation: true });
      }
      case 'filter_set': {
        const ref = sourceSelector(args);
        const filterName = requiredString(args, 'filterName');
        const settings = plainObject(args, 'settings');
        const overlay = optionalBoolean(args, 'overlay', true);
        const before = await getFilter(obs, ref, filterName);
        assertSafeFilterKind(before.filterKind);
        await obs.call('SetSourceFilterSettings', { ...ref, filterName, filterSettings: settings, overlay });
        const data = await getFilter(obs, ref, filterName);
        return okResult({ ...ref, filterName, ...data, safeForMutation: true });
      }
      case 'filter_enable': {
        const ref = sourceSelector(args);
        const filterName = requiredString(args, 'filterName');
        const enabled = optionalBoolean(args, 'enabled');
        if (enabled === undefined) throw new Error('enabled is required');
        const before = await getFilter(obs, ref, filterName);
        assertSafeFilterKind(before.filterKind);
        await obs.call('SetSourceFilterEnabled', { ...ref, filterName, filterEnabled: enabled });
        const data = await getFilter(obs, ref, filterName);
        return okResult({ ...ref, filterName, ...data, safeForMutation: true });
      }
      case 'filter_remove': {
        const ref = sourceSelector(args);
        const filterName = requiredString(args, 'filterName');
        const before = await getFilter(obs, ref, filterName);
        assertSafeFilterKind(before.filterKind);
        await obs.call('RemoveSourceFilter', { ...ref, filterName });
        return okResult({ removed: true, ...ref, filterName, filterKind: before.filterKind });
      }
      case 'media_list': {
        const includeSettings = optionalBoolean(args, 'includeSettings', false);
        const data = await obs.call('GetInputList', {});
        const media = (data.inputs ?? []).filter((input) => input.inputKind === 'ffmpeg_source' || input.unversionedInputKind === 'ffmpeg_source');
        const results = [];
        for (const item of media) {
          const normalized = { mediaId: item.inputUuid, mediaName: item.inputName, inputKind: item.inputKind };
          if (includeSettings) {
            const settings = await obs.call('GetInputSettings', { inputUuid: item.inputUuid });
            normalized.settings = settings.inputSettings;
          }
          results.push(normalized);
        }
        return okResult({ media: results });
      }
      case 'media_add': {
        const ref = sceneSelector(args);
        const source = requiredString(args, 'source');
        const requestedMode = enumValue(args, 'sourceMode', ['auto', 'local', 'network'], 'auto');
        const mode = sourceMode(source, requestedMode);
        const mediaName = optionalString(args, 'mediaName') ?? mediaNameFor(source);
        const loop = optionalBoolean(args, 'loop', false);
        const autoplay = optionalBoolean(args, 'autoplay', false);
        const restartOnActivate = optionalBoolean(args, 'restartOnActivate', false);
        const clearOnMediaEnd = optionalBoolean(args, 'clearOnMediaEnd', true);
        const speedPercent = optionalInteger(args, 'speedPercent', 100);
        if (speedPercent < 1 || speedPercent > 200) throw new Error('speedPercent must be from 1 through 200');
        const settings = {
          is_local_file: mode === 'local',
          looping: mode === 'local' ? loop : false,
          restart_on_activate: restartOnActivate,
          clear_on_media_end: clearOnMediaEnd,
          speed_percent: speedPercent,
        };
        if (mode === 'local') settings.local_file = source;
        else {
          settings.input = source;
          settings.seekable = optionalBoolean(args, 'networkSeekable', false);
          const inputFormat = optionalString(args, 'inputFormat');
          if (inputFormat !== undefined) settings.input_format = inputFormat;
        }
        const created = await obs.call('CreateInput', {
          ...ref,
          inputName: mediaName,
          inputKind: 'ffmpeg_source',
          inputSettings: settings,
          sceneItemEnabled: true,
        });
        const placement = buildTransform(args);
        if (Object.keys(placement).length > 0) {
          await obs.call('SetSceneItemTransform', { ...ref, sceneItemId: created.sceneItemId, sceneItemTransform: placement });
        }
        await obs.call('TriggerMediaInputAction', {
          inputUuid: created.inputUuid,
          mediaAction: autoplay ? MEDIA_ACTIONS.play : MEDIA_ACTIONS.stop,
        });
        const transform = await obs.call('GetSceneItemTransform', { ...ref, sceneItemId: created.sceneItemId });
        return okResult({
          mediaId: created.inputUuid,
          mediaName,
          sceneItemId: created.sceneItemId,
          source,
          sourceMode: mode,
          transform: transform.sceneItemTransform,
        });
      }
      case 'media_remove': {
        const resolved = await resolveMediaReference(obs, args);
        const ref = resolved.ref;
        const mediaId = resolved.mediaId;
        await ranges.cancel(mediaId, { pause: false });
        await obs.call('RemoveInput', ref);
        return okResult({ removed: true, mediaId, mediaName: resolved.mediaName });
      }
      case 'media_status': {
        const resolved = await resolveMediaReference(obs, args);
        const ref = resolved.ref;
        const status = await obs.call('GetMediaInputStatus', ref);
        return okResult({ mediaId: resolved.mediaId, mediaName: resolved.mediaName, ...status, activeRange: ranges.get(resolved.mediaId) });
      }
      case 'media_info': {
        const resolved = await resolveMediaReference(obs, args);
        const ref = resolved.ref;
        const mediaId = resolved.mediaId;
        const [settingsData, status, mute, volume, active, sceneData] = await Promise.all([
          obs.call('GetInputSettings', ref),
          obs.call('GetMediaInputStatus', ref),
          obs.call('GetInputMute', ref),
          obs.call('GetInputVolume', ref),
          obs.call('GetSourceActive', { sourceUuid: mediaId }),
          obs.call('GetSceneList'),
        ]);
        if (settingsData.inputKind !== 'ffmpeg_source') throw new Error(`Input is not a Media Source: ${mediaId}`);
        const placements = [];
        const sceneLists = await Promise.all((sceneData.scenes ?? []).map(async (scene) => {
          const items = await obs.call('GetSceneItemList', { sceneUuid: scene.sceneUuid });
          return { scene, items: items.sceneItems ?? [] };
        }));
        for (const { scene, items } of sceneLists) {
          for (const item of items) {
            if (item.sourceUuid !== mediaId) continue;
            placements.push({
              sceneId: scene.sceneUuid,
              sceneName: scene.sceneName,
              sceneItemId: item.sceneItemId,
              sceneItemIndex: item.sceneItemIndex,
              enabled: item.sceneItemEnabled,
              locked: item.sceneItemLocked,
              transform: item.sceneItemTransform,
            });
          }
        }
        const settings = settingsData.inputSettings ?? {};
        const isLocal = settings.is_local_file !== false;
        const firstTransform = placements[0]?.transform ?? null;
        return okResult({
          mediaId,
          mediaName: resolved.mediaName,
          inputKind: settingsData.inputKind,
          sourceMode: isLocal ? 'local' : 'network',
          source: isLocal ? (settings.local_file ?? null) : (settings.input ?? null),
          speedPercent: settings.speed_percent ?? 100,
          loop: settings.looping ?? false,
          seekable: isLocal ? true : (settings.seekable ?? false),
          restartOnActivate: settings.restart_on_activate ?? true,
          clearOnMediaEnd: settings.clear_on_media_end ?? true,
          settings,
          playback: status,
          video: {
            sourceWidth: firstTransform?.sourceWidth ?? null,
            sourceHeight: firstTransform?.sourceHeight ?? null,
          },
          audio: { muted: mute.inputMuted, volumeDb: volume.inputVolumeDb, volumeMul: volume.inputVolumeMul },
          videoActive: active.videoActive,
          videoShowing: active.videoShowing,
          placements,
          activeRange: ranges.get(mediaId),
        });
      }
      case 'media_play': {
        const resolved = await resolveMediaReference(obs, args);
        const ref = resolved.ref;
        const mediaId = resolved.mediaId;
        const startMs = optionalNumber(args, 'startMs');
        const speedPercent = optionalInteger(args, 'speedPercent');
        if (startMs !== undefined && startMs < 0) throw new Error('startMs must be >= 0');
        if (speedPercent !== undefined && (speedPercent < 1 || speedPercent > 200)) throw new Error('speedPercent must be from 1 through 200');
        await ranges.cancel(mediaId, { pause: false });
        const before = await obs.call('GetMediaInputStatus', ref);
        let status = before;
        if (speedPercent !== undefined) {
          await obs.call('SetInputSettings', { ...ref, inputSettings: { speed_percent: speedPercent }, overlay: true });
          await obs.call('TriggerMediaInputAction', { ...ref, mediaAction: MEDIA_ACTIONS.restart });
          status = await waitForMediaStatus(obs, ref,
            (candidate) => candidate.mediaState === 'OBS_MEDIA_STATE_PLAYING' && Number.isFinite(candidate.mediaCursor),
            { description: 'media restart after speed change' });
        }
        if (!MEDIA_TIME_VALID_STATES.has(status.mediaState) || !Number.isFinite(status.mediaCursor)) {
          await obs.call('TriggerMediaInputAction', { ...ref, mediaAction: MEDIA_ACTIONS.restart });
          status = await waitForMediaStatus(obs, ref,
            (candidate) => candidate.mediaState === 'OBS_MEDIA_STATE_PLAYING' && Number.isFinite(candidate.mediaCursor),
            { description: 'media restart' });
        }
        const desiredCursor = startMs !== undefined
          ? startMs
          : speedPercent !== undefined && MEDIA_TIME_VALID_STATES.has(before.mediaState) && Number.isFinite(before.mediaCursor)
            ? before.mediaCursor
            : undefined;
        if (desiredCursor !== undefined) {
          if (status.mediaState === 'OBS_MEDIA_STATE_PLAYING') {
            await obs.call('TriggerMediaInputAction', { ...ref, mediaAction: MEDIA_ACTIONS.pause });
            status = await waitForMediaStatus(obs, ref,
              (candidate) => candidate.mediaState === 'OBS_MEDIA_STATE_PAUSED',
              { description: 'media pause before seek' });
          }
          await obs.call('SetMediaInputCursor', { ...ref, mediaCursor: desiredCursor });
          status = await waitForMediaCursor(obs, ref, desiredCursor);
        }
        if (status.mediaState === 'OBS_MEDIA_STATE_PAUSED') {
          status = await resumeMediaAtCursor(obs, ref, status.mediaCursor, 'media playback to start');
        }
        const settings = await obs.call('GetInputSettings', ref);
        return okResult({ mediaId, speedPercent: settings.inputSettings?.speed_percent ?? 100, ...status });
      }
      case 'media_speed_set': {
        const resolved = await resolveMediaReference(obs, args);
        const ref = resolved.ref;
        const mediaId = resolved.mediaId;
        const speedPercent = optionalInteger(args, 'speedPercent');
        if (speedPercent === undefined || speedPercent < 1 || speedPercent > 200) throw new Error('speedPercent must be from 1 through 200');
        await ranges.cancel(mediaId, { pause: false });
        const before = await obs.call('GetMediaInputStatus', ref);
        await obs.call('SetInputSettings', { ...ref, inputSettings: { speed_percent: speedPercent }, overlay: true });
        let status;
        if (MEDIA_TIME_VALID_STATES.has(before.mediaState) && Number.isFinite(before.mediaCursor)) {
          await obs.call('TriggerMediaInputAction', { ...ref, mediaAction: MEDIA_ACTIONS.restart });
          status = await waitForMediaStatus(obs, ref,
            (candidate) => candidate.mediaState === 'OBS_MEDIA_STATE_PLAYING' && Number.isFinite(candidate.mediaCursor),
            { description: 'media restart after speed change' });
          await obs.call('TriggerMediaInputAction', { ...ref, mediaAction: MEDIA_ACTIONS.pause });
          status = await waitForMediaStatus(obs, ref,
            (candidate) => candidate.mediaState === 'OBS_MEDIA_STATE_PAUSED',
            { description: 'media pause before restoring cursor' });
          await obs.call('SetMediaInputCursor', { ...ref, mediaCursor: before.mediaCursor });
          status = await waitForMediaCursor(obs, ref, before.mediaCursor);
          if (before.mediaState === 'OBS_MEDIA_STATE_PLAYING') {
            status = await resumeMediaAtCursor(obs, ref, status.mediaCursor, 'media resume after speed change');
          }
        } else {
          await obs.call('TriggerMediaInputAction', { ...ref, mediaAction: MEDIA_ACTIONS.stop });
          status = await waitForMediaStatus(obs, ref,
            (candidate) => MEDIA_TERMINAL_STATES.has(candidate.mediaState),
            { description: 'media remain stopped after speed change' });
        }
        const settings = await obs.call('GetInputSettings', ref);
        return okResult({ mediaId, speedPercent: settings.inputSettings?.speed_percent ?? speedPercent, ...status });
      }
      case 'media_control': {
        const resolved = await resolveMediaReference(obs, args);
        const ref = resolved.ref;
        const action = enumValue(args, 'action', Object.keys(MEDIA_ACTIONS));
        const mediaId = resolved.mediaId;
        await ranges.cancel(mediaId, { pause: false });
        let status = await obs.call('GetMediaInputStatus', ref);
        if (action === 'play') {
          if (MEDIA_TIME_VALID_STATES.has(status.mediaState) && Number.isFinite(status.mediaCursor)) {
            status = await resumeMediaAtCursor(obs, ref, status.mediaCursor, 'media play');
          } else {
            await obs.call('TriggerMediaInputAction', { ...ref, mediaAction: MEDIA_ACTIONS.restart });
            status = await waitForMediaStatus(obs, ref,
              (candidate) => candidate.mediaState === 'OBS_MEDIA_STATE_PLAYING' && Number.isFinite(candidate.mediaCursor),
              { description: 'media play restart' });
          }
        } else if (action === 'restart') {
          await obs.call('TriggerMediaInputAction', { ...ref, mediaAction: MEDIA_ACTIONS.restart });
          status = await waitForMediaStatus(obs, ref,
            (candidate) => candidate.mediaState === 'OBS_MEDIA_STATE_PLAYING' && Number.isFinite(candidate.mediaCursor),
            { description: 'media restart' });
        } else if (action === 'pause') {
          if (status.mediaState !== 'OBS_MEDIA_STATE_PAUSED') {
            if (status.mediaState !== 'OBS_MEDIA_STATE_PLAYING') throw new Error(`Cannot pause media in state ${status.mediaState ?? 'unknown'}`);
            await obs.call('TriggerMediaInputAction', { ...ref, mediaAction: MEDIA_ACTIONS.pause });
            status = await waitForMediaStatus(obs, ref,
              (candidate) => candidate.mediaState === 'OBS_MEDIA_STATE_PAUSED',
              { description: 'media pause' });
          }
        } else if (!MEDIA_TERMINAL_STATES.has(status.mediaState)) {
          await obs.call('TriggerMediaInputAction', { ...ref, mediaAction: MEDIA_ACTIONS.stop });
          status = await waitForMediaStatus(obs, ref,
            (candidate) => MEDIA_TERMINAL_STATES.has(candidate.mediaState),
            { description: 'media stop' });
        }
        return okResult({ mediaId, mediaName: resolved.mediaName, action, ...status });
      }
      case 'media_seek': {
        const resolved = await resolveMediaReference(obs, args);
        const ref = resolved.ref;
        const mode = enumValue(args, 'mode', ['absolute', 'relative'], 'absolute');
        const milliseconds = requiredNumber(args, 'milliseconds');
        const mediaId = resolved.mediaId;
        await ranges.cancel(mediaId, { pause: false });
        const before = await obs.call('GetMediaInputStatus', ref);
        if (!MEDIA_TIME_VALID_STATES.has(before.mediaState) || !Number.isFinite(before.mediaCursor)) {
          throw new Error('Media must be playing or paused before it can be seeked. Use media_play first.');
        }
        const resumeAfterSeek = before.mediaState === 'OBS_MEDIA_STATE_PLAYING';
        if (resumeAfterSeek) {
          await obs.call('TriggerMediaInputAction', { ...ref, mediaAction: MEDIA_ACTIONS.pause });
          await waitForMediaStatus(obs, ref,
            (candidate) => candidate.mediaState === 'OBS_MEDIA_STATE_PAUSED',
            { description: 'media pause before seek' });
        }
        let targetMs;
        if (mode === 'absolute') {
          if (milliseconds < 0) throw new Error('Absolute media cursor must be >= 0');
          targetMs = milliseconds;
          await obs.call('SetMediaInputCursor', { ...ref, mediaCursor: milliseconds });
        } else {
          targetMs = Math.max(0, before.mediaCursor + milliseconds);
          await obs.call('OffsetMediaInputCursor', { ...ref, mediaCursorOffset: milliseconds });
        }
        let status = await waitForMediaCursor(obs, ref, targetMs);
        if (resumeAfterSeek) {
          status = await resumeMediaAtCursor(obs, ref, status.mediaCursor, 'media resume after seek');
        }
        return okResult({ mediaId, mediaName: resolved.mediaName, ...status });
      }
      case 'media_play_range': {
        const resolved = await resolveMediaReference(obs, args);
        const mediaId = resolved.mediaId;
        const startMs = requiredNumber(args, 'startMs');
        const endMs = requiredNumber(args, 'endMs');
        const speedPercent = optionalInteger(args, 'speedPercent');
        if (speedPercent !== undefined && (speedPercent < 1 || speedPercent > 200)) throw new Error('speedPercent must be from 1 through 200');
        const endAction = enumValue(args, 'endAction', ['pause', 'stop'], 'pause');
        const pollIntervalMs = optionalInteger(args, 'pollIntervalMs', 50);
        await ranges.cancel(mediaId, { pause: false });
        if (speedPercent !== undefined) {
          await obs.call('SetInputSettings', { inputUuid: mediaId, inputSettings: { speed_percent: speedPercent }, overlay: true });
        }
        const range = await ranges.start({ mediaId, startMs, endMs, endAction, pollIntervalMs });
        return okResult({ ...range, speedPercent: speedPercent ?? null });
      }
      case 'media_range_cancel': {
        const resolved = await resolveMediaReference(obs, args);
        const mediaId = resolved.mediaId;
        const pause = optionalBoolean(args, 'pause', true);
        const cancelled = await ranges.cancel(mediaId, { pause });
        return okResult({ mediaId, cancelled: Boolean(cancelled), previousRange: cancelled });
      }
      case 'screenshot': {
        const sourceId = optionalString(args, 'sourceId');
        const sourceName = optionalString(args, 'sourceName');
        if (sourceId && sourceName) throw new Error('Specify only one of sourceId or sourceName');
        let sourceRef;
        if (sourceId) sourceRef = { sourceUuid: sourceId };
        else if (sourceName) sourceRef = { sourceName };
        else {
          const current = await obs.call('GetCurrentProgramScene');
          sourceRef = { sourceUuid: current.sceneUuid };
        }
        const format = enumValue(args, 'format', ['png', 'jpeg', 'jpg', 'webp'], 'png');
        const width = optionalInteger(args, 'width', 1280);
        const height = optionalInteger(args, 'height', 720);
        const quality = optionalInteger(args, 'quality', -1);
        if (width < 8 || width > 4096 || height < 8 || height > 4096) throw new Error('width and height must be from 8 through 4096');
        if (quality < -1 || quality > 100) throw new Error('quality must be from -1 through 100');
        const data = await obs.call('GetSourceScreenshot', {
          ...sourceRef,
          imageFormat: format,
          imageWidth: width,
          imageHeight: height,
          imageCompressionQuality: quality,
        });
        const image = decodeScreenshot(data.imageData);
        return imageResult({
          sourceId: sourceRef.sourceUuid ?? null,
          sourceName: sourceRef.sourceName ?? null,
          mimeType: image.mimeType,
          bytes: image.bytes.length,
          width: image.width,
          height: image.height,
        }, image.bytes, image.mimeType);
      }
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  };
}
