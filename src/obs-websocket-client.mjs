import { createHash, randomUUID } from 'node:crypto';

const DEFAULT_URL = 'ws://127.0.0.1:4455';
const DEFAULT_CONNECT_TIMEOUT_MS = 5000;
const DEFAULT_REQUEST_TIMEOUT_MS = 10000;

function positiveIntegerEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

function sha256Base64(text) {
  return createHash('sha256').update(text, 'utf8').digest('base64');
}

function authenticationString(password, salt, challenge) {
  const secret = sha256Base64(password + salt);
  return sha256Base64(secret + challenge);
}

function eventDataToString(data) {
  if (typeof data === 'string') return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('utf8');
  throw new Error(`Unsupported WebSocket message data type: ${typeof data}`);
}

export class ObsRequestError extends Error {
  constructor(requestType, code, comment = '') {
    super(comment || `OBS request ${requestType} failed with code ${code}`);
    this.name = 'ObsRequestError';
    this.requestType = requestType;
    this.code = code;
  }
}

export class ObsWebSocketClient {
  #socket = null;
  #identified = false;
  #connectPromise = null;
  #connectResolve = null;
  #connectReject = null;
  #connectTimer = null;
  #hello = null;
  #identifiedData = null;
  #pending = new Map();
  #url;
  #password;
  #connectTimeoutMs;
  #requestTimeoutMs;

  constructor({
    url = process.env.OBS_WEBSOCKET_URL || DEFAULT_URL,
    password = process.env.OBS_WEBSOCKET_PASSWORD || '',
    connectTimeoutMs = positiveIntegerEnv('OBS_WEBSOCKET_CONNECT_TIMEOUT_MS', DEFAULT_CONNECT_TIMEOUT_MS),
    requestTimeoutMs = positiveIntegerEnv('OBS_WEBSOCKET_REQUEST_TIMEOUT_MS', DEFAULT_REQUEST_TIMEOUT_MS),
  } = {}) {
    this.#url = url;
    this.#password = password;
    this.#connectTimeoutMs = connectTimeoutMs;
    this.#requestTimeoutMs = requestTimeoutMs;
  }

  get url() {
    return this.#url;
  }

  get connected() {
    return this.#identified && this.#socket?.readyState === WebSocket.OPEN;
  }

  get connectionInfo() {
    if (!this.#hello || !this.#identifiedData) return null;
    return {
      obsStudioVersion: this.#hello.obsStudioVersion,
      obsWebSocketVersion: this.#hello.obsWebSocketVersion,
      serverRpcVersion: this.#hello.rpcVersion,
      negotiatedRpcVersion: this.#identifiedData.negotiatedRpcVersion,
    };
  }

  async connect() {
    if (this.connected) return this.connectionInfo;
    if (this.#connectPromise) return this.#connectPromise;
    if (typeof WebSocket !== 'function') {
      throw new Error('Global WebSocket is unavailable. OBS Control requires Node.js 22 or newer.');
    }

    this.#connectPromise = new Promise((resolve, reject) => {
      this.#connectResolve = resolve;
      this.#connectReject = reject;
      const socket = new WebSocket(this.#url, 'obswebsocket.json');
      this.#socket = socket;
      socket.addEventListener('message', (event) => {
        if (this.#socket === socket) this.#handleMessage(event);
      });
      socket.addEventListener('close', (event) => this.#handleClose(event, socket));
      socket.addEventListener('error', () => {
        if (this.#socket === socket && !this.#identified) {
          this.#failConnect(new Error(`Could not connect to OBS WebSocket at ${this.#url}`));
        }
      });
      this.#connectTimer = setTimeout(() => {
        this.#failConnect(new Error(`Timed out connecting to OBS WebSocket at ${this.#url}`));
        try {
          socket.close();
        } catch {
          // The timeout error above is the useful result.
        }
      }, this.#connectTimeoutMs);
    }).finally(() => {
      this.#connectPromise = null;
    });

    return this.#connectPromise;
  }

  async call(requestType, requestData = undefined) {
    await this.connect();
    if (!this.connected) throw new Error('OBS WebSocket is not connected');
    const requestId = randomUUID();
    const payload = { op: 6, d: { requestType, requestId } };
    if (requestData !== undefined) payload.d.requestData = requestData;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(requestId);
        reject(new Error(`OBS request ${requestType} timed out after ${this.#requestTimeoutMs} ms`));
      }, this.#requestTimeoutMs);
      this.#pending.set(requestId, { requestType, resolve, reject, timer });
      try {
        this.#socket.send(JSON.stringify(payload));
      } catch (error) {
        clearTimeout(timer);
        this.#pending.delete(requestId);
        reject(error);
      }
    });
  }

  async disconnect() {
    const socket = this.#socket;
    this.#resetConnectionState();
    this.#rejectPending(new Error('OBS WebSocket disconnected'));
    if (!socket || socket.readyState === WebSocket.CLOSED) return;
    try {
      socket.close(1000, 'OBS Control MCP shutdown');
    } catch {
      // Shutdown is best-effort.
    }
  }

  #handleMessage(event) {
    let message;
    try {
      message = JSON.parse(eventDataToString(event.data));
    } catch (error) {
      if (!this.#identified) this.#failConnect(new Error(`Invalid JSON received from OBS: ${error.message}`));
      return;
    }
    if (!message || typeof message.op !== 'number' || typeof message.d !== 'object' || message.d === null) return;
    if (message.op === 0) this.#handleHello(message.d);
    else if (message.op === 2) this.#handleIdentified(message.d);
    else if (message.op === 7) this.#handleResponse(message.d);
  }

  #handleHello(hello) {
    this.#hello = hello;
    if (!Number.isFinite(hello.rpcVersion) || hello.rpcVersion < 1) {
      this.#failConnect(new Error(`Unsupported OBS WebSocket RPC version: ${hello.rpcVersion}`));
      return;
    }
    const identify = { rpcVersion: 1, eventSubscriptions: 0 };
    if (hello.authentication) {
      if (!this.#password) {
        this.#failConnect(new Error('OBS WebSocket requires a password. Set [obs].password in config.toml or OBS_WEBSOCKET_PASSWORD.'));
        try {
          this.#socket?.close();
        } catch {
          // The explicit authentication error is more useful.
        }
        return;
      }
      const { salt, challenge } = hello.authentication;
      if (typeof salt !== 'string' || typeof challenge !== 'string') {
        this.#failConnect(new Error('OBS WebSocket returned an invalid authentication challenge'));
        return;
      }
      identify.authentication = authenticationString(this.#password, salt, challenge);
    }
    try {
      this.#socket?.send(JSON.stringify({ op: 1, d: identify }));
    } catch (error) {
      this.#failConnect(error);
    }
  }

  #handleIdentified(data) {
    this.#identified = true;
    this.#identifiedData = data;
    if (this.#connectTimer) clearTimeout(this.#connectTimer);
    this.#connectTimer = null;
    const resolve = this.#connectResolve;
    this.#connectResolve = null;
    this.#connectReject = null;
    resolve?.(this.connectionInfo);
  }

  #handleResponse(data) {
    const pending = this.#pending.get(data.requestId);
    if (!pending) return;
    this.#pending.delete(data.requestId);
    clearTimeout(pending.timer);
    if (!data.requestStatus?.result) {
      pending.reject(new ObsRequestError(pending.requestType, data.requestStatus?.code, data.requestStatus?.comment));
      return;
    }
    pending.resolve(data.responseData ?? {});
  }

  #handleClose(event, socket) {
    if (socket !== this.#socket) return;
    const reason = event.reason ? `: ${event.reason}` : '';
    const error = new Error(`OBS WebSocket closed with code ${event.code}${reason}`);
    if (!this.#identified) this.#failConnect(error);
    this.#rejectPending(error);
    this.#resetConnectionState();
  }

  #failConnect(error) {
    if (this.#connectTimer) clearTimeout(this.#connectTimer);
    this.#connectTimer = null;
    const reject = this.#connectReject;
    this.#connectResolve = null;
    this.#connectReject = null;
    reject?.(error);
  }

  #rejectPending(error) {
    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.#pending.clear();
  }

  #resetConnectionState() {
    if (this.#connectTimer) clearTimeout(this.#connectTimer);
    this.#connectTimer = null;
    this.#socket = null;
    this.#identified = false;
    this.#hello = null;
    this.#identifiedData = null;
  }
}
