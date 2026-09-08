import { useState } from "react";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MauthDialog } from "@/components/ui/mauth-dialog";

export interface FailedDocumentOpen {
  path: string;
  external: boolean;
  message: string;
}

export function DocumentOpenErrorDialog({
  request,
  onRetry,
  onDismiss,
}: {
  request: FailedDocumentOpen;
  onRetry: () => Promise<boolean>;
  onDismiss: () => void;
}) {
  const [retrying, setRetrying] = useState(false);
  return (
    <MauthDialog
      title="Document not opened"
      onClose={onDismiss}
      footer={
        <>
          <Button variant="ghost" onClick={onDismiss}>
            Keep current documents
          </Button>
          <Button
            disabled={retrying}
            onClick={async () => {
              setRetrying(true);
              try {
                if (await onRetry()) onDismiss();
              } finally {
                setRetrying(false);
              }
            }}
          >
            <RotateCw />
            {retrying ? "Retrying..." : "Retry"}
          </Button>
        </>
      }
    >
      <div role="alert" className="space-y-3 text-sm leading-6">
        <p className="break-words font-semibold">{request.path.split(/[\\/]/).pop()}</p>
        <p>{request.message}</p>
        <p className="text-muted-foreground">
          The assessment behind this message is your previous document, not the requested file. Your tabs and unsaved work are still open.
        </p>
        <details className="text-muted-foreground">
          <summary>File location</summary>
          <p className="mt-2 break-all">{request.path}</p>
        </details>
      </div>
    </MauthDialog>
  );
}
