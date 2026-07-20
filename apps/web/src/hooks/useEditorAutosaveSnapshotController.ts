import { useCallback, type MutableRefObject } from "react";

import { buildEditorAutosaveSnapshot, type EditorAutosaveSnapshot } from "@/lib/editorSessionSnapshots";

interface UseEditorAutosaveSnapshotControllerOptions<TFrontMatter, TQuestion, TSectionHeading, TDocumentFlow, TFormatting, TLogo> {
  frontMatterRef: MutableRefObject<TFrontMatter>;
  questionsRef: MutableRefObject<TQuestion[]>;
  sectionHeadingsRef: MutableRefObject<TSectionHeading[]>;
  documentFlowRef: MutableRefObject<TDocumentFlow[]>;
  formattingConfigRef: MutableRefObject<TFormatting>;
  logosRef: MutableRefObject<TLogo[]>;
  activeProjectFilePathRef: MutableRefObject<string | null>;
  activeProjectFileRevisionRef: MutableRefObject<number | null>;
  editorDocumentOpenRef: MutableRefObject<boolean>;
  selectLogo: (logos: TLogo[], frontMatter: TFrontMatter) => TLogo | undefined;
}

export function useEditorAutosaveSnapshotController<TFrontMatter, TQuestion, TSectionHeading, TDocumentFlow, TFormatting, TLogo>({
  frontMatterRef,
  questionsRef,
  sectionHeadingsRef,
  documentFlowRef,
  formattingConfigRef,
  logosRef,
  activeProjectFilePathRef,
  activeProjectFileRevisionRef,
  editorDocumentOpenRef,
  selectLogo,
}: UseEditorAutosaveSnapshotControllerOptions<TFrontMatter, TQuestion, TSectionHeading, TDocumentFlow, TFormatting, TLogo>) {
  return useCallback(
    (): EditorAutosaveSnapshot<TFrontMatter, TQuestion, TSectionHeading, TDocumentFlow, TFormatting, TLogo> =>
      buildEditorAutosaveSnapshot({
        document: {
          frontMatter: frontMatterRef.current,
          questions: questionsRef.current,
          sectionHeadings: sectionHeadingsRef.current,
          documentFlow: documentFlowRef.current,
          formattingConfig: formattingConfigRef.current,
          logo: selectLogo(logosRef.current, frontMatterRef.current),
        },
        file: {
          activeProjectFilePath: activeProjectFilePathRef.current,
          activeProjectFileRevision: activeProjectFileRevisionRef.current,
          documentOpen: editorDocumentOpenRef.current,
        },
      }),
    [
      activeProjectFilePathRef,
      activeProjectFileRevisionRef,
      documentFlowRef,
      editorDocumentOpenRef,
      formattingConfigRef,
      frontMatterRef,
      logosRef,
      questionsRef,
      sectionHeadingsRef,
      selectLogo,
    ],
  );
}
