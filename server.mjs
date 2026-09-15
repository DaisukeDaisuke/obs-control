import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadServerConfig } from './src/config.mjs';
import { ObsWebSocketClient } from './src/obs-websocket-client.mjs';
import { RangePlaybackManager } from './src/range-playback.mjs';
import { TOOL_SCHEMAS, createToolHandler, errorResult } from './src/tools.mjs';

const modulePath = fileURLToPath(import.meta.url);
const directExecution = process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(modulePath);

export const HELP = `OBS Control MCP
Usage:
  node server.mjs
Environment:
  OBS_MCP_CONFIG                    TOML config path (default ./config.toml beside server.mjs)
  OBS_WEBSOCKET_URL                 WebSocket URL (default ws://127.0.0.1:4455)
  OBS_WEBSOCKET_PASSWORD            OBS WebSocket password; overrides config.toml
  OBS_WEBSOCKET_CONNECT_TIMEOUT_MS  Connect timeout (default 5000)
  OBS_WEBSOCKET_REQUEST_TIMEOUT_MS  Per-request timeout (default 10000)
  OBS_MCP_MAX_IMAGE_BYTES           Maximum screenshot bytes returned to MCP (default 8388608)
Options:
  --help  Print this help and exit.
`;

const response = (id, result) => ({ jsonrpc: '2.0', id, result });
const protocolError = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

export function createServer({ obs = new ObsWebSocketClient() } = {}) {
  let initialized = false;
  const ranges = new RangePlaybackManager(obs);
  const handleTool = createToolHandler({ obs, ranges });

  const handle = async (request) => {
    if (!request || request.jsonrpc !== '2.0' || typeof request.method !== 'string') {
      return protocolError(request?.id, -32600, 'Invalid Request');
    }
    if (request.method === 'notifications/initialized' || request.method === 'notifications/cancelled') return null;
    if (request.method === 'initialize') {
      initialized = true;
      return response(request.id, {
        protocolVersion: request.params?.protocolVersion ?? '2026-07-28',
        capabilities: { tools: {} },
        serverInfo: { name: 'obs-control', version: '0.4.0' },
        instructions: 'Control OBS Studio over obs-websocket v5. Persistent identifiers are native OBS UUIDs: sceneId is sceneUuid and mediaId/textId/inputId is inputUuid. The screenshot tool returns actual MCP image content for vision. media_play_range enforces an end cursor asynchronously while the MCP server remains alive.',
      });
    }
    if (!initialized) return protocolError(request.id, -32002, 'Server not initialized');
    if (request.method === 'ping') return response(request.id, {});
    if (request.method === 'tools/list') return response(request.id, { tools: TOOL_SCHEMAS });
    if (request.method === 'tools/call') {
      try {
        if (typeof request.params?.name !== 'string') throw new Error('tools/call requires a tool name');
        const result = await handleTool(request.params.name, request.params.arguments ?? {});
        return response(request.id, result);
      } catch (error) {
        return response(request.id, errorResult(error));
      }
    }
    return protocolError(request.id, -32601, 'Method not found');
  };

  const close = async () => {
    ranges.close();
    await obs.disconnect();
  };

  return { handle, close, obs, ranges };
}

export async function startStdio(input = process.stdin, output = process.stdout) {
  const config = await loadServerConfig();
  const server = createServer({ obs: new ObsWebSocketClient(config.obs) });
  let buffer = '';
  let closing = false;

  const close = async () => {
    if (closing) return;
    closing = true;
    await server.close();
  };

  input.setEncoding('utf8');
  input.on('data', (chunk) => {
    buffer += chunk;
    while (true) {
      const newline = buffer.indexOf('\n');
      if (newline < 0) break;
      const line = buffer.slice(0, newline).replace(/\r$/, '');
      buffer = buffer.slice(newline + 1);
      if (!line.trim()) continue;
      let request;
      try {
        request = JSON.parse(line);
      } catch {
        output.write(`${JSON.stringify(protocolError(null, -32700, 'Parse error'))}\n`);
        continue;
      }
      void server.handle(request).then((reply) => {
        if (reply) output.write(`${JSON.stringify(reply)}\n`);
      }).catch((error) => {
        output.write(`${JSON.stringify(protocolError(request?.id, -32603, error instanceof Error ? error.message : String(error)))}\n`);
      });
    }
  });

  input.on('end', () => void close());
  input.on('close', () => void close());
  process.once('SIGINT', () => void close().finally(() => process.exit(0)));
  process.once('SIGTERM', () => void close().finally(() => process.exit(0)));
  return { server, close };
}

if (directExecution) {
  const args = process.argv.slice(2);
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    process.stdout.write(HELP);
  } else if (args.length > 0) {
    process.stderr.write('Unknown argument. Run with --help.\n');
    process.exitCode = 2;
  } else {
    await startStdio();
  }
}
