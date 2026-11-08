import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { statusColor } from "../components/states";
import Overview from "./Overview";
import { vi } from "vitest";

describe("states", () => {
  it("maps statuses to colors", () => {
    expect(statusColor("COMPLETED")).toBe("var(--green)");
    expect(statusColor("REJECTED")).toBe("var(--red)");
    expect(statusColor("PENDING_APPROVAL")).toBe("var(--amber)");
  });
});

describe("feed", () => {
  it("renders rows from mocked API", async () => {
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ rows: [] }), { status: 200 })
    );
    vi.stubGlobal("EventSource", class { addEventListener() {} close() {} });
    render(<MemoryRouter><Overview /></MemoryRouter>);
    expect(await screen.findByText("Recent activity")).toBeTruthy();
    vi.unstubAllGlobals();
  });
});

describe("policy editor", () => {
  it("shows plain-English summary", async () => {
    const onChange = vi.fn();
    const { PolicyEditor } = await import("./NewVault");
    render(<PolicyEditor value="" onChange={onChange} />);
    expect(screen.getByText(/This agent can pay up to/)).toBeTruthy();
  });
});
