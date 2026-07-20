import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_FRONT_MATTER, type FrontMatterConfig } from "./frontMatterConfig.ts";
import { createFrontMatterLogoActions } from "./frontMatterLogoActions.ts";
import type { MauthDocumentAction } from "./mauthActions.ts";
import type { LogoAsset } from "./logoLibrary.ts";

const primaryLogo: LogoAsset = {
  id: "primary",
  name: "Primary School",
  src: "/primary.svg",
  schoolName: "PRIMARY SCHOOL",
};

const alternateLogo: LogoAsset = {
  id: "alternate",
  name: "Alternate School",
  src: "/alternate.svg",
  schoolName: "ALTERNATE SCHOOL",
};

function createRuntime() {
  let logos = [primaryLogo, alternateLogo];
  let frontMatter: FrontMatterConfig = { ...DEFAULT_FRONT_MATTER, logoId: primaryLogo.id, schoolName: primaryLogo.schoolName ?? "" };
  const actions: MauthDocumentAction[] = [];
  const writtenLogos: LogoAsset[] = [];
  const deletedLogoIds: string[] = [];

  const runtime = {
    logos: () => logos,
    frontMatter: () => frontMatter,
    createId: (prefix: string) => `${prefix}-new`,
    applyDocumentAction: (action: MauthDocumentAction) => actions.push(action),
    updateLogoAsset: (logoId: string, patch: { name: string; schoolName: string }) => {
      const existing = logos.find((logo) => logo.id === logoId);
      if (!existing) return null;
      const updated = { ...existing, ...patch };
      logos = logos.map((logo) => (logo.id === logoId ? updated : logo));
      return updated;
    },
    appendLogoAsset: (logo: LogoAsset) => {
      logos = [...logos, logo];
      return logo;
    },
    removeLogoAsset: (logoId: string) => {
      const next = logos.filter((logo) => logo.id !== logoId);
      if (!next.length || next.length === logos.length) return null;
      logos = next;
      return next;
    },
    writeLogoToDisk: (logo: LogoAsset) => writtenLogos.push(logo),
    deleteLogoFromDisk: (logoId: string) => deletedLogoIds.push(logoId),
    readFileAsDataUrl: async () => "data:image/png;base64,new",
  };

  return {
    runtime,
    state: () => ({ logos, frontMatter, actions, writtenLogos, deletedLogoIds }),
    setFrontMatter: (value: FrontMatterConfig) => {
      frontMatter = value;
    },
  };
}

test("front matter logo actions update selected logo metadata and school name", () => {
  const testRuntime = createRuntime();
  const actions = createFrontMatterLogoActions(testRuntime.runtime);

  actions.updateLogo(primaryLogo.id, { name: "Renamed", schoolName: "RENAMED SCHOOL" });

  assert.equal(testRuntime.state().writtenLogos[0].name, "Renamed");
  assert.deepEqual(testRuntime.state().actions, [{ type: "frontMatter.update", patch: { schoolName: "RENAMED SCHOOL" } }]);
});

test("front matter updates include selected logo defaults but preserve explicit fields", () => {
  const testRuntime = createRuntime();
  const actions = createFrontMatterLogoActions(testRuntime.runtime);

  actions.updateFrontMatter({ logoId: alternateLogo.id, assessmentTitle: "Updated", schoolName: "OVERRIDE SCHOOL" });

  assert.deepEqual(testRuntime.state().actions, [
    {
      type: "frontMatter.update",
      patch: { logoId: alternateLogo.id, schoolName: "OVERRIDE SCHOOL", assessmentTitle: "Updated" },
    },
  ]);
});

test("front matter logo actions add uploaded logos in place", async () => {
  const testRuntime = createRuntime();
  const actions = createFrontMatterLogoActions(testRuntime.runtime);
  const file = { name: "New-School.png" } as File;

  await actions.addLogo(file);

  const addedLogo = testRuntime.state().logos[2];
  assert.deepEqual(addedLogo, {
    id: "logo-new",
    name: "New School",
    src: "data:image/png;base64,new",
    schoolName: "PRIMARY SCHOOL",
  });
  assert.equal(testRuntime.state().writtenLogos[0], addedLogo);
  assert.deepEqual(testRuntime.state().actions, [{ type: "frontMatter.logo.set", logoId: "logo-new", schoolName: "PRIMARY SCHOOL" }]);
});

test("front matter logo actions select a fallback only when the active logo is removed", () => {
  const testRuntime = createRuntime();
  const actions = createFrontMatterLogoActions(testRuntime.runtime);

  actions.removeLogo(primaryLogo.id);

  assert.deepEqual(testRuntime.state().deletedLogoIds, [primaryLogo.id]);
  assert.deepEqual(testRuntime.state().actions, [
    { type: "frontMatter.logo.set", logoId: alternateLogo.id, schoolName: alternateLogo.schoolName },
  ]);

  testRuntime.setFrontMatter({ ...testRuntime.state().frontMatter, logoId: alternateLogo.id });
  actions.removeLogo("missing");
  assert.deepEqual(testRuntime.state().deletedLogoIds, [primaryLogo.id]);
});
