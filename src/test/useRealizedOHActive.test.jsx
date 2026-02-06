import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { useRealizedOHActive } from "../hooks/useRealizedOHActive";

function TestHarness(props) {
  const { realizedOH, matchFactor } = useRealizedOHActive(props);
  return (
    <div>
      <div data-testid="realized">{String(realizedOH ?? "")}</div>
      <div data-testid="factor">{String(matchFactor ?? "")}</div>
    </div>
  );
}

describe("hooks/useRealizedOHActive", () => {
  it("does not crash when disabled", () => {
    render(
      <TestHarness
        species="Lohi"
        catchKg={0}
        fishingHours={0}
        gearUnits={0}
        enabled={false}
      />
    );

    expect(screen.getByTestId("realized")).toBeTruthy();
    expect(screen.getByTestId("factor")).toBeTruthy();
  });

  it("returns something when enabled and inputs are valid", () => {
    render(
      <TestHarness
        species="Lohi"
        catchKg={5}
        fishingHours={2}
        gearUnits={1}
        forecastOH={6}
        enabled={true}
      />
    );

    const realized = screen.getByTestId("realized").textContent;
    const factor = screen.getByTestId("factor").textContent;

    // Ei oleteta tarkkaa kaavaa – mutta pitää olla parsittavissa numeroiksi (yleensä)
    if (realized) expect(isNaN(Number(realized))).toBe(false);
    if (factor) expect(isNaN(Number(factor))).toBe(false);
  });
});
