// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
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
