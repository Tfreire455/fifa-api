import { Router } from "express";
import { getFullDatabase, reload } from "../controllers/databaseController.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.get("/", asyncHandler(getFullDatabase));
router.post("/reload", asyncHandler(reload));

export default router;
