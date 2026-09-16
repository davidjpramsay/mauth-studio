import { useEffect, useRef } from "react";
import type { ProjectFileVersion, ProjectSummary } from "@mauth-studio/shared";
import type { MauthDialogActions } from "@/hooks/useMauthDialogController";
import { desktopDocumentPath } from "@/lib/desktopDocumentPath";

interface Options {
  ready: boolean;
  documentOpen: boolean;
  documentId: string | null;
  project: ProjectSummary | null;
  filePath: string | null;
  startNew: () => void;
  open: () => void;
  save: () => Promise<boolean>;
  saveAs: () => Promise<boolean>;
  backup: () => Promise<void>;
  restore: (file: File) => Promise<void>;
  versions: (path: string) => Promise<ProjectFileVersion[]>;
  restoreVersion: (path: string, id: string, revision: number) => Promise<unknown>;
  dialogs: MauthDialogActions;
}

export function useDesktopFileCommands(options: Options) {
  const current = useRef(options);
  current.current = options;
  useEffect(() => {
    let busy = false;
    async function run(command: string) {
      const context = current.current;
      if (!context.ready || busy) return;
      const sameDocument = () => current.current.documentId === context.documentId && current.current.filePath === context.filePath;
      busy = true;
      try {
        if (command === "open") context.open();
        else if (command === "new") context.startNew();
        else if (command === "restore") {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = ".zip";
          input.onchange = () => {
            const file = input.files?.[0];
            if (file && sameDocument()) void context.restore(file);
          };
          input.click();
        } else if (context.documentOpen) {
          if (command === "save") await context.save();
          else if (command === "save-as") await context.saveAs();
          else if (command === "backup") await context.backup();
          else if (command === "reveal") {
            const path = desktopDocumentPath(context.project, context.filePath);
            if (path) await window.mauthDesktop?.revealDocument?.(path);
            else
              await context.dialogs.alert({
                title: "Save this document first",
                description: "This document does not have a file location yet.",
              });
          } else if (command === "versions") {
            if (!context.filePath) return;
            const versions = await context.versions(context.filePath);
            if (!sameDocument()) return;
            if (!versions.length) {
              await context.dialogs.alert({
                title: "No previous versions",
                description: "Previous versions are kept when you save changes to this file.",
              });
              return;
            }
            const selected = await context.dialogs.choose({
              title: "Version history",
              description: "Choose a previous version to restore.",
              options: versions.map((v) => ({ value: v.id, label: `Revision ${v.revision} - ${new Date(v.createdAt).toLocaleString()}` })),
            });
            const version = versions.find((v) => v.id === selected);
            if (
              version &&
              sameDocument() &&
              (await context.dialogs.confirm({
                title: "Restore this version?",
                description: "The current saved version will remain in history.",
                confirmLabel: "Restore",
              })) &&
              sameDocument()
            ) {
              await context.restoreVersion(context.filePath, version.id, version.revision);
            }
          }
        }
      } catch (error) {
        await context.dialogs.alert({
          title: "File operation failed",
          description: error instanceof Error ? error.message : "Please try again.",
        });
      } finally {
        busy = false;
      }
    }
    return window.mauthDesktop?.onFileCommand?.((command) => void run(command));
  }, []);
}
