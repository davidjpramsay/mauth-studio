import type { ComponentProps, ReactNode } from "react";

import { ActionProposalPanel } from "@/components/actions/ActionProposalPanel";
import { FileManagementDrawer } from "@/components/files/FileManagementDrawer";
import { NewTestDialog } from "@/components/new-document/NewTestDialog";
import { PaginatedTestPreview } from "@/components/preview/PaginatedTestPreview";
import { SolutionValidationPanel } from "@/components/solutions/SolutionValidationPanel";
import { SystemStatusPanel } from "@/components/system/SystemStatusPanel";
import { ContextMenu } from "@/components/ui/context-menu";

type SolutionValidationOverlayProps = ComponentProps<typeof SolutionValidationPanel> & {
  open: boolean;
};

type ActionProposalOverlayProps = ComponentProps<typeof ActionProposalPanel> & {
  open: boolean;
};

export interface AppOverlaysProps {
  fileManagement: ComponentProps<typeof FileManagementDrawer>;
  dialogNode: ReactNode;
  newTestDialog: ComponentProps<typeof NewTestDialog>;
  systemStatusPanel: ComponentProps<typeof SystemStatusPanel>;
  solutionValidationPanel: SolutionValidationOverlayProps;
  actionProposalPanel: ActionProposalOverlayProps;
  contextMenu: ComponentProps<typeof ContextMenu>;
  printPreview: ComponentProps<typeof PaginatedTestPreview> | null;
}

export function AppOverlays({
  fileManagement,
  dialogNode,
  newTestDialog,
  systemStatusPanel,
  solutionValidationPanel,
  actionProposalPanel,
  contextMenu,
  printPreview,
}: AppOverlaysProps) {
  const { open: solutionValidationOpen, ...solutionValidationProps } = solutionValidationPanel;
  const { open: actionProposalOpen, ...actionProposalProps } = actionProposalPanel;

  return (
    <>
      <FileManagementDrawer {...fileManagement} />
      {dialogNode}
      <NewTestDialog {...newTestDialog} />
      <SystemStatusPanel {...systemStatusPanel} />
      {solutionValidationOpen ? <SolutionValidationPanel {...solutionValidationProps} /> : null}
      {actionProposalOpen ? <ActionProposalPanel {...actionProposalProps} /> : null}
      <ContextMenu {...contextMenu} />
      {printPreview ? (
        <div className="print-preview-stage" aria-hidden="true">
          <PaginatedTestPreview {...printPreview} />
        </div>
      ) : null}
    </>
  );
}
