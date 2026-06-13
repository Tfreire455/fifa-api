import { getDatabase, updateDatabase } from "./databaseService.js";
import type { WorldCupDatabase, WorldCupGroup, WorldCupMatch } from "../types/worldCup.js";
import type {
  DataSource,
  GroupStandings,
  KnockoutBracket,
  MatchLineups,
  MatchStats,
  TopScorersResult
} from "../types/live.js";
import type { LiveMatchesResult } from "./liveService.js";

type Persisted<T> = T & {
  persistedAt?: string;
};

type PersistedLiveData = {
  matches?: Record<string, Persisted<LiveMatchesResult>>;
  standings?: Partial<Record<WorldCupGroup, Persisted<GroupStandings>>>;
  matchStats?: Record<string, Persisted<MatchStats>>;
  lineups?: Record<string, Persisted<MatchLineups>>;
  scorers?: Record<string, Persisted<TopScorersResult>>;
  knockout?: Persisted<KnockoutBracket>;
};

type DatabaseWithLiveData = WorldCupDatabase & {
  liveData?: PersistedLiveData;
};

type MatchWithLiveScore = WorldCupMatch & {
  homeScore?: number | null;
  awayScore?: number | null;
  minute?: string | null;
  penalties?: {
    homeScore: number | null;
    awayScore: number | null;
  } | null;
};

const nowIso = () => new Date().toISOString();

const normalizeCode = (code?: string | null) => String(code || "").trim().toUpperCase();

const normalizeName = (value?: string | null) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const withSavedSource = <T extends { source: DataSource }>(value: T): T => ({
  ...value,
  source: "database-saved"
});

const readStore = (): PersistedLiveData => {
  const database = getDatabase() as DatabaseWithLiveData;
  return database.liveData || {};
};

const ensureStore = (database: WorldCupDatabase): PersistedLiveData => {
  const target = database as DatabaseWithLiveData;
  target.liveData ||= {};
  return target.liveData;
};

export const hasPersistedScore = (match: {
  homeScore?: number | null;
  awayScore?: number | null;
}) => {
  return (
    match.homeScore !== null &&
    match.homeScore !== undefined &&
    match.awayScore !== null &&
    match.awayScore !== undefined
  );
};

export const hasPersistableMatchUpdate = (match: MatchWithLiveScore) => {
  const status = String(match.status || "").toLowerCase();

  // Resultado finalizado só é persistível se vier com placar numérico.
  // Isso evita gravar "finished" com score null e travar o card como finalizado sem resultado.
  return hasPersistedScore(match) || status === "live";
};

const sameMatch = (target: MatchWithLiveScore, liveMatch: MatchWithLiveScore) => {
  if (target.id && liveMatch.id && target.id === liveMatch.id) return true;

  if (
    target.matchNumber !== undefined &&
    liveMatch.matchNumber !== undefined &&
    Number(target.matchNumber) === Number(liveMatch.matchNumber)
  ) {
    return true;
  }

  const sameCodes =
    normalizeCode(target.homeTeamCode) &&
    normalizeCode(target.awayTeamCode) &&
    normalizeCode(target.homeTeamCode) === normalizeCode(liveMatch.homeTeamCode) &&
    normalizeCode(target.awayTeamCode) === normalizeCode(liveMatch.awayTeamCode);

  if (sameCodes) return true;

  return (
    normalizeName(target.homeTeamName) &&
    normalizeName(target.awayTeamName) &&
    normalizeName(target.homeTeamName) === normalizeName(liveMatch.homeTeamName) &&
    normalizeName(target.awayTeamName) === normalizeName(liveMatch.awayTeamName)
  );
};

const applyLiveScoreToMatch = (target: MatchWithLiveScore, liveMatch: MatchWithLiveScore) => {
  if (!hasPersistableMatchUpdate(liveMatch)) return;

  const liveStatus = String(liveMatch.status || "").toLowerCase();

  // Nunca marca um jogo como finished sem placar.
  // Se a IA retornar status finished mas score null, esse retorno é considerado incompleto.
  if (hasPersistedScore(liveMatch)) {
    target.status = liveMatch.status || target.status;
    target.homeScore = Number(liveMatch.homeScore);
    target.awayScore = Number(liveMatch.awayScore);
  } else if (liveStatus === "live") {
    target.status = liveMatch.status || target.status;
  }

  if (liveMatch.minute !== undefined) {
    target.minute = liveMatch.minute ?? null;
  }

  if (liveMatch.penalties !== undefined) {
    target.penalties = liveMatch.penalties ?? null;
  }
};

const syncLiveScoresIntoDatabaseMatches = (
  database: WorldCupDatabase,
  result: LiveMatchesResult
) => {
  const liveMatches = result.data.filter((match) =>
    hasPersistableMatchUpdate(match as MatchWithLiveScore)
  ) as MatchWithLiveScore[];

  const syncList = (matches?: WorldCupMatch[]) => {
    if (!matches?.length || !liveMatches.length) return;

    matches.forEach((match) => {
      const liveMatch = liveMatches.find((item) => sameMatch(match as MatchWithLiveScore, item));
      if (!liveMatch) return;
      applyLiveScoreToMatch(match as MatchWithLiveScore, liveMatch);
    });
  };

  syncList(database.worldCup2026?.matches);
  syncList(database.worldCup2026?.groupStageMatches);
  syncList(database.matches);
};

export const applyPersistedLiveScoreToMatch = <T extends WorldCupMatch>(
  match: T
): T & MatchWithLiveScore => {
  const patched = { ...match } as T & MatchWithLiveScore;
  const snapshots = Object.values(readStore().matches || {});

  for (const snapshot of snapshots) {
    const liveMatch = snapshot.data.find((item) =>
      sameMatch(patched, item as MatchWithLiveScore)
    ) as MatchWithLiveScore | undefined;

    if (!liveMatch) continue;
    applyLiveScoreToMatch(patched, liveMatch);
  }

  return patched;
};

export const readPersistedLiveMatches = (date: string): LiveMatchesResult | null => {
  const stored = readStore().matches?.[date];
  return stored ? withSavedSource(stored) : null;
};

export const saveLiveMatchesSnapshot = async (
  date: string,
  result: LiveMatchesResult
) => {
  await updateDatabase((database) => {
    const store = ensureStore(database);

    store.matches ||= {};
    store.matches[date] = { ...result, persistedAt: nowIso() };

    syncLiveScoresIntoDatabaseMatches(database, result);

    database.metadata.generatedAt = nowIso();
  });
};

export const readPersistedLiveStandings = (
  group: WorldCupGroup
): GroupStandings | null => {
  const stored = readStore().standings?.[group];
  return stored ? withSavedSource(stored) : null;
};

export const saveLiveStandingsSnapshot = async (
  group: WorldCupGroup,
  result: GroupStandings
) => {
  await updateDatabase((database) => {
    const store = ensureStore(database);

    store.standings ||= {};
    store.standings[group] = { ...result, persistedAt: nowIso() };

    database.metadata.generatedAt = nowIso();
  });
};

export const readPersistedMatchStats = (matchId: string): MatchStats | null => {
  const stored = readStore().matchStats?.[matchId];
  return stored ? withSavedSource(stored) : null;
};

export const saveMatchStatsSnapshot = async (matchId: string, result: MatchStats) => {
  await updateDatabase((database) => {
    const store = ensureStore(database);

    store.matchStats ||= {};
    store.matchStats[matchId] = { ...result, persistedAt: nowIso() };

    database.metadata.generatedAt = nowIso();
  });
};

export const readPersistedLineups = (matchId: string): MatchLineups | null => {
  const stored = readStore().lineups?.[matchId];
  return stored ? withSavedSource(stored) : null;
};

export const saveLineupsSnapshot = async (matchId: string, result: MatchLineups) => {
  await updateDatabase((database) => {
    const store = ensureStore(database);

    store.lineups ||= {};
    store.lineups[matchId] = { ...result, persistedAt: nowIso() };

    database.metadata.generatedAt = nowIso();
  });
};

export const readPersistedTopScorers = (limit: number): TopScorersResult | null => {
  const stored = readStore().scorers?.[String(limit)];
  return stored ? withSavedSource(stored) : null;
};

export const saveTopScorersSnapshot = async (
  limit: number,
  result: TopScorersResult
) => {
  await updateDatabase((database) => {
    const store = ensureStore(database);

    store.scorers ||= {};
    store.scorers[String(limit)] = { ...result, persistedAt: nowIso() };

    database.metadata.generatedAt = nowIso();
  });
};

export const readPersistedKnockoutBracket = (): KnockoutBracket | null => {
  const stored = readStore().knockout;
  return stored ? withSavedSource(stored) : null;
};

export const saveKnockoutBracketSnapshot = async (result: KnockoutBracket) => {
  await updateDatabase((database) => {
    const store = ensureStore(database);

    store.knockout = { ...result, persistedAt: nowIso() };

    database.metadata.generatedAt = nowIso();
  });
};
