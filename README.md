# FireFriends

Battle royale no navegador para jogar online com os amigos. Three.js no cliente, Cloudflare Workers + Durable Objects nas salas.

- `public/` — o jogo (página única) e os modelos das armas (`.glb` em base64).
- `src/worker.js` — serve o jogo e as salas online (`/ws/CODIGO`), até 16 jogadores por sala. A sala anota abates e colocação e salva o resultado de quem tem conta.
- `src/contas.js` — contas (`/api/conta/criar`, `entrar`, `eu`, `equipar`, `partida`, `ranking`) no banco D1 `firefriends`. Senhas com PBKDF2.
- `public/progressao.js` — XP, níveis e desbloqueios (usado pelo jogo e pelo servidor). `public/conta.js` — tela de conta, ranking e cores no lobby.
- `db/schema.sql` — tabelas do banco. Local: `npx wrangler d1 execute firefriends --local --file db/schema.sql`.

## Rodar local

```
npm install
npm run dev
```

Abra http://localhost:8787, crie uma sala e abra o mesmo endereço com `#CODIGO` em outra aba.

## Publicar

Na Cloudflare: Workers & Pages → Criar → Importar repositório → este repositório → Implantar. Cada push na `main` publica sozinho.

## Créditos

Armas: “low-poly Colt M5 SCW”, “DD4 X1”, “Diemaco C7 CT”, “G95 A1” e “STM-556” por D_U; “Fortnite Assault Rifle” por DevSmart. Sketchfab, licença CC-BY 4.0.
