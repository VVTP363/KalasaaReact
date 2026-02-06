import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock i18n: palautetaan avaimet defaultValue:lla
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key, opts) => (opts && opts.defaultValue ? opts.defaultValue : key),
    i18n: { language: "fi" },
  }),
}));

import VirtavesiIlmoitus from "../components/VirtavesiIlmoitus";
import { AppContext } from "../components/AppContext";

describe("VirtavesiIlmoitus integration", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows realized OH line when inputs are filled (active)", async () => {
    const user = userEvent.setup();

    render(
      <AppContext.Provider
        value={{
          riverOH: 5,
          pressure: 1008.3,
          windDirection: 199,
          windSpeed: 6.1,
          moonEmoji: "🌘",
          locationName: "Iittala",
          moonPhaseKey: "waningCrescent",
        }}
      >
        <VirtavesiIlmoitus />
      </AppContext.Provider>
    );

    // Paino
    const weightInput = screen.getByLabelText(/weight/i);
    await user.clear(weightInput);
    await user.type(weightInput, "5,18");

    // Pyydysyksiköt
    const gearInput = screen.getByLabelText(/Pyydysyksiköt/i);
    await user.clear(gearInput);
    await user.type(gearInput, "1");

    // Pyyntiaika
    const hoursInput = screen.getByLabelText(/Pyyntiaika/i);
    await user.clear(hoursInput);
    await user.type(hoursInput, "6,4");

    // Nyt pitäisi näkyä toteumarivi (teksti riippuu defaultValue:sta)
    expect(
      screen.getByText(/OH-toteuma \(aktiivipyynti\)/i)
    ).toBeInTheDocument();
  });
});
