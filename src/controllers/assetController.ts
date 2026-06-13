import type { Request, Response } from "express";
import { HttpError } from "../utils/httpError.js";
import { getTeamAssets, listPublicAssets, toImageProxyUrl } from "../services/assetService.js";
import { findTeamByCode, findTeamById } from "../services/teamService.js";

const isAllowedImageUrl = (url: string) => {
  return /^https:\/\//i.test(url) && /\.(jpe?g|png|webp|avif|svg)(\?.*)?$/i.test(url);
};

export const getAllAssets = (_req: Request, res: Response) => {
  const assets = listPublicAssets();

  res.json({
    total: assets.length,
    data: assets
  });
};

export const proxyImage = async (req: Request, res: Response) => {
  const url = String(req.query.url || "");

  if (!url || !isAllowedImageUrl(url) || !toImageProxyUrl(url)) {
    throw new HttpError(400, "Invalid image URL");
  }

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; WorldCup2026DataBot/1.0)",
      Accept: "image/avif,image/webp,image/png,image/svg+xml,image/jpeg,image/*,*/*;q=0.8"
    }
  });

  if (!response.ok || !response.body) {
    throw new HttpError(502, "Could not load remote image");
  }

  const contentType = response.headers.get("content-type") || "image/jpeg";
  if (!contentType.startsWith("image/")) {
    throw new HttpError(415, "Remote URL is not an image");
  }

  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "public, max-age=604800, immutable");

  const buffer = Buffer.from(await response.arrayBuffer());
  res.send(buffer);
};

export const getTeamAssetById = (req: Request, res: Response) => {
  const team = findTeamById(req.params.teamId);

  if (!team) throw new HttpError(404, "Team not found");

  res.json(getTeamAssets(team));
};

export const getTeamAssetByCode = (req: Request, res: Response) => {
  const team = findTeamByCode(req.params.code);

  if (!team) throw new HttpError(404, "Team not found");

  res.json(getTeamAssets(team));
};
