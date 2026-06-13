# WorldCup 2026 API TS

API local completa em **TypeScript + Node.js + Express** para ler um JSON da Copa 2026 e servir imagens locais provisórias.

## Estrutura principal

```txt
src/data/worldCup2026.json
public/images
public/teams
public/flags
public/shields
public/models
```

A API lê o JSON de:

```txt
src/data/worldCup2026.json
```

E serve arquivos estáticos de:

```txt
public
```

Exemplo de imagem:

```txt
http://localhost:3333/static/teams/CONMEBOL/brazil.webp
http://localhost:3333/static/shields/CONMEBOL/BRA1.png
```

## Como rodar

```bash
npm install
cp .env.example .env
npm run dev
```

Servidor:

```txt
http://localhost:3333
```

## Build para produção

```bash
npm run build
npm start
```

## Rotas principais

```txt
GET /api/health
GET /api/metadata
GET /api/database
POST /api/database/reload

GET /api/teams
GET /api/teams/:id
GET /api/teams/slug/:slug
GET /api/teams/code/:code
GET /api/teams/:teamId/players
GET /api/teams/:teamId/matches

GET /api/groups
GET /api/groups/:letter
GET /api/groups/:letter/teams
GET /api/groups/:letter/matches

GET /api/stadiums
GET /api/stadiums/:id

GET /api/matches
GET /api/matches/:id
GET /api/matches/team/:teamId
GET /api/matches/code/:code

GET /api/assets
GET /api/assets/team/:teamId
GET /api/assets/code/:code

GET /api/search?q=brazil
```

## Filtros

```txt
GET /api/teams?group=A
GET /api/teams?confederation=CONMEBOL
GET /api/teams?q=brazil

GET /api/matches?group=A
GET /api/matches?teamId=brazil
GET /api/matches?date=2026-06-13
GET /api/matches?hydrate=true
```

## Onde colocar imagens

Pode colocar provisoriamente em:

```txt
public/teams
public/flags
public/shields
public/images
public/models
```

Sugestão:

```txt
public/teams/CONMEBOL/brazil.webp
public/shields/CONMEBOL/BRA1.png
public/flags/brazil.svg
```

A API gera URLs automaticamente quando possível.

## Testes rápidos

Abra `requests.http` no VS Code com a extensão REST Client.

## Dados em tempo real (OpenAI)

A API pode buscar placares, classificações e estatísticas em tempo real usando a IA da OpenAI (com web search). Sem chave configurada, tudo continua funcionando com os dados locais (`source: "local-fallback"`).

| Endpoint | Descrição |
| --- | --- |
| `GET /api/live/matches` | Jogos de hoje/ontem com placares ao vivo |
| `GET /api/live/matches?date=2026-06-11` | Jogos de uma data específica |
| `GET /api/live/standings` | Classificação ao vivo de todos os grupos |
| `GET /api/live/standings/:letter` | Classificação ao vivo de um grupo (A–L) |
| `GET /api/live/match/:id/stats` | Estatísticas detalhadas de um jogo (posse, finalizações, cartões, gols) |
| `GET /api/live/match/:id/lineups` | Escalações oficiais (titulares, banco, formação, técnico) — aceita id ou matchNumber |
| `GET /api/live/team/:id/squad` | Elenco oficial atualizado (números, clubes, capitão, lesões/cortes) — aceita id, slug ou código FIFA |
| `GET /api/live/scorers` | Artilharia do torneio em tempo real (`?limit=10`) |
| `GET /api/knockout` | Chaveamento completo das eliminatórias (R32 → Final) |
| `GET /api/knockout/phase` | Fase atual do torneio (`pre_tournament`, `group_stage`, `knockout`, `finished`) |

### Configuração

No `.env`:

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
LIVE_CACHE_TTL_MS=60000
STANDINGS_CACHE_TTL_MS=300000
KNOCKOUT_CACHE_TTL_MS=300000
STATS_CACHE_TTL_MS=120000
SQUAD_CACHE_TTL_MS=21600000
LINEUPS_CACHE_TTL_MS=120000
SCORERS_CACHE_TTL_MS=600000
```

As respostas da IA são cacheadas em memória conforme os TTLs acima. Em caso de falha ou timeout da OpenAI, a API retorna automaticamente os dados locais.
# fifa-api
