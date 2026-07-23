import assert from "node:assert/strict";
import test from "node:test";

import type { FormattingConfig } from "@mauth-studio/shared";

import type { CreateSavedTestSnapshotOptions, SavedTest } from "./editorAppPersistence.ts";
import type { DocumentFlowItem, DocumentSectionHeading, QuestionBlock } from "./editorDocumentNormalization.ts";
import { DEFAULT_FORMATTING_CONFIG } from "./editorFormattingConfig.ts";
import { DEFAULT_FRONT_MATTER, type FrontMatterConfig } from "./frontMatterConfig.ts";
import type { LogoAsset } from "./logoLibrary.ts";
import {
  defaultProjectFileNameForDocument,
  fingerprintProjectDocument,
  MAUTH_DOCUMENT_FORMAT,
  MAUTH_DOCUMENT_SCHEMA_VERSION,
  parseProjectSavedDocument,
  parseProjectSavedDocumentSafely,
  serializeProjectDocumentSnapshot,
} from "./projectDocumentSerialization.ts";

function question(id: string): QuestionBlock {
  return {
    id,
    section: "Algebra",
    text: "",
    marks: 0,
    contentBlocks: [],
    parts: [],
    itemOrder: [],
  };
}

function savedTestFromOptions(options: CreateSavedTestSnapshotOptions): SavedTest {
  return {
    id: options.testId,
    name: options.name,
    frontMatter: options.frontMatter,
    questions: options.questions,
    sectionHeadings: options.sectionHeadings ?? [],
    documentFlow: options.documentFlow ?? [],
    formattingConfig: options.formattingConfig,
    logo: options.logo,
    createdAt: options.createdAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

test("defaultProjectFileNameForDocument uses the active project file basename", () => {
  assert.equal(
    defaultProjectFileNameForDocument("tests/Year 10/Test 4.test.json", {
      ...DEFAULT_FRONT_MATTER,
      subjectTitle: "Fallback",
      assessmentTitle: "Name",
    }),
    "Test 4",
  );
  assert.equal(
    defaultProjectFileNameForDocument("tests/Year 10/Test 5.mauth", {
      ...DEFAULT_FRONT_MATTER,
      subjectTitle: "Fallback",
      assessmentTitle: "Name",
    }),
    "Test 5",
  );
});

test("defaultProjectFileNameForDocument falls back to front matter outside project tests", () => {
  assert.equal(
    defaultProjectFileNameForDocument("assets/logo.svg", {
      ...DEFAULT_FRONT_MATTER,
      subjectTitle: "Mathematics",
      assessmentTitle: "Revision",
    }),
    "Mathematics - Revision",
  );
});

test("serializeProjectDocumentSnapshot saves normalized formatting, selected logo, file type, and fingerprint", () => {
  const frontMatter: FrontMatterConfig = {
    ...DEFAULT_FRONT_MATTER,
    titlePageTemplate: "worksheet",
    logoId: "school-logo",
  };
  const questions = [question("q1")];
  const sectionHeadings: DocumentSectionHeading[] = [{ id: "h1", title: "Section A" }];
  const documentFlow: DocumentFlowItem[] = [
    { kind: "sectionHeading", id: "h1" },
    { kind: "question", id: "q1" },
  ];
  const logos: LogoAsset[] = [
    { id: "other-logo", name: "Other", src: "/other.svg" },
    { id: "school-logo", name: "School", src: "/school.svg", schoolName: "SCHOOL" },
  ];
  const formattingConfig = {
    id: "worksheet",
    showMarks: "invalid",
    page: { heightPx: 777, widthPx: "invalid" },
  } as unknown as FormattingConfig;

  let savedOptions: CreateSavedTestSnapshotOptions | undefined;
  let fingerprintInput:
    | {
        frontMatter: FrontMatterConfig;
        questions: QuestionBlock[];
        formattingConfig: FormattingConfig;
        logo?: LogoAsset | null;
        sectionHeadings?: DocumentSectionHeading[];
        documentFlow?: DocumentFlowItem[];
      }
    | undefined;

  const result = serializeProjectDocumentSnapshot({
    filePath: "tests/Worksheet.test.json",
    testName: "Worksheet",
    document: { frontMatter, questions, sectionHeadings, documentFlow, formattingConfig },
    logos,
    runtime: {
      createSavedTestSnapshot: (options) => {
        savedOptions = options;
        return savedTestFromOptions(options);
      },
      editorDocumentFingerprint: (nextFrontMatter, nextQuestions, nextFormattingConfig, logo, nextSectionHeadings, nextDocumentFlow) => {
        fingerprintInput = {
          frontMatter: nextFrontMatter,
          questions: nextQuestions,
          formattingConfig: nextFormattingConfig,
          logo,
          sectionHeadings: nextSectionHeadings,
          documentFlow: nextDocumentFlow,
        };
        return "fingerprint";
      },
    },
  });

  assert.equal(result.fileType, "worksheet");
  assert.equal(result.fingerprint, "fingerprint");
  assert.equal(savedOptions?.testId, "project-file:tests/Worksheet.test.json");
  assert.equal(savedOptions?.name, "Worksheet");
  assert.deepEqual(savedOptions?.logo, logos[1]);
  assert.equal(savedOptions?.formattingConfig.showMarks, DEFAULT_FORMATTING_CONFIG.showMarks);
  assert.equal(savedOptions?.formattingConfig.page?.heightPx, 777);
  assert.equal(savedOptions?.formattingConfig.page?.widthPx, DEFAULT_FORMATTING_CONFIG.page?.widthPx);
  assert.deepEqual(fingerprintInput?.formattingConfig, savedOptions?.formattingConfig);
  assert.deepEqual(fingerprintInput?.logo, logos[1]);
  assert.deepEqual(fingerprintInput?.sectionHeadings, sectionHeadings);
  assert.deepEqual(fingerprintInput?.documentFlow, documentFlow);

  const parsed = JSON.parse(result.content) as SavedTest & { format: string; schemaVersion: number };
  assert.equal(parsed.format, MAUTH_DOCUMENT_FORMAT);
  assert.equal(parsed.schemaVersion, MAUTH_DOCUMENT_SCHEMA_VERSION);
  assert.equal(parsed.id, "project-file:tests/Worksheet.test.json");
  assert.equal(parsed.name, "Worksheet");
  assert.equal(parsed.formattingConfig.page?.heightPx, 777);
});

test("parseProjectSavedDocument parses content before normalizing", () => {
  const parsed = parseProjectSavedDocument('{"id":"saved"}', (value) => ({ id: (value as { id: string }).id }) as SavedTest);

  assert.equal(parsed?.id, "saved");
});

test("parseProjectSavedDocument passes null for empty content", () => {
  const parsed = parseProjectSavedDocument("", (value) => {
    assert.equal(value, null);
    return null;
  });

  assert.equal(parsed, null);
});

test("parseProjectSavedDocumentSafely returns null for empty and invalid content", () => {
  assert.equal(
    parseProjectSavedDocumentSafely("", () => savedTestFromOptions(baseSavedOptions())),
    null,
  );
  assert.equal(
    parseProjectSavedDocumentSafely("{", () => savedTestFromOptions(baseSavedOptions())),
    null,
  );
});

test("parseProjectSavedDocumentSafely returns normalized saved documents", () => {
  const parsed = parseProjectSavedDocumentSafely('{"id":"saved"}', (value) => ({ id: (value as { id: string }).id }) as SavedTest);

  assert.equal(parsed?.id, "saved");
});

test("fingerprintProjectDocument uses an explicit saved logo before the active library logo", () => {
  const explicitLogo: LogoAsset = { id: "saved-logo", name: "Saved", src: "/saved.svg" };
  const libraryLogo: LogoAsset = { id: "library-logo", name: "Library", src: "/library.svg" };
  const frontMatter: FrontMatterConfig = { ...DEFAULT_FRONT_MATTER, logoId: "library-logo" };
  const questions = [question("q1")];
  const sectionHeadings: DocumentSectionHeading[] = [{ id: "h1", title: "Section A" }];
  const documentFlow: DocumentFlowItem[] = [
    { kind: "sectionHeading", id: "h1" },
    { kind: "question", id: "q1" },
  ];

  let receivedLogo: LogoAsset | null | undefined;
  const fingerprint = fingerprintProjectDocument({
    document: {
      frontMatter,
      questions,
      sectionHeadings,
      documentFlow,
      formattingConfig: DEFAULT_FORMATTING_CONFIG,
      logo: explicitLogo,
    },
    logos: [libraryLogo],
    runtime: {
      editorDocumentFingerprint: (_frontMatter, _questions, _formattingConfig, logo) => {
        receivedLogo = logo;
        return "fingerprint";
      },
    },
  });

  assert.equal(fingerprint, "fingerprint");
  assert.deepEqual(receivedLogo, explicitLogo);
});

test("fingerprintProjectDocument falls back to the selected logo for document front matter", () => {
  const libraryLogo: LogoAsset = { id: "library-logo", name: "Library", src: "/library.svg" };
  const frontMatter: FrontMatterConfig = { ...DEFAULT_FRONT_MATTER, logoId: "library-logo" };
  let receivedLogo: LogoAsset | null | undefined;

  fingerprintProjectDocument({
    document: {
      frontMatter,
      questions: [question("q1")],
      sectionHeadings: [],
      documentFlow: [{ kind: "question", id: "q1" }],
      formattingConfig: DEFAULT_FORMATTING_CONFIG,
    },
    logos: [libraryLogo],
    runtime: {
      editorDocumentFingerprint: (_frontMatter, _questions, _formattingConfig, logo) => {
        receivedLogo = logo;
        return "fingerprint";
      },
    },
  });

  assert.deepEqual(receivedLogo, libraryLogo);
});

function baseSavedOptions(): CreateSavedTestSnapshotOptions {
  return {
    testId: "saved-test",
    name: "Saved Test",
    frontMatter: DEFAULT_FRONT_MATTER,
    questions: [question("q1")],
    formattingConfig: DEFAULT_FORMATTING_CONFIG,
  };
}
