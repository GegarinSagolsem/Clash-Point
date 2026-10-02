export const TICK_RATE = 20;
export const REGIONS = [{ id:'sg', name:'Singapore', prefix:'S' }, { id:'fra', name:'Frankfurt', prefix:'F' }, { id:'vir', name:'US East (Virginia)', prefix:'E' }, { id:'ore', name:'US West (Oregon)', prefix:'W' }];
export const ARENA_RADIUS = 24;
export const PLAYER_RADIUS = 0.3;
export const PLAYER_SEPARATION = 1.2;
export const BODY_RADIUS = 0.4;
export const MATCH_SECONDS = 180;
export const MATCH_HP = 100;
export const COUNTDOWN_SECONDS = 3;
export const MAX_PING_MS = 500;
export const NETWORK = { pingInterval: 2, interpolationMs: 120, maxHistoryMs: 1000, maxHitRewindMs: 300, blockParryWaitMs: 80, hitWaitCapMs: 220 };
export const MOVEMENT = { runSpeed: 6, jumpSpeed: 6.5, gravity: 20, swingMultiplier: .75, blockMultiplier: .5, stunMultiplier: .45, parryStunSeconds: 1, guardBreakStunSeconds: .7 };
export const SHIELD_DEF = 35;
export const BLOCK_RULES = { frontAngle: 75, raiseMs: 120, shieldReduction: .85, unshieldedReduction: .4, shieldCost: .8, unshieldedCost: 1.5 };
export const PARRY_RULES = { windowMs: 220, facingAngle: 30, staminaCost: 15, cooldownSeconds: .6, staggerPush: .9, staggerSeconds: 1, buffSeconds: 5, damageBonus: .2 };
export const HIT_PUSH = .3;
export const POTION = { minMatchFraction: .5, heal: 30, attackSpeedBonus: .35, durationSeconds: 8 };
export const DROP_RULES = { firstMinSeconds: 1, firstMaxSeconds: 4, firstCount: 2, doubleCount: 2, landSeconds: 3, intervalMinSeconds: 7, intervalMaxSeconds: 16, doubleChance: .3, maxGround: 6, radius: 18, obstacleGap: 1.4, playerGap: 3, itemGap: 4, potionChance: .25, lastPotionChance: .05, lastPotionSeconds: 36, weaponTypes: ['sword','shield','spear'] };
export const PICKUP_RADIUS = 1.6;
export const PLAYER_MOVE = { maxDeltaSeconds: .15, tolerance: .35, historySeconds: 1 };
export const OBSTACLES = [
  { x: 7, z: 7, radius: 0.6, height: 4, type: 'pillar' },
  { x: -7, z: 7, radius: 0.6, height: 4, type: 'pillar' },
  { x: 7, z: -7, radius: 0.6, height: 4, type: 'pillar' },
  { x: -7, z: -7, radius: 0.6, height: 4, type: 'pillar' },
  { x: 14, z: -5, radius: 1, height: 1.2, type: 'rock' },
  { x: -14, z: 5, radius: 1, height: 1.2, type: 'rock' },
  { x: 6, z: 17, radius: 1, height: 1.2, type: 'rock' },
  { x: -6, z: -17, radius: 1, height: 1.2, type: 'rock' }
];
export const SPAWNS = [{ x: 0, y: 0, z: 10, yaw: Math.PI }, { x: 0, y: 0, z: -10, yaw: 0 }];
export const WEAPONS = {
  fists: { damage: 7, reach: 1.1, arc: 35, windup: 0.16, duration: 0.48, stamina: 6 },
  sword: { damage: 20, reach: 1.9, arc: 55, windup: 0.30, duration: 0.72, stamina: 14 },
  spear: { damage: 25, reach: 2.9, stripHalfWidth: 0.7, windup: 0.40, duration: 0.95, stamina: 18 }
};
export const SPECIAL = {
  max: 100, damageTakenPerHp: 2, blockedHitGain: 4, parryGain: 35,
  chargeSeconds: 0.35, chargeMultiplier: 0.45,
  swordStrike: { damage: 20, reachBonus: 0.3, windup: 0.16, duration: 0.36, gap: 0.10 },
  spearLunge: { distance: 3, stopBeforeTarget: 1, damage: 40, reach: 2.9, stripHalfWidth: 0.7, windup: 0.18, duration: 0.42 },
  shieldBash: { damage: 22, reach: 1.6, stunSeconds: 0.5, windup: 0.12, duration: 0.36 }
};
export const STAMINA = { max: 100, regen: 24, delay: 0.9 };
export const DASH = { speed: 16, duration: 0.18, cost: 25, cooldown: 0.7 };
export const EASY_BOT = { reactionMs: 350, turnRate: Math.PI, speedMultiplier: 0.8, desiredReach: { fists: 1.3, sword: 1.7, spear: 2.5 }, weaponFetchRadius: 12, shieldFetchRadius: 6, potionFetchRadius: 6, potionHpThreshold: 60, attackDelayMinMs: 600, attackDelayMaxMs: 1200, attackFacingDegrees: 20, restBelow: 30, restAbove: 60, blockChance: 0.25, parryChance: 0.05, blockDurationMs: 600, parryLeadMs: 100, obstacleAngles: [30, 60, 90], steerHoldMs: 500 };
