import { cacheGet, cacheSetPersistent } from "../utils/cache.js";
import { readPersistedKnockoutBracket, saveKnockoutBracketSnapshot } from "./livePersistenceService.js";
import { getMatches } from "./databaseService.js";
import { findTeamByCode } from "./teamService.js";
import { askOpenAIForJson, isOpenAIConfigured } from "./openaiService.js";
import type {
  KnockoutBracket,
  KnockoutMatch,
  KnockoutRound,
  KnockoutStage,
  KnockoutTeamRef,
  LiveScore,
  PhaseInfo,
  TournamentPhase
} from "../types/live.js";

const KNOCKOUT_START = "2026-06-28";
const FINAL_DATE = "2026-07-19";

type BracketSlot = {
  matchNumber: number;
  stage: KnockoutStage;
  homeLabel: string;
  awayLabel: string;
  date?: string;
  stadiumName?: string;
  city?: string;
};

/**
 * Chaveamento oficial da Copa do Mundo FIFA 2026 (jogos 73 a 104).
 * Rótulos: "1A" = campeão do Grupo A, "2B" = vice do Grupo B,
 * "3(C/E/F/H/I)" = um dos melhores terceiros desses grupos,
 * "W73" = vencedor do jogo 73, "L101" = perdedor do jogo 101.
 * Datas e sedes só são fixadas quando confirmadas; o restante é
 * preenchido em tempo real pela camada de IA.
 */
const BRACKET_TEMPLATE: BracketSlot[] = [
  { matchNumber: 73, stage: "round_of_32", homeLabel: "2A", awayLabel: "2B", date: "2026-06-28", stadiumName: "SoFi Stadium", city: "Los Angeles" },
  { matchNumber: 74, stage: "round_of_32", homeLabel: "1E", awayLabel: "3(A/B/C/D/F)" },
  { matchNumber: 75, stage: "round_of_32", homeLabel: "1F", awayLabel: "2C" },
  { matchNumber: 76, stage: "round_of_32", homeLabel: "1C", awayLabel: "2F" },
  { matchNumber: 77, stage: "round_of_32", homeLabel: "1I", awayLabel: "3(C/D/F/G/H)", date: "2026-06-30", stadiumName: "MetLife Stadium", city: "New York / New Jersey" },
  { matchNumber: 78, stage: "round_of_32", homeLabel: "2E", awayLabel: "2I", stadiumName: "AT&T Stadium", city: "Dallas" },
  { matchNumber: 79, stage: "round_of_32", homeLabel: "1A", awayLabel: "3(C/E/F/H/I)", date: "2026-06-30", stadiumName: "Estadio Azteca", city: "Mexico City" },
  { matchNumber: 80, stage: "round_of_32", homeLabel: "1L", awayLabel: "3(E/H/I/J/K)" },
  { matchNumber: 81, stage: "round_of_32", homeLabel: "1D", awayLabel: "3(B/E/F/I/J)" },
  { matchNumber: 82, stage: "round_of_32", homeLabel: "1G", awayLabel: "3(A/E/H/I/J)" },
  { matchNumber: 83, stage: "round_of_32", homeLabel: "2K", awayLabel: "2L" },
  { matchNumber: 84, stage: "round_of_32", homeLabel: "1H", awayLabel: "2J", stadiumName: "SoFi Stadium", city: "Los Angeles" },
  { matchNumber: 85, stage: "round_of_32", homeLabel: "1B", awayLabel: "3(E/F/G/I/J)" },
  { matchNumber: 86, stage: "round_of_32", homeLabel: "1J", awayLabel: "2H" },
  { matchNumber: 87, stage: "round_of_32", homeLabel: "1K", awayLabel: "3(D/E/I/J/L)" },
  { matchNumber: 88, stage: "round_of_32", homeLabel: "2D", awayLabel: "2G", date: "2026-07-03", stadiumName: "AT&T Stadium", city: "Dallas" },

  { matchNumber: 89, stage: "round_of_16", homeLabel: "W74", awayLabel: "W77" },
  { matchNumber: 90, stage: "round_of_16", homeLabel: "W73", awayLabel: "W75" },
  { matchNumber: 91, stage: "round_of_16", homeLabel: "W76", awayLabel: "W78" },
  { matchNumber: 92, stage: "round_of_16", homeLabel: "W79", awayLabel: "W80" },
  { matchNumber: 93, stage: "round_of_16", homeLabel: "W83", awayLabel: "W84" },
  { matchNumber: 94, stage: "round_of_16", homeLabel: "W81", awayLabel: "W82" },
  { matchNumber: 95, stage: "round_of_16", homeLabel: "W86", awayLabel: "W88" },
  { matchNumber: 96, stage: "round_of_16", homeLabel: "W85", awayLabel: "W87" },

  { matchNumber: 97, stage: "quarter_final", homeLabel: "W89", awayLabel: "W90" },
  { matchNumber: 98, stage: "quarter_final", homeLabel: "W93", awayLabel: "W94" },
  { matchNumber: 99, stage: "quarter_final", homeLabel: "W91", awayLabel: "W92" },
  { matchNumber: 100, stage: "quarter_final", homeLabel: "W95", awayLabel: "W96" },

  { matchNumber: 101, stage: "semi_final", homeLabel: "W97", awayLabel: "W98", date: "2026-07-14", stadiumName: "AT&T Stadium", city: "Dallas" },
  { matchNumber: 102, stage: "semi_final", homeLabel: "W99", awayLabel: "W100", date: "2026-07-15", stadiumName: "Mercedes-Benz Stadium", city: "Atlanta" },

  { matchNumber: 103, stage: "third_place", homeLabel: "L101", awayLabel: "L102", date: "2026-07-18", stadiumName: "Hard Rock Stadium", city: "Miami" },
  { matchNumber: 104, stage: "final", homeLabel: "W101", awayLabel: "W102", date: "2026-07-19", stadiumName: "MetLife Stadium", city: "New York / New Jersey" }
];

const ROUND_META: { stage: KnockoutStage; name: string; dateRange: string }[] = [
  { stage: "round_of_32", name: "Round of 32", dateRange: "Jun 28 – Jul 3" },
  { stage: "round_of_16", name: "Round of 16", dateRange: "Jul 4 – Jul 7" },
  { stage: "quarter_final", name: "Quarter-finals", dateRange: "Jul 9 – Jul 11" },
  { stage: "semi_final", name: "Semi-finals", dateRange: "Jul 14 – Jul 15" },
  { stage: "third_place", name: "Third place", dateRange: "Jul 18" },
  { stage: "final", name: "Final", dateRange: "Jul 19" }
];

const todayIso = () => new Date().toISOString().slice(0, 10);

export const getTournamentPhase = (): PhaseInfo => {
  const matches = getMatches();
  const groupDates = matches.map((match) => match.date).filter(Boolean).sort();
  const groupStageStart = groupDates[0] || "2026-06-11";
  const groupStageEnd = groupDates[groupDates.length - 1] || "2026-06-27";

  const today = todayIso();

  let phase: TournamentPhase = "pre_tournament";
  if (today >= groupStageStart && today < KNOCKOUT_START) phase = "group_stage";
  else if (today >= KNOCKOUT_START && today <= FINAL_DATE) phase = "knockout";
  else if (today > FINAL_DATE) phase = "finished";

  const msPerDay = 24 * 60 * 60 * 1000;
  const daysUntilKnockout = Math.max(
    0,
    Math.ceil(
      (new Date(`${KNOCKOUT_START}T00:00:00Z`).getTime() -
        new Date(`${today}T00:00:00Z`).getTime()) /
        msPerDay
    )
  );

  return {
    phase,
    today,
    groupStageStart,
    groupStageEnd,
    knockoutStart: KNOCKOUT_START,
    finalDate: FINAL_DATE,
    daysUntilKnockout
  };
};

const toTeamRef = (code: string | null | undefined): KnockoutTeamRef | null => {
  if (!code) return null;

  const team = findTeamByCode(code);

  if (!team) {
    return { id: null, code, name: code, flagUrl: null };
  }

  return {
    id: team.id,
    code: team.code,
    name: team.name,
    flagUrl: team.flagSvgUrl || team.flagUrl || null
  };
};

const buildBaseBracket = (): KnockoutMatch[] => {
  return BRACKET_TEMPLATE.map((slot) => ({
    matchNumber: slot.matchNumber,
    stage: slot.stage,
    homeLabel: slot.homeLabel,
    awayLabel: slot.awayLabel,
    homeTeam: null,
    awayTeam: null,
    homeScore: null,
    awayScore: null,
    penalties: null,
    status: "scheduled",
    minute: null,
    date: slot.date || null,
    kickoffLocal: null,
    stadiumName: slot.stadiumName || null,
    city: slot.city || null
  }));
};

type AiKnockoutPayload = {
  matches?: (LiveScore & {
    date?: string | null;
    kickoffLocal?: string | null;
    stadiumName?: string | null;
    city?: string | null;
  })[];
};

const fetchKnockoutFromOpenAI = async (): Promise<AiKnockoutPayload | null> => {
  const prompt = [
    `Hoje é ${todayIso()}.`,
    "Busque na web os dados mais recentes da fase eliminatória (mata-mata) da Copa do Mundo FIFA 2026,",
    "que vai do jogo 73 (Round of 32) ao jogo 104 (final).",
    "Para cada jogo já definido, em andamento ou encerrado, informe os times classificados e o placar.",
    "Responda SOMENTE com JSON no formato:",
    `{"matches":[{"matchNumber":73,"homeTeamCode":"BRA","awayTeamCode":"MEX","homeScore":2,"awayScore":1,"status":"finished","minute":null,"penalties":{"homeScore":null,"awayScore":null},"date":"2026-06-28","kickoffLocal":"15:00","stadiumName":"SoFi Stadium","city":"Los Angeles"}]}`,
    "Regras: status deve ser scheduled, live ou finished.",
    "Inclua apenas jogos cujos confrontos já estejam definidos.",
    "Se um time ainda não estiver definido, não inclua o jogo.",
    "Use null em qualquer campo desconhecido. Não invente dados."
  ].join(" ");

  return askOpenAIForJson<AiKnockoutPayload>(prompt);
};

export const getKnockoutBracket = async (
  options: { force?: boolean } = {}
): Promise<KnockoutBracket> => {
  const cacheKey = "knockout:bracket";

  if (!options.force) {
    const stored = readPersistedKnockoutBracket();
    if (stored) {
      cacheSetPersistent(cacheKey, stored);
      return stored;
    }

    const cached = cacheGet<KnockoutBracket>(cacheKey);
    if (cached && cached.source !== "local-fallback") return cached;
  }

  const phaseInfo = getTournamentPhase();
  const matches = buildBaseBracket();
  let source: KnockoutBracket["source"] = "local-fallback";

  // A IA só é acionada quando o usuário clica em Refresh / Is something wrong?.
  const shouldAskAI =
    Boolean(options.force) &&
    isOpenAIConfigured() &&
    (phaseInfo.phase === "knockout" || phaseInfo.phase === "finished");

  if (shouldAskAI) {
    const aiData = await fetchKnockoutFromOpenAI();

    if (aiData?.matches?.length) {
      source = "openai-live";

      for (const aiMatch of aiData.matches) {
        const target = matches.find(
          (match) => match.matchNumber === Number(aiMatch.matchNumber)
        );

        if (!target) continue;

        target.homeTeam = toTeamRef(aiMatch.homeTeamCode) || target.homeTeam;
        target.awayTeam = toTeamRef(aiMatch.awayTeamCode) || target.awayTeam;

        if (aiMatch.homeScore !== null && aiMatch.homeScore !== undefined) {
          target.homeScore = Number(aiMatch.homeScore);
        }

        if (aiMatch.awayScore !== null && aiMatch.awayScore !== undefined) {
          target.awayScore = Number(aiMatch.awayScore);
        }

        if (aiMatch.status && aiMatch.status !== "scheduled") {
          target.status = aiMatch.status;
        }

        target.minute = aiMatch.minute ?? target.minute;
        target.penalties = aiMatch.penalties ?? target.penalties;
        target.date = aiMatch.date ?? target.date;
        target.kickoffLocal = aiMatch.kickoffLocal ?? target.kickoffLocal;
        target.stadiumName = aiMatch.stadiumName ?? target.stadiumName;
        target.city = aiMatch.city ?? target.city;
      }
    }
  }

  const rounds: KnockoutRound[] = ROUND_META.map((meta) => ({
    stage: meta.stage,
    name: meta.name,
    dateRange: meta.dateRange,
    matches: matches.filter((match) => match.stage === meta.stage)
  }));

  const bracket: KnockoutBracket = {
    phase: phaseInfo.phase,
    source,
    updatedAt: new Date().toISOString(),
    knockoutStart: KNOCKOUT_START,
    rounds
  };

  if (source === "openai-live") {
    await saveKnockoutBracketSnapshot(bracket);
    cacheSetPersistent(cacheKey, bracket);
    return bracket;
  }

  const previous = readPersistedKnockoutBracket();
  if (previous) {
    cacheSetPersistent(cacheKey, previous);
    return previous;
  }

  return bracket;
};
