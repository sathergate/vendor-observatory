import { describe, it, expect } from "vitest";
import { translateError, listKnownErrors } from "./translate-error.js";

describe("translateError", () => {
  it("translates unique violation", () => {
    const result = translateError(
      "23505",
      'duplicate key value violates unique constraint "users_email_key"',
    );
    expect(result).not.toBeNull();
    expect(result!.explanation).toContain("Unique constraint violation");
    expect(result!.commonCauses.length).toBeGreaterThan(0);
  });

  it("translates undefined table", () => {
    const result = translateError("42P01", 'relation "foo" does not exist');
    expect(result).not.toBeNull();
    expect(result!.explanation).toContain("does not exist");
    expect(result!.actionableStep).toContain("list_tables");
  });

  it("translates permission denied", () => {
    const result = translateError("42501", "permission denied for table users");
    expect(result).not.toBeNull();
    expect(result!.explanation).toContain("privilege");
  });

  it("translates too many connections", () => {
    const result = translateError("53300", "too many connections for role");
    expect(result).not.toBeNull();
    expect(result!.actionableStep).toContain("pooling");
  });

  it("translates paused project by message pattern", () => {
    const result = translateError("", "project is paused due to inactivity");
    expect(result).not.toBeNull();
    expect(result!.explanation).toContain("paused");
  });

  it("translates JWT expired by message pattern", () => {
    const result = translateError("", "JWT token has expired");
    expect(result).not.toBeNull();
    expect(result!.explanation).toContain("expired");
  });

  it("returns null for unknown errors", () => {
    const result = translateError("99999", "something completely unknown");
    expect(result).toBeNull();
  });

  it("lists known errors", () => {
    const errors = listKnownErrors();
    expect(errors.length).toBeGreaterThan(10);
    expect(errors[0]).toHaveProperty("code");
    expect(errors[0]).toHaveProperty("explanation");
  });
});
