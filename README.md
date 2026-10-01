# Area of Duel

Area of Duel is a browser-based first-person arena fighter for two players. Create a room and share its code or invite link, or practise alone against an easy bot.

## How to play

- Move with **WASD**, look with the mouse, jump with **Space**, and dash with **Shift**. Click the arena to capture the mouse; press **Esc** to pause.
- Click to attack and to try a parry. Hold **right mouse** or **C** to block. Press **F** near a dropped sword or spear to swap weapons, **G** to drop your weapon or shield, and **E** to use a ready special.
- Start with fists. Swords deal strong close-range slashes; spears thrust along a narrow line at longer range. Shields add defence and improve blocking.
- Fill the SP meter by taking damage, blocking, or parrying. With a sword, **E** unleashes Double Strike; with a spear it triggers Lunge; with only a shield it performs Shield Bash.
- Choose **Practice vs bot** on Home to start a solo match against Bot · Easy.
- Touch devices show on-screen movement and action controls automatically.

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

The game uses KayKit Adventurers models by Kay Lousberg (CC0); see [`public/models/LICENSE.txt`](public/models/LICENSE.txt) for details. Rendering uses [three.js](https://threejs.org/) (MIT); the server uses [Express](https://expressjs.com/) (MIT) and [ws](https://github.com/websockets/ws) (MIT). The code was written with ChatGPT.
