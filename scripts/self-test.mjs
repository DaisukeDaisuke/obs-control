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
  mediaState = 'OBS_MEDIA_STATE_STOPPED';
  mediaCursor = null;
  mediaDuration = 30000;
  mediaSpeedPercent = 100;
  seekSnapMs = 0;
  resetOnNextPlay = false;
  textSettings = {
    text: 'Hello',
    font: { face: 'Arial', style: 'Regular', size: 48, flags: 1 },
    color: 0xFFFFFF,
    opacity: 100,
    bk_color: 0x332211,
    bk_opacity: 25,
    outline: true,
    outline_size: 2,
    outline_color: 0x000000,
    outline_opacity: 100,
    align: 'left',
    valign: 'top',
    antialiasing: true,
  };
  createdTextSettings = null;

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
          inputs: [
            {
              inputName: 'clip',
              inputUuid: 'media-1',
              inputKind: 'ffmpeg_source',
              unversionedInputKind: 'ffmpeg_source',
              inputKindCaps: 2,
            },
            {
              inputName: 'title',
              inputUuid: 'text-1',
              inputKind: 'text_gdiplus_v3',
              unversionedInputKind: 'text_gdiplus',
              inputKindCaps: 1,
            },
          ],
        };
      case 'GetInputKindList':
        return { inputKinds: ['ffmpeg_source', 'text_gdiplus', 'text_gdiplus_v2', 'text_gdiplus_v3'] };
      case 'GetInputSettings': {
        if (requestData?.inputUuid === 'text-1') {
          return { inputKind: 'text_gdiplus_v3', inputSettings: this.textSettings };
        }
        if (requestData?.inputUuid === 'text-created') {
          return { inputKind: 'text_gdiplus_v3', inputSettings: this.createdTextSettings ?? {} };
        }
        return {
          inputKind: 'ffmpeg_source',
          inputSettings: {
            is_local_file: true,
            local_file: 'C:\\video\\clip.mp4',
            looping: false,
            restart_on_activate: false,
            clear_on_media_end: true,
            speed_percent: this.mediaSpeedPercent,
          },
        };
      }
      case 'SetInputSettings': {
        if (requestData?.inputUuid === 'text-1' || requestData?.inputUuid === 'text-created') {
          const current = requestData.inputUuid === 'text-1' ? this.textSettings : (this.createdTextSettings ?? {});
          const update = requestData.inputSettings ?? {};
          const merged = {
            ...current,
            ...update,
            ...(update.font ? { font: { ...(current.font ?? {}), ...update.font } } : {}),
          };
          if (requestData.inputUuid === 'text-1') this.textSettings = merged;
          else this.createdTextSettings = merged;
        } else if (requestData?.inputSettings?.speed_percent !== undefined) {
          this.mediaSpeedPercent = requestData.inputSettings.speed_percent;
          this.mediaState = 'OBS_MEDIA_STATE_PLAYING';
          this.mediaCursor = 0;
        }
        return {};
      }
      case 'SetMediaInputCursor':
        if (!['OBS_MEDIA_STATE_PLAYING', 'OBS_MEDIA_STATE_PAUSED'].includes(this.mediaState)) {
          throw new Error('The media input must be playing or paused in order to set the cursor position.');
        }
        this.mediaCursor = Math.max(0, requestData.mediaCursor - this.seekSnapMs);
        return {};
      case 'OffsetMediaInputCursor':
        if (!['OBS_MEDIA_STATE_PLAYING', 'OBS_MEDIA_STATE_PAUSED'].includes(this.mediaState)) {
          throw new Error('The media input must be playing or paused in order to set the cursor position.');
        }
        this.mediaCursor = Math.max(0, (this.mediaCursor ?? 0) + requestData.mediaCursorOffset);
        return {};
      case 'TriggerMediaInputAction':
        switch (requestData.mediaAction) {
          case 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY':
            this.mediaState = 'OBS_MEDIA_STATE_PLAYING';
            if (this.resetOnNextPlay) {
              this.mediaCursor = 0;
              this.resetOnNextPlay = false;
            } else {
              this.mediaCursor ??= 0;
            }
            break;
          case 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE':
            if (this.mediaState === 'OBS_MEDIA_STATE_PLAYING') this.mediaState = 'OBS_MEDIA_STATE_PAUSED';
            break;
          case 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_STOP':
            this.mediaState = 'OBS_MEDIA_STATE_STOPPED';
            this.mediaCursor = null;
            break;
          case 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART':
            this.mediaState = 'OBS_MEDIA_STATE_PLAYING';
            this.mediaCursor = 0;
            break;
          default:
            throw new Error(`Unknown fake media action: ${requestData.mediaAction}`);
        }
        return {};
      case 'SetSceneItemTransform':
      case 'SetInputMute':
      case 'SetInputVolume':
      case 'SetInputAudioBalance':
      case 'SetInputAudioSyncOffset':
      case 'SetInputAudioMonitorType':
      case 'SetInputAudioTracks':
      case 'ToggleInputMute':
      case 'RemoveInput':
        return {};
      case 'CreateInput':
        if (requestData?.inputKind?.startsWith('text_gdiplus')) {
          this.createdTextSettings = requestData.inputSettings;
          return { inputUuid: 'text-created', sceneItemId: 10 };
        }
        return { inputUuid: 'media-created', sceneItemId: 9 };
      case 'GetSceneItemTransform':
        if (requestData?.sceneItemId === 10) {
          return {
            sceneItemTransform: {
              sourceWidth: 800,
              sourceHeight: 120,
              positionX: 100,
              positionY: 200,
              width: 800,
              height: 200,
            },
          };
        }
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
        return {
          mediaState: this.mediaState,
          mediaDuration: ['OBS_MEDIA_STATE_PLAYING', 'OBS_MEDIA_STATE_PAUSED'].includes(this.mediaState) ? this.mediaDuration : null,
          mediaCursor: ['OBS_MEDIA_STATE_PLAYING', 'OBS_MEDIA_STATE_PAUSED'].includes(this.mediaState) ? this.mediaCursor : null,
        };
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
          sceneItems: [
            {
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
            },
            {
              sceneItemId: 8,
              sceneItemIndex: 1,
              sceneItemEnabled: true,
              sceneItemLocked: false,
              sourceName: 'title',
              sourceUuid: 'text-1',
              inputKind: 'text_gdiplus_v3',
              sceneItemTransform: {
                sourceWidth: 640,
                sourceHeight: 80,
                positionX: 50,
                positionY: 60,
                width: 640,
                height: 80,
              },
            },
          ],
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
for (const requiredTool of ['media_play', 'media_speed_set', 'media_info', 'media_play_range', 'screenshot', 'audio_mixer_list', 'audio_mixer_get', 'audio_mixer_set', 'audio_mixer_mute_toggle', 'text_add', 'text_info', 'text_set', 'text_remove']) {
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
fake.seekSnapMs = 3600;
const played = await server.handle({
  jsonrpc: '2.0',
  id: 3,
  method: 'tools/call',
  params: {
    name: 'media_play',
    arguments: { mediaId: 'media-1', speedPercent: 150, startMs: 12000 },
  },
});
assert.equal(played.result.isError, false, JSON.stringify(played.result.structuredContent));
assert.equal(played.result.structuredContent.result.mediaId, 'media-1');
const mediaPlayCalls = fake.calls.filter((entry) => entry.requestType !== 'GetMediaInputStatus');
assert.deepEqual(mediaPlayCalls.map((entry) => entry.requestType), [
  'GetInputList',
  'SetInputSettings',
  'TriggerMediaInputAction',
  'TriggerMediaInputAction',
  'SetMediaInputCursor',
  'TriggerMediaInputAction',
  'GetInputSettings',
]);
assert.equal(mediaPlayCalls[1].requestData.inputSettings.speed_percent, 150);
assert.equal(mediaPlayCalls[2].requestData.mediaAction, 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART');
assert.equal(mediaPlayCalls[3].requestData.mediaAction, 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE');
assert.equal(mediaPlayCalls[4].requestData.mediaCursor, 12000);
assert.equal(mediaPlayCalls[5].requestData.mediaAction, 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY');
assert.equal(fake.mediaState, 'OBS_MEDIA_STATE_PLAYING');
assert.equal(fake.mediaCursor, 8400);
assert.equal(played.result.structuredContent.result.mediaCursor, 8400);
fake.seekSnapMs = 0;

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
const textInfoResult = await server.handle({
  jsonrpc: '2.0',
  id: 402,
  method: 'tools/call',
  params: { name: 'text_info', arguments: { textId: 'text-1' } },
});
assert.equal(textInfoResult.result.isError, false, JSON.stringify(textInfoResult.result.structuredContent));
const initialTextInfo = textInfoResult.result.structuredContent.result;
assert.equal(initialTextInfo.text, 'Hello');
assert.equal(initialTextInfo.font.name, 'Arial');
assert.equal(initialTextInfo.font.size, 48);
assert.equal(initialTextInfo.font.bold, true);
assert.equal(initialTextInfo.backgroundColor, '#112233');
assert.equal(initialTextInfo.backgroundOpacity, 25);
assert.equal(initialTextInfo.placements[0].sceneItemId, 8);

fake.calls.length = 0;
const textAdded = await server.handle({
  jsonrpc: '2.0',
  id: 403,
  method: 'tools/call',
  params: {
    name: 'text_add',
    arguments: {
      sceneId: 'scene-1',
      text: 'Created title',
      textName: 'created-title',
      fontName: 'Yu Gothic',
      fontSize: 52,
      bold: true,
      italic: true,
      textColor: '#12AB34',
      backgroundColor: '#102030',
      backgroundOpacity: 70,
      outline: true,
      outlineSize: 3,
      outlineColor: '#FFFFFF',
      outlineOpacity: 90,
      align: 'center',
      verticalAlign: 'bottom',
      x: 100,
      y: 200,
      width: 800,
      height: 200,
      fit: 'contain',
    },
  },
});
assert.equal(textAdded.result.isError, false, JSON.stringify(textAdded.result.structuredContent));
assert.equal(textAdded.result.structuredContent.result.textId, 'text-created');
const textCreateCall = fake.calls.find((entry) => entry.requestType === 'CreateInput');
assert.equal(textCreateCall.requestData.inputKind, 'text_gdiplus_v3');
assert.equal(textCreateCall.requestData.inputSettings.font.face, 'Yu Gothic');
assert.equal(textCreateCall.requestData.inputSettings.font.size, 52);
assert.equal(textCreateCall.requestData.inputSettings.font.flags, 3);
assert.equal(textCreateCall.requestData.inputSettings.color, 0x34AB12);
assert.equal(textCreateCall.requestData.inputSettings.bk_color, 0x302010);
assert.equal(textCreateCall.requestData.inputSettings.bk_opacity, 70);
assert(fake.calls.some((entry) => entry.requestType === 'SetSceneItemTransform' && entry.requestData.sceneItemId === 10));

fake.calls.length = 0;
const textSetResult = await server.handle({
  jsonrpc: '2.0',
  id: 404,
  method: 'tools/call',
  params: {
    name: 'text_set',
    arguments: {
      textId: 'text-1',
      sceneId: 'scene-1',
      text: 'Updated title',
      fontName: 'Meiryo',
      fontSize: 64,
      bold: false,
      italic: true,
      textColor: '#FF0000',
      backgroundColor: '#0000FF',
      backgroundOpacity: 50,
      outline: true,
      outlineSize: 4,
      outlineColor: '#00FF00',
      align: 'right',
      verticalAlign: 'center',
      x: 300,
      y: 400,
      width: 900,
      height: 250,
    },
  },
});
assert.equal(textSetResult.result.isError, false, JSON.stringify(textSetResult.result.structuredContent));
const textSettingsCall = fake.calls.find((entry) => entry.requestType === 'SetInputSettings');
assert.equal(textSettingsCall.requestData.inputSettings.text, 'Updated title');
assert.equal(textSettingsCall.requestData.inputSettings.font.face, 'Meiryo');
assert.equal(textSettingsCall.requestData.inputSettings.font.size, 64);
assert.equal(textSettingsCall.requestData.inputSettings.font.flags, 2);
assert.equal(textSettingsCall.requestData.inputSettings.color, 0x0000FF);
assert.equal(textSettingsCall.requestData.inputSettings.bk_color, 0xFF0000);
assert.equal(textSettingsCall.requestData.inputSettings.outline_color, 0x00FF00);
assert(fake.calls.some((entry) => entry.requestType === 'SetSceneItemTransform' && entry.requestData.sceneItemId === 8));
assert.equal(textSetResult.result.structuredContent.result.text, 'Updated title');
assert.equal(textSetResult.result.structuredContent.result.font.italic, true);
assert.equal(textSetResult.result.structuredContent.result.font.bold, false);

fake.calls.length = 0;
const textRemoved = await server.handle({
  jsonrpc: '2.0',
  id: 405,
  method: 'tools/call',
  params: { name: 'text_remove', arguments: { textId: 'text-1' } },
});
assert.equal(textRemoved.result.isError, false);
assert(fake.calls.some((entry) => entry.requestType === 'RemoveInput' && entry.requestData.inputUuid === 'text-1'));

fake.calls.length = 0;
const speedSet = await server.handle({
  jsonrpc: '2.0',
  id: 41,
  method: 'tools/call',
  params: { name: 'media_speed_set', arguments: { mediaId: 'media-1', speedPercent: 80 } },
});
assert.equal(speedSet.result.isError, false);
assert(fake.calls.some((entry) => entry.requestType === 'SetInputSettings' && entry.requestData.inputSettings.speed_percent === 80));
assert.equal(speedSet.result.structuredContent.result.speedPercent, 80);
assert.equal(fake.mediaState, 'OBS_MEDIA_STATE_PLAYING');
assert.equal(fake.mediaCursor, 8400);

fake.calls.length = 0;
fake.mediaState = 'OBS_MEDIA_STATE_PAUSED';
fake.mediaCursor = 8400;
fake.resetOnNextPlay = true;
const resumedAfterDeferredReset = await server.handle({
  jsonrpc: '2.0',
  id: 411,
  method: 'tools/call',
  params: { name: 'media_control', arguments: { mediaId: 'media-1', action: 'play' } },
});
assert.equal(resumedAfterDeferredReset.result.isError, false, JSON.stringify(resumedAfterDeferredReset.result.structuredContent));
assert.equal(fake.mediaState, 'OBS_MEDIA_STATE_PLAYING');
assert.equal(fake.mediaCursor, 8400);
assert(fake.calls.some((entry) => entry.requestType === 'SetMediaInputCursor' && entry.requestData.mediaCursor === 8400));

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
  fake.calls.slice(0, 9).map((entry) => entry.requestType),
  [
    'GetInputList',
    'SetInputSettings',
    'GetMediaInputStatus',
    'TriggerMediaInputAction',
    'GetMediaInputStatus',
    'SetMediaInputCursor',
    'GetMediaInputStatus',
    'TriggerMediaInputAction',
    'GetMediaInputStatus',
  ],
);
assert.equal(fake.calls[3].requestData.mediaAction, 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE');
assert.equal(fake.calls[5].requestData.mediaCursor, 1000);
assert.equal(fake.calls[7].requestData.mediaAction, 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY');
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
  mediaState = 'OBS_MEDIA_STATE_PLAYING';
  mediaCursor = 900;
  resetOnNextPlay = true;

  async call(requestType, requestData) {
    this.calls.push({ requestType, requestData });
    if (requestType === 'GetMediaInputStatus') {
      if (this.mediaState === 'OBS_MEDIA_STATE_PLAYING') this.mediaCursor += 300;
      return {
        mediaState: this.mediaState,
        mediaDuration: 10000,
        mediaCursor: this.mediaCursor,
      };
    }
    if (requestType === 'TriggerMediaInputAction') {
      if (requestData.mediaAction === 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE') this.mediaState = 'OBS_MEDIA_STATE_PAUSED';
      if (requestData.mediaAction === 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY') {
        this.mediaState = 'OBS_MEDIA_STATE_PLAYING';
        if (this.resetOnNextPlay) {
          this.mediaCursor = 0;
          this.resetOnNextPlay = false;
        }
      }
      if (requestData.mediaAction === 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART') {
        this.mediaState = 'OBS_MEDIA_STATE_PLAYING';
        this.mediaCursor = 0;
      }
      if (requestData.mediaAction === 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_STOP') {
        this.mediaState = 'OBS_MEDIA_STATE_STOPPED';
        this.mediaCursor = null;
      }
      return {};
    }
    if (requestType === 'SetMediaInputCursor') {
      if (!['OBS_MEDIA_STATE_PLAYING', 'OBS_MEDIA_STATE_PAUSED'].includes(this.mediaState)) {
        throw new Error('seek requires playing or paused');
      }
      this.mediaCursor = requestData.mediaCursor;
      return {};
    }
    return {};
  }
}

const rangeFake = new RangeFakeObs();
const ranges = new RangePlaybackManager(rangeFake);
await ranges.start({ mediaId: 'range-media', startMs: 5000, endMs: 6000, pollIntervalMs: 25 });
await new Promise((resolve) => setTimeout(resolve, 90));
assert.equal(ranges.get('range-media'), null);
assert(rangeFake.calls.some((entry) => entry.requestType === 'TriggerMediaInputAction' && entry.requestData.mediaAction === 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE'));
assert(rangeFake.calls.filter((entry) => entry.requestType === 'SetMediaInputCursor' && entry.requestData.mediaCursor === 5000).length >= 2);
assert(!rangeFake.calls.some((entry) => entry.requestType === 'SetMediaInputCursor' && entry.requestData.mediaCursor === 6000));
assert(rangeFake.mediaCursor >= 6000 && rangeFake.mediaCursor < 6500);
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
process.stdout.write(`${JSON.stringify({ ok: true, toolCount: names.size, tests: ['config-toml', 'audio-mixer', 'text-sources', 'media_play', 'media_speed_set', 'media_info', 'media_add-placement', 'media_play_range-speed', 'screenshot-image-content', 'range-playback', 'obs-websocket-v5-auth-request'] })}\n`);
