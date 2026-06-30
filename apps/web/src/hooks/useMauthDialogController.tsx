import { useRef, useState } from "react";
import type { ReactNode } from "react";

import { MauthDialog } from "@/components/ui/mauth-dialog";
import { Button } from "@/components/ui/button";

interface MauthConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

interface MauthPromptOptions {
  title: string;
  label: string;
  description?: ReactNode;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  requireValue?: boolean;
}

interface MauthAlertOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
}

interface MauthChoiceOption {
  value: string;
  label: string;
  destructive?: boolean;
}

interface MauthChoiceOptions {
  title: string;
  description?: ReactNode;
  options: MauthChoiceOption[];
  cancelLabel?: string;
}

export interface MauthDialogActions {
  confirm: (options: MauthConfirmOptions) => Promise<boolean>;
  prompt: (options: MauthPromptOptions) => Promise<string | null>;
  alert: (options: MauthAlertOptions) => Promise<void>;
  choose: (options: MauthChoiceOptions) => Promise<string | null>;
}

type DialogState =
  | ({ kind: "confirm" } & MauthConfirmOptions)
  | ({ kind: "prompt" } & MauthPromptOptions)
  | ({ kind: "alert" } & MauthAlertOptions)
  | ({ kind: "choice" } & MauthChoiceOptions);

function cancelValueForState(state: DialogState | null) {
  if (state?.kind === "confirm") return false;
  if (state?.kind === "prompt" || state?.kind === "choice") return null;
  return undefined;
}

export function useMauthDialogController(): MauthDialogActions & { dialogNode: ReactNode } {
  const [dialogState, setDialogState] = useState<DialogState | null>(null);
  const [promptValue, setPromptValue] = useState("");
  const resolverRef = useRef<((value: boolean | string | null | undefined) => void) | null>(null);
  const dialogStateRef = useRef<DialogState | null>(null);

  function settle(value: boolean | string | null | undefined) {
    resolverRef.current?.(value);
    resolverRef.current = null;
    dialogStateRef.current = null;
    setDialogState(null);
  }

  function openDialog(state: DialogState, resolver: (value: boolean | string | null | undefined) => void, initialPromptValue = "") {
    if (resolverRef.current) {
      resolverRef.current(cancelValueForState(dialogStateRef.current));
    }
    dialogStateRef.current = state;
    resolverRef.current = resolver;
    setPromptValue(initialPromptValue);
    setDialogState(state);
  }

  function confirm(options: MauthConfirmOptions) {
    return new Promise<boolean>((resolve) => {
      openDialog({ kind: "confirm", ...options }, (value) => resolve(Boolean(value)));
    });
  }

  function prompt(options: MauthPromptOptions) {
    return new Promise<string | null>((resolve) => {
      openDialog({ kind: "prompt", ...options }, (value) => resolve(typeof value === "string" ? value : null), options.defaultValue ?? "");
    });
  }

  function alert(options: MauthAlertOptions) {
    return new Promise<void>((resolve) => {
      openDialog({ kind: "alert", ...options }, () => resolve());
    });
  }

  function choose(options: MauthChoiceOptions) {
    return new Promise<string | null>((resolve) => {
      openDialog({ kind: "choice", ...options }, (value) => resolve(typeof value === "string" ? value : null));
    });
  }

  const dialogNode =
    dialogState === null ? null : dialogState.kind === "prompt" ? (
      <MauthDialog
        title={dialogState.title}
        description={dialogState.description}
        onClose={() => settle(null)}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => settle(null)}>
              {dialogState.cancelLabel ?? "Cancel"}
            </Button>
            <Button type="submit" form="mauth-prompt-dialog-form" disabled={dialogState.requireValue && !promptValue.trim()}>
              {dialogState.confirmLabel ?? "OK"}
            </Button>
          </>
        }
      >
        <form
          id="mauth-prompt-dialog-form"
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            settle(promptValue);
          }}
        >
          <label className="block text-sm font-medium" htmlFor="mauth-prompt-dialog-input">
            {dialogState.label}
          </label>
          <input
            id="mauth-prompt-dialog-input"
            value={promptValue}
            placeholder={dialogState.placeholder}
            onChange={(event) => setPromptValue(event.currentTarget.value)}
            className="h-10 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/25"
            autoFocus
          />
        </form>
      </MauthDialog>
    ) : dialogState.kind === "confirm" ? (
      <MauthDialog
        title={dialogState.title}
        description={dialogState.description}
        onClose={() => settle(false)}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => settle(false)}>
              {dialogState.cancelLabel ?? "Cancel"}
            </Button>
            <Button
              type="button"
              onClick={() => settle(true)}
              className={dialogState.destructive ? "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500" : undefined}
            >
              {dialogState.confirmLabel ?? "OK"}
            </Button>
          </>
        }
      />
    ) : dialogState.kind === "choice" ? (
      <MauthDialog
        title={dialogState.title}
        description={dialogState.description}
        onClose={() => settle(null)}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => settle(null)}>
              {dialogState.cancelLabel ?? "Cancel"}
            </Button>
            {dialogState.options.map((option) => (
              <Button
                key={option.value}
                type="button"
                onClick={() => settle(option.value)}
                className={option.destructive ? "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500" : undefined}
              >
                {option.label}
              </Button>
            ))}
          </>
        }
      />
    ) : (
      <MauthDialog
        title={dialogState.title}
        description={dialogState.description}
        onClose={() => settle(undefined)}
        footer={
          <Button type="button" onClick={() => settle(undefined)}>
            {dialogState.confirmLabel ?? "OK"}
          </Button>
        }
      />
    );

  return { confirm, prompt, alert, choose, dialogNode };
}
