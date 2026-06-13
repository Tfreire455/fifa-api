import { includesNormalized } from "../utils/text.js";
import { getMatches, getStadiums, reloadDatabase } from "./databaseService.js";
import { getStadiumAssets, toImageProxyUrl } from "./assetService.js";
import { askOpenAIForJson, isOpenAIConfigured } from "./openaiService.js";
import { saveStadiumDetailsToDatabase, type AiStadiumDetails } from "./databaseWriteService.js";
import type { Stadium } from "../types/worldCup.js";

const countryTimezones: Record<string, string> = {
  "México": "America/Mexico_City",
  "Mexico": "America/Mexico_City",
  "Estados Unidos": "America/New_York",
  "United States": "America/New_York",
  "Canadá": "America/Toronto",
  "Canada": "America/Toronto"
};

const todayIso = () => new Date().toISOString().slice(0, 10);

const getTimezone = (stadium: Stadium) => {
  if (/los angeles|san francisco|seattle|vancouver/i.test(`${stadium.city} ${stadium.name}`)) {
    return "America/Los_Angeles";
  }
  if (/denver/i.test(`${stadium.city} ${stadium.name}`)) return "America/Denver";
  if (/dallas|houston|kansas city|monterrey|guadalajara|mexico city/i.test(`${stadium.city} ${stadium.name}`)) {
    return "America/Chicago";
  }
  return countryTimezones[stadium.country] || "America/New_York";
};

export type StadiumWithDetails = Stadium & {
  timezone: string;
  matchCount: number;
  matches: ReturnType<typeof getMatches>;
  assets: ReturnType<typeof getStadiumAssets>;
  description: string;
  highlights: string[];
  opened?: string | null;
  surface?: string | null;
  roof?: string | null;
  architect?: string | null;
  tenantTeams?: string[];
  photoUrl?: string | null;
};

const hasPersistedStadiumInfo = (stadium: Stadium) => {
  return Boolean(stadium.description && stadium.highlights?.length && (stadium as StadiumWithDetails).opened !== undefined);
};

const buildDescription = (stadium: Stadium, matchCount: number) => {
  return `${stadium.name} is one of the FIFA World Cup 2026 venues in ${stadium.city}, ${stadium.country}. It is scheduled to host ${matchCount} match${matchCount === 1 ? "" : "es"} during the tournament.`;
};

const buildHighlights = (stadium: Stadium, matchCount: number) => {
  return [
    `${stadium.capacity.toLocaleString("en-US")} capacity`,
    `${matchCount} World Cup 2026 match${matchCount === 1 ? "" : "es"}`,
    `${stadium.city}, ${stadium.country}`,
    getTimezone(stadium)
  ];
};

const fetchStadiumDetailsFromOpenAI = async (stadium: Stadium): Promise<AiStadiumDetails | null> => {
  const prompt = [
    `Hoje é ${todayIso()}.`,
    `Busque informações públicas e atuais sobre o estádio ${stadium.name}, em ${stadium.city}, ${stadium.country}, sede da Copa do Mundo FIFA 2026.`,
    "Responda SOMENTE com JSON válido no formato:",
    `{"description":"Resumo curto em inglês, com no máximo 240 caracteres.","highlights":["Highlight curto"],"opened":"Ano ou data de abertura","surface":"Tipo de gramado","roof":"Tipo de cobertura ou null","architect":"Arquiteto/empresa ou null","tenantTeams":["Time mandante"],"photoUrl":"https://...jpg"}`,
    "Regras: highlights deve ter no máximo 5 itens curtos. photoUrl deve ser URL direta de imagem terminando em .jpg, .jpeg, .png, .webp, .avif ou .svg, preferindo Wikimedia. Se não encontrar imagem direta confiável, use null.",
    "Não invente dados incertos; use null quando não souber."
  ].join(" ");

  return askOpenAIForJson<AiStadiumDetails>(prompt);
};

const sanitizeStadiumDetails = (details: AiStadiumDetails | null): AiStadiumDetails | null => {
  if (!details) return null;

  const photoUrl = details.photoUrl && toImageProxyUrl(details.photoUrl) ? details.photoUrl : null;

  return {
    description: details.description || null,
    highlights: (details.highlights || []).filter(Boolean).slice(0, 5),
    opened: details.opened || null,
    surface: details.surface || null,
    roof: details.roof || null,
    architect: details.architect || null,
    tenantTeams: (details.tenantTeams || []).filter(Boolean).slice(0, 6),
    photoUrl
  };
};

const ensureStadiumDetails = async (stadium: Stadium): Promise<Stadium> => {
  if (hasPersistedStadiumInfo(stadium) || !isOpenAIConfigured()) return stadium;

  const details = sanitizeStadiumDetails(await fetchStadiumDetailsFromOpenAI(stadium));

  if (!details) return stadium;

  await saveStadiumDetailsToDatabase(stadium.id, details);
  const reloaded = reloadDatabase();

  return reloaded.worldCup2026.stadiums.find((item) => item.id === stadium.id) || stadium;
};

export const enrichStadium = (stadium: Stadium): StadiumWithDetails => {
  const matches = getMatches()
    .filter((match) => match.stadiumId === stadium.id || match.stadiumName === stadium.name)
    .sort((a, b) => Number(a.matchNumber) - Number(b.matchNumber));

  const stadiumWithExtras = stadium as StadiumWithDetails;

  return {
    ...stadium,
    timezone: stadium.timezone || getTimezone(stadium),
    matchCount: matches.length,
    matches,
    assets: getStadiumAssets(stadium),
    description: stadium.description || buildDescription(stadium, matches.length),
    highlights: stadium.highlights?.length ? stadium.highlights : buildHighlights(stadium, matches.length),
    opened: stadiumWithExtras.opened || null,
    surface: stadiumWithExtras.surface || null,
    roof: stadiumWithExtras.roof || null,
    architect: stadiumWithExtras.architect || null,
    tenantTeams: stadiumWithExtras.tenantTeams || [],
    photoUrl: stadiumWithExtras.photoUrl || null
  };
};

export const listStadiums = async ({ q, details }: { q?: string; details?: boolean } = {}) => {
  let stadiums = getStadiums();

  if (q) {
    stadiums = stadiums.filter((stadium) => {
      return [stadium.id, stadium.name, stadium.city, stadium.country].some((value) =>
        includesNormalized(value, q)
      );
    });
  }

  const sorted = [...stadiums].sort((a, b) => a.country.localeCompare(b.country) || a.city.localeCompare(b.city));

  if (!details) return sorted;

  const ensured: Stadium[] = [];

  for (const stadium of sorted) {
    ensured.push(await ensureStadiumDetails(stadium));
  }

  return ensured.map(enrichStadium);
};

export const findStadiumById = async (id: string, details = false) => {
  const stadium = getStadiums().find((item) => item.id === id);
  if (!stadium) return undefined;

  if (!details) return stadium;

  return enrichStadium(await ensureStadiumDetails(stadium));
};
