import { describe, expect, it } from "vitest";
import { creditLine, FILE_TITLE, plainText, speciesSearchNames } from "./stock-photos";

describe("speciesSearchNames", () => {
  it("searches the name and its synonyms", () => {
    expect(speciesSearchNames("Goeppertia lancifolia (syn. Calathea lancifolia)")).toEqual(["Goeppertia lancifolia", "Calathea lancifolia"]);
  });
  it("keeps a plain name as it is", () => {
    expect(speciesSearchNames("Monstera deliciosa")).toEqual(["Monstera deliciosa"]);
  });
  it("skips duplicates and empty parts", () => {
    expect(speciesSearchNames("Pachira aquatica (Pachira aquatica; )")).toEqual(["Pachira aquatica"]);
  });
});

describe("plainText", () => {
  it("strips Commons HTML from author names", () => {
    expect(plainText('<a href="//commons.wikimedia.org/wiki/User:Bastique" title="User:Bastique">Cary Bass (<i>n</i>)</a>')).toBe("Cary Bass (n)");
    expect(plainText('<a href="https://en.wikipedia.org/wiki/User:Chhe">Chhe</a> (<a href="#">talk</a>)')).toBe("Chhe");
    expect(plainText("Tom &amp; Jerry")).toBe("Tom & Jerry");
  });
  it("shortens long text and handles empty values", () => {
    expect(plainText("x".repeat(100), 10)).toBe("xxxxxxxxx…");
    expect(plainText("<span> </span>")).toBeNull();
    expect(plainText(undefined)).toBeNull();
  });
});

describe("FILE_TITLE", () => {
  it("accepts Commons photo titles only", () => {
    expect(FILE_TITLE.test("File:Monstera deliciosa2.jpg")).toBe(true);
    expect(FILE_TITLE.test("File:Chamaedorea elegans Mart.JPG")).toBe(true);
    expect(FILE_TITLE.test("File:drawing.svg")).toBe(false);
    expect(FILE_TITLE.test("File:../../etc.jpg")).toBe(false);
    expect(FILE_TITLE.test("https://example.com/a.jpg")).toBe(false);
  });
});

it("creditLine", () => {
  expect(creditLine({ author: "Dinkum", license: "CC0", sourceUrl: "https://commons.wikimedia.org/wiki/File:x.jpg" })).toBe("Photo: Dinkum · CC0");
  expect(creditLine({ author: null, license: "Public domain", sourceUrl: "" })).toBe("Photo · Public domain");
});
