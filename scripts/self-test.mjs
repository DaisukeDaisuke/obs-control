import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from '../server.mjs';
import { parseConfigToml } from '../src/config.mjs';
import { RangePlaybackManager } from '../src/range-playback.mjs';
import { ObsWebSocketClient } from '../src/obs-websocket-client.mjs';

const TINY_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z0X8AAAAASUVORK5CYII=';

class FakeObs {
  url = 'ws://fake:4455';
  calls = [];

  async connect() {
    return {
      obsStudioVersion: '99.0.0-test',
      obsWebSocketVersion: '5.0.0-test',
      serverRpcVersion: 1,
      negotiatedRpcVersion: 1,
    };
  }

  async disconnect() {}

  async call(requestType, requestData = undefined) {
    this.calls.push({ requestType, requestData });
    switch (requestType) {
      case 'GetVersion':
        return {
          obsVersion: '99.0.0-test',
          obsWebSocketVersion: '5.0.0-test',
          rpcVersion: 1,
          availableRequests: [],
          supportedImageFormats: ['png'],
          platform: 'windows',
          platformDescription: 'test',
        };
      case 'GetInputList':
        return {
          inputs: [{
            inputName: 'clip',
            inputUuid: 'media-1',
            inputKind: 'ffmpeg_source',
            unversionedInputKind: 'ffmpeg_source',
            inputKindCaps: 2,
          }],
        };
      case 'GetInputSettings':
        return {
          inputKind: 'ffmpeg_source',
          inputSettings: {
            is_local_file: true,
            local_file: 'C:\\video\\clip.mp4',
            looping: false,
            restart_on_activate: false,
            clear_on_media_end: true,
            speed_percent: 150,
          },
        };
      case 'SetInputSettings':
      case 'SetMediaInputCursor':
      case 'OffsetMediaInputCursor':
      case 'TriggerMediaInputAction':
      case 'SetSceneItemTransform':
      case 'SetInputMute':
      case 'SetInputVolume':
      case 'SetInputAudioBalance':
      case 'SetInputAudioSyncOffset':
      case 'SetInputAudioMonitorType':
      case 'SetInputAudioTracks':
      case 'ToggleInputMute':
        return {};
      case 'CreateInput':
        return { inputUuid: 'media-created', sceneItemId: 9 };
      case 'GetSceneItemTransform':
        return {
          sceneItemTransform: {
            sourceWidth: 1920,
            sourceHeight: 1080,
            positionX: 10,
            positionY: 20,
            width: 640,
            height: 360,
          },
        };
      case 'GetMediaInputStatus':
        return { mediaState: 'OBS_MEDIA_STATE_PLAYING', mediaDuration: 30000, mediaCursor: 12500 };
      case 'GetInputMute':
        return { inputMuted: false };
      case 'GetInputVolume':
        return { inputVolumeMul: 1, inputVolumeDb: 0 };
      case 'GetInputAudioBalance':
        return { inputAudioBalance: 0.5 };
      case 'GetInputAudioSyncOffset':
        return { inputAudioSyncOffset: 100 };
      case 'GetInputAudioMonitorType':
        return { monitorType: 'OBS_MONITORING_TYPE_NONE' };
      case 'GetInputAudioTracks':
        return { inputAudioTracks: { '1': true, '2': false, '3': false, '4': false, '5': false, '6': false } };
      case 'GetSourceActive':
        return { videoActive: true, videoShowing: true };
      case 'GetSceneList':
        return {
          currentProgramSceneName: 'Main',
          currentProgramSceneUuid: 'scene-1',
          currentPreviewSceneName: null,
          currentPreviewSceneUuid: null,
          scenes: [{ sceneName: 'Main', sceneUuid: 'scene-1', sceneIndex: 0 }],
        };
      case 'GetSceneItemList':
        return {
          sceneItems: [{
            sceneItemId: 7,
            sceneItemIndex: 0,
            sceneItemEnabled: true,
            sceneItemLocked: false,
            sourceName: 'clip',
            sourceUuid: 'media-1',
            inputKind: 'ffmpeg_source',
            sceneItemTransform: {
              sourceWidth: 1920,
              sourceHeight: 1080,
              positionX: 12,
              positionY: 34,
              width: 640,
              height: 360,
            },
          }],
        };
      case 'GetSourceScreenshot':
        return { imageData: `data:image/png;base64,${TINY_PNG_BASE64}` };
      default:
        throw new Error(`FakeObs has no response for ${requestType}`);
    }
  }
}

const fake = new FakeObs();
const server = createServer({ obs: fake });

const initialized = await server.handle({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2026-07-28' },
});
assert.equal(initialized.result.serverInfo.name, 'obs-control');

const listed = await server.handle({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
const names = new Set(listed.result.tools.map((tool) => tool.name));
for (const requiredTool of ['media_play', 'media_speed_set', 'media_info', 'media_play_range', 'screenshot', 'audio_mixer_list', 'audio_mixer_get', 'audio_mixer_set', 'audio_mixer_mute_toggle']) {
  assert(names.has(requiredTool), `missing tool ${requiredTool}`);
}

const parsedConfig = parseConfigToml(`
[obs]
url = "ws://127.0.0.1:4455"
password = "p#ssword"
connect_timeout_ms = 6000
request_timeout_ms = 12000
`);
assert.equal(parsedConfig.obs.password, 'p#ssword');
assert.equal(parsedConfig.obs.connect_timeout_ms, 6000);

fake.calls.length = 0;
const played = await server.handle({
  jsonrpc: '2.0',
  id: 3,
  method: 'tools/call',
  params: {
    name: 'media_play',
    arguments: { mediaId: 'media-1', speedPercent: 150, startMs: 12000 },
  },
});
assert.equal(played.result.isError, false);
assert.equal(played.result.structuredContent.result.mediaId, 'media-1');
assert.deepEqual(
  fake.calls.slice(0, 4).map((entry) => entry.requestType),
  ['GetInputList', 'SetInputSettings', 'SetMediaInputCursor', 'TriggerMediaInputAction'],
);
assert.equal(fake.calls[1].requestData.inputSettings.speed_percent, 150);
assert.equal(fake.calls[2].requestData.mediaCursor, 12000);
assert.equal(fake.calls[3].requestData.mediaAction, 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY');

fake.calls.length = 0;
const info = await server.handle({
  jsonrpc: '2.0',
  id: 4,
  method: 'tools/call',
  params: { name: 'media_info', arguments: { mediaId: 'media-1' } },
});
assert.equal(info.result.isError, false);
const mediaInfo = info.result.structuredContent.result;
assert.equal(mediaInfo.mediaName, 'clip');
assert.equal(mediaInfo.sourceMode, 'local');
assert.equal(mediaInfo.source, 'C:\\video\\clip.mp4');
assert.equal(mediaInfo.speedPercent, 150);
assert.equal(mediaInfo.playback.mediaDuration, 30000);
assert.equal(mediaInfo.placements.length, 1);
assert.equal(mediaInfo.placements[0].sceneItemId, 7);
assert.equal(mediaInfo.video.sourceWidth, 1920);
assert.equal(mediaInfo.video.sourceHeight, 1080);

fake.calls.length = 0;
const mixerList = await server.handle({
  jsonrpc: '2.0',
  id: 40,
  method: 'tools/call',
  params: { name: 'audio_mixer_list', arguments: {} },
});
assert.equal(mixerList.result.isError, false, JSON.stringify(mixerList.result.structuredContent));
assert.equal(mixerList.result.structuredContent.result.inputs.length, 1);
assert.equal(mixerList.result.structuredContent.result.inputs[0].inputId, 'media-1');
assert.equal(mixerList.result.structuredContent.result.inputs[0].balance, 0.5);
assert.equal(mixerList.result.structuredContent.result.inputs[0].syncOffsetMs, 100);

fake.calls.length = 0;
const mixerSet = await server.handle({
  jsonrpc: '2.0',
  id: 401,
  method: 'tools/call',
  params: {
    name: 'audio_mixer_set',
    arguments: {
      inputId: 'media-1',
      muted: true,
      volumeDb: -6,
      balance: 0.25,
      syncOffsetMs: 250,
      monitorType: 'monitor_and_output',
      tracks: { '1': true, '2': true },
    },
  },
});
assert.equal(mixerSet.result.isError, false);
assert(fake.calls.some((entry) => entry.requestType === 'SetInputMute' && entry.requestData.inputMuted === true));
assert(fake.calls.some((entry) => entry.requestType === 'SetInputVolume' && entry.requestData.inputVolumeDb === -6));
assert(fake.calls.some((entry) => entry.requestType === 'SetInputAudioBalance' && entry.requestData.inputAudioBalance === 0.25));
assert(fake.calls.some((entry) => entry.requestType === 'SetInputAudioSyncOffset' && entry.requestData.inputAudioSyncOffset === 250));
assert(fake.calls.some((entry) => entry.requestType === 'SetInputAudioMonitorType' && entry.requestData.monitorType === 'OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT'));
assert(fake.calls.some((entry) => entry.requestType === 'SetInputAudioTracks' && entry.requestData.inputAudioTracks['2'] === true));

fake.calls.length = 0;
const speedSet = await server.handle({
  jsonrpc: '2.0',
  id: 41,
  method: 'tools/call',
  params: { name: 'media_speed_set', arguments: { mediaId: 'media-1', speedPercent: 80 } },
});
assert.equal(speedSet.result.isError, false);
assert(fake.calls.some((entry) => entry.requestType === 'SetInputSettings' && entry.requestData.inputSettings.speed_percent === 80));

fake.calls.length = 0;
const added = await server.handle({
  jsonrpc: '2.0',
  id: 42,
  method: 'tools/call',
  params: {
    name: 'media_add',
    arguments: {
      sceneId: 'scene-1',
      source: 'C:\\video\\created.mp4',
      mediaName: 'created',
      autoplay: true,
      x: 10,
      y: 20,
      width: 640,
      height: 360,
      fit: 'contain',
    },
  },
});
assert.equal(added.result.isError, false);
assert.equal(added.result.structuredContent.result.mediaId, 'media-created');
assert(fake.calls.some((entry) => entry.requestType === 'SetSceneItemTransform'));
assert(fake.calls.some((entry) => entry.requestType === 'TriggerMediaInputAction' && entry.requestData.mediaAction === 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY'));

fake.calls.length = 0;
const rangeTool = await server.handle({
  jsonrpc: '2.0',
  id: 43,
  method: 'tools/call',
  params: {
    name: 'media_play_range',
    arguments: { mediaId: 'media-1', startMs: 1000, endMs: 20000, speedPercent: 125, pollIntervalMs: 2000 },
  },
});
assert.equal(rangeTool.result.isError, false);
assert.deepEqual(
  fake.calls.slice(0, 4).map((entry) => entry.requestType),
  ['GetInputList', 'SetInputSettings', 'SetMediaInputCursor', 'TriggerMediaInputAction'],
);
await server.handle({
  jsonrpc: '2.0',
  id: 44,
  method: 'tools/call',
  params: { name: 'media_range_cancel', arguments: { mediaId: 'media-1', pause: false } },
});

fake.calls.length = 0;
const screenshot = await server.handle({
  jsonrpc: '2.0',
  id: 5,
  method: 'tools/call',
  params: { name: 'screenshot', arguments: { sourceId: 'scene-1', width: 1280, height: 720 } },
});
assert.equal(screenshot.result.isError, false);
assert.equal(screenshot.result.content[1].type, 'image');
assert.equal(screenshot.result.content[1].mimeType, 'image/png');
assert.equal(screenshot.result.structuredContent.result.width, 1);
assert.equal(screenshot.result.structuredContent.result.height, 1);

class RangeFakeObs {
  calls = [];
  statusCalls = 0;

  async call(requestType, requestData) {
    this.calls.push({ requestType, requestData });
    if (requestType === 'GetMediaInputStatus') {
      this.statusCalls += 1;
      return {
        mediaState: 'OBS_MEDIA_STATE_PLAYING',
        mediaDuration: 10000,
        mediaCursor: this.statusCalls === 1 ? 900 : 1100,
      };
    }
    return {};
  }
}

const rangeFake = new RangeFakeObs();
const ranges = new RangePlaybackManager(rangeFake);
await ranges.start({ mediaId: 'range-media', startMs: 500, endMs: 1000, pollIntervalMs: 25 });
await new Promise((resolve) => setTimeout(resolve, 90));
assert.equal(ranges.get('range-media'), null);
assert(rangeFake.calls.some((entry) => entry.requestType === 'TriggerMediaInputAction' && entry.requestData.mediaAction === 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE'));
assert(rangeFake.calls.some((entry) => entry.requestType === 'SetMediaInputCursor' && entry.requestData.mediaCursor === 1000));
ranges.close();

const originalWebSocket = globalThis.WebSocket;
class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances = [];

  constructor(url, protocol) {
    this.url = url;
    this.protocol = protocol;
    this.readyState = FakeWebSocket.CONNECTING;
    this.listeners = new Map();
    this.sent = [];
    FakeWebSocket.instances.push(this);
    queueMicrotask(() => {
      this.readyState = FakeWebSocket.OPEN;
      this.#emit('message', {
        data: JSON.stringify({
          op: 0,
          d: {
            obsStudioVersion: '31.0.0-test',
            obsWebSocketVersion: '5.6.0-test',
            rpcVersion: 1,
            authentication: {
              salt: 'lM1GncleQOaCu9lT1yeUZhFYnqhsLLP1G5lAGo3ixaI=',
              challenge: '+IxH4CnCiqpX1rM9scsNynZzbOe4KhDeYcTNS3PDaeY=',
            },
          },
        }),
      });
    });
  }

  addEventListener(type, listener) {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  send(text) {
    const message = JSON.parse(text);
    this.sent.push(message);
    if (message.op === 1) {
      queueMicrotask(() => this.#emit('message', { data: JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }) }));
    } else if (message.op === 6) {
      queueMicrotask(() => this.#emit('message', {
        data: JSON.stringify({
          op: 7,
          d: {
            requestType: message.d.requestType,
            requestId: message.d.requestId,
            requestStatus: { result: true, code: 100 },
            responseData: { pong: true },
          },
        }),
      }));
    }
  }

  close(code = 1000, reason = '') {
    this.readyState = FakeWebSocket.CLOSED;
    queueMicrotask(() => this.#emit('close', { code, reason }));
  }

  #emit(type, event) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

globalThis.WebSocket = FakeWebSocket;
try {
  const wsClient = new ObsWebSocketClient({
    url: 'ws://fake-obs:4455',
    password: 'supersecretpassword',
    connectTimeoutMs: 1000,
    requestTimeoutMs: 1000,
  });
  const connection = await wsClient.connect();
  assert.equal(connection.negotiatedRpcVersion, 1);
  const socket = FakeWebSocket.instances.at(-1);
  const identify = socket.sent.find((message) => message.op === 1);
  const expectedSecret = createHash('sha256').update('supersecretpassword' + 'lM1GncleQOaCu9lT1yeUZhFYnqhsLLP1G5lAGo3ixaI=', 'utf8').digest('base64');
  const expectedAuth = createHash('sha256').update(expectedSecret + '+IxH4CnCiqpX1rM9scsNynZzbOe4KhDeYcTNS3PDaeY=', 'utf8').digest('base64');
  assert.equal(identify.d.authentication, expectedAuth);
  const response = await wsClient.call('FakeRequest', { hello: 'world' });
  assert.deepEqual(response, { pong: true });
  await wsClient.disconnect();
} finally {
  globalThis.WebSocket = originalWebSocket;
}

await server.close();
process.stdout.write(`${JSON.stringify({ ok: true, toolCount: names.size, tests: ['config-toml', 'audio-mixer', 'media_play', 'media_speed_set', 'media_info', 'media_add-placement', 'media_play_range-speed', 'screenshot-image-content', 'range-playback', 'obs-websocket-v5-auth-request'] })}\n`);
