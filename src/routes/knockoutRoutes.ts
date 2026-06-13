import { Router } from "express";
import {
  knockoutBracket,
  tournamentPhase
} from "../controllers/knockoutController.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.get("/", asyncHandler(knockoutBracket));
router.get("/phase", asyncHandler(tournamentPhase));

export default router;
