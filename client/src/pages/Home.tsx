import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Clipboard,
  Clock3,
  Copy,
  Cross,
  ExternalLink,
  HeartPulse,
  LocateFixed,
  MapPin,
  Mic,
  Navigation,
  Phone,
  Radio,
  RefreshCw,
  Share2,
  ShieldCheck,
  Siren,
  Sparkles,
  StopCircle,
  UserRound,
  WifiOff,
} from "lucide-react";
import type { ActionRecord, IncidentRecord, Recommendation } from "@shared/carebridge";

const DEMO_REPORT = "Mere father ko saans lene mein bahut dikkat hai aur chest mein pain hai.";
const DEMO_LOCATION = { latitude: 12.9716, longitude: 77.5946, label: "Demo location · Bengaluru", source: "demo" as const };

type Step = "ready" | "report" | "results";
type LocationState = { latitude: number; longitude: number; label: string; source: "browser" | "demo" | "manual" };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
};

type WindowWithSpeech = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

const actionNames: Record<ActionRecord["actionType"], string> = {
  CALL_DOCTOR: "Call doctor",
  CALL_112: "Call 112",
  NAVIGATE: "Navigate",
  SHARE_LOCATION: "Share location",
  COPY_SUMMARY: "Copy handoff summary",
};

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("CareBridge could not complete that step.");
  return response.json() as Promise<T>;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Location lookup failed");
  return response.json() as Promise<T>;
}

function urgencyClasses(urgency: Recommendation["incident"]["urgency"]) {
  if (urgency === "EMERGENCY") return "bg-[#e8505b] text-white";
  if (urgency === "URGENT") return "bg-[#f59e0b] text-[#3e2600]";
  return "bg-[#d9f99d] text-[#1f3811]";
}

function formatPhone(phone: string | null) {
  if (!phone) return "Phone not listed";
  return phone.length > 8 ? `${phone.slice(0, 3)} ${phone.slice(3, 7)} ${phone.slice(7)}` : phone;
}

export default function Home() {
  const [step, setStep] = useState<Step>("ready");
  const [report, setReport] = useState("");
  const [patientRelation, setPatientRelation] = useState("Father");
  const [location, setLocation] = useState<LocationState | null>(null);
  const [locationNotice, setLocationNotice] = useState("Location has not been fetched yet. Tap Use my location to fetch it.");
  const [isLocating, setIsLocating] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recommendation, setRecommendation] = useState<IncidentRecord | null>(null);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && !navigator.onLine);
  const [copied, setCopied] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    const handleOnline = () => setOffline(false);
    const handleOffline = () => setOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      recognitionRef.current?.stop();
    };
  }, []);

  const summaryText = useMemo(() => {
    if (!recommendation) return "";
    const handoff = recommendation.handoff;
    return [
      "CAREBRIDGE EMERGENCY HANDOFF",
      `Patient relation: ${handoff.patientRelation}`,
      `Reported concerns: ${handoff.reportedConcerns.join(", ") || "No specific concern identified"}`,
      `Urgency: ${handoff.urgency}`,
      `Recommended facility: ${handoff.recommendedFacility}`,
      `Recommended clinician: ${handoff.recommendedClinician}`,
      `Location: ${handoff.location}`,
      `Current time: ${handoff.currentTime}`,
      handoff.disclaimer,
    ].join("\n");
  }, [recommendation]);

  const logAction = async (actionType: ActionRecord["actionType"]) => {
    if (!recommendation) return;
    try {
      await postJson("/api/actions", {
        incidentId: recommendation.id,
        doctorId: recommendation.recommendedDoctor?.id,
        hospitalId: recommendation.recommendedFacility?.id,
        actionType,
      });
    } catch {
      // An action should never be blocked by logging failure.
    }
  };

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocation(null);
      setLocationNotice("Browser location is unavailable. No location was fetched; the emergency flow can use a demo fallback.");
      return;
    }
    setIsLocating(true);
    setLocation(null);
    setLocationNotice("Requesting your location… allow permission when your browser asks.");
    navigator.geolocation.getCurrentPosition(
      async position => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        let label = "Address unavailable · current browser location";
        try {
          const result = await getJson<{ address: string | null }>(`/api/location/reverse-geocode?latitude=${latitude}&longitude=${longitude}`);
          if (result.address) label = result.address;
        } catch {
          // Coordinates remain available internally for matching if address lookup is unavailable.
        }
        setLocation({ latitude, longitude, label, source: "browser" });
        setLocationNotice(label.startsWith("Address unavailable") ? "Location fetched. The address could not be resolved, but it will still be used for approximate matching." : "Current address fetched successfully. It will be used for approximate matching.");
        setIsLocating(false);
      },
      error => {
        setLocation(null);
        const message = error.code === error.PERMISSION_DENIED
          ? "Location permission was denied. No location was fetched; you can continue with a demo fallback."
          : error.code === error.TIMEOUT
            ? "Location request timed out. No location was fetched; try again or continue with a demo fallback."
            : "Location could not be fetched. Try again or continue with a demo fallback.";
        setLocationNotice(message);
        setIsLocating(false);
      },
      { enableHighAccuracy: false, timeout: 7000, maximumAge: 300000 },
    );
  };

  const startVoice = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      setVoiceNotice("Voice input stopped. You can edit the text or type instead.");
      return;
    }
    const speechWindow = window as WindowWithSpeech;
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceNotice("Voice input is not supported in this browser. Use Chrome or Edge, or type instead.");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = event => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      if (transcript) setReport(previous => previous ? `${previous} ${transcript}` : transcript);
      setVoiceNotice("Voice captured. You can edit the text before continuing.");
    };
    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };
    recognition.onerror = event => {
      setIsListening(false);
      recognitionRef.current = null;
      const message = event.error === "not-allowed" || event.error === "service-not-allowed"
        ? "Microphone permission was blocked. Allow microphone access for this site, or type instead."
        : event.error === "no-speech"
          ? "No speech was detected. Tap the microphone and speak clearly, or type instead."
          : event.error === "audio-capture"
            ? "No microphone was found. Check your microphone, or type instead."
            : "Voice input could not start. Type instead if needed.";
      setVoiceNotice(message);
    };
    recognitionRef.current = recognition;
    setIsListening(true);
    setVoiceNotice("Listening… speak now. You can stop and edit the text at any time.");
    try {
      recognition.start();
    } catch {
      setIsListening(false);
      recognitionRef.current = null;
      setVoiceNotice("Voice input could not start. Allow microphone access or type instead.");
    }
  };

  const submitIncident = async (text = report) => {
    if (!text.trim()) {
      setError("Tell us what is happening, or use the demo scenario.");
      return;
    }
    setError("");
    setIsSubmitting(true);
    try {
      const result = await postJson<IncidentRecord>("/api/incident", {
        rawText: text.trim(),
        patientRelation,
        ...(location ? { location } : {}),
      });
      setRecommendation(result);
      setStep("results");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("The emergency flow is temporarily unavailable. Call 112 directly if there is immediate danger.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const shareLocation = async () => {
    if (!recommendation) return;
    const facility = recommendation.recommendedFacility;
    const activeLocation = location ?? DEMO_LOCATION;
    const link = facility ? `https://www.google.com/maps/dir/?api=1&destination=${facility.latitude},${facility.longitude}` : `https://www.google.com/maps/search/?api=1&query=${activeLocation.latitude},${activeLocation.longitude}`;
    const shareData = { title: "CareBridge emergency location", text: `${summaryText}\n\nDirections: ${link}`, url: link };
    await logAction("SHARE_LOCATION");
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
      await navigator.clipboard.writeText(`${summaryText}\n\nDirections: ${link}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    } catch {
      // User cancelled the native share sheet; no error should be shown.
    }
  };

  const copySummary = async () => {
    await logAction("COPY_SUMMARY");
    try {
      await navigator.clipboard.writeText(summaryText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2400);
    } catch {
      setError("Copy is not available here. Select the handoff text manually.");
    }
  };

  const navigateToFacility = async () => {
    if (!recommendation?.recommendedFacility) return;
    await logAction("NAVIGATE");
    const facility = recommendation.recommendedFacility;
    const activeLocation = location ?? DEMO_LOCATION;
    window.open(`https://www.google.com/maps/dir/?api=1&origin=${activeLocation.latitude},${activeLocation.longitude}&destination=${facility.latitude},${facility.longitude}`, "_blank", "noopener,noreferrer");
  };

  const reset = () => {
    setStep("ready");
    setRecommendation(null);
    setReport("");
    setLocation(null);
    setLocationNotice("Location has not been fetched yet. Tap Use my location to fetch it.");
    setError("");
    setCopied(false);
  };

  const start = () => {
    setStep("report");
    setReport("");
    setLocation(null);
    setLocationNotice("Location has not been fetched yet. Tap Use my location to fetch it.");
    setError("");
  };

  return (
    <div className="min-h-screen bg-[#f5f2eb] text-[#202b2c]">
      <header className="border-b border-[#d9d5cc] bg-[#f5f2eb]/95 px-4 py-4 backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <button className="flex items-center gap-3 text-left" onClick={reset} aria-label="Return to CareBridge home">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[#133b3a] text-[#fbf7ed] shadow-[0_8px_24px_rgba(19,59,58,0.18)]"><Cross size={20} strokeWidth={2.5} /></span>
            <span>
              <span className="block font-display text-xl font-semibold tracking-tight">CareBridge</span>
              <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6a7773]">Emergency navigator</span>
            </span>
          </button>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#6a7773]">
            {offline ? <><WifiOff size={15} /> Offline mode</> : <><ShieldCheck size={15} className="text-[#2e8069]" /> Safety-first</>}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-8 sm:pt-12">
        {step === "ready" && <ReadyScreen onStart={start} onDemo={() => { setReport(DEMO_REPORT); setLocation(null); setLocationNotice("Location has not been fetched yet. Tap Use my location to fetch it."); setStep("report"); }} />}
        {step === "report" && (
          <ReportScreen
            report={report}
            setReport={setReport}
            patientRelation={patientRelation}
            setPatientRelation={setPatientRelation}
            isListening={isListening}
            isSubmitting={isSubmitting}
            onVoice={startVoice}
            onSubmit={() => submitIncident()}
            onUseDemo={() => setReport(DEMO_REPORT)}
            onBack={() => setStep("ready")}
            location={location}
            locationNotice={locationNotice}
            isLocating={isLocating}
            onLocation={requestLocation}
            voiceNotice={voiceNotice}
            error={error}
          />
        )}
        {step === "results" && recommendation && (
          <ResultsScreen
            recommendation={recommendation}
            offline={offline}
            copied={copied}
            summaryText={summaryText}
            onBack={reset}
            onCallDoctor={async () => { await logAction("CALL_DOCTOR"); if (recommendation.recommendedDoctor) window.location.href = `tel:${recommendation.recommendedDoctor.phone}`; }}
            onCall112={async () => { await logAction("CALL_112"); window.location.href = "tel:112"; }}
            onNavigate={navigateToFacility}
            onShare={shareLocation}
            onCopy={copySummary}
          />
        )}
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-8 text-center text-xs leading-5 text-[#7b827e] sm:px-8">
        CareBridge is not a diagnostic or treatment system. Guidance is based on the information reported by the user. Seek professional medical care for emergencies.
      </footer>
    </div>
  );
}

function ReadyScreen({ onStart, onDemo }: { onStart: () => void; onDemo: () => void }) {
  return (
    <section className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20 lg:py-8">
      <div className="relative">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#c5d7ca] bg-[#e8f0e8] px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] text-[#275d51]"><Radio size={14} /> No login. No diagnosis.</div>
        <h1 className="max-w-xl font-display text-5xl font-semibold leading-[0.98] tracking-[-0.05em] text-[#133b3a] sm:text-7xl">One clear next step when every second feels loud.</h1>
        <p className="mt-6 max-w-lg text-lg leading-8 text-[#596765]">Speak or type what is happening. CareBridge turns the report into a safety-focused handoff, trusted emergency resources, and actions you can choose.</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button className="cb-primary-action group" onClick={onStart}><Siren size={22} /> NEED EMERGENCY HELP <ArrowRight size={19} className="transition-transform group-hover:translate-x-1" /></button>
          <button className="cb-secondary-action" onClick={onDemo}><Sparkles size={17} /> Try the demo scenario</button>
        </div>
        <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-[#6e7c77]"><span className="flex items-center gap-2"><Check size={15} className="text-[#2f806a]" /> Type fallback always available</span><span className="flex items-center gap-2"><Check size={15} className="text-[#2f806a]" /> Demo location if needed</span></div>
      </div>
      <div className="relative overflow-hidden rounded-[2.4rem] bg-[#133b3a] p-6 text-[#f8f3e8] shadow-[0_30px_80px_rgba(19,59,58,0.22)] sm:p-9">
        <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full border-[26px] border-[#d7a943]/25" />
        <div className="absolute -bottom-28 -left-20 h-64 w-64 rounded-full border-[34px] border-[#e8505b]/20" />
        <div className="relative">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.16em] text-[#bbd3c8]"><span>CareBridge protocol</span><HeartPulse size={18} /></div>
          <div className="mt-10 space-y-4">
            {["Understand the report", "Apply safety rules", "Match trusted resources", "Choose your action"].map((label, index) => <div className="flex items-center gap-4" key={label}><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${index === 0 ? "bg-[#d7a943] text-[#133b3a]" : "bg-[#285d58] text-[#cfe8da]"} font-bold`}>{String(index + 1).padStart(2, "0")}</span><div><p className="font-semibold">{label}</p><p className="mt-0.5 text-sm text-[#aac8be]">{index === 0 ? "Voice or typed input" : index === 1 ? "Deterministic, not diagnostic" : index === 2 ? "No invented facilities" : "Call, navigate, share"}</p></div></div>)}
          </div>
          <div className="mt-10 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-6 text-[#d9e7df]"><AlertTriangle size={17} className="mb-2 text-[#f1cb67]" />If someone is in immediate danger, call <strong>112</strong> now. CareBridge never asks you to delay professional help.</div>
        </div>
      </div>
    </section>
  );
}

function ReportScreen(props: {
  report: string; setReport: (value: string) => void; patientRelation: string; setPatientRelation: (value: string) => void;
  isListening: boolean; isSubmitting: boolean; onVoice: () => void; onSubmit: () => void; onUseDemo: () => void; onBack: () => void;
  location: LocationState | null; locationNotice: string; isLocating: boolean; onLocation: () => void; voiceNotice: string; error: string;
}) {
  return (
    <section className="mx-auto max-w-3xl">
      <button className="cb-back-link" onClick={props.onBack}><ArrowLeft size={16} /> Back</button>
      <div className="mt-6 flex items-start justify-between gap-6"><div><div className="cb-eyebrow"><span className="cb-step-dot bg-[#d7a943]" /> Step 1 of 2 · Tell us what is happening</div><h1 className="mt-3 font-display text-4xl font-semibold tracking-[-0.04em] text-[#133b3a] sm:text-5xl">What is happening right now?</h1><p className="mt-4 text-base leading-7 text-[#66716e]">Use simple words. Mention the person and the most important concern.</p></div><div className="hidden rounded-2xl bg-[#e8f0e8] p-3 text-[#2e8069] sm:block"><Mic size={22} /></div></div>
      <div className="mt-8 rounded-[2rem] border border-[#ded9ce] bg-white p-5 shadow-[0_18px_45px_rgba(34,49,47,0.06)] sm:p-7">
        <div className="flex items-center justify-between gap-3"><label className="cb-label" htmlFor="relation">Who needs help?</label><button className="text-xs font-bold text-[#2e8069]" onClick={props.onUseDemo}>Use demo report</button></div>
        <div className="mt-2 flex flex-wrap gap-2">{["Father", "Mother", "Child", "Myself", "Someone else"].map(option => <button key={option} className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${props.patientRelation === option ? "border-[#133b3a] bg-[#133b3a] text-white" : "border-[#d9d5cc] bg-[#faf9f5] text-[#5e6a67] hover:border-[#94aaa0]"}`} onClick={() => props.setPatientRelation(option)}>{option}</button>)}</div>
        <label className="cb-label mt-7 block" htmlFor="incident-report">Describe the concern</label>
        <div className="relative mt-2"><textarea id="incident-report" value={props.report} onChange={event => props.setReport(event.target.value)} placeholder="For example: Mere father ko saans lene mein bahut dikkat hai aur chest mein pain hai." className="min-h-44 w-full resize-none rounded-2xl border border-[#d9d5cc] bg-[#faf9f5] px-4 py-4 pr-16 text-base leading-7 text-[#202b2c] outline-none transition placeholder:text-[#9aa09b] focus:border-[#568a78] focus:ring-4 focus:ring-[#568a78]/10" />
          <button className={`absolute bottom-4 right-4 grid h-11 w-11 place-items-center rounded-full ${props.isListening ? "bg-[#e8505b] text-white" : "bg-[#dcebe0] text-[#286252]"}`} onClick={props.onVoice} aria-label={props.isListening ? "Stop listening" : "Speak your concern"}>{props.isListening ? <StopCircle size={20} /> : <Mic size={20} />}</button>
        </div>
        <div className="mt-3 flex items-start gap-2 text-xs font-semibold text-[#79827f]"><Mic size={14} className="mt-0.5 shrink-0" /><span>{props.voiceNotice || "Voice works in supported browsers over HTTPS. Allow microphone access when prompted."} · <button onClick={() => document.getElementById("incident-report")?.focus()} className="text-[#2e8069]">Type instead</button></span></div>
        <div className="mt-7 border-t border-[#ebe7df] pt-5"><div className="flex items-center justify-between gap-4"><div><p className="cb-label">Your location</p><p className="mt-1 text-sm text-[#65716d]">{props.locationNotice}</p></div><button className="cb-location-button" onClick={props.onLocation} disabled={props.isLocating}>{props.isLocating ? <RefreshCw size={16} className="animate-spin" /> : <LocateFixed size={16} />} {props.isLocating ? "Fetching" : props.location ? "Refresh location" : "Use my location"}</button></div>{props.location ? <div className="mt-3 rounded-xl bg-[#f3f7ef] px-3 py-2 text-xs font-bold text-[#47705b]"><div className="flex items-center gap-2"><MapPin size={14} /> {props.location.label}</div><p className="mt-1 pl-5 font-medium text-[#62806d]">{props.location.label}</p></div> : <div className="mt-3 rounded-xl border border-dashed border-[#d9d5cc] bg-[#faf9f5] px-3 py-3 text-xs font-semibold text-[#7b827e]">No location fetched yet. Your location will appear here after permission is granted.</div>}</div>
        {props.error && <div className="mt-5 rounded-xl border border-[#f5b8b8] bg-[#fff3f2] px-4 py-3 text-sm font-semibold text-[#a7383f]">{props.error}</div>}
        <button className="cb-primary-action mt-7 w-full justify-center" onClick={props.onSubmit} disabled={props.isSubmitting}>{props.isSubmitting ? <><RefreshCw size={20} className="animate-spin" /> Building your handoff…</> : <>Continue to safe next steps <ArrowRight size={19} /></>}</button>
      </div>
      <div className="mt-5 flex items-start gap-3 rounded-2xl bg-[#e8f0e8] p-4 text-sm leading-6 text-[#396050]"><ShieldCheck size={18} className="mt-1 shrink-0" /><span>CareBridge uses rules to identify urgency signals. It does not diagnose, prescribe, or recommend treatment.</span></div>
    </section>
  );
}

function ResultsScreen(props: {
  recommendation: IncidentRecord; offline: boolean; copied: boolean; summaryText: string; onBack: () => void; onCallDoctor: () => void; onCall112: () => void; onNavigate: () => void; onShare: () => void; onCopy: () => void;
}) {
  const { recommendation } = props;
  const facility = recommendation.recommendedFacility;
  const doctor = recommendation.recommendedDoctor;
  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-4"><button className="cb-back-link" onClick={props.onBack}><ArrowLeft size={16} /> New report</button><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-[#6d7974]"><Clock3 size={14} /> Handoff ready</div></div>
      <div className="mt-6 grid gap-7 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
        <div><div className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-black uppercase tracking-[0.16em] ${urgencyClasses(recommendation.incident.urgency)}`}><Siren size={15} /> {recommendation.incident.urgency}</div><h1 className="mt-4 max-w-xl font-display text-4xl font-semibold leading-tight tracking-[-0.04em] text-[#133b3a] sm:text-6xl">Here is the safest next step.</h1><p className="mt-4 max-w-xl text-base leading-7 text-[#66716e]">Based only on what you reported. This is navigation support, not a diagnosis.</p>
          {recommendation.incident.urgency === "EMERGENCY" && <div className="mt-6 flex items-start gap-3 rounded-2xl border border-[#f1b0b2] bg-[#fff2f1] p-4 text-sm font-semibold leading-6 text-[#91363d]"><AlertTriangle size={19} className="mt-1 shrink-0" /><span>{recommendation.incident.safetyNote}</span></div>}
          <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4"><ActionButton icon={<Phone size={18} />} label="Call doctor" onClick={props.onCallDoctor} disabled={!doctor} /><ActionButton icon={<Siren size={18} />} label="Call 112" onClick={props.onCall112} danger /><ActionButton icon={<Navigation size={18} />} label="Navigate" onClick={props.onNavigate} disabled={!facility} /><ActionButton icon={<Share2 size={18} />} label={props.copied ? "Copied" : "Share"} onClick={props.onShare} /></div>
          <button className="cb-112-banner mt-4 w-full" onClick={props.onCall112}><span className="grid h-10 w-10 place-items-center rounded-full bg-white/15"><Phone size={18} /></span><span className="flex-1 text-left"><strong className="block text-sm">If there is immediate danger, call 112 now.</strong><span className="text-xs text-white/70">This button opens your phone dialer. It does not simulate a call.</span></span><ArrowRight size={18} /></button>
        </div>
        <div className="rounded-[2rem] border border-[#ded9ce] bg-white p-5 shadow-[0_18px_45px_rgba(34,49,47,0.06)] sm:p-7"><div className="flex items-center justify-between gap-4"><div><div className="cb-eyebrow"><span className="cb-step-dot bg-[#2e8069]" /> Step 2 of 2 · Care connections</div><h2 className="mt-2 font-display text-2xl font-semibold text-[#133b3a]">What to do, where to go</h2></div><div className="rounded-2xl bg-[#e8f0e8] p-3 text-[#2e8069]"><HeartPulse size={22} /></div></div>
          <div className="mt-6 space-y-3"><div className="rounded-2xl bg-[#f6f5ef] p-4"><div className="flex items-start gap-3"><MapPin size={18} className="mt-1 text-[#2e8069]" /><div className="min-w-0"><p className="cb-mini-heading">WHERE TO GO</p><p className="mt-1 font-semibold text-[#263534]">{facility?.name ?? "Use 112 for the closest emergency facility"}</p><p className="mt-1 text-sm leading-6 text-[#6d7774]">{facility?.address ?? "No verified facility matched this report."}</p>{facility && <p className="mt-2 text-xs font-bold text-[#2e8069]">Approx. {facility.distanceKm.toFixed(1)} km · {formatPhone(facility.phone)}</p>}</div></div></div><div className="rounded-2xl bg-[#f6f5ef] p-4"><div className="flex items-start gap-3"><UserRound size={18} className="mt-1 text-[#2e8069]" /><div className="min-w-0"><p className="cb-mini-heading">WHO CAN HELP</p><p className="mt-1 font-semibold text-[#263534]">{doctor?.name ?? "No verified clinician available"}</p><p className="mt-1 text-sm leading-6 text-[#6d7774]">{doctor ? `${doctor.specialty} · ${doctor.phoneLabel}` : "Use 112 and the emergency facility recommendation."}</p>{doctor && <p className="mt-2 text-xs font-bold text-[#2e8069]">Verified resource · last checked {new Date(doctor.lastVerifiedAt).toLocaleDateString()}</p>}</div></div></div><div className="rounded-2xl bg-[#f6f5ef] p-4"><div className="flex items-start gap-3"><Navigation size={18} className="mt-1 text-[#2e8069]" /><div><p className="cb-mini-heading">HOW TO GET THERE</p><p className="mt-1 font-semibold text-[#263534]">{facility ? "Open Google Maps directions" : "Call 112 for routing support"}</p><p className="mt-1 text-sm leading-6 text-[#6d7774]">{recommendation.location.label}. Navigation uses your chosen location and the trusted facility coordinates.</p></div></div></div></div>
          {props.offline || recommendation.liveStatusUnavailable ? <div className="mt-4 rounded-xl border border-[#eadcb3] bg-[#fff8df] px-3 py-3 text-xs font-semibold leading-5 text-[#6f5c20]"><WifiOff size={14} className="mr-1 inline" /> {recommendation.fallbackMessage}</div> : null}
        </div>
      </div>
      {recommendation.liveFacilities.length > 0 && <div className="mt-8 rounded-[2rem] border border-[#d8e3d8] bg-[#f7fbf6] p-5 sm:p-7"><div className="flex items-start justify-between gap-4"><div><p className="cb-mini-heading">NEARBY MAP RESULTS</p><h2 className="mt-2 font-display text-2xl font-semibold text-[#133b3a]">Hospitals near this location</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#65716d]">Live OpenStreetMap results for the fetched coordinates. These listings are not confirmation of emergency capacity, open beds, or current clinician availability.</p></div><MapPin size={22} className="shrink-0 text-[#2e8069]" /></div><div className="mt-5 grid gap-3 sm:grid-cols-2">{recommendation.liveFacilities.map(hospital => <div key={hospital.id} className="rounded-2xl border border-[#dce7dc] bg-white p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold text-[#263534]">{hospital.name}</p><p className="mt-1 text-sm leading-6 text-[#6d7774]">{hospital.address}</p><p className="mt-2 text-xs font-bold text-[#47705b]">Phone: {formatPhone(hospital.phone)}</p></div><a className="shrink-0 rounded-xl bg-[#e8f0e8] p-2 text-[#2e8069]" href={`https://www.google.com/maps/search/?api=1&query=${hospital.latitude},${hospital.longitude}`} target="_blank" rel="noreferrer" aria-label={`Open ${hospital.name} in Google Maps`}><ExternalLink size={16} /></a></div><p className="mt-3 border-t border-[#edf1eb] pt-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[#7b827e]">OpenStreetMap listing · verify before relying on it</p></div>)}</div></div>}
      <div className="mt-8 grid gap-7 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[2rem] border border-[#ded9ce] bg-white p-5 sm:p-7"><div className="flex items-center justify-between gap-3"><div><p className="cb-mini-heading">WHY THIS FACILITY?</p><h2 className="mt-2 font-display text-2xl font-semibold text-[#133b3a]">Transparent matching</h2></div><ShieldCheck size={22} className="text-[#2e8069]" /></div><div className="mt-5 grid gap-3 sm:grid-cols-2">{facility?.why.map((reason, index) => <div className="flex gap-3 rounded-xl bg-[#f6f5ef] p-3 text-sm leading-6 text-[#5e6b67]" key={reason}><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#dcebe0] text-xs font-black text-[#2e8069]">{index + 1}</span>{reason}</div>) ?? <p className="text-sm text-[#6d7774]">No facility explanation is available because no verified resource matched.</p>}</div><div className="mt-5 flex flex-wrap gap-2 text-xs font-bold text-[#6d7774]"><span className="rounded-full bg-[#edf3ee] px-3 py-2">30% emergency readiness</span><span className="rounded-full bg-[#edf3ee] px-3 py-2">30% category match</span><span className="rounded-full bg-[#edf3ee] px-3 py-2">15% status</span><span className="rounded-full bg-[#edf3ee] px-3 py-2">15% distance</span><span className="rounded-full bg-[#edf3ee] px-3 py-2">10% freshness</span></div></div>
        <div className="rounded-[2rem] bg-[#133b3a] p-5 text-[#f8f3e8] shadow-[0_18px_45px_rgba(19,59,58,0.16)] sm:p-7"><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-[#bbd3c8]">Incident signal</p><p className="mt-2 font-display text-3xl font-semibold">{recommendation.incident.careCategory.replaceAll("_", " ")}</p></div><Sparkles size={22} className="text-[#f1cb67]" /></div><div className="mt-6 border-t border-white/10 pt-5"><p className="text-xs font-black uppercase tracking-[0.16em] text-[#bbd3c8]">Reported concerns</p><div className="mt-3 flex flex-wrap gap-2">{recommendation.incident.reportedConcerns.length ? recommendation.incident.reportedConcerns.map(concern => <span key={concern} className="rounded-full bg-white/10 px-3 py-2 text-sm text-[#e0ede6]">{concern}</span>) : <span className="text-sm text-[#c8d8d0]">No specific concern identified</span>}</div></div><div className="mt-6 rounded-2xl bg-white/7 p-4 text-sm leading-6 text-[#d5e4dc]">{recommendation.incident.safetyNote}</div></div>
      </div>
      <div className="mt-8 rounded-[2rem] border border-[#ded9ce] bg-[#fbfaf6] p-5 sm:p-7"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="cb-mini-heading">HANDOFF SUMMARY</p><h2 className="mt-2 font-display text-2xl font-semibold text-[#133b3a]">Ready to show a professional</h2></div><button className="cb-secondary-action" onClick={props.onCopy}><Copy size={16} /> {props.copied ? "Copied" : "Copy summary"}</button></div><pre className="mt-5 whitespace-pre-wrap font-sans text-sm leading-7 text-[#5c6965]">{props.summaryText}</pre><p className="mt-5 border-t border-[#e1ddd3] pt-4 text-xs font-bold leading-5 text-[#7b827e]">Not a diagnosis. Based only on information reported by the user.</p></div>
    </section>
  );
}

function ActionButton({ icon, label, onClick, disabled, danger = false }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return <button className={`group flex min-h-24 flex-col items-start justify-between rounded-2xl border p-3 text-left transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45 ${danger ? "border-[#f1b0b2] bg-[#fff2f1] text-[#a33b41]" : "border-[#d9d5cc] bg-white text-[#33514b] hover:border-[#8eafa0]"}`} onClick={onClick} disabled={disabled}>{icon}<span className="flex w-full items-center justify-between gap-2 text-xs font-black uppercase tracking-[0.08em]">{label}<ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" /></span></button>;
}
