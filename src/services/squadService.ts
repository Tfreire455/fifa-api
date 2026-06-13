import { cacheGet, cacheSetPersistent } from "../utils/cache.js";
import { normalizeText } from "../utils/text.js";
import { findTeamByCode, findTeamById, findTeamBySlug } from "./teamService.js";
import { resolveStatsMatch } from "./liveService.js";
import { askOpenAIForJson, isOpenAIConfigured } from "./openaiService.js";
import { getTournamentPhase } from "./knockoutService.js";
import { resolvePlayerPhotoUrl } from "./assetService.js";
import { saveLiveSquadToDatabase } from "./databaseWriteService.js";
import {
  readPersistedLineups,
  readPersistedTopScorers,
  saveLineupsSnapshot,
  saveTopScorersSnapshot
} from "./livePersistenceService.js";
import type { Country, Player } from "../types/worldCup.js";
import type {
  DataSource,
  LineupPlayer,
  LiveCoachDetails,
  LiveNextMatch,
  LiveSquad,
  LiveTeamResult,
  LiveSquadPlayer,
  MatchLineups,
  SquadUpdate,
  TeamLineup,
  TopScorer,
  TopScorersResult
} from "../types/live.js";

const todayIso = () => new Date().toISOString().slice(0, 10);

/* -------------------------------------------------------------------------- */
/*                              Elenco ao vivo                                */
/* -------------------------------------------------------------------------- */

const POSITION_BUCKETS: Record<string, keyof Pick<LiveSquad, "goalkeepers" | "defenders" | "midfielders" | "forwards">> = {
  gk: "goalkeepers",
  goalkeeper: "goalkeepers",
  goleiro: "goalkeepers",
  df: "defenders",
  def: "defenders",
  defender: "defenders",
  zagueiro: "defenders",
  lateral: "defenders",
  mf: "midfielders",
  mid: "midfielders",
  midfielder: "midfielders",
  meia: "midfielders",
  volante: "midfielders",
  fw: "forwards",
  fwd: "forwards",
  forward: "forwards",
  atacante: "forwards",
  striker: "forwards",
  winger: "forwards"
};

const bucketForPosition = (
  position: string | null | undefined
): keyof Pick<LiveSquad, "goalkeepers" | "defenders" | "midfielders" | "forwards"> => {
  const normalized = normalizeText(position);

  for (const [key, bucket] of Object.entries(POSITION_BUCKETS)) {
    if (normalized.includes(key)) return bucket;
  }

  return "midfielders";
};

/** Aceita apenas URLs https diretas de imagem para evitar links quebrados ou inseguros. */
const isDirectImageUrl = (url: unknown): boolean => {
  if (typeof url !== "string") return false;
  if (!url.startsWith("https://")) return false;
  return /\.(jpe?g|png|webp)(\?.*)?$/i.test(url);
};

const localPlayerToLive = (team: Country, player: Player): LiveSquadPlayer => ({
  id: player.id,
  name: player.name,
  shirtName: player.shirtName,
  number: player.number,
  position: player.position,
  club: player.club,
  captain: false,
  status: player.status,
  photoUrl: resolvePlayerPhotoUrl(team, player) || null
});

const buildLocalSquad = (team: Country): LiveSquad => {
  const map = (players: Player[] = []) => players.map((player) => localPlayerToLive(team, player));

  const goalkeepers = map(team.squad?.goalkeepers);
  const defenders = map(team.squad?.defenders);
  const midfielders = map(team.squad?.midfielders);
  const forwards = map(team.squad?.forwards);

  return {
    teamId: team.id,
    teamCode: team.code,
    teamName: team.nameEn || team.name,
    source: "local-fallback",
    updatedAt: new Date().toISOString(),
    coach: team.coach?.name || null,
    coachDetails: null,
    captain: null,
    fifaRanking: null,
    recentResults: [],
    nextMatch: null,
    updates: [],
    goalkeepers,
    defenders,
    midfielders,
    forwards,
    all: [...goalkeepers, ...defenders, ...midfielders, ...forwards]
  };
};

type AiSquadPayload = {
  coach?: string | null;
  coachDetails?: {
    nationality?: string | null;
    age?: number | null;
    since?: string | null;
  } | null;
  captain?: string | null;
  fifaRanking?: number | null;
  recentResults?: Array<{
    date?: string | null;
    opponent?: string | null;
    score?: string | null;
    competition?: string | null;
    result?: string | null;
  }>;
  nextMatch?: {
    date?: string | null;
    opponent?: string | null;
    competition?: string | null;
    stadium?: string | null;
  } | null;
  players?: Array<{
    name?: string;
    number?: number | null;
    position?: string | null;
    club?: string | null;
    captain?: boolean;
    status?: string | null;
    photoUrl?: string | null;
  }>;
  updates?: Array<{
    date?: string | null;
    type?: string | null;
    description?: string;
  }>;
};

const fetchSquadFromOpenAI = async (team: Country): Promise<AiSquadPayload | null> => {
  const prompt = [
    `Hoje é ${todayIso()}.`,
    `Busque na web as informações completas e mais atualizadas da seleção ${team.nameEn} (${team.code}) na Copa do Mundo FIFA 2026:`,
    "elenco oficial (convocações finais, números das camisas, clubes atuais), capitão, técnico atual com nacionalidade/idade/ano de início,",
    "ranking FIFA atual, últimos 5 resultados da seleção, próximo jogo e mudanças recentes no elenco (lesões, cortes, substituições).",
    "Para CADA jogador, inclua photoUrl: a URL direta de uma foto/retrato oficial do jogador (terminada em .jpg, .jpeg, .png ou .webp),",
    "preferindo imagens da Wikipedia/Wikimedia Commons. Se não encontrar uma URL direta confiável, use null.",
    "Responda SOMENTE com JSON no formato:",
    `{"coach":"Nome do Técnico","coachDetails":{"nationality":"Italiana","age":66,"since":"2025"},"captain":"Nome do Capitão","fifaRanking":5,` +
      `"recentResults":[{"date":"2026-06-01","opponent":"França","score":"2-1","competition":"Amistoso","result":"W"}],` +
      `"nextMatch":{"date":"2026-06-13","opponent":"Marrocos","competition":"Copa do Mundo - Grupo C","stadium":"MetLife Stadium"},` +
      `"players":[{"name":"Nome","number":10,"position":"FW","club":"Clube","captain":false,"status":"confirmed","photoUrl":"https://upload.wikimedia.org/...jpg"}],` +
      `"updates":[{"date":"2026-06-05","type":"injury","description":"Jogador X cortado por lesão, substituído por Y"}]}`,
    "Regras: position deve ser GK, DF, MF ou FW.",
    "status deve ser confirmed, injured, doubt, replaced ou called_up.",
    "result em recentResults deve ser W, D ou L (do ponto de vista desta seleção).",
    "type em updates deve ser injury, replacement, call_up, suspension ou info.",
    "score deve ser string curta em linha única, exemplo: \"2-1\" ou null. Nunca coloque quebra de linha dentro de score.",
    "Não use texto longo dentro dos campos. Mantenha description com no máximo 160 caracteres.",
    "Liste os 26 jogadores convocados quando a lista oficial existir. Não invente jogadores, números nem URLs de fotos."
  ].join(" ");

  return askOpenAIForJson<AiSquadPayload>(prompt);
};

const mergeSquadWithLocal = (team: Country, payload: AiSquadPayload): LiveSquad => {
  const localPlayers = team.squad?.all || [];
  const findLocal = (name: string) => {
    const normalized = normalizeText(name);
    return localPlayers.find((player) => {
      const localName = normalizeText(player.name);
      const localShirt = normalizeText(player.shirtName);
      return (
        localName === normalized ||
        (localShirt && localShirt === normalized) ||
        localName.includes(normalized) ||
        normalized.includes(localName)
      );
    });
  };

  const coachDetails: LiveCoachDetails | null = payload.coachDetails
    ? {
        name: payload.coach || team.coach?.name || null,
        nationality: payload.coachDetails.nationality || null,
        age: payload.coachDetails.age ?? null,
        since: payload.coachDetails.since || null
      }
    : null;

  const recentResults: LiveTeamResult[] = (payload.recentResults || [])
    .filter((item) => Boolean(item?.opponent))
    .slice(0, 5)
    .map((item) => ({
      date: item.date || null,
      opponent: item.opponent || null,
      score: item.score || null,
      competition: item.competition || null,
      result: item.result || null
    }));

  const nextMatch: LiveNextMatch | null = payload.nextMatch?.opponent
    ? {
        date: payload.nextMatch.date || null,
        opponent: payload.nextMatch.opponent || null,
        competition: payload.nextMatch.competition || null,
        stadium: payload.nextMatch.stadium || null
      }
    : null;

  const result: LiveSquad = {
    teamId: team.id,
    teamCode: team.code,
    teamName: team.nameEn || team.name,
    source: "openai-live",
    updatedAt: new Date().toISOString(),
    coach: payload.coach || team.coach?.name || null,
    coachDetails,
    captain: payload.captain || null,
    fifaRanking: payload.fifaRanking ?? null,
    recentResults,
    nextMatch,
    updates: (payload.updates || [])
      .filter((update): update is SquadUpdate & { description: string } => Boolean(update?.description))
      .map((update) => ({
        date: update.date || null,
        type: update.type || "info",
        description: update.description
      })),
    goalkeepers: [],
    defenders: [],
    midfielders: [],
    forwards: [],
    all: []
  };

  for (const aiPlayer of payload.players || []) {
    if (!aiPlayer?.name) continue;

    const local = findLocal(aiPlayer.name);

    const player: LiveSquadPlayer = {
      id: local?.id || null,
      name: aiPlayer.name,
      shirtName: local?.shirtName || null,
      number: aiPlayer.number ?? local?.number ?? null,
      position: aiPlayer.position || local?.position || "MF",
      club: aiPlayer.club ?? local?.club ?? null,
      captain: Boolean(aiPlayer.captain),
      status: aiPlayer.status || "confirmed",
      photoUrl:
        resolvePlayerPhotoUrl(team, {
          id: local?.id || null,
          name: aiPlayer.name,
          shirtName: local?.shirtName || null,
          photoUrl:
            local?.photoUrl ||
            (isDirectImageUrl(aiPlayer.photoUrl) ? (aiPlayer.photoUrl as string) : null) ||
            null
        }) || null
    };

    result[bucketForPosition(player.position)].push(player);
    result.all.push(player);
  }

  const byNumber = (a: LiveSquadPlayer, b: LiveSquadPlayer) =>
    (a.number ?? 99) - (b.number ?? 99);

  result.goalkeepers.sort(byNumber);
  result.defenders.sort(byNumber);
  result.midfielders.sort(byNumber);
  result.forwards.sort(byNumber);

  return result;
};

const resolveStoredLiveSquad = (team: Country): LiveSquad | null => {
  const stored = (team as Country & { liveData?: { squad?: LiveSquad } }).liveData?.squad;

  if (!stored?.all?.length || stored.all.length < 11) return null;

  const resolvePlayer = (player: LiveSquadPlayer): LiveSquadPlayer => ({
    ...player,
    photoUrl:
      resolvePlayerPhotoUrl(team, {
        id: player.id || null,
        name: player.name,
        shirtName: player.shirtName || null,
        photoUrl: player.photoUrl || null
      }) || null
  });

  const all = stored.all.map(resolvePlayer);

  const byBucket = (bucket: keyof Pick<LiveSquad, "goalkeepers" | "defenders" | "midfielders" | "forwards">) => {
    const source = stored[bucket]?.length ? stored[bucket] : all.filter((player) => bucketForPosition(player.position) === bucket);
    return source.map(resolvePlayer);
  };

  return {
    ...stored,
    source: "openai-live",
    goalkeepers: byBucket("goalkeepers"),
    defenders: byBucket("defenders"),
    midfielders: byBucket("midfielders"),
    forwards: byBucket("forwards"),
    all
  };
};

const resolveTeam = (idOrSlugOrCode: string): Country | undefined => {
  return (
    findTeamById(idOrSlugOrCode) ||
    findTeamBySlug(idOrSlugOrCode) ||
    findTeamByCode(idOrSlugOrCode)
  );
};

/**
 * Elenco oficial atualizado da seleção via OpenAI + web search,
 * mesclado com os dados locais (fotos, ids), com fallback local.
 */
export const getLiveSquad = async (
  idOrSlugOrCode: string,
  options: { force?: boolean } = {}
): Promise<LiveSquad | null> => {
  const team = resolveTeam(idOrSlugOrCode);
  if (!team) return null;

  const cacheKey = `live:squad:v2:${team.id}`;

  if (!options.force) {
    const cached = cacheGet<LiveSquad>(cacheKey);
    if (cached) return cached;

    const stored = resolveStoredLiveSquad(team);
    if (stored) {
      cacheSetPersistent(cacheKey, stored);
      return stored;
    }
  }

  let result = buildLocalSquad(team);
  let fetchedLive = false;

  if (options.force && isOpenAIConfigured()) {
    const payload = await fetchSquadFromOpenAI(team);

    if (payload?.players?.length && payload.players.length >= 11) {
      result = mergeSquadWithLocal(team, payload);
      await saveLiveSquadToDatabase(team.id, result);
      fetchedLive = true;
    }
  }

  // Conseguiu dados ao vivo: grava permanentemente.
  if (fetchedLive) {
    cacheSetPersistent(cacheKey, result);
    return result;
  }

  // Refresh sem sucesso: mantém o elenco bom já gravado (cache ou base).
  const previous = cacheGet<LiveSquad>(cacheKey) || resolveStoredLiveSquad(team);
  if (previous) {
    cacheSetPersistent(cacheKey, previous);
    return previous;
  }

  cacheSetPersistent(cacheKey, result);
  return result;
};

/* -------------------------------------------------------------------------- */
/*                                Escalações                                  */
/* -------------------------------------------------------------------------- */

const emptyLineup = (code: string | null, name: string | null): TeamLineup => ({
  teamCode: code,
  teamName: name,
  formation: null,
  coach: null,
  startingXI: [],
  bench: []
});

type AiLineupsPayload = {
  available?: boolean;
  home?: {
    formation?: string | null;
    coach?: string | null;
    startingXI?: LineupPlayer[];
    bench?: LineupPlayer[];
  };
  away?: {
    formation?: string | null;
    coach?: string | null;
    startingXI?: LineupPlayer[];
    bench?: LineupPlayer[];
  };
};

const sanitizeLineupPlayers = (players?: LineupPlayer[]): LineupPlayer[] => {
  return (players || [])
    .filter((player) => Boolean(player?.name))
    .map((player) => ({
      number: player.number ?? null,
      name: player.name,
      position: player.position ?? null,
      captain: Boolean(player.captain)
    }));
};

const fetchLineupsFromOpenAI = async (match: {
  matchNumber: number;
  date: string | null;
  homeTeamCode: string | null;
  awayTeamCode: string | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
}): Promise<AiLineupsPayload | null> => {
  const prompt = [
    `Hoje é ${todayIso()}.`,
    `Busque na web a escalação oficial do jogo ${match.matchNumber} da Copa do Mundo FIFA 2026:`,
    `${match.homeTeamName || match.homeTeamCode} x ${match.awayTeamName || match.awayTeamCode}, em ${match.date}.`,
    "Responda SOMENTE com JSON no formato:",
    `{"available":true,"home":{"formation":"4-3-3","coach":"Nome","startingXI":[{"number":1,"name":"Nome","position":"GK","captain":false}],"bench":[{"number":12,"name":"Nome","position":"GK"}]},"away":{...}}`,
    "Regras: startingXI deve ter exatamente 11 jogadores quando a escalação tiver sido divulgada.",
    `Se a escalação ainda não foi divulgada, responda {"available":false}.`,
    "Não invente jogadores."
  ].join(" ");

  return askOpenAIForJson<AiLineupsPayload>(prompt);
};

/**
 * Escalações oficiais (titulares, banco, formação, técnico) de um jogo,
 * via OpenAI + web search. Aceita id do jogo ou matchNumber.
 */
export const getLiveLineups = async (
  matchId: string,
  options: { force?: boolean } = {}
): Promise<MatchLineups | null> => {
  const match = await resolveStatsMatch(matchId);

  if (!match) return null;

  const cacheKey = `live:lineups:${match.id}`;

  if (!options.force) {
    const stored = readPersistedLineups(match.id);
    if (stored) {
      cacheSetPersistent(cacheKey, stored);
      return stored;
    }

    const cached = cacheGet<MatchLineups>(cacheKey);
    if (cached) return cached;
  }

  const homeTeam = match.homeTeamCode ? findTeamByCode(match.homeTeamCode) : undefined;
  const awayTeam = match.awayTeamCode ? findTeamByCode(match.awayTeamCode) : undefined;

  const result: MatchLineups = {
    matchId: match.id,
    matchNumber: Number(match.matchNumber),
    source: "local-fallback",
    updatedAt: new Date().toISOString(),
    available: false,
    home: emptyLineup(match.homeTeamCode, homeTeam?.nameEn || match.homeTeamName),
    away: emptyLineup(match.awayTeamCode, awayTeam?.nameEn || match.awayTeamName)
  };

  if (options.force && isOpenAIConfigured()) {
    const payload = await fetchLineupsFromOpenAI(match);

    if (payload?.available && payload.home && payload.away) {
      const homeXI = sanitizeLineupPlayers(payload.home.startingXI);
      const awayXI = sanitizeLineupPlayers(payload.away.startingXI);

      if (homeXI.length >= 11 && awayXI.length >= 11) {
        result.source = "openai-live";
        result.available = true;

        result.home.formation = payload.home.formation || null;
        result.home.coach = payload.home.coach || homeTeam?.coach?.name || null;
        result.home.startingXI = homeXI.slice(0, 11);
        result.home.bench = sanitizeLineupPlayers(payload.home.bench);

        result.away.formation = payload.away.formation || null;
        result.away.coach = payload.away.coach || awayTeam?.coach?.name || null;
        result.away.startingXI = awayXI.slice(0, 11);
        result.away.bench = sanitizeLineupPlayers(payload.away.bench);
      }
    }
  }

  if (result.source === "openai-live") {
    await saveLineupsSnapshot(match.id, result);
    cacheSetPersistent(cacheKey, result);
    return result;
  }

  const previous = cacheGet<MatchLineups>(cacheKey);
  if (previous) return previous;

  cacheSetPersistent(cacheKey, result);
  return result;
};

/* -------------------------------------------------------------------------- */
/*                                Artilharia                                  */
/* -------------------------------------------------------------------------- */

type AiScorersPayload = {
  scorers?: Array<{
    name?: string;
    teamCode?: string | null;
    teamName?: string | null;
    goals?: number;
    assists?: number | null;
  }>;
};

const fetchScorersFromOpenAI = async (limit: number): Promise<AiScorersPayload | null> => {
  const prompt = [
    `Hoje é ${todayIso()}.`,
    `Busque na web a artilharia atualizada da Copa do Mundo FIFA 2026 (top ${limit} goleadores).`,
    "Responda SOMENTE com JSON no formato:",
    `{"scorers":[{"name":"Nome","teamCode":"BRA","teamName":"Brazil","goals":4,"assists":2}]}`,
    "Regras: ordene por gols (desc). teamCode é o código FIFA de 3 letras. Não invente dados."
  ].join(" ");

  return askOpenAIForJson<AiScorersPayload>(prompt);
};

/**
 * Artilharia do torneio em tempo real via OpenAI + web search.
 * Antes do torneio começar, retorna lista vazia (local-fallback).
 */
export const getTopScorers = async (
  limit = 10,
  options: { force?: boolean } = {}
): Promise<TopScorersResult> => {
  const safeLimit = Math.min(Math.max(limit, 1), 30);
  const cacheKey = `live:scorers:${safeLimit}`;

  if (!options.force) {
    const stored = readPersistedTopScorers(safeLimit);
    if (stored) {
      cacheSetPersistent(cacheKey, stored);
      return stored;
    }

    const cached = cacheGet<TopScorersResult>(cacheKey);
    if (cached) return cached;
  }

  let source: DataSource = "local-fallback";
  let scorers: TopScorer[] = [];

  const phase = getTournamentPhase();
  const tournamentStarted = phase.phase !== "pre_tournament";

  if (options.force && tournamentStarted && isOpenAIConfigured()) {
    const payload = await fetchScorersFromOpenAI(safeLimit);

    if (payload?.scorers?.length) {
      source = "openai-live";
      scorers = payload.scorers
        .filter((scorer): scorer is typeof scorer & { name: string } => Boolean(scorer?.name))
        .map((scorer, index) => ({
          position: index + 1,
          name: scorer.name,
          teamCode: scorer.teamCode || null,
          teamName: scorer.teamName || null,
          goals: Number(scorer.goals) || 0,
          assists: scorer.assists ?? null
        }))
        .sort((a, b) => b.goals - a.goals)
        .map((scorer, index) => ({ ...scorer, position: index + 1 }))
        .slice(0, safeLimit);
    }
  }

  const result: TopScorersResult = {
    source,
    updatedAt: new Date().toISOString(),
    total: scorers.length,
    data: scorers
  };

  if (source === "openai-live") {
    await saveTopScorersSnapshot(safeLimit, result);
    cacheSetPersistent(cacheKey, result);
    return result;
  }

  const previous = cacheGet<TopScorersResult>(cacheKey);
  if (previous) return previous;

  cacheSetPersistent(cacheKey, result);
  return result;
};