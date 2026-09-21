export const CARE_CATEGORIES = [
  "GENERAL",
  "CARDIO_RESPIRATORY",
  "TRAUMA",
  "NEUROLOGICAL",
  "PEDIATRIC",
  "WOMEN_HEALTH",
  "MEDICAL_EMERGENCY",
] as const;

export type CareCategory = (typeof CARE_CATEGORIES)[number];
export type Urgency = "EMERGENCY" | "URGENT" | "GENERAL";

export type ConcernKey =
  | "breathing difficulty"
  | "chest pain"
  | "unconsciousness"
  | "heavy bleeding"
  | "stroke signs"
  | "severe injury"
  | "seizure"
  | "fever"
  | "vomiting"
  | "pregnancy-related concern"
  | "child-related concern";

export interface ParsedIncident {
  patientRelation: string;
  rawText: string;
  language: "English" | "Hindi / Hinglish" | "Unknown";
  reportedConcerns: ConcernKey[];
  careCategory: CareCategory;
  urgency: Urgency;
  safetyNote: string;
}

export interface Hospital {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  phone: string | null;
  emergencyAvailable: boolean;
  status: "TRUSTED_RESOURCE" | "UNVERIFIED";
  capabilities: CareCategory[];
  isVerified: boolean;
  lastVerifiedAt: string;
  sourceUrl: string;
  sourceLabel: string;
  dataSource?: "official" | "openstreetmap";
  distanceKm?: number;
}

export interface Doctor {
  id: string;
  name: string;
  phone: string;
  phoneLabel: string;
  specialty: string;
  hospitalId: string;
  isOnCall: boolean;
  isVerified: boolean;
  lastVerifiedAt: string;
  sourceUrl: string;
  sourceLabel: string;
}

export interface RankedHospital extends Hospital {
  distanceKm: number;
  score: number;
  why: string[];
}

export interface HandoffSummary {
  patientRelation: string;
  reportedConcerns: string[];
  urgency: Urgency;
  recommendedFacility: string;
  recommendedClinician: string;
  location: string;
  currentTime: string;
  disclaimer: string;
}

export interface Recommendation {
  incident: ParsedIncident;
  facilities: RankedHospital[];
  liveFacilities: Hospital[];
  recommendedFacility: RankedHospital | null;
  recommendedDoctor: Doctor | null;
  location: { latitude: number; longitude: number; label: string; source: "browser" | "demo" | "manual" };
  liveStatusUnavailable: boolean;
  fallbackMessage: string | null;
  handoff: HandoffSummary;
}

export interface IncidentRecord extends Recommendation {
  id: string;
  createdAt: string;
}

export interface ActionRecord {
  id: string;
  incidentId: string;
  doctorId?: string;
  hospitalId?: string;
  actionType: "CALL_DOCTOR" | "CALL_112" | "NAVIGATE" | "SHARE_LOCATION" | "COPY_SUMMARY";
  createdAt: string;
}
