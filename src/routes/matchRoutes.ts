import { Router } from "express";
import {
  getAllMatches,
  getMatchById,
  getMatchesByTeamCodeController,
  getMatchesByTeamIdController
} from "../controllers/matchController.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.get("/", asyncHandler(getAllMatches));
router.get("/team/:teamId", asyncHandler(getMatchesByTeamIdController));
router.get("/code/:code", asyncHandler(getMatchesByTeamCodeController));
router.get("/:id", asyncHandler(getMatchById));

export default router;
