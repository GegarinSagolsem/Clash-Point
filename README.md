# Clash Point

Clash Point is a browser-based first-person 1v1 sword duel. Matches are best of three 90-second rounds. Choose Knight, Barbarian or Rogue, then fight a friend or practise against Easy, Normal or Hard bots. A guided tutorial introduces the first match. Each match gets a random day or evening sky.

## Play with a friend

Create a room and invite someone with its four-letter code, a copied invite link, the Share action, or its QR code. When regional servers are configured, choose a region: Singapore, Frankfurt, US East (Virginia), or US West (Oregon).

## How to play

On keyboard and mouse, move with **W A S D**, look with the mouse, attack and attempt a parry with left click, block with right click or **C**, jump with **Space**, dash with **Shift**, pick up or swap near a weapon with **F**, drop with **G**, use a ready special with **E**, and pause with **Esc**. Click the arena to lock the mouse.

On phones, move with the stick on the left; **Block**, **Dash**, **Special** and **Jump** sit around the big **Attack** button on the right. **Pick up** appears near items, and **Drop** appears while carrying a weapon or shield. **☰** opens the pause menu and **⛶** requests full screen. On iPhone, use **Share → Add to Home Screen** to play full screen.

A parry is an attack in the final **0.22 seconds** before an incoming hit lands, while facing its attacker.

## Run locally

Requires Node.js and npm.

```sh
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser. With no region environment variables, this runs as a single local game server and uses unprefixed room codes.

## Run online

Run four game-server instances in Singapore, Frankfurt, US East (Virginia), and US West (Oregon). Set `REGION` on each instance to `sg`, `fra`, `vir`, or `ore`. Set `GAME_SERVERS` to the list of public server URLs on the site and game instances, for example:

```text
GAME_SERVERS=sg=https://your-sg-host,fra=https://your-fra-host,vir=https://your-vir-host,ore=https://your-ore-host
```

Host the always-on front page as a static site by running `npm run build:static` and publishing the generated `dist/` directory. Set `GAME_SERVERS` when building so the static page knows the region server URLs. The picker pings regions, and sleeping servers wake when a player selects them.

## Credits

- Characters and models (Knight, Barbarian, Rogue): KayKit Adventurers by Kay Lousberg, Creative Commons Zero (CC0); see [`public/models/LICENSE.txt`](public/models/LICENSE.txt).
- Sound effects: Kenney, RPG Audio and Impact Sounds, CC0; and artisticdude, RPG Sound Pack and Swishes Sound Pack, CC0. Some effects were synthesized and combined for Clash Point; see [`public/sounds/LICENSE.txt`](public/sounds/LICENSE.txt).
- Fight music: **“Taiko drums (seamless loop)” by jobro**, [OpenGameArt](https://opengameart.org/content/taiko-drums-seamless-loop), Creative Commons Attribution 3.0 (CC-BY 3.0). Re-encoded as MP3 and levelled; see [`public/music/LICENSE.txt`](public/music/LICENSE.txt).
- Menu theme: original music made for Clash Point, CC0; see [`public/music/LICENSE.txt`](public/music/LICENSE.txt).
- Rendering: [three.js](https://threejs.org/), MIT. QR codes: [qrcode](https://www.npmjs.com/package/qrcode), MIT.
- Built with ChatGPT.
