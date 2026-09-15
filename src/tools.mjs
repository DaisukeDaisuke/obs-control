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

export const TOOL_SCHEMAS = [
  schema('obs_status', 'OBS status', 'Connect to OBS and return OBS/obs-websocket versions plus active range playbacks.', {}, [], READ_ONLY),
  schema('scene_list', 'List scenes', 'List OBS scenes and identify the current program/preview scenes.', {}, [], READ_ONLY),
  schema('scene_create', 'Create scene', 'Create a new OBS scene.', {
    sceneName: { type: 'string', minLength: 1 },
  }, ['sceneName']),
  schema('scene_delete', 'Delete scene', 'Delete an OBS scene by UUID or name.', SCENE_SELECTOR, [], DESTRUCTIVE),
  schema('scene_set_current', 'Set current scene', 'Switch the current program scene by UUID or name.', SCENE_SELECTOR),
  schema('scene_item_list', 'List scene items', 'List every source/item in a scene.', SCENE_SELECTOR, [], READ_ONLY),
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
  schema('input_list', 'List inputs', 'List OBS inputs, optionally restricted to one input kind.', {
    inputKind: { type: 'string', minLength: 1 },
  }, [], READ_ONLY),
  schema('input_settings_get', 'Get input settings', 'Get an OBS input kind and its current settings.', INPUT_SELECTOR, [], READ_ONLY),
  schema('input_settings_set', 'Set input settings', 'Apply settings to an OBS input. overlay=true preserves unspecified settings.', {
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
  schema('media_play_range', 'Play media range', 'Play only a specified [startMs,endMs] range. Returns immediately while the server watches the real OBS media cursor; at end it pauses on the exact end frame by default or stops.', {
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
const FIT_BOUNDS = {
  contain: 'OBS_BOUNDS_SCALE_INNER',
  cover: 'OBS_BOUNDS_SCALE_OUTER',
  stretch: 'OBS_BOUNDS_STRETCH',
};
const TOP_LEFT_ALIGNMENT = 5; // OBS_ALIGN_LEFT (1) | OBS_ALIGN_TOP (4)
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
      case 'scene_item_list': {
        const ref = sceneSelector(args);
        const data = await obs.call('GetSceneItemList', ref);
        return okResult({ ...ref, sceneItems: data.sceneItems ?? [] });
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
      case 'input_list': {
        const inputKind = optionalString(args, 'inputKind');
        const data = await obs.call('GetInputList', inputKind ? { inputKind } : {});
        return okResult({ inputs: (data.inputs ?? []).map(normalizedInput) });
      }
      case 'input_settings_get': {
        const ref = inputSelector(args);
        const data = await obs.call('GetInputSettings', ref);
        return okResult({ ...ref, inputKind: data.inputKind, settings: data.inputSettings });
      }
      case 'input_settings_set': {
        const ref = inputSelector(args);
        const settings = plainObject(args, 'settings');
        const overlay = optionalBoolean(args, 'overlay', true);
        await obs.call('SetInputSettings', { ...ref, inputSettings: settings, overlay });
        const data = await obs.call('GetInputSettings', ref);
        return okResult({ ...ref, inputKind: data.inputKind, settings: data.inputSettings });
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
        if (speedPercent !== undefined) {
          await obs.call('SetInputSettings', { ...ref, inputSettings: { speed_percent: speedPercent }, overlay: true });
        }
        if (startMs !== undefined) await obs.call('SetMediaInputCursor', { ...ref, mediaCursor: startMs });
        await obs.call('TriggerMediaInputAction', { ...ref, mediaAction: MEDIA_ACTIONS.play });
        const [status, settings] = await Promise.all([
          obs.call('GetMediaInputStatus', ref),
          obs.call('GetInputSettings', ref),
        ]);
        return okResult({ mediaId, speedPercent: settings.inputSettings?.speed_percent ?? 100, ...status });
      }
      case 'media_speed_set': {
        const resolved = await resolveMediaReference(obs, args);
        const ref = resolved.ref;
        const mediaId = resolved.mediaId;
        const speedPercent = optionalInteger(args, 'speedPercent');
        if (speedPercent === undefined || speedPercent < 1 || speedPercent > 200) throw new Error('speedPercent must be from 1 through 200');
        await ranges.cancel(mediaId, { pause: false });
        await obs.call('SetInputSettings', { ...ref, inputSettings: { speed_percent: speedPercent }, overlay: true });
        const [settings, status] = await Promise.all([
          obs.call('GetInputSettings', ref),
          obs.call('GetMediaInputStatus', ref),
        ]);
        return okResult({ mediaId, speedPercent: settings.inputSettings?.speed_percent ?? speedPercent, ...status });
      }
      case 'media_control': {
        const resolved = await resolveMediaReference(obs, args);
        const ref = resolved.ref;
        const action = enumValue(args, 'action', Object.keys(MEDIA_ACTIONS));
        const mediaId = resolved.mediaId;
        await ranges.cancel(mediaId, { pause: false });
        await obs.call('TriggerMediaInputAction', { ...ref, mediaAction: MEDIA_ACTIONS[action] });
        const status = await obs.call('GetMediaInputStatus', ref);
        return okResult({ mediaId, mediaName: resolved.mediaName, action, ...status });
      }
      case 'media_seek': {
        const resolved = await resolveMediaReference(obs, args);
        const ref = resolved.ref;
        const mode = enumValue(args, 'mode', ['absolute', 'relative'], 'absolute');
        const milliseconds = requiredNumber(args, 'milliseconds');
        const mediaId = resolved.mediaId;
        await ranges.cancel(mediaId, { pause: false });
        if (mode === 'absolute') {
          if (milliseconds < 0) throw new Error('Absolute media cursor must be >= 0');
          await obs.call('SetMediaInputCursor', { ...ref, mediaCursor: milliseconds });
        } else {
          await obs.call('OffsetMediaInputCursor', { ...ref, mediaCursorOffset: milliseconds });
        }
        const status = await obs.call('GetMediaInputStatus', ref);
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
