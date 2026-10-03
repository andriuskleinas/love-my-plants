import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

const origin = "https://plants.example";

describe("post-login redirect", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/plants/123?x=1", origin)).toBe("/plants/123?x=1");
    expect(safeNext("/join/abc", origin)).toBe("/join/abc");
  });

  it("rejects anything that leaves the site", () => {
    expect(safeNext("//evil.example", origin)).toBe("/");
    expect(safeNext("/\\\\evil.example", origin)).toBe("/");
    expect(safeNext("/\\\\/evil.example", origin)).toBe("/");
    expect(safeNext("https://evil.example", origin)).toBe("/");
    expect(safeNext("javascript:alert(1)", origin)).toBe("/");
    expect(safeNext(null, origin)).toBe("/");
  });
});
