import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { buildRecommendationFromDatabase, getDoctorRecommendationsFromDatabase, getFacilityRecommendationsFromDatabase, getHospitalDirectoryFromDatabase } from "../services/carebridgeEngine";
import { getIncident } from "../services/incidentStore";
import { logAction } from "../services/actionLog";
import { findNearbyHospitals } from "../services/openStreetMap";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => server.close(() => resolve(true)));
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

function numberQuery(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ limit: "2mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);

  // CareBridge REST API. These endpoints are public by design: emergency input must not require login.
  app.post("/api/incident", async (req, res) => {
    try {
      const { rawText, patientRelation, location } = req.body ?? {};
      if (typeof rawText !== "string" || rawText.trim().length === 0) return res.status(400).json({ error: "rawText is required" });
      const recommendation = await buildRecommendationFromDatabase({ rawText, patientRelation, location });
      const liveFacilities = await findNearbyHospitals(recommendation.location.latitude, recommendation.location.longitude);
      const fallbackMessage = liveFacilities.length > 0
        ? "Live emergency capacity unavailable. Showing nearby OpenStreetMap listings and cached verified resources."
        : recommendation.fallbackMessage;
      return res.json({ ...recommendation, liveFacilities, fallbackMessage });
    } catch (error) {
      console.error("[CareBridge] incident error", error);
      return res.status(500).json({ error: "Unable to create incident" });
    }
  });

  app.get("/api/facilities/recommendations", async (req, res) => {
    const latitude = numberQuery(req.query.latitude, 12.9716);
    const longitude = numberQuery(req.query.longitude, 77.5946);
    return res.json(await getFacilityRecommendationsFromDatabase({ latitude, longitude, category: typeof req.query.category === "string" ? req.query.category as never : undefined }));
  });

  app.get("/api/facilities/directory", async (req, res) => {
    const latitude = numberQuery(req.query.latitude, 12.9716);
    const longitude = numberQuery(req.query.longitude, 77.5946);
    const liveFacilities = await findNearbyHospitals(latitude, longitude, 20);
    return res.json(liveFacilities.length > 0 ? liveFacilities : await getHospitalDirectoryFromDatabase({ latitude, longitude }));
  });

  app.get("/api/doctors/recommendations", async (req, res) => {
    const hospitalId = typeof req.query.hospitalId === "string" ? req.query.hospitalId : "";
    return res.json(await getDoctorRecommendationsFromDatabase({ hospitalId, category: typeof req.query.category === "string" ? req.query.category as never : undefined }));
  });

  app.get("/api/emergency/recommendation/:incidentId", (req, res) => {
    const incident = getIncident(req.params.incidentId);
    return incident ? res.json(incident) : res.status(404).json({ error: "Incident not found" });
  });

  app.post("/api/actions", (req, res) => {
    try {
      const { incidentId, doctorId, hospitalId, actionType } = req.body ?? {};
      const allowed = new Set(["CALL_DOCTOR", "CALL_112", "NAVIGATE", "SHARE_LOCATION", "COPY_SUMMARY"]);
      if (typeof incidentId !== "string" || !allowed.has(actionType)) return res.status(400).json({ error: "incidentId and valid actionType are required" });
      return res.json(logAction({ incidentId, doctorId, hospitalId, actionType }));
    } catch (error) {
      console.error("[CareBridge] action error", error);
      return res.status(500).json({ error: "Unable to log action" });
    }
  });

  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
  if (process.env.NODE_ENV === "development") await setupVite(app, server);
  else serveStatic(app);

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  server.listen(port, () => console.log(`Server running on http://localhost:${port}/`));
}

startServer().catch(console.error);
