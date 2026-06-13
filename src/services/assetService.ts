import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";
import { PUBLIC_DIR } from "../config/paths.js";
import { normalizeText } from "../utils/text.js";
import type { Country, Player, Stadium } from "../types/worldCup.js";

const imageExtensions = [".webp", ".avif", ".png", ".jpg", ".jpeg", ".svg"];

/**
 * Mapa completo: ID usado no banco/API -> pasta usada pelo scraper/FIFA.
 * Mesmo quando o valor é igual, deixei explícito para facilitar manutenção.
 */
const databaseTeamIdToFifaFolder: Record<string, string> = {
  algeria: "algeria",
  argentina: "argentina",
  australia: "australia",
  austria: "austria",
  belgium: "belgium",
  "bosnia-herzegovina": "bosnia-herzegovina",
  brazil: "brazil",
  "cape-verde": "cabo-verde",
  canada: "canada",
  colombia: "colombia",
  "dr-congo": "congo-dr",
  "ivory-coast": "cote-d-ivoire",
  croatia: "croatia",
  curacao: "curacao",
  "czech-republic": "czechia",
  czechia: "czechia",
  ecuador: "ecuador",
  egypt: "egypt",
  england: "england",
  france: "france",
  germany: "germany",
  ghana: "ghana",
  haiti: "haiti",
  iran: "ir-iran",
  iraq: "iraq",
  japan: "japan",
  jordan: "jordan",
  "south-korea": "korea-republic",
  mexico: "mexico",
  morocco: "morocco",
  netherlands: "netherlands",
  "new-zealand": "new-zealand",
  norway: "norway",
  panama: "panama",
  paraguay: "paraguay",
  portugal: "portugal",
  qatar: "qatar",
  "saudi-arabia": "saudi-arabia",
  scotland: "scotland",
  senegal: "senegal",
  "south-africa": "south-africa",
  spain: "spain",
  sweden: "sweden",
  switzerland: "switzerland",
  tunisia: "tunisia",
  turkiye: "turkiye",
  turkey: "turkiye",
  uruguay: "uruguay",
  "united-states": "usa",
  usa: "usa",
  uzbekistan: "uzbekistan",
};

/**
 * Mapa reverso: pasta FIFA -> ID usado no banco/API.
 * Ajuda quando algum objeto Country vem com slug FIFA em vez do ID do banco.
 */
const fifaFolderToDatabaseTeamId: Record<string, string> = Object.fromEntries(
  Object.entries(databaseTeamIdToFifaFolder).map(([databaseId, fifaFolder]) => [
    fifaFolder,
    databaseId,
  ])
);

const countryFolderAliases: Record<string, string[]> = {
  algeria: ["algeria", "ALG"],
  argentina: ["argentina", "ARG"],
  australia: ["australia", "AUS"],
  austria: ["austria", "AUT"],
  belgium: ["belgium", "BEL"],
  "bosnia-herzegovina": ["bosnia-herzegovina", "bosnia-and-herzegovina", "BIH"],
  brazil: ["brazil", "brasil", "BRA"],
  "cape-verde": ["cape-verde", "cabo-verde", "CPV"],
  "cabo-verde": ["cabo-verde", "cape-verde", "CPV"],
  canada: ["canada", "CAN"],
  colombia: ["colombia", "COL"],
  "dr-congo": ["dr-congo", "congo-dr", "cod", "COD"],
  "congo-dr": ["congo-dr", "dr-congo", "cod", "COD"],
  "ivory-coast": ["ivory-coast", "cote-d-ivoire", "côte-d-ivoire", "CIV"],
  "cote-d-ivoire": ["cote-d-ivoire", "ivory-coast", "côte-d-ivoire", "CIV"],
  croatia: ["croatia", "CRO"],
  curacao: ["curacao", "curaçao", "CUW"],
  czechia: ["czechia", "czech-republic", "CZE"],
  "czech-republic": ["czech-republic", "czechia", "CZE"],
  ecuador: ["ecuador", "ECU"],
  egypt: ["egypt", "EGY"],
  england: ["england", "ENG"],
  france: ["france", "FRA"],
  germany: ["germany", "GER"],
  ghana: ["ghana", "GHA"],
  haiti: ["haiti", "HAI"],
  iran: ["iran", "ir-iran", "IRN"],
  "ir-iran": ["ir-iran", "iran", "IRN"],
  iraq: ["iraq", "IRQ"],
  japan: ["japan", "JPN"],
  jordan: ["jordan", "JOR"],
  "south-korea": ["south-korea", "korea-republic", "KOR"],
  "korea-republic": ["korea-republic", "south-korea", "KOR"],
  mexico: ["mexico", "méxico", "MEX"],
  morocco: ["morocco", "MAR"],
  netherlands: ["netherlands", "NED"],
  "new-zealand": ["new-zealand", "NZL"],
  norway: ["norway", "NOR"],
  panama: ["panama", "PAN"],
  paraguay: ["paraguay", "PAR"],
  portugal: ["portugal", "POR"],
  qatar: ["qatar", "QAT"],
  "saudi-arabia": ["saudi-arabia", "KSA"],
  scotland: ["scotland", "SCO"],
  senegal: ["senegal", "SEN"],
  "south-africa": ["south-africa", "south-africa-rsa", "africa-do-sul", "RSA"],
  spain: ["spain", "ESP"],
  sweden: ["sweden", "SWE"],
  switzerland: ["switzerland", "SUI"],
  tunisia: ["tunisia", "TUN"],
  turkiye: ["turkiye", "turkey", "türkiye", "TUR"],
  turkey: ["turkey", "turkiye", "türkiye", "TUR"],
  uruguay: ["uruguay", "URU"],
  "united-states": ["united-states", "usa", "united-states-of-america", "USA"],
  usa: ["usa", "united-states", "united-states-of-america", "USA"],
  uzbekistan: ["uzbekistan", "UZB"],
};

export const toSlug = (value: string) => {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

const compactSlug = (value: string) => toSlug(value).replaceAll("-", "");

const unique = (values: Array<string | null | undefined>): string[] => {
  return Array.from(
    new Set(
      values
        .filter((value): value is string => Boolean(value))
        .map((value) => String(value).trim())
        .filter(Boolean)
    )
  );
};

const normalizeFolder = (folder: string | null | undefined): string | null => {
  if (!folder) return null;
  return folder.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
};

const toPublicUrl = (absolutePath: string): string => {
  const relativePath = path
    .relative(PUBLIC_DIR, absolutePath)
    .replaceAll(path.sep, "/");

  return `${env.apiBaseUrl}/static/${relativePath}`;
};

const isDirectRemoteImageUrl = (url: string) => {
  if (!/^https?:\/\//i.test(url)) return false;
  return /\.(jpe?g|png|webp|avif|svg)(\?.*)?$/i.test(url);
};

export const toImageProxyUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;

  if (url.startsWith(`${env.apiBaseUrl}/api/assets/image-proxy`)) {
    return url;
  }

  if (!isDirectRemoteImageUrl(url)) {
    return null;
  }

  return `${env.apiBaseUrl}/api/assets/image-proxy?url=${encodeURIComponent(url)}`;
};

const findExistingFile = (candidates: string[]): string | null => {
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
};

const buildCandidates = (
  folders: Array<string | null | undefined>,
  names: Array<string | null | undefined>
): string[] => {
  const candidates: string[] = [];

  for (const folder of unique(folders.map(normalizeFolder))) {
    for (const rawName of unique(names)) {
      const name = String(rawName);
      const ext = path.extname(name);

      if (ext) {
        candidates.push(path.resolve(PUBLIC_DIR, folder, name));
      } else {
        for (const imageExt of imageExtensions) {
          candidates.push(path.resolve(PUBLIC_DIR, folder, `${name}${imageExt}`));
        }
      }
    }
  }

  return candidates;
};

const findLooseExistingFile = (
  folders: Array<string | null | undefined>,
  names: Array<string | null | undefined>
): string | null => {
  const normalizedNames = unique(names).map((name) => toSlug(name));
  const compactNames = new Set(normalizedNames.map(compactSlug));
  const tokenNames = normalizedNames.map((name) => new Set(name.split("-").filter(Boolean)));

  let best: { file: string; score: number } | null = null;

  for (const folder of unique(folders.map(normalizeFolder))) {
    const absoluteFolder = path.resolve(PUBLIC_DIR, folder);
    if (!fs.existsSync(absoluteFolder)) continue;

    const entries = fs.readdirSync(absoluteFolder, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile()) continue;

      const extension = path.extname(entry.name).toLowerCase();
      if (!imageExtensions.includes(extension)) continue;

      const basename = path.basename(entry.name, extension);
      const fileSlug = toSlug(basename);
      const fileCompact = compactSlug(fileSlug);

      let score = 0;

      if (normalizedNames.includes(fileSlug)) {
        score = 100;
      } else if (compactNames.has(fileCompact)) {
        score = 98;
      } else {
        const fileParts = fileSlug.split("-").filter(Boolean);
        const fileSet = new Set(fileParts);

        for (const candidateSet of tokenNames) {
          if (!candidateSet.size || !fileSet.size) continue;

          let common = 0;
          for (const part of fileSet) {
            if (candidateSet.has(part)) common++;
          }

          const ratio = common / Math.max(candidateSet.size, fileSet.size);
          if (ratio >= 0.9) score = Math.max(score, 94);
          else if (ratio >= 0.75) score = Math.max(score, 88);
          else if (ratio >= 0.6) score = Math.max(score, 78);
        }
      }

      if (score >= 78 && (!best || score > best.score)) {
        best = {
          file: path.resolve(absoluteFolder, entry.name),
          score,
        };
      }
    }
  }

  return best?.file || null;
};

const firstLocalUrl = (
  folders: Array<string | null | undefined>,
  names: Array<string | null | undefined>,
  options: { loose?: boolean } = {}
): string | null => {
  const exact = findExistingFile(buildCandidates(folders, names));
  if (exact) return toPublicUrl(exact);

  if (options.loose) {
    const loose = findLooseExistingFile(folders, names);
    if (loose) return toPublicUrl(loose);
  }

  return null;
};

const getNameParts = (value: string | null | undefined): string[] => {
  if (!value) return [];

  return toSlug(value)
    .split("-")
    .map((part) => part.trim())
    .filter(Boolean);
};

const addNameOrderCandidates = (names: string[], value: string | null | undefined) => {
  const parts = getNameParts(value);
  if (parts.length < 2) return;

  const first = parts[0];
  const last = parts[parts.length - 1];
  const rest = parts.slice(1);
  const withoutLast = parts.slice(0, -1);

  names.push(parts.join("-"));
  names.push(parts.join(""));

  // Kim Moon-hwan -> moon-hwan-kim / moonhwan-kim
  names.push([...rest, first].join("-"));
  names.push(`${rest.join("")}-${first}`);
  names.push(`${first}-${rest.join("")}`);
  names.push(`${first}${rest.join("")}`);
  names.push(`${rest.join("")}${first}`);

  // Ronwen Williams -> williams-ronwen, útil se algum arquivo vier invertido.
  names.push([last, ...withoutLast].join("-"));
  names.push(`${last}-${withoutLast.join("")}`);
  names.push(`${withoutLast.join("")}-${last}`);
};

const getPlayerNameCandidates = (
  player:
    | Pick<Player, "id" | "name" | "shirtName" | "photoUrl">
    | {
        name: string;
        id?: string | null;
        shirtName?: string | null;
        photoUrl?: string | null;
      }
): string[] => {
  const names: string[] = [];

  if (player.id) {
    names.push(String(player.id));
    names.push(toSlug(String(player.id)));

    const idParts = getNameParts(String(player.id));
    if (idParts.length >= 3) {
      names.push(idParts.slice(2).join("-"));
      names.push(idParts.slice(2).join(""));
    }
  }

  if (player.name) {
    names.push(player.name);
    names.push(toSlug(player.name));
    addNameOrderCandidates(names, player.name);
  }

  if (player.shirtName) {
    names.push(player.shirtName);
    names.push(toSlug(player.shirtName));
    addNameOrderCandidates(names, player.shirtName);

    if (player.name) {
      const nameParts = getNameParts(player.name);
      const shirtSlug = toSlug(player.shirtName);
      const surname = nameParts[0];
      const lastName = nameParts[nameParts.length - 1];

      if (surname) {
        names.push(`${shirtSlug}-${surname}`);
        names.push(`${surname}-${shirtSlug}`);
      }

      if (lastName) {
        names.push(`${shirtSlug}-${lastName}`);
        names.push(`${lastName}-${shirtSlug}`);
      }
    }
  }

  return unique(names.map((name) => toSlug(name)));
};

const getTeamFolderCandidates = (team: Country): string[] => {
  const code = team.code?.toUpperCase();
  const codeLower = team.code?.toLowerCase();
  const teamSlug = team.slug || toSlug(team.nameEn || team.name);

  const mappedFromId = databaseTeamIdToFifaFolder[team.id];
  const mappedFromSlug = databaseTeamIdToFifaFolder[teamSlug];
  const databaseFromFifaId = fifaFolderToDatabaseTeamId[team.id];
  const databaseFromFifaSlug = fifaFolderToDatabaseTeamId[teamSlug];

  const aliasKeys = unique([
    team.id,
    team.slug,
    teamSlug,
    mappedFromId,
    mappedFromSlug,
    databaseFromFifaId,
    databaseFromFifaSlug,
  ]);

  const aliases = aliasKeys.flatMap((key) => countryFolderAliases[key] || []);

  return unique([
    team.id,
    team.slug,
    teamSlug,
    mappedFromId,
    mappedFromSlug,
    databaseFromFifaId,
    databaseFromFifaSlug,
    code,
    codeLower,
    team.nameEn ? toSlug(team.nameEn) : null,
    team.name ? toSlug(team.name) : null,
    ...aliases,
  ]).map((folder) => toSlug(folder));
};

export const getLocalTeamImageUrl = (team: Country): string | null => {
  const teamFolders = getTeamFolderCandidates(team);

  return firstLocalUrl(
    [
      "teams",
      `teams/${team.confederation}`,
      `teams/${team.confederation?.toUpperCase()}`,
      "images/teams",
      `images/teams/${team.confederation}`,
      `images/teams/${team.confederation?.toUpperCase()}`,
    ],
    [team.slug, team.id, team.code, toSlug(team.nameEn || team.name), ...teamFolders]
  );
};

export const getLocalShieldUrl = (team: Country): string | null => {
  const code = team.code?.toUpperCase();
  const confederation = team.confederation?.toUpperCase();
  const teamFolders = getTeamFolderCandidates(team);

  return firstLocalUrl(
    [
      "shields",
      `shields/${confederation}`,
      "images/shields",
      `images/shields/${confederation}`,
    ],
    [`${code}1`, code, team.slug, team.id, toSlug(team.nameEn || team.name), ...teamFolders]
  );
};

export const getLocalFlagUrl = (team: Country): string | null => {
  const teamFolders = getTeamFolderCandidates(team);

  return firstLocalUrl(
    ["flags", "images/flags"],
    [team.slug, team.id, team.code, team.nameEn, team.name, toSlug(team.nameEn || team.name), ...teamFolders]
  );
};

export const getLocalPlayerPhotoUrl = (
  team: Country,
  player:
    | Pick<Player, "id" | "name" | "shirtName" | "photoUrl">
    | {
        name: string;
        id?: string | null;
        shirtName?: string | null;
        photoUrl?: string | null;
      }
): string | null => {
  const code = team.code?.toUpperCase();
  const codeLower = team.code?.toLowerCase();
  const teamFolders = getTeamFolderCandidates(team);

  const local = firstLocalUrl(
    [
      "players",
      ...teamFolders.map((folder) => `players/${folder}`),
      `players/${team.confederation}`,
      `players/${team.confederation?.toUpperCase()}`,
      ...teamFolders.map((folder) => `players/${team.confederation}/${folder}`),
      ...teamFolders.map((folder) => `players/${team.confederation?.toUpperCase()}/${folder}`),
      "images/players",
      ...teamFolders.map((folder) => `images/players/${folder}`),
      `images/players/${code}`,
      `images/players/${codeLower}`,
    ],
    getPlayerNameCandidates(player),
    { loose: true }
  );

  if (local) return local;

  if (player.photoUrl?.startsWith(`${env.apiBaseUrl}/static/`)) {
    return player.photoUrl;
  }

  if (player.photoUrl?.startsWith("/static/")) {
    return `${env.apiBaseUrl}${player.photoUrl}`;
  }

  if (player.photoUrl?.startsWith("/images/")) {
    return `${env.apiBaseUrl}/static${player.photoUrl}`;
  }

  // Jogador sem arquivo local fica sem foto.
  // Não use fallback para Wikimedia/DigitalHub/image-proxy para jogadores.
  return null;
};

export const resolvePlayerPhotoUrl = (
  team: Country,
  player:
    | Player
    | {
        id?: string | null;
        name: string;
        shirtName?: string | null;
        photoUrl?: string | null;
      }
): string | null => {
  return getLocalPlayerPhotoUrl(team, player);
};

export const getLocalStadiumImageUrl = (stadium: Stadium): string | null => {
  return firstLocalUrl(
    ["stadiums", "images/stadiums", "images"],
    [stadium.id, toSlug(stadium.name), toSlug(`${stadium.name}-${stadium.city}`)]
  );
};

export const getTeamAssets = (team: Country) => {
  const localTeamImage = getLocalTeamImageUrl(team);
  const localShield = getLocalShieldUrl(team);
  const localFlag = getLocalFlagUrl(team);

  return {
    teamId: team.id,
    code: team.code,
    slug: team.slug,
    confederation: team.confederation,
    urls: {
      teamPhoto: localTeamImage || team.teamPhotoUrl || team.teamPhoto || null,
      shield: localShield,
      flag: localFlag || team.flagSvgUrl || team.flagUrl || team.flag || null,
    },
    local: {
      teamPhoto: localTeamImage,
      shield: localShield,
      flag: localFlag,
    },
    remote: {
      teamPhoto: team.teamPhotoUrl || team.teamPhoto || null,
      flagSvgUrl: team.flagSvgUrl || null,
      flagUrl: team.flagUrl || null,
    },
  };
};

export const getPlayerAssets = (
  team: Country,
  player:
    | Player
    | {
        id?: string | null;
        name: string;
        shirtName?: string | null;
        photoUrl?: string | null;
      }
) => {
  const localPhoto = getLocalPlayerPhotoUrl(team, { ...player, photoUrl: null });
  const resolvedPhoto = resolvePlayerPhotoUrl(team, player);

  return {
    teamId: team.id,
    playerId: player.id || null,
    playerName: player.name,
    urls: {
      photo: resolvedPhoto,
    },
    local: {
      photo: localPhoto,
    },
    remote: {
      photo: null,
    },
  };
};

export const getStadiumAssets = (stadium: Stadium) => {
  const localImage = getLocalStadiumImageUrl(stadium);
  const remoteImage = toImageProxyUrl((stadium as Stadium & { photoUrl?: string | null }).photoUrl || null);

  return {
    stadiumId: stadium.id,
    urls: {
      image: localImage || remoteImage || `${env.apiBaseUrl}/static/stadiums/${stadium.id}.svg`,
    },
    local: {
      image: localImage,
    },
    remote: {
      image: remoteImage,
    },
  };
};

export const listPublicAssets = () => {
  const results: string[] = [];

  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const absolute = path.resolve(dir, entry.name);

      if (entry.isDirectory()) {
        walk(absolute);
      } else {
        results.push(toPublicUrl(absolute));
      }
    }
  };

  walk(PUBLIC_DIR);

  return results;
};