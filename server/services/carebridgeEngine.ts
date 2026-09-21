import { randomUUID } from "node:crypto";
import type { Doctor, Hospital, IncidentRecord, Recommendation } from "../../shared/carebridge";
import { getDoctorsFromDatabase, getHospitalsFromDatabase } from "../db";
import { applySafetyRules } from "./safetyRules";
import { parseIncident } from "./parser";
import { HOSPITALS, DOCTORS } from "./seedData";
import { distanceKm, matchDoctor, rankHospitals } from "./matching";
import { saveIncident } from "./incidentStore";

export const DEMO_LOCATION = { latitude: 12.9716, longitude: 77.5946, label: "Demo location · Bengaluru", source: "demo" as const };

type LocationInput = { latitude?: number; longitude?: number; label?: string; source?: "browser" | "demo" | "manual" };
type RecommendationInput = { rawText: string; patientRelation?: string; location?: LocationInput };
type FacilityInput = { latitude: number; longitude: number; category?: Recommendation["incident"]["careCategory"] };

function createRecommendation(input: RecommendationInput, hospitals: Hospital[], doctors: Doctor[]): IncidentRecord {
  const incident = applySafetyRules(parseIncident(input.rawText, input.patientRelation));
  const location = {
    latitude: Number.isFinite(input.location?.latitude) ? input.location!.latitude : DEMO_LOCATION.latitude,
    longitude: Number.isFinite(input.location?.longitude) ? input.location!.longitude : DEMO_LOCATION.longitude,
    label: input.location?.label || DEMO_LOCATION.label,
    source: input.location?.source || DEMO_LOCATION.source,
  } as Recommendation["location"];
  const facilities = rankHospitals(hospitals, incident.careCategory, location.latitude, location.longitude);
  const recommendedFacility = facilities[0] ?? null;
  const recommendedDoctor = recommendedFacility ? matchDoctor(doctors, recommendedFacility.id, incident.careCategory) : null;
  const now = new Date();
  return saveIncident({
    id: randomUUID(),
    createdAt: now.toISOString(),
    incident,
    facilities,
    liveFacilities: [],
    recommendedFacility,
    recommendedDoctor,
    location,
    liveStatusUnavailable: true,
    fallbackMessage: facilities.length === 0 ? "No verified nearby facility matched. Call 112 and use the closest professional emergency resource." : "Live facility information unavailable. Showing cached emergency resources.",
    handoff: {
      patientRelation: incident.patientRelation,
      reportedConcerns: incident.reportedConcerns,
      urgency: incident.urgency,
      recommendedFacility: recommendedFacility?.name ?? "No verified facility selected",
      recommendedClinician: recommendedDoctor?.name ?? "No verified clinician available",
      location: location.label,
      currentTime: now.toLocaleString(),
      disclaimer: "Not a diagnosis. Based only on information reported by the user.",
    },
  });
}

/** Synchronous fallback used by tests and when no DATABASE_URL is configured. */
export function buildRecommendation(input: RecommendationInput): IncidentRecord {
  return createRecommendation(input, HOSPITALS, DOCTORS);
}

/** Database-backed path used by the web API. Only verified records can drive emergency matching. */
export async function buildRecommendationFromDatabase(input: RecommendationInput): Promise<IncidentRecord> {
  const [hospitals, doctors] = await Promise.all([getHospitalsFromDatabase(), getDoctorsFromDatabase()]);
  if (!hospitals || !doctors) return buildRecommendation(input);
  return createRecommendation(input, hospitals.filter(hospital => hospital.isVerified), doctors.filter(doctor => doctor.isVerified));
}

export function getFacilityRecommendations(input: FacilityInput) {
  return rankHospitals(HOSPITALS, input.category || "GENERAL", input.latitude, input.longitude);
}

export async function getFacilityRecommendationsFromDatabase(input: FacilityInput) {
  const hospitals = await getHospitalsFromDatabase();
  if (!hospitals) return getFacilityRecommendations(input);
  return rankHospitals(hospitals.filter(hospital => hospital.isVerified), input.category || "GENERAL", input.latitude, input.longitude);
}

export async function getHospitalDirectoryFromDatabase(input: Pick<FacilityInput, "latitude" | "longitude">) {
  const hospitals = await getHospitalsFromDatabase();
  const source = hospitals ?? HOSPITALS;
  return source
    .map(hospital => ({ ...hospital, distanceKm: distanceKm(input.latitude, input.longitude, hospital.latitude, hospital.longitude) }))
    .sort((left, right) => left.distanceKm - right.distanceKm);
}

export function getDoctorRecommendations(input: { hospitalId: string; category?: Recommendation["incident"]["careCategory"] }) {
  return DOCTORS.filter(doctor => doctor.hospitalId === input.hospitalId && doctor.isVerified).sort((a, b) => Number(b.isOnCall) - Number(a.isOnCall));
}

export async function getDoctorRecommendationsFromDatabase(input: { hospitalId: string; category?: Recommendation["incident"]["careCategory"] }) {
  const doctors = await getDoctorsFromDatabase();
  if (!doctors) return getDoctorRecommendations(input);
  return doctors.filter(doctor => doctor.hospitalId === input.hospitalId && doctor.isVerified).sort((a, b) => Number(b.isOnCall) - Number(a.isOnCall));
}
