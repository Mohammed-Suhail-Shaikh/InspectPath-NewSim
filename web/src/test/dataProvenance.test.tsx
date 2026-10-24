import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import Footer, { MOCK_DISCLAIMER } from "../components/Footer";
import { mockSource } from "../data/mockSource";

describe("data provenance labeling", () => {
  it("mock source is flagged as mock", () => {
    expect(mockSource.isMock).toBe(true);
  });

  it("footer shows the sample-data disclaimer when the source is mock", () => {
    render(<Footer />);
    expect(screen.getByText(MOCK_DISCLAIMER)).toBeInTheDocument();
    // Must not claim real data while on mocks.
    expect(
      screen.queryByText(/Simulation with real bridge data/i)
    ).not.toBeInTheDocument();
  });

  it("the mock disclaimer does not claim real data", () => {
    expect(MOCK_DISCLAIMER).toContain("Sample data for demonstration");
    expect(MOCK_DISCLAIMER).not.toMatch(/real bridge data/i);
    // Keeps the estimates-not-ratings wording.
    expect(MOCK_DISCLAIMER).toContain(
      "estimates, not engineering ratings"
    );
  });
});
