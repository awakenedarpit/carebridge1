import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { buildRecommendationFromDatabase, getDoctorRecommendationsFromDatabase, getFacilityRecommendationsFromDatabase } from "./services/carebridgeEngine";
import { logAction } from "./services/actionLog";
import { getIncident } from "./services/incidentStore";

const locationInput = z.object({
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  label: z.string().optional(),
  source: z.enum(["browser", "demo", "manual"]).optional(),
}).optional();

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  incident: router({
    create: publicProcedure.input(z.object({ rawText: z.string().min(1), patientRelation: z.string().optional(), location: locationInput })).mutation(({ input }) => buildRecommendationFromDatabase(input)),
    get: publicProcedure.input(z.object({ incidentId: z.string() })).query(({ input }) => getIncident(input.incidentId)),
  }),
  facilities: router({
    recommendations: publicProcedure.input(z.object({ latitude: z.number(), longitude: z.number(), category: z.string().optional() })).query(({ input }) => getFacilityRecommendationsFromDatabase(input as Parameters<typeof getFacilityRecommendationsFromDatabase>[0])),
  }),
  doctors: router({
    recommendations: publicProcedure.input(z.object({ hospitalId: z.string(), category: z.string().optional() })).query(({ input }) => getDoctorRecommendationsFromDatabase(input as Parameters<typeof getDoctorRecommendationsFromDatabase>[0])),
  }),
  emergency: router({
    recommendation: publicProcedure.input(z.object({ incidentId: z.string() })).query(({ input }) => getIncident(input.incidentId)),
  }),
  actions: router({
    log: publicProcedure.input(z.object({ incidentId: z.string(), doctorId: z.string().optional(), hospitalId: z.string().optional(), actionType: z.enum(["CALL_DOCTOR", "CALL_112", "NAVIGATE", "SHARE_LOCATION", "COPY_SUMMARY"]) })).mutation(({ input }) => logAction(input)),
  }),
});

export type AppRouter = typeof appRouter;
