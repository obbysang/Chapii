import { SHARED_SENTINEL } from "./index";
import { describe, expect, it } from "vitest";
describe("shared stub", () => {
  it("exports sentinel", () => { expect(SHARED_SENTINEL).toBe("shared"); });
});
