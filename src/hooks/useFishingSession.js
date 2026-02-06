// src/hooks/useFishingSession.js
import { useEffect, useMemo, useState } from "react";
import {
  STORAGE_KEYS,
  makeActiveSession,
  stopSessionToDraft,
  safeJsonParse,
  nowIso,
} from "../utils/catchModel";

function fmtDuration(mins) {
  const m = Math.max(0, Number(mins) || 0);
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  if (hh <= 0) return `${mm} min`;
  return `${hh} h ${mm} min`;
}

function computeFishingMinutes(startedAtIso, stoppedAtMsOrIso) {
  const a = new Date(startedAtIso).getTime();
  const b =
    typeof stoppedAtMsOrIso === "number"
      ? stoppedAtMsOrIso
      : new Date(stoppedAtMsOrIso).getTime();

  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;

  // tärkeä: vähintään 1 min jos sessio on oikeasti ollut käynnissä
  return Math.max(1, Math.round((b - a) / 60000));
}

// ✅ pidetään defaultit yhdessä paikassa (ulkona hookista)
function withTargetDefaults(obj) {
  if (!obj) return obj;
  return {
    targetSpecies: null,
    targetResolved: false,
    targetOutcome: null, // "caught" | "none" | null
    targetCatchKg: 0,
    targetCatchCount: 0,
    ...obj,
  };
}

export function useFishingSession({
  source = "lake", // "lake" | "river"
  getWeatherSnapshot, // () => { pressure, windDeg, windSpeed, windDirectionText, forecastOH, moon... }
  getContextSnapshot, // () => { locationName, coords } optional
} = {}) {
  const [activeSession, setActiveSession] = useState(null);
  const [draftCatch, setDraftCatch] = useState(null);
  const [nowTick, setNowTick] = useState(Date.now());

  // load persisted session + draft at mount
  useEffect(() => {
    const sess = safeJsonParse(
      localStorage.getItem(STORAGE_KEYS.ACTIVE_SESSION) || "null",
      null
    );
    const draft = safeJsonParse(
      localStorage.getItem(STORAGE_KEYS.DRAFT_CATCH) || "null",
      null
    );

    if (sess && !sess.stoppedAt) setActiveSession(withTargetDefaults(sess));
    if (draft) setDraftCatch(withTargetDefaults(draft));
  }, []);

  // tick for duration label while active
  useEffect(() => {
    if (!activeSession?.startedAt) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [activeSession?.startedAt]);

  // persist on changes
  useEffect(() => {
    if (activeSession) {
      localStorage.setItem(
        STORAGE_KEYS.ACTIVE_SESSION,
        JSON.stringify(activeSession)
      );
    } else {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_SESSION);
    }
  }, [activeSession]);

  useEffect(() => {
    if (draftCatch) {
      localStorage.setItem(STORAGE_KEYS.DRAFT_CATCH, JSON.stringify(draftCatch));
    } else {
      localStorage.removeItem(STORAGE_KEYS.DRAFT_CATCH);
    }
  }, [draftCatch]);

  const isActive = !!activeSession?.startedAt && !activeSession?.stoppedAt;

  const durationMinutes = useMemo(() => {
    if (!isActive) return 0;
    const a = new Date(activeSession.startedAt).getTime();
    const b = nowTick;
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
    return Math.max(0, Math.round((b - a) / 60000));
  }, [isActive, activeSession?.startedAt, nowTick]);

  const durationText = useMemo(
    () => fmtDuration(durationMinutes),
    [durationMinutes]
  );

  // ✅ target-tila aina saatavilla (draft voittaa, koska se on "lopetettu sessio")
  const targetSpecies =
    (draftCatch && draftCatch.targetSpecies) ||
    (activeSession && activeSession.targetSpecies) ||
    null;

  const targetResolved =
    (draftCatch && typeof draftCatch.targetResolved === "boolean"
      ? draftCatch.targetResolved
      : activeSession && typeof activeSession.targetResolved === "boolean"
      ? activeSession.targetResolved
      : true);

  // jos target on valittu, pitää ratkaista ennen tallennusta
  const canFinalize = !targetSpecies || !!targetResolved;

  const start = (opts = {}) => {
    const ctx = getContextSnapshot ? getContextSnapshot() : {};
    const weather = getWeatherSnapshot ? getWeatherSnapshot() : null;

    const baseSess = makeActiveSession({
      source: opts.source || source,
      locationName: opts.locationName ?? ctx.locationName,
      coords: opts.coords ?? ctx.coords,
      weatherSnapshot: weather,
    });

    const sess = withTargetDefaults({
      ...baseSess,
      targetSpecies: opts.targetSpecies ?? null,
      // jos tavoite on valittu, gate päälle; jos ei, sallitaan normaalisti
      targetResolved: opts.targetSpecies ? false : true,
      targetOutcome: null,
      targetCatchKg: 0,
      targetCatchCount: 0,
    });

    setActiveSession(sess);
  };

  const stopToDraft = () => {
    if (!activeSession) return null;

    const weather = getWeatherSnapshot ? getWeatherSnapshot() : null;
    const stopMs = Date.now();

    const mins = computeFishingMinutes(activeSession.startedAt, stopMs) ?? 0;
    const baseDraft = stopSessionToDraft(activeSession, weather);

    const hasTarget = !!activeSession?.targetSpecies;

    const draft = withTargetDefaults({
      ...baseDraft,
      stoppedAt: nowIso(),
      durationMinutes: mins,
      durationText: fmtDuration(mins),
      pyyntiaikaMin: mins,
      pyyntiaikaText: fmtDuration(mins),

      // ✅ kohdekala mukaan draftiin
      targetSpecies: activeSession?.targetSpecies || null,
      // ✅ jos kohdekala valittu, pitää käyttäjän ratkaista (saalis / ei tavoitesaalista)
      targetResolved: hasTarget ? false : true,
      targetOutcome: null,
      targetCatchKg: 0,
      targetCatchCount: 0,
    });

    setActiveSession(null);
    setDraftCatch(draft);
    return draft;
  };

  const clearDraft = () => setDraftCatch(null);

  const requestExit = () => {
    if (isActive) return { action: "stop_to_draft", reason: "active_session" };
    if (draftCatch) return { action: "go_to_form", reason: "draft_exists" };
    return { action: "no_pending" };
  };

  const onCatchSaved = () => setDraftCatch(null);

  // ✅ target-gaten vapautus: "Ei tavoitesaalista"
  const resolveTargetNone = () => {
    setDraftCatch((d) => {
      if (!d) return d;
      const dd = withTargetDefaults(d);
      return { ...dd, targetResolved: true, targetOutcome: "none" };
    });
  };

  // ✅ kun tallennetaan tavoitelaji → merkitään ratkaistuksi ja kerätään tehokkuusdataa
  const markTargetCaught = ({ addKg = 0, addCount = 0 } = {}) => {
    setDraftCatch((d) => {
      if (!d) return d;
      const dd = withTargetDefaults(d);
      return {
        ...dd,
        targetResolved: true,
        targetOutcome: "caught",
        targetCatchKg: (Number(dd.targetCatchKg) || 0) + (Number(addKg) || 0),
        targetCatchCount:
          (Number(dd.targetCatchCount) || 0) + (Number(addCount) || 0),
      };
    });
  };

  return {
    // state
    isActive,
    activeSession,
    draftCatch,

    // derived
    durationMinutes,
    durationText,

    // target derived
    targetSpecies,
    targetResolved,
    canFinalize,

    // actions
    start,
    stopToDraft,
    clearDraft,
    requestExit,
    onCatchSaved,

    // target actions
    resolveTargetNone,
    markTargetCaught,
  };
}
