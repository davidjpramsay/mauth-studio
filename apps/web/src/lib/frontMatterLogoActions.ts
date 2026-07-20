import type { MauthDocumentAction } from "./mauthActions.ts";
import type { FrontMatterConfig } from "./frontMatterConfig.ts";
import { frontMatterPatchForLogo, logoNameFromFile, selectedLogoFromLibrary, type LogoAsset } from "./logoLibrary.ts";

interface FrontMatterLogoActionsRuntime {
  logos: () => LogoAsset[];
  frontMatter: () => FrontMatterConfig;
  createId: (prefix: string) => string;
  applyDocumentAction: (action: MauthDocumentAction) => void;
  updateLogoAsset: (logoId: string, patch: { name: string; schoolName: string }) => LogoAsset | null;
  appendLogoAsset: (logo: LogoAsset) => LogoAsset;
  removeLogoAsset: (logoId: string) => LogoAsset[] | null;
  writeLogoToDisk: (logo: LogoAsset) => void;
  deleteLogoFromDisk: (logoId: string) => void;
  readFileAsDataUrl?: (file: File) => Promise<string>;
}

export function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

export function createFrontMatterLogoActions(runtime: FrontMatterLogoActionsRuntime) {
  function updateLogo(logoId: string, patch: { name: string; schoolName: string }) {
    const updatedLogo = runtime.updateLogoAsset(logoId, patch);
    if (!updatedLogo) return;
    runtime.writeLogoToDisk(updatedLogo);
    if (runtime.frontMatter().logoId === logoId) {
      runtime.applyDocumentAction({ type: "frontMatter.update", patch: { schoolName: patch.schoolName } });
    }
  }

  function updateFrontMatter(patch: Partial<FrontMatterConfig>) {
    runtime.applyDocumentAction({
      type: "frontMatter.update",
      patch: {
        ...(typeof patch.logoId === "string" ? frontMatterPatchForLogo(runtime.logos(), patch.logoId) : {}),
        ...patch,
      } as Record<string, unknown>,
    });
  }

  async function addLogo(file: File) {
    const src = await (runtime.readFileAsDataUrl ?? readFileAsDataUrl)(file);
    if (!src) return;

    const logo: LogoAsset = {
      id: runtime.createId("logo"),
      name: logoNameFromFile(file.name),
      src,
      schoolName: runtime.frontMatter().schoolName,
    };
    runtime.appendLogoAsset(logo);
    runtime.writeLogoToDisk(logo);
    runtime.applyDocumentAction({ type: "frontMatter.logo.set", logoId: logo.id, schoolName: logo.schoolName });
  }

  function removeLogo(logoId: string) {
    const nextLogos = runtime.removeLogoAsset(logoId);
    if (!nextLogos) return;
    runtime.deleteLogoFromDisk(logoId);
    if (runtime.frontMatter().logoId === logoId) {
      const nextLogo = selectedLogoFromLibrary(nextLogos, nextLogos[0].id);
      runtime.applyDocumentAction({ type: "frontMatter.logo.set", logoId: nextLogo.id, schoolName: nextLogo.schoolName });
    }
  }

  return { updateLogo, updateFrontMatter, addLogo, removeLogo };
}
