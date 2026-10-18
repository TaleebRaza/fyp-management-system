// Test-only wire proxy: real MongoDB replies, globally paced CRUD commands, fixed synthetic RTT.
import assert from 'node:assert/strict';
import net from 'node:net';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { BSON } from 'bson';

const CRUD = new Set(['find', 'getMore', 'insert', 'update', 'delete', 'findAndModify', 'aggregate', 'count', 'distinct']);

export function commandName(packet) {
  const opcode = packet.readInt32LE(12);
  assert.notEqual(opcode, 2012, 'Compressed messages are unsupported in this test proxy.');
  if (opcode !== 2013) return null;
  assert.equal(packet[20], 0, 'Expected an OP_MSG body section.');
  const length = packet.readInt32LE(21);
  return Object.keys(BSON.deserialize(packet.subarray(21, 21 + length)))[0];
}

export function maximumPerSecond(times) {
  let first = 0;
  let maximum = 0;
  for (let last = 0; last < times.length; last++) {
    while (times[last] - times[first] >= 1000) first++;
    maximum = Math.max(maximum, last - first + 1);
  }
  return maximum;
}

export async function startProxy({ listenPort = 27018, targetPort = 27019, latencyMs = 20 } = {}) {
  const sockets = new Set();
  const forwarded = [];
  const commands = {};
  let tail = Promise.resolve();
  let lastForward = -Infinity;
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const server = net.createServer((client) => {
    const upstream = net.connect(targetPort, '127.0.0.1');
    sockets.add(client);
    sockets.add(upstream);
    let pending = Buffer.alloc(0);
    client.on('data', (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      while (pending.length >= 4 && pending.length >= pending.readInt32LE(0)) {
        const size = pending.readInt32LE(0);
        assert.ok(size >= 16 && size <= 48 * 1024 * 1024, 'Invalid MongoDB packet size.');
        const packet = pending.subarray(0, size);
        pending = pending.subarray(size);
        const command = commandName(packet);
        const send = async () => {
          if (CRUD.has(command)) {
            const wait = 10 - (performance.now() - lastForward);
            if (wait > 0) await pause(Math.ceil(wait));
            lastForward = performance.now();
            forwarded.push(lastForward);
            commands[command] = (commands[command] || 0) + 1;
          }
          if (!upstream.destroyed) upstream.write(packet);
        };
        setTimeout(() => {
          if (CRUD.has(command)) tail = tail.then(send);
          else void send();
        }, latencyMs);
      }
    });
    upstream.on('data', (chunk) => setTimeout(() => {
      if (!client.destroyed) client.write(chunk);
    }, latencyMs));
    for (const [socket, peer] of [[client, upstream], [upstream, client]]) {
      socket.on('error', () => peer.destroy());
      socket.on('close', () => { sockets.delete(socket); peer.destroy(); });
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(listenPort, '127.0.0.1', resolve);
  });
  return {
    stats: () => ({ commands, total: forwarded.length, maximumCrudPerRollingSecond: maximumPerSecond(forwarded), syntheticRoundTripMs: latencyMs * 2 }),
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const proxy = await startProxy();
  console.log('Test MongoDB proxy ready: 127.0.0.1:27018; 100 CRUD commands/s; synthetic 40 ms RTT.');
  process.once('SIGTERM', async () => {
    const stats = proxy.stats();
    assert.ok(stats.maximumCrudPerRollingSecond <= 100);
    if (process.env.LOGIN_PROXY_REPORT) await writeFile(process.env.LOGIN_PROXY_REPORT, JSON.stringify(stats, null, 2));
    await proxy.close();
  });
}
