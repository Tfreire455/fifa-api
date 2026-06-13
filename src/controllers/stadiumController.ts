import type { Request, Response } from "express";
import { HttpError } from "../utils/httpError.js";
import { findStadiumById, listStadiums } from "../services/stadiumService.js";

export const getAllStadiums = async (req: Request, res: Response) => {
  const stadiums = await listStadiums({
    q: req.query.q as string | undefined,
    details: req.query.details === "true"
  });

  res.json({
    total: stadiums.length,
    data: stadiums
  });
};

export const getStadiumById = async (req: Request, res: Response) => {
  const stadium = await findStadiumById(req.params.id, req.query.details !== "false");

  if (!stadium) throw new HttpError(404, "Stadium not found");

  res.json(stadium);
};
