// src/hooks/usePro.js
import { useMemo } from "react";
import { useEntitlement } from "../components/EntitlementContext";

export function usePro() {
  const { entitlement } = useEntitlement();

  return useMemo(() => {
    const tier = entitlement?.tier || "free";
    const expired = entitlement?.expired === true;

    const isPro =
      !expired && ["pro", "pro_paid", "pro_permanent", "pro_trial"].includes(tier);

    return { isPro, tier, expired };
  }, [entitlement]);
}
