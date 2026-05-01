import { describe, expect, it } from "vitest";
import { uuid } from "./ids";

describe("uuid", () => {
  it("returns an RFC 4122 UUID string", () => {
    expect(uuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

