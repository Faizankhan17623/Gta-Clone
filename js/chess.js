import * as THREE from 'three';
import { blockStart, BLOCK, pointBlocked } from './city.js';
import { createCharacter } from './characters.js';
import { showToast, showMissionMsg } from './hud.js';
import { sfxMissionPass, sfxMissionFail, sfxPickup } from './sound.js';

// GRANDPA VOLKOV: a stone table at the park's edge, $50 a game. Three
// positions per game; each offers three candidate moves, and Volkov
// telegraphs — his eyebrows favor one square, and his eyebrows lie
// exactly a third of the time. Win two positions to take the game.

const POSITIONS = [
  { prompt: 'He castles early and shows you his kingside', moves: ['probe the h-file', 'trade the bishops', 'push the center'] },
  { prompt: 'A knight lands where a knight should not be', moves: ['take it and pray', 'shore up the pawn', 'counter on the queenside'] },
  { prompt: 'The endgame arrives with unequal pawns', moves: ['race the passer', 'activate the king', 'give the exchange back'] },
  { prompt: 'He offers a pawn with terrible innocence', moves: ['decline politely', 'grab it and hold', 'offer one back'] },
];

export function initChess(scene, world, save) {
  let pos = new THREE.Vector3(blockStart(5) + 6, 0, blockStart(5) + BLOCK - 8);
  const probe = new THREE.Vector3(pos.x, 1, pos.z);
  if (pointBlocked(probe, world.city.colliders, 1.4)) pos = new THREE.Vector3(blockStart(5) + BLOCK - 6, 0, blockStart(5) + 6);

  const table = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 0.8, 1.1),
    new THREE.MeshStandardMaterial({ color: 0x8a8a86, roughness: 0.9 })
  );
  table.position.copy(pos).setY(0.4);
  scene.add(table);
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.05, 0.8), new THREE.MeshStandardMaterial({ color: 0x3a2f26, roughness: 0.8 }));
  board.position.copy(pos).setY(0.83);
  scene.add(board);
  const volkov = createCharacter({ shirt: '#5a5a62', pants: '#3a3a42', hair: '#c8c8c8' });
  volkov.group.position.copy(pos).add(new THREE.Vector3(0, -0.5, -1.1));
  volkov.group.userData.baseY = -0.5;
  volkov.lLeg.rotation.x = 1.4;
  volkov.rLeg.rotation.x = 1.4;
  scene.add(volkov.group);

  world.chess = { pos, on: false, round: 0, wins: 0, tell: 0, truthful: true, record: save?.chessWins ?? 0 };
}

function deal(ch) {
  ch.tell = Math.floor(Math.random() * 3);
  ch.truthful = Math.random() < 0.67;
  ch.best = ch.truthful ? ch.tell : (ch.tell + 1 + Math.floor(Math.random() * 2)) % 3;
  ch.posIdx = Math.floor(Math.random() * POSITIONS.length);
}

export function updateChess(world, dt, pressed) {
  const ch = world.chess;
  if (!ch) return;
  const player = world.player;
  world.chessHint = null;
  const onFoot = !player.inCar && !player.inHeli && !player.inBoat;
  const d = Math.hypot(player.pos.x - ch.pos.x, player.pos.z - ch.pos.z);
  if (d > 3 || !onFoot) { if (ch.on) { ch.on = false; showToast('Volkov resets the pieces without comment'); } return; }

  if (!ch.on) {
    world.chessHint = `Press <b>E</b> — chess with GRANDPA VOLKOV, $50 (career: ${ch.record} wins)`;
    if (pressed['KeyE']) {
      if (world.money < 50) { showToast('"Come back with stakes. Chess is not free therapy."'); return; }
      world.money -= 50;
      ch.on = true;
      ch.round = 1;
      ch.wins = 0;
      deal(ch);
      sfxPickup();
      showMissionMsg('VOLKOV', '"Three positions. His eyebrows lie one time in three."', '#c8c8c8');
    }
    return;
  }

  world.nearKiosk = true;
  const p = POSITIONS[ch.posIdx];
  const marks = p.moves.map((m, i) => `${i + 1}) ${m}${i === ch.tell ? ' ←eyebrows' : ''}`).join(' · ');
  world.chessHint = `POSITION ${ch.round}/3 — ${p.prompt}: ${marks}`;

  let pick = -1;
  for (let i = 0; i < 3; i++) if (pressed['Digit' + (i + 1)]) pick = i;
  if (pick < 0) return;

  const won = pick === ch.best;
  if (won) { ch.wins++; showToast('"...Hm." He replies instantly but his shoulders drop.'); }
  else showToast('"Thank you for the material." The position collapses.');

  if (ch.round >= 3) {
    ch.on = false;
    if (ch.wins >= 2) {
      ch.record++;
      world.money += 250;
      sfxMissionPass();
      showMissionMsg('VOLKOV RESIGNS', `+$250 — "Again tomorrow. Bring the same luck."`, '#c8c8c8');
      world.onSave?.();
    } else {
      sfxMissionFail();
      showMissionMsg('CHECKMATE', '"You play like the pigeons. They also knock pieces over."', '#c8c8c8');
    }
  } else {
    ch.round++;
    deal(ch);
  }
}
