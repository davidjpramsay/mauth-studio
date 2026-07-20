import assert from "node:assert/strict";
import test from "node:test";

import {
  STARTER_LOGOS,
  appendedLogoLibraryAsset,
  appendMissingLogoAssets,
  frontMatterPatchForLogo,
  logoNameFromFile,
  mergeLogoAssets,
  normalizeLogoAsset,
  normalizeLogoAssets,
  removedLogoLibraryAsset,
  schoolInitials,
  selectedLogoForFrontMatter,
  selectedLogoFromLibrary,
  updatedLogoLibraryAsset,
  type LogoAsset,
} from "./logoLibrary.ts";

const accLogo = STARTER_LOGOS[0];
const customLogo: LogoAsset = {
  id: "custom",
  name: "Custom School",
  src: "data:image/png;base64,abc",
  schoolName: "CUSTOM\nSCHOOL",
};

test("normalizeLogoAsset accepts only complete logo records", () => {
  assert.deepEqual(normalizeLogoAsset(customLogo), customLogo);
  assert.equal(normalizeLogoAsset({ id: "missing-src", name: "Missing" }), undefined);
  assert.equal(normalizeLogoAsset(null), undefined);
});

test("normalizeLogoAssets drops invalid logo records", () => {
  assert.deepEqual(normalizeLogoAssets([customLogo, { id: "bad" }, null]), [customLogo]);
});

test("mergeLogoAssets appends and updates logos without cloning unchanged arrays", () => {
  const initial = [accLogo];
  assert.equal(mergeLogoAssets(initial, [accLogo]), initial);

  const appended = mergeLogoAssets(initial, [customLogo]);
  assert.notEqual(appended, initial);
  assert.deepEqual(
    appended.map((logo) => logo.id),
    [accLogo.id, customLogo.id],
  );

  const updated = mergeLogoAssets(appended, [{ ...customLogo, name: "Renamed School" }]);
  assert.equal(updated.find((logo) => logo.id === customLogo.id)?.name, "Renamed School");
});

test("appendMissingLogoAssets preserves existing logos and ignores duplicates", () => {
  const initial = [accLogo];
  assert.equal(appendMissingLogoAssets(initial, [accLogo]), initial);

  const next = appendMissingLogoAssets(initial, [accLogo, customLogo]);
  assert.deepEqual(
    next.map((logo) => logo.id),
    [accLogo.id, customLogo.id],
  );
});

test("updatedLogoLibraryAsset updates metadata and keeps the existing name for blank input", () => {
  const initial = [accLogo, customLogo];
  const updated = updatedLogoLibraryAsset(initial, customLogo.id, {
    name: "  Renamed School  ",
    schoolName: "RENAMED\nSCHOOL",
  });

  assert.equal(updated?.logo.name, "Renamed School");
  assert.equal(updated?.logo.schoolName, "RENAMED\nSCHOOL");
  assert.equal(updated?.logos[0], accLogo);
  assert.equal(updatedLogoLibraryAsset(initial, "missing", { name: "Missing", schoolName: "" }), null);

  const blankName = updatedLogoLibraryAsset(initial, customLogo.id, { name: "   ", schoolName: "CUSTOM SCHOOL" });
  assert.equal(blankName?.logo.name, customLogo.name);
});

test("appendedLogoLibraryAsset appends new logos and replaces matching records", () => {
  const initial = [accLogo];
  assert.deepEqual(appendedLogoLibraryAsset(initial, customLogo), [accLogo, customLogo]);

  const renamed = { ...customLogo, name: "Renamed School" };
  assert.deepEqual(appendedLogoLibraryAsset([accLogo, customLogo], renamed), [accLogo, renamed]);
});

test("removedLogoLibraryAsset rejects missing and final-logo removals", () => {
  const initial = [accLogo, customLogo];
  assert.deepEqual(removedLogoLibraryAsset(initial, customLogo.id), [accLogo]);
  assert.equal(removedLogoLibraryAsset(initial, "missing"), null);
  assert.equal(removedLogoLibraryAsset([accLogo], accLogo.id), null);
});

test("logo selection falls back predictably", () => {
  assert.equal(selectedLogoFromLibrary([customLogo], "custom"), customLogo);
  assert.equal(selectedLogoFromLibrary([customLogo], "missing"), customLogo);
  assert.equal(selectedLogoFromLibrary([], "missing"), accLogo);
  assert.equal(selectedLogoForFrontMatter([customLogo], { logoId: "" }), undefined);
});

test("frontMatterPatchForLogo includes the selected school name", () => {
  assert.deepEqual(frontMatterPatchForLogo([customLogo], "custom"), {
    logoId: "custom",
    schoolName: "CUSTOM\nSCHOOL",
  });
});

test("logoNameFromFile and schoolInitials produce readable labels", () => {
  assert.equal(logoNameFromFile("Australian-Christian-College.png"), "Australian Christian College");
  assert.equal(logoNameFromFile(".png"), "Custom logo");
  assert.equal(schoolInitials(["Australian Christian College"]), "ACC");
});
