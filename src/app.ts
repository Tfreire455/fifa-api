import compression from "compression";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import path from "node:path";

import { PUBLIC_DIR } from "./config/paths.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { notFound } from "./middlewares/notFound.js";
import apiRoutes from "./routes/index.js";

const app = express();

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },
  })
);

app.use(cors());
app.use(compression());
app.use(express.json({ limit: "5mb" }));
app.use(morgan("dev"));

app.use(
  "/static",
  express.static(PUBLIC_DIR, {
    maxAge: "1d",
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
      const extension = path.extname(filePath).toLowerCase();

      if (extension === ".avif") {
        res.setHeader("Content-Type", "image/avif");
        res.setHeader("Content-Disposition", "inline");
      }

      if (extension === ".webp") {
        res.setHeader("Content-Type", "image/webp");
        res.setHeader("Content-Disposition", "inline");
      }

      if (extension === ".jpg" || extension === ".jpeg") {
        res.setHeader("Content-Type", "image/jpeg");
        res.setHeader("Content-Disposition", "inline");
      }

      if (extension === ".png") {
        res.setHeader("Content-Type", "image/png");
        res.setHeader("Content-Disposition", "inline");
      }

      if (extension === ".svg") {
        res.setHeader("Content-Type", "image/svg+xml");
        res.setHeader("Content-Disposition", "inline");
      }
    },
  })
);

app.get("/", (_req, res) => {
  res.json({
    message: "WorldCup 2026 API TS",
    docs: {
      health: "/api/health",
      metadata: "/api/metadata",
      teams: "/api/teams",
      teamsWithAssets: "/api/teams?assets=true",
      groups: "/api/groups",
      matches: "/api/matches",
      liveMatches: "/api/live/matches",
      liveStandings: "/api/live/standings/A",
      liveMatchStats: "/api/live/match/match-001/stats",
      liveMatchLineups: "/api/live/match/match-001/lineups",
      liveTeamSquad: "/api/live/team/brazil/squad",
      liveTopScorers: "/api/live/scorers",
      knockoutBracket: "/api/knockout",
      tournamentPhase: "/api/knockout/phase",
      stadiums: "/api/stadiums",
      assets: "/api/assets",
      search: "/api/search?q=brazil",
      staticFiles: "/static",
    },
    folders: {
      public: path.relative(process.cwd(), PUBLIC_DIR),
    },
  });
});

app.use("/api", apiRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;