import { ObsWebSocketClient } from '../src/obs-websocket-client.mjs';

const obs = new ObsWebSocketClient();
try {
  const connection = await obs.connect();
  const version = await obs.call('GetVersion');
  process.stdout.write(`${JSON.stringify({ ok: true, connection, version })}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) })}\n`);
  process.exitCode = 1;
} finally {
  await obs.disconnect();
}
