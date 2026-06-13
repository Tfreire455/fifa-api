import { Router } from "express";
import { health, metadata } from "../controllers/healthController.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.get("/health", asyncHandler(health));
router.get("/metadata", asyncHandler(metadata));

export default router;
