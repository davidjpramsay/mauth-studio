export interface EditorSessionDocumentState<TFrontMatter, TQuestion, TSectionHeading, TDocumentFlow, TFormatting, TLogo> {
  frontMatter: TFrontMatter;
  questions: TQuestion[];
  sectionHeadings: TSectionHeading[];
  documentFlow: TDocumentFlow[];
  formattingConfig: TFormatting;
  logo?: TLogo;
}

export interface EditorSessionFileState {
  activeProjectFilePath?: string | null;
  activeProjectFileRevision?: number | null;
  documentOpen: boolean;
}

export type EditorAutosaveSnapshot<TFrontMatter, TQuestion, TSectionHeading, TDocumentFlow, TFormatting, TLogo> =
  EditorSessionDocumentState<TFrontMatter, TQuestion, TSectionHeading, TDocumentFlow, TFormatting, TLogo> & {
    activeProjectFilePath?: string;
    activeProjectFileRevision?: number;
    documentOpen: boolean;
  };

export function buildEditorAutosaveSnapshot<TFrontMatter, TQuestion, TSectionHeading, TDocumentFlow, TFormatting, TLogo>({
  document,
  file,
}: {
  document: EditorSessionDocumentState<TFrontMatter, TQuestion, TSectionHeading, TDocumentFlow, TFormatting, TLogo>;
  file: EditorSessionFileState;
}): EditorAutosaveSnapshot<TFrontMatter, TQuestion, TSectionHeading, TDocumentFlow, TFormatting, TLogo> {
  return {
    frontMatter: document.frontMatter,
    questions: document.questions,
    sectionHeadings: document.sectionHeadings,
    documentFlow: document.documentFlow,
    formattingConfig: document.formattingConfig,
    activeProjectFilePath: file.activeProjectFilePath ?? undefined,
    activeProjectFileRevision: file.activeProjectFileRevision ?? undefined,
    documentOpen: file.documentOpen,
    logo: document.logo,
  };
}

export function editorDraftChangeKey({
  documentOpen,
  activeProjectFilePath,
  activeProjectFileRevision,
  documentFingerprint,
}: EditorSessionFileState & { documentFingerprint: string }) {
  return `${documentOpen ? "open" : "closed"}|${activeProjectFilePath ?? ""}|${activeProjectFileRevision ?? ""}|${documentFingerprint}`;
}
