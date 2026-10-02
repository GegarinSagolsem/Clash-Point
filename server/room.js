import { ARENA_RADIUS, BLOCK_RULES, BODY_RADIUS, CAPTURE, COUNTDOWN_SECONDS, DASH, DROP_RULES, EASY_BOT, HIT_PUSH, MATCH_HP, MATCH_SECONDS, MAX_PING_MS, MOVEMENT, NETWORK, OBSTACLES, PICKUP_RADIUS, PLAYER_MOVE, PLAYER_RADIUS, PLAYER_SEPARATION, PARRY_RULES, POTION, SHIELD_DEF, SPAWNS, SPECIAL, STAMINA, TICK_RATE, WEAPONS } from '../shared/rules.js';
import { randomUUID } from 'node:crypto';

const CODES = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const now = () => Date.now();
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const safeSend = (socket, data) => { if (socket?.readyState === 1) socket.send(JSON.stringify(data)); };

export class RoomManager {
  constructor(regionPrefix = '') { this.rooms = new Map(); this.regionPrefix = regionPrefix; }
  create(socket, name, options = {}) {
    let code;
    const prefix = this.regionPrefix || '';
    do { code = prefix + Array.from({ length: prefix ? 3 : 4 }, () => CODES[Math.floor(Math.random() * CODES.length)]).join(''); } while (this.rooms.has(code));
    const room = new Room(code, this); room.mode=options.mode==='capture'?'capture':'duel';
    if(room.mode==='capture'){room.teamSize=clamp(Number(options.teamSize)||CAPTURE.teamSize,1,CAPTURE.teamSize);room.fillBots=options.fillBots!==false;}
    this.rooms.set(code, room);
    room.add(socket, name);
    return { type: 'joined', code, player: 0, token: room.players[0].rejoinToken, players: room.lobbyPlayers() };
  }
  createPractice(socket, name, mode = 'duel') {
    let code;
    const prefix = this.regionPrefix || '';
    do { code = prefix + Array.from({ length: prefix ? 3 : 4 }, () => CODES[Math.floor(Math.random() * CODES.length)]).join(''); } while (this.rooms.has(code));
    const room = new Room(code, this);
    room.practice = true; room.mode=mode==='capture'?'capture':'duel'; room.teamSize=CAPTURE.teamSize; room.fillBots=true;
    this.rooms.set(code, room);
    room.add(socket, name);
    if(room.mode==='capture'){for(let i=1;i<CAPTURE.teamSize;i++)room.add(null,'',true,'red');for(let i=0;i<CAPTURE.teamSize;i++)room.add(null,'',true,'blue');}
    else room.add(null, 'Bot · Easy', true);
    room.start();
    return room;
  }
  join(socket, code, name, requestedTeam = null) {
    const room = this.rooms.get(code);
    if (!room) return { type: 'error', message: 'Room not found' };
    if (room.practice) return { type: 'error', message: 'Room not found' };
    if (room.phase !== 'lobby'||room.players.filter(p=>!p.isBot).length >= (room.mode==='capture'?CAPTURE.teamSize*2:2)) return { type: 'error', message: 'Room is full' };
    let id;
    if(room.mode==='capture'&&room.phase==='fight'){
      const bot=room.players.filter(p=>p.isBot).sort((a,b)=>room.players.filter(x=>x.team===a.team).length-room.players.filter(x=>x.team===b.team).length)[0];
      if(!bot)return {type:'error',message:'Room is full'};id=bot.id;Object.assign(bot,{name:room.uniqueName(name), socket,isBot:false,connected:true,ready:true,rejoinToken:randomUUID(),rejoinUntil:0,team:bot.team});socket.room=room;socket.player=id;
      room.broadcast({type:'roster',players:room.publicPlayers(),...room.captureSnapshot()});const remaining=Math.max(0,Math.ceil((room.endsAt-now())/1000));return {type:'rejoined',code,player:id,token:bot.rejoinToken,phase:room.phase,serverTime:now(),remaining,endsAt:room.endsAt,players:room.publicPlayers(),items:room.items,...room.captureSnapshot()};
    }
    if(room.phase!=='lobby')return {type:'error',message:'Room is full'};
    id = room.add(socket, name,false,room.mode==='capture'?(room.players.length>=room.teamSize*2?null:(['red','blue'].includes(requestedTeam)&&room.players.filter(p=>p.team===requestedTeam).length<room.teamSize?requestedTeam:room.smallerTeam())):null);
    room.broadcast(room.lobbyState());
    return { type: 'joined', code, player: id, token: room.players.find(p=>p.id===id).rejoinToken, players: room.lobbyPlayers(),...room.captureSnapshot() };
  }
  rejoin(socket, code, token) {
    const room = this.rooms.get(code), t = now();
    if (room?.practice) return { type:'error', message:'Rejoin is unavailable for practice' };
    const p = room?.players.find(x => x.rejoinToken === token && (x.connected || x.rejoinUntil >= t));
    if (!p || !['countdown','fight'].includes(room.phase)) return { type:'error', message:'Rejoin window expired' };
    const oldSocket=p.socket;
    p.socket = socket; p.connected = true; p.rejoinUntil = 0;
    socket.room = room; socket.player = p.id;
    if(oldSocket!==socket&&oldSocket?.readyState===1)oldSocket.close(4001,'Session resumed elsewhere');
    const remaining = Math.max(0, Math.ceil(((room.phase === 'fight' ? room.endsAt : room.startedAt) - t) / 1000));
    room.broadcast({ type:'reconnected', player:p.id });
    return { type:'rejoined', code:room.code, player:p.id, token:p.rejoinToken, phase:room.phase, serverTime:t, remaining, endsAt:room.endsAt, players:room.publicPlayers(), items:room.items,...room.captureSnapshot() };
  }
  delete(code) { this.rooms.delete(code); }
}

class Room {
  constructor(code, manager) {
    this.code = code; this.manager = manager; this.players = []; this.phase = 'lobby'; this.items = []; this.practice = false;this.mode='duel';this.teamSize=1;this.fillBots=false;
    this.tick = setInterval(() => this.update(), 1000 / TICK_RATE);
    this.lastDrop = 0; this.pending = [];
  }
  add(socket, name, isBot = false, team = null) {
    const id = this.players.length;
    if(this.mode==='capture')name=isBot?this.uniqueBotName():this.uniqueName(name||randomFighterName());
    const spawn = SPAWNS[id]||{x:0,y:0,z:0,yaw:0};
    const p = { id, name, fighter: id % 2 === 0 ? 'Knight' : 'Barbarian', socket, isBot, team: this.mode==='capture'?(team||this.smallerTeam()):null, connected: true, ready: false, rematch: false,
      x: spawn.x, y: 0, z: spawn.z, yaw: spawn.yaw, pitch: 0, mt: now(), hp: MATCH_HP, stamina: STAMINA.max, sp: 0, lastSpend: 0, lastMove: now(), moveBudget: 0, corr: 0,
      history: [], ping: 0, rejoinToken:randomUUID(), rejoinUntil:0, block: false, blockAt: 0, blockOffAt: 0, swing: null, nextAttack: 0, nextParry: 0, stunUntil: 0, dashUntil: 0,
      lastDash: 0, lockedUntil: 0, weapon: this.mode==='capture'?'sword':'fists', shield: false, special: null, specialQueue: null, defZeroUntil: 0, bonusUntil: 0, attackBoostUntil: 0, alive: true, kos:0, falls:0 };
    this.players.push(p); if (socket) { socket.room = this; socket.player = id; } p.history.push({ t: now(), x: p.x, z: p.z, yaw: p.yaw });
    return id;
  }
  player(id){return this.players.find(p=>p.id===id);}
  uniqueName(name){const taken=new Set(this.players.map(p=>p.name));if(!taken.has(name))return name;let n=2;while(taken.has(`${name} ${n}`))n++;return `${name} ${n}`;}
  uniqueBotName(except=null){const names=['Iron Fox','Red Wolf','Storm Hawk','Silver Bear','Quiet Tiger','Ash Raven','Bright Lynx','Frost Jackal','Golden Viper','Blue Falcon','Wild Stag','Night Heron','Stone Cobra','Swift Badger','Ember Owl','Grey Panther','Bold Crane','Copper Boar','Clever Otter','Thorn Eagle'],used=new Set(this.players.filter(p=>p!==except).map(p=>p.name));const available=names.filter(n=>!used.has(`Bot · ${n}`));return `Bot · ${available[Math.floor(Math.random()*available.length)]||randomFighterName()}`;}
  smallerTeam(){return this.players.filter(p=>!p.isBot&&p.team==='red').length<=this.players.filter(p=>!p.isBot&&p.team==='blue').length?'red':'blue';}
  lobbyPlayers() { return this.players.map(p => ({ id: p.id, name: p.name, fighter: p.fighter, ready: p.ready, team:p.team,isBot:p.isBot })); }
  lobbyState(){return {type:'lobby',code:this.code,mode:this.mode,teamSize:this.teamSize,fillBots:this.fillBots,players:this.lobbyPlayers()};}
  configure(id,opts){if(id!==0||this.phase!=='lobby')return;const p=this.player(id);if(opts.mode==='duel'){if(this.players.filter(x=>!x.isBot).length>2){this.notice(p,'Duel rooms hold two people');return;}this.mode='duel';this.teamSize=1;this.fillBots=false;this.players=this.players.filter(x=>!x.isBot).slice(0,2);this.players.forEach((x,i)=>{x.id=i;x.team=null;x.socket&&(x.socket.player=i);});}else if(opts.mode==='capture'){this.mode='capture';const current=Math.max(...['red','blue'].map(team=>this.players.filter(x=>!x.isBot&&x.team===team).length));this.teamSize=clamp(Math.max(Number(opts.teamSize)||CAPTURE.teamSize,current),1,CAPTURE.teamSize);this.fillBots=opts.fillBots!==false;this.players.forEach(x=>{if(!x.team)x.team=this.smallerTeam();});if(['red','blue'].includes(opts.team))p.team=opts.team;}else{const current=Math.max(...['red','blue'].map(team=>this.players.filter(x=>!x.isBot&&x.team===team).length));this.teamSize=clamp(Math.max(Number(opts.teamSize)||this.teamSize,current),1,CAPTURE.teamSize);this.fillBots=opts.fillBots!==false;if(['red','blue'].includes(opts.team))p.team=opts.team;}this.broadcast(this.lobbyState());}
  chooseTeam(id,team){const p=this.player(id);if(this.phase==='lobby'&&this.mode==='capture'&&p&&['red','blue'].includes(team)&&this.players.filter(x=>x.team===team).length<this.teamSize){p.team=team;this.broadcast(this.lobbyState());}}
  broadcast(data) { for (const p of this.players) safeSend(p.socket, data); }
  setPing(id, rtt) { const p = this.player(id); if (p) p.ping = clamp(rtt, 0, MAX_PING_MS); }
  teammates(p){return this.players.filter(x=>x!==p&&x.alive&&x.team===p.team);}
  enemies(p){return this.mode==='capture'?this.players.filter(x=>x!==p&&x.alive&&x.team!==p.team):[this.players[1-p.id]].filter(x=>x?.alive);}
  targetFor(p){return this.enemies(p).sort((a,b)=>dist(p,a)-dist(p,b))[0]||null;}
  captureSnapshot(){return this.mode==='capture'?{mode:'capture',teamSize:this.teamSize,point:{progress:this.pointProgress||0,team:this.pointTeam||null,contested:!!this.pointContested},scores:this.scores||{red:0,blue:0}}:{mode:'duel'};}
  setReady(id, ready) { const p = this.player(id); if (!p || this.phase !== 'lobby') return; p.ready = ready; this.broadcast(this.lobbyState()); const humans=this.players.filter(x=>!x.isBot),validCapture=this.fillBots||(this.players.some(x=>x.team==='red'&&!x.isBot)&&this.players.some(x=>x.team==='blue'&&!x.isBot));if(this.mode==='capture'?validCapture&&humans.every(x=>x.ready):humans.length===2&&humans.every(x=>x.ready))this.start(); }
  setRematch(id) { const p = this.player(id); if (!p || this.phase !== 'result') return; p.rematch = true; if (this.practice) { this.start(); return; } const humans=this.players.filter(x=>!x.isBot);this.broadcast({ type: 'result', result: this.result, players: this.publicPlayers(), rematch: this.players.map(x => x.isBot||x.rematch) }); if (humans.every(x=>x.rematch)) this.start(); }
  notice(p, message) { safeSend(p.socket, { type:'notice', message }); }
  addSp(p, amount) { p.sp = clamp((p.sp || 0) + amount, 0, SPECIAL.max); }
  swap(id) {
    const p=this.player(id), t=now(); if(!p||this.phase!=='fight'||!p.alive)return;
    const item=this.items.filter(i=>i.landed&&['sword','spear'].includes(i.type)&&this.canPickup(p,i)&&dist(p,i)<PICKUP_RADIUS).sort((a,b)=>dist(p,a)-dist(p,b))[0];
    if(!item||p.weapon==='fists'||p.weapon===item.type)return;
    const oldWeapon=p.weapon;p.weapon=item.type;this.items=this.items.filter(i=>i!==item);
    if(this.items.length<DROP_RULES.maxGround)this.items.push({id:Math.random().toString(36).slice(2,9),type:oldWeapon,x:p.x,z:p.z,landAt:t,landed:true});
    this.broadcast({type:'event',event:'pickup',player:p.id,item:item.type});
  }
  drop(id) {
    const p=this.player(id),t=now();if(!p||this.phase!=='fight'||!p.alive||p.swing||p.special||p.specialQueue||p.stunUntil>t||p.lockedUntil>t||this.items.length>=DROP_RULES.maxGround)return;
    const type=p.weapon!=='fists'?p.weapon:p.shield?'shield':null;if(!type)return;
    if(type==='shield')p.shield=false;else p.weapon='fists';
    this.items.push({id:Math.random().toString(36).slice(2,9),type,x:p.x,z:p.z,landAt:t,landed:true,dropper:p.id,ownerLock:true});
  }
  special(id) {
    const p=this.player(id);if(!p||this.phase!=='fight'||!p.alive||p.special||p.swing||p.stunUntil>now()||p.lockedUntil>now())return;
    let move=p.weapon==='sword'?'doubleStrike':p.weapon==='spear'?'lunge':p.shield?'shieldBash':null;
    if(!move){this.notice(p,'No special: hold a weapon or a shield');return;}
    if(p.sp<SPECIAL.max){this.notice(p,'SPECIAL NOT READY');return;}
    const t=now();p.special={move,started:t,firesAt:t+SPECIAL.chargeSeconds*1000};
    this.broadcast({type:'event',event:'specialCharge',player:p.id,move,started:t,firesAt:p.special.firesAt});
  }
  startSpecialSwing(p, t, config) {
    const targets=this.enemies(p);if(!targets.length)return;
    const defenderWait=Math.min(NETWORK.hitWaitCapMs,Math.max(...targets.map(target=>target.ping/2+NETWORK.blockParryWaitMs)));
    p.swing={started:t,due:t+config.windup*1000,finish:t+config.duration*1000,weapon:config.weapon,parries:[],defenderWait,checked:false,
      specialDamage:config.damage,specialReach:config.reach,specialReachBonus:config.reachBonus||0,specialArc:config.arc,specialStripHalfWidth:config.stripHalfWidth,specialStun:config.stunSeconds||0};
    p.nextAttack=p.swing.finish;
    this.broadcast({type:'event',event:'swing',player:p.id,weapon:config.weapon,due:p.swing.due,started:t});
    this.planPracticeDefense(p,p.swing);
  }
  fireSpecial(p,t) {
    const charge=p.special;if(!charge)return;p.special=null;p.sp=0;
    if(charge.move==='doubleStrike'){
      const strike=SPECIAL.swordStrike;this.startSpecialSwing(p,t,{...strike,weapon:'sword'});
      p.specialQueue={nextAt:t+(strike.duration+strike.gap)*1000,config:{...strike,weapon:'sword'}};
    }else if(charge.move==='lunge'){
      const config=SPECIAL.spearLunge,fx=Math.sin(p.yaw),fz=Math.cos(p.yaw),oldX=p.x,oldZ=p.z,other=this.targetFor(p);let travel=config.distance;
      if(other?.alive){const ox=other.x-oldX,oz=other.z-oldZ,forward=ox*fx+oz*fz,lateral=Math.abs(ox*fz-oz*fx);if(forward>0&&lateral<=config.stripHalfWidth)travel=Math.min(config.distance,Math.max(0,forward-config.stopBeforeTarget));}
      const dx=fx*travel,dz=fz*travel,steps=Math.max(1,Math.ceil(travel/.075));
      for(let i=steps;i>0;i--){const x=oldX+dx*i/steps,z=oldZ+dz*i/steps,blocked=this.mode==='capture'?this.players.some(o=>o!==p&&o.alive&&Math.hypot(x-o.x,z-o.z)<PLAYER_SEPARATION):other?.alive&&Math.hypot(x-other.x,z-other.z)<PLAYER_SEPARATION;if(Math.hypot(x,z)<=ARENA_RADIUS-PLAYER_RADIUS&&!OBSTACLES.some(o=>Math.hypot(x-o.x,z-o.z)<o.radius+PLAYER_RADIUS)&&!blocked){p.x=x;p.z=z;break;}}
      p.moveBudget=0;p.history.push({t,x:p.x,z:p.z,yaw:p.yaw});this.correct(p);
      this.startSpecialSwing(p,t,{...config,weapon:'spear',reach:config.reach,arc:config.arc});
    }else if(charge.move==='shieldBash'){
      this.startSpecialSwing(p,t,{...SPECIAL.shieldBash,weapon:'fists',reach:SPECIAL.shieldBash.reach,arc:WEAPONS.fists.arc});
    }
  }
  start() {
    if(this.mode==='capture'){if(this.fillBots){for(const team of ['red','blue'])while(this.players.filter(x=>x.team===team).length<this.teamSize)this.add(null,'',true,team);}this.players=this.players.filter(p=>p.team&&this.players.filter(x=>x.team===p.team).indexOf(p)<this.teamSize);this.players.forEach((p,id)=>{p.id=id;if(p.socket)p.socket.player=id;});this.pointProgress=0;this.progressTeam=null;this.pointTeam=null;this.pointContested=false;this.scores={red:0,blue:0};this.lastPointTick=now();}
    this.phase = 'countdown'; this.items = []; this.pending = []; this.startedAt = now() + COUNTDOWN_SECONDS * 1000; this.endsAt = this.startedAt + (this.mode==='capture'?CAPTURE.matchSeconds:MATCH_SECONDS) * 1000; this.lastDrop = this.startedAt + DROP_RULES.firstMinSeconds*1000 + Math.random()*(DROP_RULES.firstMaxSeconds-DROP_RULES.firstMinSeconds)*1000;
    for (const p of this.players) { const s=this.mode==='capture'?this.captureSpawn(p):SPAWNS[p.id], t=now(); Object.assign(p, { x:s.x,y:0,z:s.z,yaw:s.yaw,mt:t,pitch:0,hp:MATCH_HP,stamina:STAMINA.max,sp:0,lastSpend:0,lastMove:t,moveBudget:0,corr:0,ready:false,rematch:false,block:false,blockAt:0,blockOffAt:0,swing:null,special:null,specialQueue:null,nextAttack:0,nextParry:0,stunUntil:0,lockedUntil:0,lastDash:0,dashUntil:0,weapon:this.mode==='capture'?'sword':'fists',shield:false,defZeroUntil:0,bonusUntil:0,attackBoostUntil:0,alive:true,respawnAt:0,history:[] }); p.history.push({t,x:p.x,z:p.z,yaw:p.yaw}); }
    if(this.mode==='capture'){this.teamSize=clamp(this.teamSize||CAPTURE.teamSize,1,CAPTURE.teamSize);}
    for (const p of this.players) if (p.isBot) Object.assign(p, { botNextThink:now(), botNextAttack:now(), botResting:false, botDefense:null, botBlockRelease:0, botLastTick:now(), botSteerSide:0, botSteerUntil:0 });
    this.broadcast({ type:'started', practice:this.practice, players:this.publicPlayers(), countdown:COUNTDOWN_SECONDS,...this.captureSnapshot() });
  }
  captureSpawn(p){const teamIndex=this.players.filter(x=>x.team===p.team&&x.id<p.id).length,total=this.players.filter(x=>x.team===p.team).length,spacing=total<=1?0:CAPTURE.spawnSpread*2/(total-1),x=-CAPTURE.spawnSpread+teamIndex*spacing,z=p.team==='red'?CAPTURE.spawnZ:-CAPTURE.spawnZ;return{x,y:0,z,yaw:p.team==='red'?Math.PI:0};}
  move(id, msg) {
    const p = this.player(id); if (!p || this.phase !== 'fight' || !p.alive) return;
    const t = now();
    if (Number.isFinite(msg.corr) && msg.corr < p.corr) return;
    const dt = clamp((t - p.lastMove) / 1000, 0, 0.5); p.lastMove = t;
    const x = Number(msg.x), z = Number(msg.z), y = clamp(Number(msg.y)||0, 0, MOVEMENT.jumpSpeed*MOVEMENT.jumpSpeed/(2*MOVEMENT.gravity)), yaw = Number(msg.yaw), pitch = clamp(Number(msg.pitch)||0, -1.35, 1.35);
    if (![x,z,yaw].every(Number.isFinite)) return;
    const dx=x-p.x,dz=z-p.z, d=Math.hypot(dx,dz);
    let slow=1;if(t<p.lockedUntil)slow=0;else if(p.special)slow=SPECIAL.chargeMultiplier;else if(p.stunUntil>t)slow=MOVEMENT.stunMultiplier;else if(p.block)slow=MOVEMENT.blockMultiplier;else if(p.swing)slow=MOVEMENT.swingMultiplier;
    const speed = t <= p.dashUntil + 150 ? DASH.speed : MOVEMENT.runSpeed * slow * (p.isBot ? EASY_BOT.speedMultiplier : 1);
    p.moveBudget = Math.min(speed * 0.5, p.moveBudget + speed * dt);
    const overBudget = d > p.moveBudget + 0.5;
    const allowed = overBudget ? p.moveBudget : d;
    const scale = d > allowed && d > 0 ? allowed / d : 1;
    let nx = p.x + dx * scale, nz = p.z + dz * scale;
    let corrected = overBudget;
    // Walk the requested segment so a long packet cannot cross a wall or obstacle.
    const steps = Math.max(1, Math.ceil(Math.hypot(nx-p.x,nz-p.z) / .08));
    let validX = p.x, validZ = p.z;
    for (let i=1;i<=steps;i++) {
      const qx=p.x+(nx-p.x)*i/steps, qz=p.z+(nz-p.z)*i/steps;
      const collision=this.mode==='capture'?this.players.some(other=>other!==p&&other.alive&&Math.hypot(qx-other.x,qz-other.z)<PLAYER_SEPARATION):this.players[1-p.id]?.alive&&Math.hypot(qx-this.players[1-p.id].x,qz-this.players[1-p.id].z)<PLAYER_SEPARATION;
      if (Math.hypot(qx,qz) > ARENA_RADIUS-PLAYER_RADIUS || OBSTACLES.some(o => Math.hypot(qx-o.x,qz-o.z) < o.radius+PLAYER_RADIUS) || collision) { corrected=true; break; }
      validX=qx; validZ=qz;
    }
    if (Math.abs(validX-nx)>.001 || Math.abs(validZ-nz)>.001) corrected=true;
    const oldX=p.x,oldZ=p.z;
    const oldYaw=p.yaw,oldY=p.y;p.x=validX;p.z=validZ;p.y=y;p.yaw=yaw;p.pitch=pitch;if(Math.hypot(p.x-oldX,p.z-oldZ)>.001||Math.abs(p.y-oldY)>.001||p.yaw!==oldYaw)p.mt=t;
    p.moveBudget = Math.max(0, p.moveBudget - Math.hypot(p.x-oldX, p.z-oldZ));
    p.history.push({t,x:p.x,z:p.z,yaw}); while (p.history.length && t-p.history[0].t>PLAYER_MOVE.historySeconds*1000+NETWORK.interpolationMs) p.history.shift();
    if (corrected) this.correct(p);
    this.tryPickup(p);
  }
  correct(p) { p.corr++; safeSend(p.socket, { type:'correction', x:p.x, y:p.y, z:p.z, corr:p.corr }); }
  dash(id) { const p=this.player(id),t=now();if(!p||this.phase!=='fight'||!p.alive||p.special||p.specialQueue||t<p.stunUntil||t-p.lastDash<DASH.cooldown*1000||p.stamina<DASH.cost)return;p.lastDash=t;p.dashUntil=t+DASH.duration*1000;p.stamina-=DASH.cost;p.lastSpend=t; }
  attack(id, msg = {}) {
    const p=this.player(id), t=now(); if (!p || this.phase!=='fight'||!p.alive||p.special||p.specialQueue||t<p.stunUntil) return;
    if(Number.isFinite(msg.yaw))p.yaw=msg.yaw;
    const incomingTarget=this.mode==='capture'?this.enemies(p).filter(target=>target.swing&&Math.abs(angleDelta(Math.atan2(target.x-p.x,target.z-p.z),p.yaw))<=PARRY_RULES.facingAngle*Math.PI/180).sort((a,b)=>dist(p,a)-dist(p,b))[0]:this.targetFor(p),incoming=incomingTarget?.swing;
    if(incoming&&t<=incoming.due+incoming.defenderWait&&t>=p.nextParry&&p.stamina>=PARRY_RULES.staminaCost){p.stamina-=PARRY_RULES.staminaCost;p.lastSpend=t;p.nextParry=t+PARRY_RULES.cooldownSeconds*1000;incoming.parries.push({ at:t-p.ping/2, yaw:p.yaw, player:id });return;}
    if (p.swing || t<p.nextAttack) return;
    const targets=this.enemies(p);if(!targets.length)return;
    const w=WEAPONS[p.weapon]; if(p.stamina<w.stamina) return;
    p.stamina-=w.stamina;p.lastSpend=t;
    const speedFactor=p.attackBoostUntil>t?1/(1+POTION.attackSpeedBonus):1;
    const due=t+w.windup*1000*speedFactor, defenderWait=Math.min(NETWORK.hitWaitCapMs,Math.max(...targets.map(target=>target.ping/2+NETWORK.blockParryWaitMs)));
    p.swing={ started:t,due,finish:t+w.duration*1000*speedFactor,weapon:p.weapon,parries:[],defenderWait,checked:false };
    p.nextAttack=t+w.duration*1000*speedFactor;
    this.broadcast({type:'event',event:'swing',player:id,weapon:p.weapon,due,started:t});
    this.planPracticeDefense(p,p.swing);
  }
  block(id,held,msg={}) { const p=this.player(id); if(!p||this.phase!=='fight'||p.special||now()<p.stunUntil)return;const t=now(),actionAt=t-p.ping/2;if(Number.isFinite(msg.yaw))p.yaw=msg.yaw;if(held&&!p.block){p.block=true;p.blockAt=actionAt;p.blockOffAt=0;}else if(!held&&p.block){p.block=false;p.blockOffAt=actionAt;} }
  disconnect(id, explicit, socket) {
    const p=this.player(id);if(!p||!p.connected||(socket&&p.socket!==socket))return;p.connected=false;p.block=false;p.blockOffAt=now();
    if(this.practice){this.cleanup();return;}
    if(this.mode==='capture'){
      if((this.phase==='fight'||this.phase==='countdown')&&!explicit){p.rejoinUntil=now()+15000;this.broadcast({type:'reconnecting',player:id,expiresAt:p.rejoinUntil});return;}
      if(this.phase==='fight'||this.phase==='countdown'){if(explicit||now()>=p.rejoinUntil){p.isBot=true;p.name=this.uniqueBotName(p);p.socket=null;p.connected=true;p.rejoinUntil=0;p.botNextThink=0;if(!this.players.some(x=>!x.isBot&&x.connected)){this.cleanup();return;}this.broadcast({type:'roster',players:this.publicPlayers(),...this.captureSnapshot()});}return;}
      if(this.phase==='lobby'){this.players.splice(this.players.indexOf(p),1);this.players.forEach((player,index)=>{player.id=index;if(player.socket)player.socket.player=index;});if(!this.players.length)this.cleanup();else this.broadcast(this.lobbyState());return;}
      if(this.phase==='result'&&this.players.every(x=>!x.connected))this.cleanup();return;
    }
    if(this.phase==='fight'||this.phase==='countdown'){
      if(!explicit){p.rejoinUntil=now()+15000;const other=this.players[1-id];if(other?.connected)safeSend(other.socket,{type:'reconnecting',player:id,expiresAt:p.rejoinUntil});return;}
      p.rejoinUntil=0;const other=this.players[1-id];if(other){this.finish(other.id,'Opponent left');}else this.cleanup();
    }
    else if(this.phase==='lobby'){this.players.splice(id,1);this.players.forEach((player,index)=>{player.id=index;player.fighter=index===0?'Knight':'Barbarian';player.socket.player=index;});if(!this.players.length)this.cleanup();else this.broadcast({type:'lobby',code:this.code,players:this.lobbyPlayers()});}
    else if(this.phase==='result'){const other=this.players[1-id];if(other?.connected)safeSend(other.socket,{type:'opponentLeft'});if(this.players.every(x=>!x.connected))this.cleanup();}
    else if(this.players.every(x=>!x.connected))this.cleanup();
  }
  planPracticeDefense(attacker,swing) {
    if(!this.practice||attacker.isBot)return;
    const bot=this.players.find(p=>p.isBot);if(!bot?.alive)return;
    const weapon=WEAPONS[swing.weapon]||WEAPONS.fists;
    const reach=swing.specialReach??weapon.reach+(swing.specialReachBonus||0);
    if(dist(attacker,bot)>reach+BODY_RADIUS)return;
    bot.botDefense=null;
    const roll=Math.random(),t=now();
    if(roll<EASY_BOT.blockChance){
      this.block(bot.id,true,{});
      bot.botBlockRelease=t+EASY_BOT.blockDurationMs;
    }else if(roll<EASY_BOT.blockChance+EASY_BOT.parryChance){
      if(bot.block){this.block(bot.id,false,{});bot.botBlockRelease=0;}
      bot.botDefense={started:swing.started,kind:'parry',at:Math.max(t,swing.due-EASY_BOT.parryLeadMs)};
    }
  }
  botStepFree(p,x,z) {
    const dx=x-p.x,dz=z-p.z,steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.08));
    for(let i=1;i<=steps;i++){
      const qx=p.x+dx*i/steps,qz=p.z+dz*i/steps;
      if(Math.hypot(qx,qz)>ARENA_RADIUS-PLAYER_RADIUS||OBSTACLES.some(o=>Math.hypot(qx-o.x,qz-o.z)<o.radius+PLAYER_RADIUS)||this.players.some(other=>other!==p&&other.alive&&Math.hypot(qx-other.x,qz-other.z)<PLAYER_SEPARATION))return false;
    }
    return true;
  }
  runEasyBot(t) {
    const bot=this.players.find(p=>p.isBot), human=this.players.find(p=>!p.isBot);
    if(!bot?.alive||!human?.alive)return;
    const dt=clamp((t-(bot.botLastTick||t))/1000,0,.15);bot.botLastTick=t;
    const seen=this.sample(human,t-EASY_BOT.reactionMs);
    const dx=seen.x-bot.x,dz=seen.z-bot.z,distToSeen=Math.hypot(dx,dz),bearing=Math.atan2(dx,dz);
    const turn=clamp(angleDelta(bearing,bot.yaw),-EASY_BOT.turnRate*dt,EASY_BOT.turnRate*dt);
    const yaw=bot.yaw+turn;

    if(bot.block&&bot.botBlockRelease&&t>=bot.botBlockRelease){this.block(bot.id,false,{yaw});bot.botBlockRelease=0;}
    if(bot.botDefense&&t>=bot.botDefense.at){
      const defense=bot.botDefense;bot.botDefense=null;
      if(defense.kind==='parry'&&human.swing?.started===defense.started&&t<=human.swing.due+human.swing.defenderWait)this.attack(bot.id,{yaw});
    }

    if(t>=bot.botNextThink){
      bot.botNextThink=t+50;
      const weapon=WEAPONS[bot.weapon]||WEAPONS.fists;
      const weaponReach=EASY_BOT.desiredReach[bot.weapon]||EASY_BOT.desiredReach.fists;
      let itemGoal=null;
    const candidates=[];
      if(bot.weapon==='fists'){
        const item=this.items.filter(i=>i.landed&&['sword','spear'].includes(i.type)&&dist(bot,i)<=EASY_BOT.weaponFetchRadius).sort((a,b)=>dist(bot,a)-dist(bot,b))[0];
        if(item)candidates.push(item);
      }
      if(!bot.shield){const item=this.items.filter(i=>i.landed&&i.type==='shield'&&dist(bot,i)<=EASY_BOT.shieldFetchRadius).sort((a,b)=>dist(bot,a)-dist(bot,b))[0];if(item)candidates.push(item);}
      if(bot.hp<EASY_BOT.potionHpThreshold){const item=this.items.filter(i=>i.landed&&i.type==='potion'&&dist(bot,i)<=EASY_BOT.potionFetchRadius).sort((a,b)=>dist(bot,a)-dist(bot,b))[0];if(item)candidates.push(item);}
      itemGoal=candidates.sort((a,b)=>dist(bot,a)-dist(bot,b))[0]||null;
      const goal=itemGoal||seen;
      const gx=goal.x-bot.x,gz=goal.z-bot.z,gd=Math.hypot(gx,gz);
      let moveX=bot.x,moveZ=bot.z;
      const stopDistance=itemGoal?Math.max(0,PICKUP_RADIUS-.12):weaponReach;
      const elapsedMove=clamp((t-bot.lastMove)/1000,0,PLAYER_MOVE.maxDeltaSeconds);
      if(gd>stopDistance+.04){const step=Math.min(MOVEMENT.runSpeed*EASY_BOT.speedMultiplier*elapsedMove,gd-stopDistance);moveX+=gx/gd*step;moveZ+=gz/gd*step;}
      else if(!itemGoal&&gd<stopDistance-.3){const step=Math.min(MOVEMENT.runSpeed*EASY_BOT.speedMultiplier*elapsedMove,stopDistance-gd);moveX-=gx/(gd||1)*step;moveZ-=gz/(gd||1)*step;}
      const stepLength=Math.hypot(moveX-bot.x,moveZ-bot.z);
      if(stepLength>0&&!this.botStepFree(bot,moveX,moveZ)){
        const preferred=(t<bot.botSteerUntil&&bot.botSteerSide)?bot.botSteerSide:1;
        let routed=null;
        for(const degrees of EASY_BOT.obstacleAngles){
          for(const side of [preferred,-preferred]){
            const a=bearing+side*degrees*Math.PI/180;
            const candidateX=bot.x+Math.sin(a)*stepLength,candidateZ=bot.z+Math.cos(a)*stepLength;
            if(this.botStepFree(bot,candidateX,candidateZ)){routed={x:candidateX,z:candidateZ,side};break;}
          }
          if(routed)break;
        }
        if(routed){moveX=routed.x;moveZ=routed.z;bot.botSteerSide=routed.side;bot.botSteerUntil=t+EASY_BOT.steerHoldMs;}
      }
      this.move(bot.id,{x:moveX,y:0,z:moveZ,yaw,pitch:0,corr:bot.corr});

      // A different landed weapon is swapped only when already in pickup range.
      const swapItem=this.items.find(i=>i.landed&&['sword','spear'].includes(i.type)&&bot.weapon!=='fists'&&bot.weapon!==i.type&&dist(bot,i)<PICKUP_RADIUS);
      if(swapItem)this.swap(bot.id);

      const reach=bot.weapon==='spear'?WEAPONS.spear.reach+BODY_RADIUS:weapon.reach+BODY_RADIUS;
      const facing=Math.abs(angleDelta(Math.atan2(seen.x-bot.x,seen.z-bot.z),yaw))<=EASY_BOT.attackFacingDegrees*Math.PI/180;
      if(bot.stamina<EASY_BOT.restBelow)bot.botResting=true;
      if(bot.botResting&&bot.stamina>=EASY_BOT.restAbove)bot.botResting=false;
      const specialReach=(bot.weapon==='sword'?WEAPONS.sword.reach:bot.weapon==='spear'?WEAPONS.spear.reach:bot.shield?SPECIAL.shieldBash.reach:WEAPONS.fists.reach)+BODY_RADIUS;
      if(bot.sp>=SPECIAL.max&&distToSeen<=specialReach&&!bot.special&&!bot.swing){this.special(bot.id);}
      else if(!bot.botResting&&!bot.block&&!bot.special&&!bot.swing&&t>=bot.botNextAttack&&distToSeen<=reach&&facing){
        this.attack(bot.id,{yaw});
        bot.botNextAttack=t+EASY_BOT.attackDelayMinMs+Math.random()*(EASY_BOT.attackDelayMaxMs-EASY_BOT.attackDelayMinMs);
      }
    }
  }
  update() {
    const t=now();
    if(this.mode==='capture')for(const p of this.players)if(!p.alive&&p.respawnAt&&t>=p.respawnAt){const s=this.captureSpawn(p);Object.assign(p,{x:s.x,y:0,z:s.z,yaw:s.yaw,hp:MATCH_HP,stamina:STAMINA.max,sp:0,weapon:'sword',shield:false,alive:true,respawnAt:0,swing:null,special:null,specialQueue:null,block:false,blockAt:0,blockOffAt:0,stunUntil:0,history:[],mt:t});p.history.push({t,x:p.x,z:p.z,yaw:p.yaw});}
    for(const p of this.players){if(!p.connected&&p.rejoinUntil&&t>=p.rejoinUntil){p.rejoinUntil=0;if(this.mode==='capture'){p.isBot=true;p.name=this.uniqueBotName(p);p.socket=null;p.connected=true;p.botNextThink=0;if(!this.players.some(x=>!x.isBot&&x.connected)){this.cleanup();return;}this.broadcast({type:'roster',players:this.publicPlayers(),...this.captureSnapshot()});}else{const other=this.players[1-p.id];if(other?.connected)this.finish(other.id,'Opponent left');else this.cleanup();}}}
    if(this.phase==='closed'||this.phase==='result')return;
    if(this.phase==='countdown'&&t>=this.startedAt){this.phase='fight';this.broadcast({type:'fight',endsAt:this.endsAt});}
    if(this.phase==='fight'){
      if(this.mode==='capture'){if(t>=(this.nextCaptureBotThink||0)){this.nextCaptureBotThink=t+CAPTURE.botThinkSeconds*1000;this.runCaptureBots(t);}this.updateCapture(t);}
      else if(this.practice)this.runEasyBot(t);
      this.separatePlayers(t);
      for(const p of this.players){if(!p.alive)continue;if(p.special&&t>=p.special.firesAt)this.fireSpecial(p,t);if(t-p.lastSpend>=STAMINA.delay*1000)p.stamina=Math.min(STAMINA.max,p.stamina+STAMINA.regen/(TICK_RATE));if(p.swing&&t>=p.swing.due+Math.min(p.swing.defenderWait,NETWORK.hitWaitCapMs)&&!p.swing.checked)this.resolveSwing(p);if(p.swing&&t>=p.swing.finish)p.swing=null;if(p.specialQueue&&!p.swing&&t>=p.specialQueue.nextAt){if(p.stunUntil<=t){const q=p.specialQueue;p.specialQueue=null;this.startSpecialSwing(p,t,q.config);}else p.specialQueue=null;}}for(const item of this.items)if(t>=item.landAt)item.landed=true;
      if(t>=this.lastDrop&&this.items.length<DROP_RULES.maxGround){this.spawnDrops();this.lastDrop=t+DROP_RULES.intervalMinSeconds*1000+Math.random()*(DROP_RULES.intervalMaxSeconds-DROP_RULES.intervalMinSeconds)*1000;}
      this.broadcast({type:'state',serverTime:t,phase:this.phase,remaining:Math.max(0,Math.ceil((this.endsAt-t)/1000)),players:this.publicPlayers(),items:this.items,...this.captureSnapshot()});
      if(t>=this.endsAt){if(this.mode==='capture'){const r=this.scores.red,b=this.scores.blue;this.finish(r===b?-1:(r>b?'red':'blue'),'Time');}else{const a=this.players[0],b=this.players[1];this.finish(a.hp===b.hp?-1:(a.hp>b.hp?0:1),'Time');}}
    } else if(this.phase==='countdown'){this.broadcast({type:'state',phase:this.phase,remaining:Math.max(0,Math.ceil((this.startedAt-t)/1000)),players:this.publicPlayers(),items:[],...this.captureSnapshot()});}
  }
  updateCapture(t){const dt=Math.max(0,Math.min(.2,(t-(this.lastPointTick||t))/1000));this.lastPointTick=t;const inPoint=this.players.filter(p=>p.alive&&Math.hypot(p.x,p.z)<=CAPTURE.pointRadius),red=inPoint.filter(p=>p.team==='red').length,blue=inPoint.filter(p=>p.team==='blue').length;this.pointContested=red>0&&blue>0;const team=red&&!blue?'red':blue&&!red?'blue':null;const speed=count=>100/CAPTURE.captureSeconds*(count>=3?CAPTURE.threePlayerMultiplier:count===2?CAPTURE.twoPlayerMultiplier:1);if(!this.pointContested){if(this.pointTeam){if(team===this.pointTeam){this.pointProgress=Math.min(100,this.pointProgress+speed(this.pointTeam==='red'?red:blue)*dt);}else if(team){this.pointProgress=Math.max(0,this.pointProgress-speed(team==='red'?red:blue)*dt);if(this.pointProgress===0){this.pointTeam=null;this.progressTeam=null;}}else this.pointProgress=Math.max(0,this.pointProgress-speed(this.pointTeam==='red'?red:blue)*dt);}else if(team){if(this.progressTeam&&team!==this.progressTeam){this.pointProgress=Math.max(0,this.pointProgress-speed(team==='red'?red:blue)*dt);if(this.pointProgress===0)this.progressTeam=team;}else{this.progressTeam=team;this.pointProgress=Math.min(100,this.pointProgress+speed(team==='red'?red:blue)*dt);if(this.pointProgress>=100){this.pointTeam=team;this.progressTeam=null;}}}else{this.pointProgress=Math.max(0,this.pointProgress-100/CAPTURE.captureSeconds*dt);if(this.pointProgress===0)this.progressTeam=null;}}if(this.pointTeam&&!this.pointContested)this.scores[this.pointTeam]=Math.min(CAPTURE.scoreToWin,this.scores[this.pointTeam]+dt);if(this.scores.red>=CAPTURE.scoreToWin||this.scores.blue>=CAPTURE.scoreToWin){const winner=this.scores.red===this.scores.blue?-1:this.scores.red>this.scores.blue?'red':'blue';this.finish(winner,'Score');}}
  runCaptureBots(t){for(const bot of this.players.filter(p=>p.isBot&&p.alive)){if(t<(bot.botNextThink||0))continue;bot.botNextThink=t+CAPTURE.botThinkSeconds*1000;const enemies=this.enemies(bot),near=enemies.filter(e=>dist(bot,e)<=CAPTURE.botEnemyRadius).sort((a,b)=>Number(Math.hypot(b.x,b.z)<=CAPTURE.pointRadius)-Number(Math.hypot(a.x,a.z)<=CAPTURE.pointRadius)||dist(bot,a)-dist(bot,b)),target=near[0];if(target){this.runBotAgainst(bot,target,t);continue;}let gx=bot.x,gz=bot.z;if(this.pointTeam!==bot.team||this.pointContested){const a=Math.random()*Math.PI*2,r=Math.random()*Math.max(.2,CAPTURE.pointRadius-1);gx=Math.cos(a)*r;gz=Math.sin(a)*r;}else{const a=t/1000+bot.id;gx=Math.sin(a)*CAPTURE.botGuardStrafe;gz=Math.cos(a)*CAPTURE.botGuardStrafe;}this.botMoveToward(bot,gx,gz,t);}}
  botMoveToward(bot,gx,gz,t){const dx=gx-bot.x,dz=gz-bot.z,d=Math.hypot(dx,dz);if(d<.2)return;const step=Math.min(MOVEMENT.runSpeed*EASY_BOT.speedMultiplier*CAPTURE.botThinkSeconds,d),yaw=Math.atan2(dx,dz);this.move(bot.id,{x:bot.x+dx/d*step,y:0,z:bot.z+dz/d*step,yaw,pitch:0,corr:bot.corr});}
  runBotAgainst(bot,target,t){const seen=this.sample(target,t-EASY_BOT.reactionMs),dx=seen.x-bot.x,dz=seen.z-bot.z,d=Math.hypot(dx,dz),yaw=Math.atan2(dx,dz),turn=clamp(angleDelta(yaw,bot.yaw),-EASY_BOT.turnRate*CAPTURE.botThinkSeconds,EASY_BOT.turnRate*CAPTURE.botThinkSeconds);bot.yaw+=turn;const reach=EASY_BOT.desiredReach[bot.weapon]||EASY_BOT.desiredReach.sword;if(bot.block&&bot.botBlockRelease&&t>=bot.botBlockRelease){this.block(bot.id,false,{yaw:bot.yaw});bot.botBlockRelease=0;}if(target.swing&&d<reach+BODY_RADIUS+1&&!bot.block&&Math.random()<EASY_BOT.blockChance){this.block(bot.id,true,{yaw:bot.yaw});bot.botBlockRelease=t+EASY_BOT.blockDurationMs;}else if(target.swing&&d<reach+BODY_RADIUS&&Math.random()<EASY_BOT.parryChance&&t>=bot.nextParry)this.attack(bot.id,{yaw:bot.yaw});if(d>reach+.15)this.botMoveToward(bot,seen.x,seen.z,t);else if(!bot.swing&&t>=(bot.botNextAttack||0)&&d<=reach+BODY_RADIUS){this.attack(bot.id,{yaw:bot.yaw});bot.botNextAttack=t+EASY_BOT.attackDelayMinMs+Math.random()*(EASY_BOT.attackDelayMaxMs-EASY_BOT.attackDelayMinMs);}}
  resolveSwing(attacker) {
    const swing=attacker.swing;if(!swing||swing.checked)return;swing.checked=true;
    const defender=this.enemies(attacker).filter(candidate=>this.swingCanReach(attacker,candidate,swing)).sort((a,b)=>dist(attacker,a)-dist(attacker,b))[0];
    if(defender)this.resolveSwingAgainst(attacker,defender,swing);
  }
  swingCanReach(attacker,defender,swing){if(!defender?.alive||this.phase!=='fight')return false;const target=this.sample(defender,swing.due-Math.min(NETWORK.maxHitRewindMs,attacker.ping/2+NETWORK.interpolationMs)),source=this.sample(attacker,swing.due),w=WEAPONS[swing.weapon],d=Math.hypot(target.x-source.x,target.z-source.z),bearing=Math.atan2(target.x-source.x,target.z-source.z),delta=angleDelta(bearing,source.yaw),reach=swing.specialReach??w.reach+(swing.specialReachBonus||0),arc=swing.specialArc??w.arc;if(swing.weapon==='spear'){const forward=(target.x-source.x)*Math.sin(source.yaw)+(target.z-source.z)*Math.cos(source.yaw),side=Math.abs((target.x-source.x)*Math.cos(source.yaw)-(target.z-source.z)*Math.sin(source.yaw));return forward>0&&forward<=reach+BODY_RADIUS&&side<=(swing.specialStripHalfWidth??w.stripHalfWidth);}return d-BODY_RADIUS<=reach&&Math.abs(delta)<=arc*Math.PI/180;}
  resolveSwingAgainst(attacker,defender,swing) {
    if(!defender?.alive||this.phase!=='fight')return;
    const targetPos=this.sample(defender,swing.due-Math.min(NETWORK.maxHitRewindMs,attacker.ping/2+NETWORK.interpolationMs));
    const attackerAtHit=this.sample(attacker,swing.due), d=Math.hypot(targetPos.x-attackerAtHit.x,targetPos.z-attackerAtHit.z), w=WEAPONS[swing.weapon];
    const bearing=Math.atan2(targetPos.x-attackerAtHit.x,targetPos.z-attackerAtHit.z), delta=angleDelta(bearing,attackerAtHit.yaw);
    const reach=swing.specialReach??w.reach+(swing.specialReachBonus||0),arc=swing.specialArc??w.arc;
    if(swing.weapon==='spear'){
      const forward=(targetPos.x-attackerAtHit.x)*Math.sin(attackerAtHit.yaw)+(targetPos.z-attackerAtHit.z)*Math.cos(attackerAtHit.yaw),side=Math.abs((targetPos.x-attackerAtHit.x)*Math.cos(attackerAtHit.yaw)-(targetPos.z-attackerAtHit.z)*Math.sin(attackerAtHit.yaw));
      if(forward<=0||forward>reach+BODY_RADIUS||side>(swing.specialStripHalfWidth??w.stripHalfWidth))return;
    }else if(d-BODY_RADIUS>reach||Math.abs(delta)>arc*Math.PI/180)return;
    const parry=swing.parries.find(x=>(this.mode!=='capture'||x.player===defender.id)&&x.at>=swing.due-PARRY_RULES.windowMs&&x.at<=swing.due&&Math.abs(angleDelta(Math.atan2(attackerAtHit.x-targetPos.x,attackerAtHit.z-targetPos.z),x.yaw))<=PARRY_RULES.facingAngle*Math.PI/180);
    if(parry){const t=now();attacker.specialQueue=null;attacker.stunUntil=t+PARRY_RULES.staggerSeconds*1000;attacker.lockedUntil=t+PARRY_RULES.staggerSeconds*1000;const dx=attacker.x-defender.x,dz=attacker.z-defender.z,l=Math.hypot(dx,dz)||1;this.push(attacker,dx/l*PARRY_RULES.staggerPush,dz/l*PARRY_RULES.staggerPush);this.addSp(defender,SPECIAL.parryGain);defender.bonusUntil=t+PARRY_RULES.buffSeconds*1000;attacker.defZeroUntil=t+PARRY_RULES.buffSeconds*1000;this.broadcast({type:'event',event:'parry',player:defender.id,target:attacker.id});return;}
    const defenderAtHit=this.sample(defender,swing.due), from=Math.atan2(attackerAtHit.x-defenderAtHit.x,attackerAtHit.z-defenderAtHit.z), incoming=Math.abs(angleDelta(from,defenderAtHit.yaw))<=BLOCK_RULES.frontAngle*Math.PI/180;
    let base=(swing.specialDamage??w.damage)*(attacker.bonusUntil>now()?1+PARRY_RULES.damageBonus:1);const def=defender.defZeroUntil>now()?0:(defender.shield?SHIELD_DEF:0);let damage=base*100/(100+def);
    let blocked=0;
    const blockWasActive=defender.blockAt>0&&defender.blockAt<=swing.due-BLOCK_RULES.raiseMs&&(!defender.blockOffAt||defender.blockOffAt>=swing.due);
    if(blockWasActive&&incoming){const ratio=defender.shield?BLOCK_RULES.shieldReduction:BLOCK_RULES.unshieldedReduction;blocked=damage*ratio;const cost=blocked*(defender.shield?BLOCK_RULES.shieldCost:BLOCK_RULES.unshieldedCost);if(defender.stamina<cost){defender.stamina=0;defender.stunUntil=now()+MOVEMENT.guardBreakStunSeconds*1000;defender.block=false;defender.blockOffAt=now();blocked=0;this.broadcast({type:'event',event:'guardBreak',player:defender.id});}else{defender.stamina-=cost;defender.lastSpend=now();this.addSp(defender,SPECIAL.blockedHitGain);}}
    damage=Math.max(0,damage-blocked);defender.hp=Math.max(0,defender.hp-damage);this.addSp(defender,damage*SPECIAL.damageTakenPerHp);
    if(damage>0){if(swing.specialStun)defender.stunUntil=now()+swing.specialStun*1000;const dx=defender.x-attacker.x,dz=defender.z-attacker.z,l=Math.hypot(dx,dz)||1;this.push(defender,dx/l*HIT_PUSH,dz/l*HIT_PUSH);}
    this.broadcast({type:'event',event:blocked?'block':'hit',player:attacker.id,target:defender.id,damage:Math.round(damage*10)/10,blocked:Math.round(blocked*10)/10,hp:defender.hp});
    if(defender.hp<=0){if(this.mode==='capture'){defender.alive=false;attacker.kos=(attacker.kos||0)+1;defender.falls=(defender.falls||0)+1;defender.respawnAt=now()+CAPTURE.respawnSeconds*1000;defender.hp=0;defender.block=false;defender.swing=null;defender.special=null;defender.specialQueue=null;defender.stamina=0;defender.sp=0;this.broadcast({type:'event',event:'ko',player:attacker.id,target:defender.id,respawnAt:defender.respawnAt});}else this.finish(attacker.id,'K.O.');}
  }
  sample(p,t){if(!p.history.length)return{x:p.x,z:p.z,yaw:p.yaw};let before=p.history[0],after=p.history[p.history.length-1];for(let i=1;i<p.history.length;i++){if(p.history[i].t>=t){before=p.history[i-1];after=p.history[i];break;}}if(after.t===before.t)return{x:before.x,z:before.z,yaw:before.yaw};const a=clamp((t-before.t)/(after.t-before.t),0,1);return{x:before.x+(after.x-before.x)*a,z:before.z+(after.z-before.z)*a,yaw:before.yaw+angleDelta(after.yaw,before.yaw)*a};}
  push(p,dx,dz){const t=now(),oldX=p.x,oldZ=p.z,steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.075));for(let i=steps;i>0;i--){const x=oldX+dx*i/steps,z=oldZ+dz*i/steps,blocked=this.mode==='capture'?this.players.some(o=>o!==p&&o.alive&&Math.hypot(x-o.x,z-o.z)<PLAYER_SEPARATION):this.players[1-p.id]?.alive&&Math.hypot(x-this.players[1-p.id].x,z-this.players[1-p.id].z)<PLAYER_SEPARATION;if(Math.hypot(x,z)<=ARENA_RADIUS-PLAYER_RADIUS&&!OBSTACLES.some(o=>Math.hypot(x-o.x,z-o.z)<o.radius+PLAYER_RADIUS)&&!blocked){p.x=x;p.z=z;break;}}p.history.push({t,x:p.x,z:p.z,yaw:p.yaw});while(p.history.length&&t-p.history[0].t>PLAYER_MOVE.historySeconds*1000+NETWORK.interpolationMs)p.history.shift();const appliedX=p.x-oldX,appliedZ=p.z-oldZ;if(Math.hypot(appliedX,appliedZ)>.001){p.corr++;safeSend(p.socket,{type:'push',dx:appliedX,dz:appliedZ,corr:p.corr});}}
  canPickup(p,item){if(item.ownerLock&&item.dropper===p.id){if(dist(p,item)<=PICKUP_RADIUS)return false;item.ownerLock=false;}return true;}
  tryPickup(p){const item=this.items.filter(i=>i.landed&&this.canPickup(p,i)&&dist(p,i)<PICKUP_RADIUS).sort((a,b)=>dist(p,a)-dist(p,b))[0];if(!item)return;if(item.type==='potion'){p.hp=Math.min(MATCH_HP,p.hp+POTION.heal);p.attackBoostUntil=now()+POTION.durationSeconds*1000;}else if(['sword','spear'].includes(item.type)){if(p.weapon!=='fists')return;p.weapon=item.type;}else if(item.type==='shield'){if(p.shield)return;p.shield=true;}this.items=this.items.filter(i=>i!==item);this.broadcast({type:'event',event:'pickup',player:p.id,item:item.type});}
  pickup(id){const p=this.player(id);if(!p||this.phase!=='fight'||!p.alive)return;const item=this.items.filter(i=>i.landed&&this.canPickup(p,i)&&dist(p,i)<PICKUP_RADIUS).sort((a,b)=>dist(p,a)-dist(p,b))[0];if(item&&['sword','spear'].includes(item.type)&&p.weapon!=='fists'&&p.weapon!==item.type){this.swap(id);return;}this.tryPickup(p);}
  spawnDrops(){const first=this.lastDrop < this.startedAt+(DROP_RULES.firstMaxSeconds+1)*1000;const count=first?DROP_RULES.firstCount:(Math.random()<DROP_RULES.doubleChance?DROP_RULES.doubleCount:1);const type=this.chooseItem();for(let n=0;n<count&&this.items.length<DROP_RULES.maxGround;n++){const pos=this.randomSpot(first);if(!pos)continue;const landAt=now()+DROP_RULES.landSeconds*1000;this.items.push({id:Math.random().toString(36).slice(2,9),type,x:pos.x,z:pos.z,landAt,landed:false});if(first&&this.items.length<DROP_RULES.maxGround){this.items.push({id:Math.random().toString(36).slice(2,9),type,x:-pos.x,z:-pos.z,landAt,landed:false});break;}}}
  chooseItem(){const elapsed=now()-this.startedAt;if(elapsed>MATCH_SECONDS*POTION.minMatchFraction*1000&&Math.random()<(elapsed>=MATCH_SECONDS*1000-DROP_RULES.lastPotionSeconds*1000?DROP_RULES.lastPotionChance:DROP_RULES.potionChance))return'potion';return DROP_RULES.weaponTypes[Math.floor(Math.random()*DROP_RULES.weaponTypes.length)];}
  randomSpot(mirrored=false){for(let tries=0;tries<60;tries++){const a=Math.random()*Math.PI*2,r=Math.sqrt(Math.random())*DROP_RULES.radius,x=Math.cos(a)*r,z=Math.sin(a)*r,points=mirrored?[{x,z},{x:-x,z:-z}]:[{x,z}];if(mirrored&&2*r<DROP_RULES.itemGap)continue;const valid=points.every(point=>!OBSTACLES.some(o=>Math.hypot(point.x-o.x,point.z-o.z)<o.radius+DROP_RULES.obstacleGap)&&!this.players.some(p=>p.alive&&Math.hypot(point.x-p.x,point.z-p.z)<DROP_RULES.playerGap)&&!this.items.some(i=>Math.hypot(point.x-i.x,point.z-i.z)<DROP_RULES.itemGap));if(valid)return{x,z};}return null;}
  finish(winner,reason){if(this.phase==='result'||this.phase==='closed')return;this.phase='result';this.result={winner,reason,scores:this.scores||null,kos:this.players.map(p=>({id:p.id,name:p.name,team:p.team,kos:p.kos||0,falls:p.falls||0}))};this.broadcast({type:'result',result:this.result,players:this.publicPlayers(),rematch:this.players.map(x=>x.rematch),...this.captureSnapshot()});}
  separatePlayers(t=now()){if(this.mode!=='capture'){const [a,b]=this.players;if(!a?.alive||!b?.alive)return;this.separatePair(a,b,t);return;}for(let i=0;i<this.players.length;i++)for(let j=i+1;j<this.players.length;j++){const a=this.players[i],b=this.players[j];if(a.alive&&b.alive)this.separatePair(a,b,t);}}
  separatePair(a,b,t){let dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz);if(d>=PLAYER_SEPARATION)return;if(d<1e-6){dx=0;dz=a.id%2===0?1:-1;d=1;}const overlap=PLAYER_SEPARATION-d,nx=dx/d,nz=dz/d,half=overlap/2,ax=a.x-nx*half,az=a.z-nz*half,bx=b.x+nx*half,bz=b.z+nz*half,clear=(x,z)=>Math.hypot(x,z)<=ARENA_RADIUS-PLAYER_RADIUS&&!OBSTACLES.some(o=>Math.hypot(x-o.x,z-o.z)<o.radius+PLAYER_RADIUS);if(!clear(ax,az)||!clear(bx,bz))return;for(const [p,x,z] of [[a,ax,az],[b,bx,bz]]){const px=x-p.x,pz=z-p.z;p.x=x;p.z=z;p.mt=t;p.history.push({t,x:p.x,z:p.z,yaw:p.yaw});while(p.history.length&&t-p.history[0].t>PLAYER_MOVE.historySeconds*1000+NETWORK.interpolationMs)p.history.shift();p.corr++;safeSend(p.socket,{type:'push',dx:px,dz:pz,corr:p.corr});}}
  publicPlayers(){const t=now();return this.players.map(p=>{const sent=p.lastPublicPosition,changed=sent&&(sent.x!==p.x||sent.y!==p.y||sent.z!==p.z||sent.yaw!==p.yaw);if(changed&&p.mt===p.lastSentMt)p.mt=t;p.lastPublicPosition={x:p.x,y:p.y,z:p.z,yaw:p.yaw};p.lastSentMt=p.mt;return{id:p.id,name:p.name,fighter:p.fighter,team:p.team,isBot:p.isBot,alive:p.alive,respawnAt:p.respawnAt||0,kos:p.kos||0,falls:p.falls||0,x:p.x,y:p.y,z:p.z,yaw:p.yaw,mt:p.mt,pitch:p.pitch,hp:p.hp,stamina:p.stamina,sp:p.sp,weapon:p.weapon,shield:p.shield,block:p.block,stun:p.stunUntil>t,locked:p.lockedUntil>t,special:p.special?{move:p.special.move,started:p.special.started,firesAt:p.special.firesAt}:null,swing:p.swing?{started:p.swing.started,due:p.swing.due,weapon:p.swing.weapon}:null,dashUntil:p.dashUntil,attackBoost:p.attackBoostUntil>t,ping:p.ping};});}
  cleanup(){clearInterval(this.tick);this.phase='closed';this.manager.delete(this.code);}
}

function angleDelta(a,b){return Math.atan2(Math.sin(a-b),Math.cos(a-b));}
function randomFighterName(){const names=['Iron Fox','Red Wolf','Storm Hawk','Silver Bear','Quiet Tiger','Ash Raven','Bright Lynx','Frost Jackal','Golden Viper','Blue Falcon','Wild Stag','Night Heron','Stone Cobra','Swift Badger','Ember Owl','Grey Panther','Bold Crane','Copper Boar','Clever Otter','Thorn Eagle'];return names[Math.floor(Math.random()*names.length)];}
