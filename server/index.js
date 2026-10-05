import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { RoomManager } from './room.js';
import { REGIONS } from '../shared/rules.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = express();
const region = process.env.REGION || null;
const regionInfo = REGIONS.find(r => r.id === region);
app.get('/health', (_req, res) => { if (region) res.set('Access-Control-Allow-Origin', '*').json({ ok: true, region }); else res.json({ ok: true }); });
app.get('/config.js', (_req, res) => { res.type('application/javascript').send(`window.GAME_SERVERS=${JSON.stringify(parseServers(process.env.GAME_SERVERS))};`); });
app.use('/vendor/three', express.static(path.join(root, 'node_modules/three')));
app.use('/shared', express.static(path.join(root, 'shared')));
app.use(express.static(path.join(root, 'public')));
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const rooms = new RoomManager(regionInfo ? regionInfo.prefix : '');

wss.on('connection', socket => {
  socket.clientId = randomUUID();
  socket.isAlive = true;
  socket.on('pong', () => { socket.isAlive = true; });
  socket.room = null;
  socket.player = null;
  socket.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || typeof msg.type !== 'string') return;
    if (msg.type === 'ping') {
      socket.lastPingAt = Date.now();
      socket.send(JSON.stringify({ type: 'pong', stamp: msg.stamp, serverTime: Date.now() }));
      return;
    }
    if (msg.type === 'pingResult') {
      const rtt = Math.max(0, Math.min(500, Number(msg.rtt) || 0));
      if (socket.room && socket.player !== null) socket.room.setPing(socket.player, rtt);
      socket.lastPing = rtt;
      return;
    }
    if (msg.type === 'practice') {
      rooms.createPractice(socket, cleanName(msg.name), msg.botLevel, msg.fighter, msg.tutorial===true);
      return;
    }
    if (msg.type === 'create') {
      const result = rooms.create(socket, cleanName(msg.name), msg.fighter);
      socket.send(JSON.stringify(result));
      return;
    }
    if (msg.type === 'join') {
      const result = rooms.join(socket, String(msg.code || '').toUpperCase(), cleanName(msg.name), msg.fighter);
      socket.send(JSON.stringify(result));
      return;
    }
    if (msg.type === 'rejoin') {
      const result = rooms.rejoin(socket, String(msg.code || '').toUpperCase(), String(msg.token || ''));
      socket.send(JSON.stringify(result));
      return;
    }
    const room = socket.room;
    if (!room) return;
    switch (msg.type) {
      case 'ready': room.setReady(socket.player, !!msg.ready); break;
      case 'fighter': room.setFighter(socket.player, msg.fighter); break;
      case 'rematch': room.setRematch(socket.player); break;
      case 'move': room.move(socket.player, msg); break;
      case 'dash': room.dash(socket.player); break;
      case 'attack': room.attack(socket.player, msg); break;
      case 'block': room.block(socket.player, !!msg.held, msg); break;
      case 'swap': room.swap(socket.player); break;
      case 'drop': room.drop(socket.player); break;
      case 'special': room.special(socket.player); break;
      case 'pickup': room.pickup(socket.player); break;
      case 'tutorialSkip': room.skipTutorial(socket.player); break;
      case 'leave': room.disconnect(socket.player, true, socket); break;
    }
  });
  socket.on('close', () => { if (socket.room && socket.player !== null) socket.room.disconnect(socket.player, false, socket); });
});

const connectionWatchdog = setInterval(() => {
  for (const socket of wss.clients) {
    if (!socket.room || !['countdown','fight'].includes(socket.room.phase)) continue;
    if (!socket.isAlive) { socket.terminate(); continue; }
    socket.isAlive = false;
    socket.ping();
  }
}, 2000);
server.on('close', () => clearInterval(connectionWatchdog));

function cleanName(value) {
  const name = String(value || '').trim().slice(0, 16);
  return name || 'Player';
}
function parseServers(raw = '') { return Object.fromEntries(String(raw).split(',').map(x => x.trim()).filter(Boolean).map(x => x.split('=').map(y => y.trim())).filter(x => x.length === 2)); }

const port = Number(process.env.PORT) || 3000;
server.listen(port, '0.0.0.0', () => console.log(`Clash Point listening on http://localhost:${port}`));
