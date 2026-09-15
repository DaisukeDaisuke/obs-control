import { randomUUID } from 'node:crypto';

const PLAY = 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY';
const PAUSE = 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE';
const STOP = 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_STOP';
const TERMINAL_STATES = new Set([
  'OBS_MEDIA_STATE_STOPPED',
  'OBS_MEDIA_STATE_ENDED',
  'OBS_MEDIA_STATE_NONE',
]);
const ACTIVE_STATES = new Set([
  'OBS_MEDIA_STATE_PLAYING',
  'OBS_MEDIA_STATE_OPENING',
  'OBS_MEDIA_STATE_BUFFERING',
  'OBS_MEDIA_STATE_PAUSED',
]);
const TIME_VALID_STATES = new Set([
  'OBS_MEDIA_STATE_PLAYING',
  'OBS_MEDIA_STATE_PAUSED',
]);
const STARTUP_GRACE_MS = 3000;
const STATE_SETTLE_TIMEOUT_MS = 2000;
const STATE_POLL_MS = 25;
const SEEK_TOLERANCE_MS = 1500;
const SEEK_SNAP_TOLERANCE_MS = 5000;
const SEEK_STABLE_DELTA_MS = 50;
const SEEK_STABLE_POLLS = 2;
const RESUME_BACKTRACK_TOLERANCE_MS = 1500;
const RESUME_VERIFY_DELAY_MS = 75;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForStatus(obs, mediaId, predicate, description) {
  const deadline = Date.now() + STATE_SETTLE_TIMEOUT_MS;
  let status = await obs.call('GetMediaInputStatus', { inputUuid: mediaId });
  while (!predicate(status)) {
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for ${description}; last state=${status.mediaState ?? 'unknown'}, cursor=${status.mediaCursor ?? 'null'}`);
    }
    await sleep(STATE_POLL_MS);
    status = await obs.call('GetMediaInputStatus', { inputUuid: mediaId });
  }
  return status;
}

async function waitForSeekCursor(obs, mediaId, targetMs, description) {
  const deadline = Date.now() + STATE_SETTLE_TIMEOUT_MS;
  let status = await obs.call('GetMediaInputStatus', { inputUuid: mediaId });
  let previousCursor = null;
  let stablePolls = 0;

  while (true) {
    if (TIME_VALID_STATES.has(status.mediaState) && Number.isFinite(status.mediaCursor)) {
      const distance = Math.abs(status.mediaCursor - targetMs);
      if (distance <= SEEK_TOLERANCE_MS) return status;
      if (status.mediaState === 'OBS_MEDIA_STATE_PAUSED' && distance <= SEEK_SNAP_TOLERANCE_MS) {
        if (previousCursor !== null && Math.abs(status.mediaCursor - previousCursor) <= SEEK_STABLE_DELTA_MS) {
          stablePolls += 1;
        } else {
          stablePolls = 0;
        }
        if (stablePolls >= SEEK_STABLE_POLLS) return status;
      } else {
        stablePolls = 0;
      }
      previousCursor = status.mediaCursor;
    }

    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for ${description}; last state=${status.mediaState ?? 'unknown'}, cursor=${status.mediaCursor ?? 'null'}`);
    }
    await sleep(STATE_POLL_MS);
    status = await obs.call('GetMediaInputStatus', { inputUuid: mediaId });
  }
}

async function resumeAtCursor(obs, mediaId, expectedCursor, description) {
  await obs.call('TriggerMediaInputAction', { inputUuid: mediaId, mediaAction: PLAY });
  let status = await waitForStatus(
    obs,
    mediaId,
    (candidate) => candidate.mediaState === 'OBS_MEDIA_STATE_PLAYING' && Number.isFinite(candidate.mediaCursor),
    description,
  );
  await sleep(RESUME_VERIFY_DELAY_MS);
  const verified = await obs.call('GetMediaInputStatus', { inputUuid: mediaId });
  if (verified.mediaState === 'OBS_MEDIA_STATE_PLAYING' && Number.isFinite(verified.mediaCursor)) status = verified;
  if (Number.isFinite(expectedCursor)
      && Number.isFinite(status.mediaCursor)
      && status.mediaCursor < expectedCursor - RESUME_BACKTRACK_TOLERANCE_MS) {
    await obs.call('TriggerMediaInputAction', { inputUuid: mediaId, mediaAction: PAUSE });
    await waitForStatus(obs, mediaId, (candidate) => candidate.mediaState === 'OBS_MEDIA_STATE_PAUSED', `${description} correction pause`);
    await obs.call('SetMediaInputCursor', { inputUuid: mediaId, mediaCursor: expectedCursor });
    const correctedSeek = await waitForSeekCursor(obs, mediaId, expectedCursor, `${description} correction seek`);
    await obs.call('TriggerMediaInputAction', { inputUuid: mediaId, mediaAction: PLAY });
    status = await waitForStatus(
      obs,
      mediaId,
      (candidate) => candidate.mediaState === 'OBS_MEDIA_STATE_PLAYING' && Number.isFinite(candidate.mediaCursor),
      `${description} correction play`,
    );
    if (status.mediaCursor < correctedSeek.mediaCursor - RESUME_BACKTRACK_TOLERANCE_MS) {
      throw new Error(`Media range resume lost its cursor after correction; expected near ${correctedSeek.mediaCursor}ms, got ${status.mediaCursor}ms`);
    }
  }
  return status;
}

export class RangePlaybackManager {
  #obs;
  #ranges = new Map();

  constructor(obs) {
    this.#obs = obs;
  }

  get(mediaId) {
    const entry = this.#ranges.get(mediaId);
    return entry ? this.#publicEntry(entry) : null;
  }

  list() {
    return [...this.#ranges.values()].map((entry) => this.#publicEntry(entry));
  }

  async start({ mediaId, startMs, endMs, endAction = 'pause', pollIntervalMs = 50 }) {
    if (!Number.isFinite(startMs) || startMs < 0) throw new Error('startMs must be >= 0');
    if (!Number.isFinite(endMs) || endMs <= startMs) throw new Error('endMs must be greater than startMs');
    if (!['pause', 'stop'].includes(endAction)) throw new Error('endAction must be pause or stop');
    if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 25 || pollIntervalMs > 2000) {
      throw new Error('pollIntervalMs must be an integer from 25 through 2000');
    }

    await this.cancel(mediaId, { pause: false });
    let status = await this.#obs.call('GetMediaInputStatus', { inputUuid: mediaId });
    if (!TIME_VALID_STATES.has(status.mediaState) || !Number.isFinite(status.mediaCursor)) {
      await this.#obs.call('TriggerMediaInputAction', {
        inputUuid: mediaId,
        mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART',
      });
      status = await waitForStatus(
        this.#obs,
        mediaId,
        (candidate) => candidate.mediaState === 'OBS_MEDIA_STATE_PLAYING' && Number.isFinite(candidate.mediaCursor),
        'media range restart',
      );
    }
    if (status.mediaState === 'OBS_MEDIA_STATE_PLAYING') {
      await this.#obs.call('TriggerMediaInputAction', { inputUuid: mediaId, mediaAction: PAUSE });
      await waitForStatus(
        this.#obs,
        mediaId,
        (candidate) => candidate.mediaState === 'OBS_MEDIA_STATE_PAUSED',
        'media range pause before seek',
      );
    }
    await this.#obs.call('SetMediaInputCursor', { inputUuid: mediaId, mediaCursor: startMs });
    const seekStatus = await waitForSeekCursor(this.#obs, mediaId, startMs, `media cursor near ${startMs}ms`);
    await resumeAtCursor(this.#obs, mediaId, seekStatus.mediaCursor, 'media range playback to start');
    const entry = {
      rangeId: randomUUID(),
      mediaId,
      startMs,
      endMs,
      endAction,
      pollIntervalMs,
      startedAt: new Date().toISOString(),
      startedAtMs: Date.now(),
      actualStartMs: seekStatus.mediaCursor,
      timer: null,
      polling: false,
      cancelled: false,
      seenActiveState: false,
      lastCursorMs: startMs,
      lastState: null,
      lastError: null,
    };
    entry.timer = setInterval(() => void this.#tick(entry), pollIntervalMs);
    entry.timer.unref?.();
    this.#ranges.set(mediaId, entry);
    return this.#publicEntry(entry);
  }

  async cancel(mediaId, { pause = false } = {}) {
    const entry = this.#ranges.get(mediaId);
    if (entry) {
      entry.cancelled = true;
      if (entry.timer) clearInterval(entry.timer);
      this.#ranges.delete(mediaId);
    }
    if (pause) await this.#obs.call('TriggerMediaInputAction', { inputUuid: mediaId, mediaAction: PAUSE });
    return entry ? this.#publicEntry(entry) : null;
  }

  close() {
    for (const entry of this.#ranges.values()) {
      entry.cancelled = true;
      if (entry.timer) clearInterval(entry.timer);
    }
    this.#ranges.clear();
  }

  async #tick(entry) {
    if (entry.cancelled || entry.polling || this.#ranges.get(entry.mediaId) !== entry) return;
    entry.polling = true;
    try {
      const status = await this.#obs.call('GetMediaInputStatus', { inputUuid: entry.mediaId });
      if (entry.cancelled || this.#ranges.get(entry.mediaId) !== entry) return;
      entry.lastState = status.mediaState ?? null;
      if (Number.isFinite(status.mediaCursor)) entry.lastCursorMs = status.mediaCursor;
      entry.lastError = null;
      if (ACTIVE_STATES.has(status.mediaState)) entry.seenActiveState = true;
      if (Number.isFinite(status.mediaCursor) && status.mediaCursor >= entry.endMs) {
        await this.#finish(entry);
        return;
      }
      if (status.mediaState === 'OBS_MEDIA_STATE_ERROR') {
        entry.cancelled = true;
        if (entry.timer) clearInterval(entry.timer);
        this.#ranges.delete(entry.mediaId);
        return;
      }
      const startupGraceExpired = Date.now() - entry.startedAtMs >= STARTUP_GRACE_MS;
      if (TERMINAL_STATES.has(status.mediaState) && (entry.seenActiveState || startupGraceExpired)) {
        entry.cancelled = true;
        if (entry.timer) clearInterval(entry.timer);
        this.#ranges.delete(entry.mediaId);
      }
    } catch (error) {
      entry.lastError = error instanceof Error ? error.message : String(error);
    } finally {
      entry.polling = false;
    }
  }

  async #finish(entry) {
    if (entry.cancelled || this.#ranges.get(entry.mediaId) !== entry) return;
    entry.cancelled = true;
    if (entry.timer) clearInterval(entry.timer);
    this.#ranges.delete(entry.mediaId);
    if (entry.endAction === 'stop') {
      await this.#obs.call('TriggerMediaInputAction', { inputUuid: entry.mediaId, mediaAction: STOP });
      return;
    }
    await this.#obs.call('TriggerMediaInputAction', { inputUuid: entry.mediaId, mediaAction: PAUSE });
    await waitForStatus(
      this.#obs,
      entry.mediaId,
      (status) => status.mediaState === 'OBS_MEDIA_STATE_PAUSED',
      'media range end pause',
    );
  }

  #publicEntry(entry) {
    return {
      rangeId: entry.rangeId,
      mediaId: entry.mediaId,
      startMs: entry.startMs,
      actualStartMs: entry.actualStartMs,
      endMs: entry.endMs,
      endAction: entry.endAction,
      pollIntervalMs: entry.pollIntervalMs,
      startedAt: entry.startedAt,
      lastCursorMs: entry.lastCursorMs,
      lastState: entry.lastState,
      lastError: entry.lastError,
    };
  }
}
