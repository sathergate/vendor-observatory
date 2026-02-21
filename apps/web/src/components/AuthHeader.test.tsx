// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import { AuthHeader } from "./AuthHeader";

// ── Mocks ───────────────────────────────────────────────────────────

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

let mockSelectedVendor: string | null = null;
const mockSetSelectedVendor = vi.fn((v: string | null) => {
  mockSelectedVendor = v;
});

vi.mock("@/context/VendorContext", () => ({
  useVendor: () => ({
    selectedVendor: mockSelectedVendor,
    setSelectedVendor: mockSetSelectedVendor,
  }),
}));

// ── Helpers ─────────────────────────────────────────────────────────

function mockFetchUser(user: { id: string; email: string } | null) {
  return vi.fn().mockResolvedValue({
    ok: user !== null,
    status: user ? 200 : 401,
    json: async () => ({ user }),
  });
}

// ── Tests ───────────────────────────────────────────────────────────

beforeEach(() => {
  vi.restoreAllMocks();
  mockSelectedVendor = null;
  mockSetSelectedVendor.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AuthHeader", () => {
  it("shows login/signup buttons when not authenticated", async () => {
    global.fetch = mockFetchUser(null);
    render(<AuthHeader />);

    await waitFor(() => {
      expect(screen.getByText("Log in")).toBeDefined();
      expect(screen.getByText("Sign up")).toBeDefined();
    });
  });

  it("shows profile icon when authenticated", async () => {
    global.fetch = mockFetchUser({ id: "u1", email: "alice@example.com" });
    render(<AuthHeader />);

    await waitFor(() => {
      expect(screen.getByLabelText("Account menu")).toBeDefined();
      expect(screen.getByText("A")).toBeDefined();
    });
  });

  it("switches from login buttons to profile icon when auth-change fires", async () => {
    // Start unauthenticated
    const fetchMock = mockFetchUser(null);
    global.fetch = fetchMock;
    render(<AuthHeader />);

    await waitFor(() => {
      expect(screen.getByText("Log in")).toBeDefined();
    });

    // Simulate login: next fetch returns a user
    global.fetch = mockFetchUser({ id: "u1", email: "bob@example.com" });

    // Dispatch the auth-change event (this is what login/signup pages do)
    await act(async () => {
      window.dispatchEvent(new Event("auth-change"));
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Account menu")).toBeDefined();
      expect(screen.getByText("B")).toBeDefined();
    });

    // Login/signup buttons should be gone
    expect(screen.queryByText("Log in")).toBeNull();
    expect(screen.queryByText("Sign up")).toBeNull();
  });

  it("cleans up the auth-change listener on unmount", async () => {
    global.fetch = mockFetchUser(null);
    const spy = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<AuthHeader />);

    await waitFor(() => {
      expect(screen.getByText("Log in")).toBeDefined();
    });

    unmount();

    const authCleanup = spy.mock.calls.find(
      ([event]) => event === "auth-change",
    );
    expect(authCleanup).toBeDefined();
  });
});

describe("AuthHeader vendor dropdown", () => {
  it("shows vendor select dropdown in the popover", async () => {
    global.fetch = mockFetchUser({ id: "u1", email: "alice@example.com" });
    render(<AuthHeader />);

    await waitFor(() => {
      expect(screen.getByLabelText("Account menu")).toBeDefined();
    });

    // Open the popover
    act(() => {
      screen.getByLabelText("Account menu").click();
    });

    expect(screen.getByLabelText("Your vendor")).toBeDefined();
    expect(screen.getByText("Select a vendor...")).toBeDefined();
  });

  it("lists vendors grouped by category in the dropdown", async () => {
    global.fetch = mockFetchUser({ id: "u1", email: "alice@example.com" });
    render(<AuthHeader />);

    await waitFor(() => {
      expect(screen.getByLabelText("Account menu")).toBeDefined();
    });

    act(() => {
      screen.getByLabelText("Account menu").click();
    });

    const select = screen.getByLabelText("Your vendor") as HTMLSelectElement;

    // Check that optgroups exist for some known categories
    const optgroups = select.querySelectorAll("optgroup");
    expect(optgroups.length).toBeGreaterThan(0);

    // Check that known vendors are listed as options
    const options = select.querySelectorAll("option");
    const optionValues = Array.from(options).map((o) => o.value);
    expect(optionValues).toContain("supabase");
    expect(optionValues).toContain("sentry");
    expect(optionValues).toContain("datadog");
  });

  it("calls setSelectedVendor when a vendor is chosen", async () => {
    global.fetch = mockFetchUser({ id: "u1", email: "alice@example.com" });
    render(<AuthHeader />);

    await waitFor(() => {
      expect(screen.getByLabelText("Account menu")).toBeDefined();
    });

    act(() => {
      screen.getByLabelText("Account menu").click();
    });

    const select = screen.getByLabelText("Your vendor") as HTMLSelectElement;

    act(() => {
      fireEvent.change(select, { target: { value: "supabase" } });
    });

    expect(mockSetSelectedVendor).toHaveBeenCalledWith("supabase");
  });

  it("calls setSelectedVendor with null when cleared", async () => {
    mockSelectedVendor = "supabase";
    global.fetch = mockFetchUser({ id: "u1", email: "alice@example.com" });
    render(<AuthHeader />);

    await waitFor(() => {
      expect(screen.getByLabelText("Account menu")).toBeDefined();
    });

    act(() => {
      screen.getByLabelText("Account menu").click();
    });

    const select = screen.getByLabelText("Your vendor") as HTMLSelectElement;

    act(() => {
      fireEvent.change(select, { target: { value: "" } });
    });

    expect(mockSetSelectedVendor).toHaveBeenCalledWith(null);
  });

  it("shows confirmation text when a vendor is selected", async () => {
    mockSelectedVendor = "supabase";
    global.fetch = mockFetchUser({ id: "u1", email: "alice@example.com" });
    render(<AuthHeader />);

    await waitFor(() => {
      expect(screen.getByLabelText("Account menu")).toBeDefined();
    });

    act(() => {
      screen.getByLabelText("Account menu").click();
    });

    expect(screen.getByText(/Viewing profile for Supabase/)).toBeDefined();
  });

  it("does not show vendor dropdown when user is not authenticated", async () => {
    global.fetch = mockFetchUser(null);
    render(<AuthHeader />);

    await waitFor(() => {
      expect(screen.getByText("Log in")).toBeDefined();
    });

    expect(screen.queryByLabelText("Your vendor")).toBeNull();
  });
});
