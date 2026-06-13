import { cacheGet, cacheSetPersistent } from "../utils/cache.js";
import { getGroups, getMatches } from "./databaseService.js";
import { findTeamByCode, listTeams } from "./teamService.js";
import { askOpenAIForJson, isOpenAIConfigured } from "./openaiService.js";
import { getKnockoutBracket, getTournamentPhase } from "./knockoutService.js";
import type { WorldCupGroup, WorldCupMatch } from "../types/worldCup.js";
import type {
	DataSource,
	GroupStandingRow,
	GroupStandings,
	LiveMatch,
	LiveScore,
	MatchStats,
	MatchTeamStats,
} from "../types/live.js";
import {
	readPersistedLiveMatches,
	readPersistedLiveStandings,
	readPersistedMatchStats,
	applyPersistedLiveScoreToMatch,
	saveLiveMatchesSnapshot,
	saveLiveStandingsSnapshot,
	saveMatchStatsSnapshot,
	hasPersistableMatchUpdate,
} from "./livePersistenceService.js";

const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * Opções comuns dos getters ao vivo.
 * `force: true` ignora cache/dado persistido e refaz a busca via OpenAI.
 * Use somente nos botões "Refresh" / "Is something wrong?".
 */
export type LiveFetchOptions = {
	force?: boolean;
};

const normalizeTeamCode = (code?: string | null) => {
	return String(code || "").trim().toUpperCase();
};

const hasScore = (match: {
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

const sortStandings = (rows: GroupStandingRow[]) => {
	return [...rows]
		.sort(
			(a, b) =>
				b.points - a.points ||
				b.goalDifference - a.goalDifference ||
				b.goalsFor - a.goalsFor ||
				a.teamName.localeCompare(b.teamName),
		)
		.map((row, index) => ({
			...row,
			position: index + 1,
		}));
};

const toLiveMatch = (match: WorldCupMatch): LiveMatch => {
	const patched = applyPersistedLiveScoreToMatch(match);

	return {
		...patched,
		homeScore: patched.homeScore ?? null,
		awayScore: patched.awayScore ?? null,
		minute: patched.minute ?? null,
		penalties: patched.penalties ?? null,
	};
};

type AiLiveScoresPayload = {
	matches?: LiveScore[];
};

const fetchLiveScoresFromOpenAI = async (
	dates: string[],
): Promise<LiveScore[] | null> => {
	const prompt = [
		`Hoje é ${todayIso()}.`,
		`Busque na web os placares em tempo real e resultados dos jogos da Copa do Mundo FIFA 2026 nas datas: ${dates.join(", ")}.`,
		"Cada jogo tem um número oficial (matchNumber) de 1 a 104.",
		"Responda SOMENTE com JSON no formato:",
		`{"matches":[{"matchNumber":1,"homeTeamCode":"MEX","awayTeamCode":"RSA","homeScore":1,"awayScore":0,"status":"live","minute":"63'"}]}`,
		"Regras: status deve ser scheduled, live ou finished.",
		"homeScore/awayScore devem ser null para jogos ainda não iniciados.",
		'minute é a string do minuto atual apenas para jogos ao vivo (ex: "63\'", "45\'+2", "HT"), caso contrário null.',
		"Inclua todos os jogos dessas datas que encontrar. Não invente placares.",
	].join(" ");

	const payload = await askOpenAIForJson<AiLiveScoresPayload>(prompt);
	return payload?.matches || null;
};

const mergeScores = (matches: LiveMatch[], scores: LiveScore[]): boolean => {
	let changed = false;

	for (const score of scores) {
		const scoreHomeCode = normalizeTeamCode(score.homeTeamCode);
		const scoreAwayCode = normalizeTeamCode(score.awayTeamCode);

		const target = matches.find((match) => {
			const sameMatchNumber =
				Number(match.matchNumber) === Number(score.matchNumber);

			const sameTeams =
				scoreHomeCode &&
				scoreAwayCode &&
				normalizeTeamCode(match.homeTeamCode) === scoreHomeCode &&
				normalizeTeamCode(match.awayTeamCode) === scoreAwayCode;

			return sameMatchNumber || sameTeams;
		});

		if (!target) continue;

		const scoreHasNumbers = hasScore(score);
		const scoreStatus = String(score.status || "").toLowerCase();
		const scoreIsUseful = scoreHasNumbers || scoreStatus === "live" || scoreStatus === "finished";

		if (!scoreIsUseful) continue;

		if (scoreStatus && scoreStatus !== "scheduled") {
			target.status = score.status || target.status;
		}

		// Não apaga placar salvo com null vindo da IA.
		if (scoreHasNumbers) {
			target.homeScore = Number(score.homeScore);
			target.awayScore = Number(score.awayScore);
		}

		target.minute = score.minute ?? target.minute ?? null;
		target.penalties = score.penalties ?? target.penalties ?? null;
		changed = true;
	}

	return changed;
};
export type LiveMatchesResult = {
	source: DataSource;
	updatedAt: string;
	date: string;
	total: number;
	data: LiveMatch[];
};

const resultHasPersistableUpdate = (result?: LiveMatchesResult | null) => {
	return Boolean(
		result?.data?.some((match) =>
			hasPersistableMatchUpdate(match as LiveMatch),
		),
	);
};

const getLocalMatchesForDates = (dates: string[]) => {
	return getMatches()
		.map(applyPersistedLiveScoreToMatch)
		.filter((match) => dates.includes(match.date))
		.sort((a, b) => Number(a.matchNumber) - Number(b.matchNumber))
		.map(toLiveMatch);
};

/**
 * Jogos de hoje e de ontem, com placares atualizados.
 *
 * Regra:
 * - Se já existe dado salvo com placar, usa database.
 * - Só chama OpenAI se não houver dado salvo ou se options.force === true.
 * - Quando OpenAI retorna, salva na database e sincroniza os matches.
 */
export const getLiveMatches = async (
	date?: string,
	options: LiveFetchOptions = {},
): Promise<LiveMatchesResult> => {
	const referenceDate = date || todayIso();
	const cacheKey = `live:matches:${referenceDate}`;

	const previousDay = new Date(`${referenceDate}T12:00:00Z`);
	previousDay.setUTCDate(previousDay.getUTCDate() - 1);
	const previousIso = previousDay.toISOString().slice(0, 10);

	const dates = [previousIso, referenceDate];
	const localMatches = getLocalMatchesForDates(dates);
	const localHasPersistedUpdate = localMatches.some((match) =>
		hasPersistableMatchUpdate(match as LiveMatch),
	);

	const localResult: LiveMatchesResult = {
		source: localHasPersistedUpdate ? "database-saved" : "local-fallback",
		updatedAt: new Date().toISOString(),
		date: referenceDate,
		total: localMatches.length,
		data: localMatches,
	};

	// Sem refresh manual, NUNCA chama OpenAI. Isso evita gasto de tokens.
	// Também ignora caches antigos "openai-live" sem placar, que prendiam jogos em scheduled.
	if (!options.force) {
		const stored = readPersistedLiveMatches(referenceDate);

		if (stored && resultHasPersistableUpdate(stored)) {
			cacheSetPersistent(cacheKey, stored);
			return stored;
		}

		cacheSetPersistent(cacheKey, localResult);
		return localResult;
	}

	let result = localResult;

	if (isOpenAIConfigured() && localMatches.length > 0) {
		const scores = await fetchLiveScoresFromOpenAI(dates);

		if (scores?.length) {
			const changed = mergeScores(localMatches, scores);

			if (changed) {
				result = {
					source: "openai-live",
					updatedAt: new Date().toISOString(),
					date: referenceDate,
					total: localMatches.length,
					data: localMatches,
				};
			}
		}
	}

	if (result.source === "openai-live" && resultHasPersistableUpdate(result)) {
		await saveLiveMatchesSnapshot(referenceDate, result);
		cacheSetPersistent(cacheKey, result);
		return result;
	}

	// Refresh sem resposta útil da IA: mantém o melhor dado salvo, se houver.
	const previous = readPersistedLiveMatches(referenceDate);

	if (previous && resultHasPersistableUpdate(previous)) {
		cacheSetPersistent(cacheKey, previous);
		return previous;
	}

	cacheSetPersistent(cacheKey, localResult);
	return localResult;
};

type AiStandingsPayload = {
	standings?: {
		teamCode?: string;
		played?: number;
		won?: number;
		drawn?: number;
		lost?: number;
		goalsFor?: number;
		goalsAgainst?: number;
		points?: number;
	}[];
};

const buildFallbackStandings = (group: WorldCupGroup): GroupStandingRow[] => {
	const teams = listTeams({ group });
	const rows = new Map<string, GroupStandingRow>();

	teams.forEach((team, index) => {
		rows.set(normalizeTeamCode(team.code), {
			position: index + 1,
			teamId: team.id,
			teamCode: normalizeTeamCode(team.code),
			teamName: team.name,
			played: 0,
			won: 0,
			drawn: 0,
			lost: 0,
			goalsFor: 0,
			goalsAgainst: 0,
			goalDifference: 0,
			points: 0,
		});
	});

	getMatches()
		.map(applyPersistedLiveScoreToMatch)
		.filter((match) => match.group === group)
		.filter((match) => match.status === "finished" || hasScore(match))
		.forEach((match) => {
			if (!hasScore(match)) return;

			const homeCode = normalizeTeamCode(match.homeTeamCode);
			const awayCode = normalizeTeamCode(match.awayTeamCode);

			const home = rows.get(homeCode);
			const away = rows.get(awayCode);

			if (!home || !away) return;

			const homeScore = Number(match.homeScore);
			const awayScore = Number(match.awayScore);

			home.played += 1;
			away.played += 1;

			home.goalsFor += homeScore;
			home.goalsAgainst += awayScore;

			away.goalsFor += awayScore;
			away.goalsAgainst += homeScore;

			if (homeScore > awayScore) {
				home.won += 1;
				home.points += 3;
				away.lost += 1;
			} else if (awayScore > homeScore) {
				away.won += 1;
				away.points += 3;
				home.lost += 1;
			} else {
				home.drawn += 1;
				away.drawn += 1;
				home.points += 1;
				away.points += 1;
			}

			home.goalDifference = home.goalsFor - home.goalsAgainst;
			away.goalDifference = away.goalsFor - away.goalsAgainst;
		});

	return sortStandings([...rows.values()]);
};

const fallbackHasResults = (fallback: GroupStandingRow[]) => {
	return fallback.some((row) => row.played > 0);
};

const mergeStandingsWithSavedMatchResults = (
	current: GroupStandings,
	fallback: GroupStandingRow[],
): GroupStandings => {
	if (!fallbackHasResults(fallback)) return current;

	const rowsByCode = new Map<string, GroupStandingRow>();

	current.standings.forEach((row) => {
		rowsByCode.set(normalizeTeamCode(row.teamCode), {
			...row,
			teamCode: normalizeTeamCode(row.teamCode),
		});
	});

	let changed = false;

	for (const fallbackRow of fallback) {
		const code = normalizeTeamCode(fallbackRow.teamCode);
		const currentRow = rowsByCode.get(code);

		if (!currentRow) {
			rowsByCode.set(code, fallbackRow);
			changed = true;
			continue;
		}

		const fallbackIsNewer =
			fallbackRow.played > currentRow.played ||
			fallbackRow.points > currentRow.points ||
			fallbackRow.goalsFor > currentRow.goalsFor ||
			fallbackRow.goalsAgainst > currentRow.goalsAgainst;

		if (fallbackIsNewer) {
			rowsByCode.set(code, fallbackRow);
			changed = true;
		}
	}

	if (!changed) return current;

	return {
		...current,
		source:
			current.source === "openai-live" ? current.source : "database-saved",
		updatedAt: new Date().toISOString(),
		standings: sortStandings([...rowsByCode.values()]),
	};
};

const normalizeAiStandings = (
	payload: AiStandingsPayload | null | undefined,
): GroupStandingRow[] => {
	const rows: GroupStandingRow[] = [];

	payload?.standings?.forEach((row, index) => {
		const teamCode = normalizeTeamCode(row.teamCode);
		if (!teamCode) return;

		const team = findTeamByCode(teamCode);
		const goalsFor = Number(row.goalsFor ?? 0);
		const goalsAgainst = Number(row.goalsAgainst ?? 0);

		rows.push({
			position: index + 1,
			teamId: team?.id || null,
			teamCode,
			teamName: team?.name || teamCode,
			played: Number(row.played ?? 0),
			won: Number(row.won ?? 0),
			drawn: Number(row.drawn ?? 0),
			lost: Number(row.lost ?? 0),
			goalsFor,
			goalsAgainst,
			goalDifference: goalsFor - goalsAgainst,
			points: Number(row.points ?? 0),
		});
	});

	return sortStandings(rows);
};

/**
 * Classificação do grupo.
 *
 * Regra:
 * - Primeiro tenta usar resultado salvo na database.
 * - Se houver jogos com placar persistido, calcula a tabela localmente.
 * - A IA nunca pode apagar placar já salvo.
 * - Só busca novamente na IA com force.
 */
export const getLiveStandings = async (
	group: WorldCupGroup,
	options: LiveFetchOptions = {},
): Promise<GroupStandings> => {
	const letter = group.toUpperCase() as WorldCupGroup;
	const cacheKey = `live:standings:${letter}`;
	const fallback = buildFallbackStandings(letter);

	if (!options.force) {
		const stored = readPersistedLiveStandings(letter);

		if (stored) {
			const merged = mergeStandingsWithSavedMatchResults(stored, fallback);

			if (merged !== stored) {
				await saveLiveStandingsSnapshot(letter, merged);
			}

			cacheSetPersistent(cacheKey, merged);
			return merged;
		}

		const result: GroupStandings = {
			group: letter,
			source: fallbackHasResults(fallback) ? "database-saved" : "local-fallback",
			updatedAt: new Date().toISOString(),
			standings: fallback,
		};

		if (fallbackHasResults(fallback)) {
			await saveLiveStandingsSnapshot(letter, result);
		}

		cacheSetPersistent(cacheKey, result);
		return result;
	}

	let standings = fallback;
	let source: DataSource = fallbackHasResults(fallback)
		? "database-saved"
		: "local-fallback";

	const phase = getTournamentPhase().phase;
	const tournamentStarted = phase !== "pre_tournament";

	// Só consulta IA quando o usuário força refresh.
	if (isOpenAIConfigured() && tournamentStarted && fallback.length > 0) {
		const codes = fallback.map((row) => row.teamCode).join(", ");

		const prompt = [
			`Hoje é ${todayIso()}.`,
			`Busque na web a classificação atualizada do Grupo ${letter} da Copa do Mundo FIFA 2026.`,
			`As seleções do grupo são: ${codes}.`,
			"Responda SOMENTE com JSON no formato:",
			`{"standings":[{"teamCode":"MEX","played":2,"won":1,"drawn":1,"lost":0,"goalsFor":3,"goalsAgainst":1,"points":4}]}`,
			"Ordene do primeiro ao último colocado. Use 0 quando o time ainda não jogou. Não invente dados.",
		].join(" ");

		const payload = await askOpenAIForJson<AiStandingsPayload>(prompt);
		const rows = normalizeAiStandings(payload);

		if (rows.length > 0) {
			const aiResult: GroupStandings = {
				group: letter,
				source: "openai-live",
				updatedAt: new Date().toISOString(),
				standings: rows,
			};

			const merged = mergeStandingsWithSavedMatchResults(aiResult, fallback);

			standings = merged.standings;
			source = "openai-live";
		}
	}

	const result: GroupStandings = {
		group: letter,
		source,
		updatedAt: new Date().toISOString(),
		standings: sortStandings(standings),
	};

	if (source === "openai-live" || source === "database-saved") {
		await saveLiveStandingsSnapshot(letter, result);
	}

	cacheSetPersistent(cacheKey, result);
	return result;
};

export const getAllLiveStandings = async (
	options: LiveFetchOptions = {},
): Promise<GroupStandings[]> => {
	const groups = getGroups();

	return Promise.all(
		groups.map((group) =>
			getLiveStandings(group.letter as WorldCupGroup, options),
		),
	);
};

type AiStatsPayload = {
	status?: string;
	homeScore?: number | null;
	awayScore?: number | null;
	home?: Partial<MatchTeamStats>;
	away?: Partial<MatchTeamStats>;
	summary?: string | null;
	scorers?: {
		team?: "home" | "away";
		player?: string;
		minute?: string | null;
	}[];
};

const emptyTeamStats = (): MatchTeamStats => ({
	possession: null,
	shots: null,
	shotsOnTarget: null,
	corners: null,
	fouls: null,
	yellowCards: null,
	redCards: null,
	offsides: null,
	passes: null,
	passAccuracy: null,
});

const normalizeTeamStats = (raw?: Partial<MatchTeamStats>): MatchTeamStats => ({
	...emptyTeamStats(),
	...(raw || {}),
});

type StatsMatchRef = {
	id: string;
	matchNumber: number;
	status: string;
	date: string | null;
	stadiumName: string | null;
	city: string | null;
	homeTeamCode: string | null;
	awayTeamCode: string | null;
	homeTeamName: string | null;
	awayTeamName: string | null;
};

/**
 * Resolve um jogo por id ou matchNumber, incluindo os jogos do
 * mata-mata (73-104), que não existem na base local.
 */
export const resolveStatsMatch = async (
	matchId: string,
): Promise<StatsMatchRef | null> => {
	const local = getMatches().find(
		(item) =>
			item.id === matchId || String(item.matchNumber) === String(matchId),
	);

	if (local) {
		const patched = applyPersistedLiveScoreToMatch(local);

		return {
			id: patched.id,
			matchNumber: Number(patched.matchNumber),
			status: patched.status,
			date: patched.date || null,
			stadiumName: patched.stadiumName || null,
			city: patched.city || null,
			homeTeamCode: patched.homeTeamCode || null,
			awayTeamCode: patched.awayTeamCode || null,
			homeTeamName: patched.homeTeamName || null,
			awayTeamName: patched.awayTeamName || null,
		};
	}

	const numeric = Number(String(matchId).replace(/^match-0*/, ""));

	if (!Number.isInteger(numeric) || numeric < 73 || numeric > 104) return null;

	const bracket = await getKnockoutBracket();
	const knockoutMatch = bracket.rounds
		.flatMap((round) => round.matches)
		.find((item) => item.matchNumber === numeric);

	if (!knockoutMatch) return null;

	return {
		id: `match-${String(numeric).padStart(3, "0")}`,
		matchNumber: numeric,
		status: knockoutMatch.status,
		date: knockoutMatch.date,
		stadiumName: knockoutMatch.stadiumName,
		city: knockoutMatch.city,
		homeTeamCode: knockoutMatch.homeTeam?.code || null,
		awayTeamCode: knockoutMatch.awayTeam?.code || null,
		homeTeamName: knockoutMatch.homeTeam?.name || knockoutMatch.homeLabel,
		awayTeamName: knockoutMatch.awayTeam?.name || knockoutMatch.awayLabel,
	};
};

/**
 * Estatísticas detalhadas de uma partida em tempo real via OpenAI + web search.
 */
export const getLiveMatchStats = async (
	matchId: string,
	options: LiveFetchOptions = {},
): Promise<MatchStats | null> => {
	const match = await resolveStatsMatch(matchId);

	if (!match) return null;

	const cacheKey = `live:stats:${match.id}`;

	if (!options.force) {
		const stored = readPersistedMatchStats(match.id);

		if (stored) {
			cacheSetPersistent(cacheKey, stored);
			return stored;
		}

		const cached = cacheGet<MatchStats>(cacheKey);

		if (cached) {
			return cached;
		}
	}

	const homeTeam = match.homeTeamCode
		? findTeamByCode(match.homeTeamCode)
		: undefined;
	const awayTeam = match.awayTeamCode
		? findTeamByCode(match.awayTeamCode)
		: undefined;

	let stats: MatchStats = {
		matchId: match.id,
		matchNumber: match.matchNumber,
		source: "local-fallback",
		updatedAt: new Date().toISOString(),
		status: match.status,
		homeScore: null,
		awayScore: null,
		home: emptyTeamStats(),
		away: emptyTeamStats(),
		summary: null,
		scorers: [],
	};

	if (options.force && isOpenAIConfigured()) {
		const prompt = [
			`Hoje é ${todayIso()}.`,
			`Busque na web as estatísticas da partida da Copa do Mundo FIFA 2026:`,
			`jogo ${match.matchNumber}, ${homeTeam?.name || match.homeTeamName} (${match.homeTeamCode}) x ${awayTeam?.name || match.awayTeamName} (${match.awayTeamCode}),`,
			`data ${match.date}, estádio ${match.stadiumName}, ${match.city}.`,
			"Responda SOMENTE com JSON no formato:",
			`{"status":"finished","homeScore":2,"awayScore":1,"home":{"possession":55,"shots":12,"shotsOnTarget":6,"corners":5,"fouls":10,"yellowCards":1,"redCards":0,"offsides":2,"passes":480,"passAccuracy":87},"away":{"possession":45,"shots":8,"shotsOnTarget":3,"corners":3,"fouls":14,"yellowCards":2,"redCards":0,"offsides":1,"passes":390,"passAccuracy":82},"summary":"Resumo curto da partida em português.","scorers":[{"team":"home","player":"Nome","minute":"23'"}]}`,
			"Regras: status deve ser scheduled, live ou finished.",
			"Se a partida ainda não começou ou a estatística não estiver disponível, use null.",
			"Não invente números.",
		].join(" ");

		const payload = await askOpenAIForJson<AiStatsPayload>(prompt);

		if (payload) {
			stats = {
				...stats,
				source: "openai-live",
				status: payload.status || stats.status,
				homeScore: payload.homeScore ?? null,
				awayScore: payload.awayScore ?? null,
				home: normalizeTeamStats(payload.home),
				away: normalizeTeamStats(payload.away),
				summary: payload.summary ?? null,
				scorers: (payload.scorers || [])
					.filter((scorer) => scorer.player && scorer.team)
					.map((scorer) => ({
						team: scorer.team as "home" | "away",
						player: scorer.player as string,
						minute: scorer.minute ?? null,
					})),
			};
		}
	}

	if (stats.source === "openai-live") {
		await saveMatchStatsSnapshot(match.id, stats);
		cacheSetPersistent(cacheKey, stats);
		return stats;
	}

	const previous = readPersistedMatchStats(match.id);

	if (previous) {
		cacheSetPersistent(cacheKey, previous);
		return previous;
	}

	cacheSetPersistent(cacheKey, stats);
	return stats;
};