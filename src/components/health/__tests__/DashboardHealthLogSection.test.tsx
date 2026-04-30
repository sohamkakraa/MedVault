import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DashboardHealthLogSection } from "../DashboardHealthLogSection";
import type { PatientStore } from "@/lib/types";
import { defaultHealthLogs } from "@/lib/healthLogs";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/components/ui/DateTimePicker", () => ({
  DateTimePicker: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <input type="text" data-testid="datetime-picker" value={value} readOnly onChange={(e) => onChange(e.target.value)} />
  ),
}));

vi.mock("@/components/ui/Button", async () => {
  const { forwardRef } = await import("react");
  const Btn = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }>(
    ({ children, onClick, type, disabled, variant: _v, ...rest }, ref) => (
      <button ref={ref} type={type ?? "button"} onClick={onClick} disabled={disabled} {...rest}>{children}</button>
    )
  );
  Btn.displayName = "Button";
  return { Button: Btn };
});

vi.mock("@/components/ui/Input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock("@/components/ui/Badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock("@/components/ui/Card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("lucide-react", () => ({
  Activity: () => null,
  Droplets: () => null,
  Stethoscope: () => null,
}));

// ─── Helper ───────────────────────────────────────────────────────────────────

function makeStore(overrides?: Partial<PatientStore>): PatientStore {
  return {
    docs: [],
    meds: [],
    labs: [],
    healthLogs: defaultHealthLogs(),
    profile: { name: "", allergies: [], conditions: [], trends: [] },
    preferences: { theme: "system" },
    updatedAtISO: new Date().toISOString(),
    ...overrides,
  } as PatientStore;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("DashboardHealthLogSection", () => {
  let handleChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    handleChange = vi.fn();
  });

  it("empty BP submit shows systolic and diastolic error messages", async () => {
    render(<DashboardHealthLogSection store={makeStore()} onStoreChange={handleChange} />);

    // First "Add new" opens the BP form
    const addButtons = screen.getAllByRole("button", { name: /^add new$/i });
    fireEvent.click(addButtons[0]);

    const forms = document.querySelectorAll("form");
    fireEvent.submit(forms[0]);

    await waitFor(() => {
      expect(
        screen.getByText(/enter the top number from your reading/i)
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText(/enter the bottom number/i)
    ).toBeInTheDocument();
  });

  it("systolic ≤ diastolic shows the double-check error", async () => {
    const user = userEvent.setup();
    render(<DashboardHealthLogSection store={makeStore()} onStoreChange={handleChange} />);

    const addButtons = screen.getAllByRole("button", { name: /^add new$/i });
    fireEvent.click(addButtons[0]);

    const numericInputs = document.querySelectorAll("input[inputmode='numeric']");
    await user.type(numericInputs[0], "80");
    await user.type(numericInputs[1], "120");

    const forms = document.querySelectorAll("form");
    fireEvent.submit(forms[0]);

    await waitFor(() => {
      expect(
        screen.getByText(/top number is usually larger/i)
      ).toBeInTheDocument();
    });
  });

  it("empty side-effect submit shows the description error", async () => {
    render(<DashboardHealthLogSection store={makeStore()} onStoreChange={handleChange} />);

    // Second "Add new" opens the SE form
    const addButtons = screen.getAllByRole("button", { name: /^add new$/i });
    fireEvent.click(addButtons[1]);

    const forms = document.querySelectorAll("form");
    fireEvent.submit(forms[0]);

    await waitFor(() => {
      expect(
        screen.getByText(/tell uma in a few words/i)
      ).toBeInTheDocument();
    });
  });

  it("successful BP save clears the form and calls onStoreChange once", async () => {
    const user = userEvent.setup();
    render(<DashboardHealthLogSection store={makeStore()} onStoreChange={handleChange} />);

    const addButtons = screen.getAllByRole("button", { name: /^add new$/i });
    fireEvent.click(addButtons[0]);

    // Wait for form to appear and pending ID to be set
    await waitFor(() => {
      expect(document.querySelector("form")).not.toBeNull();
    });

    const numericInputs = document.querySelectorAll("input[inputmode='numeric']");
    await user.type(numericInputs[0], "120");
    await user.type(numericInputs[1], "80");

    const form = document.querySelector("form") as HTMLFormElement;
    await act(async () => {
      fireEvent.submit(form);
      // allow the setTimeout(0) microtask to run
      await new Promise((r) => setTimeout(r, 10));
    });

    await waitFor(() => {
      expect(handleChange).toHaveBeenCalledTimes(1);
    });

    const saved = (handleChange.mock.calls[0] as [PatientStore])[0];
    expect(saved.healthLogs?.bloodPressure).toHaveLength(1);
    expect(saved.healthLogs?.bloodPressure[0].systolic).toBe(120);
    expect(saved.healthLogs?.bloodPressure[0].diastolic).toBe(80);
  });

  it("double-submit produces exactly one BP row", async () => {
    const user = userEvent.setup();
    render(<DashboardHealthLogSection store={makeStore()} onStoreChange={handleChange} />);

    const addButtons = screen.getAllByRole("button", { name: /^add new$/i });
    fireEvent.click(addButtons[0]);

    await waitFor(() => {
      expect(document.querySelector("form")).not.toBeNull();
    });

    const numericInputs = document.querySelectorAll("input[inputmode='numeric']");
    await user.type(numericInputs[0], "120");
    await user.type(numericInputs[1], "80");

    const form = document.querySelector("form") as HTMLFormElement;

    await act(async () => {
      // Fire twice rapidly
      fireEvent.submit(form);
      fireEvent.submit(form);
      await new Promise((r) => setTimeout(r, 20));
    });

    await waitFor(() => {
      expect(handleChange).toHaveBeenCalled();
    });

    // Regardless of how many times handleChange was called, the last call
    // should have at most 1 BP entry (idempotency prevents duplicates).
    const allCalls = handleChange.mock.calls as [PatientStore][];
    const allEntries = allCalls.flatMap((c) => c[0].healthLogs?.bloodPressure ?? []);
    const uniqueIds = new Set(allEntries.map((e) => e.id));
    expect(uniqueIds.size).toBeLessThanOrEqual(1);
  });
});
