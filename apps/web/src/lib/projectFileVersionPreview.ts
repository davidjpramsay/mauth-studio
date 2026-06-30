import type { ProjectFileVersion } from "@mauth-studio/shared";

import { formatProjectFileSize } from "./projectFiles.ts";

export interface ProjectFileVersionPreviewSummary {
  kind: "test" | "raw";
  title: string;
  subtitle: string;
  details: string[];
  questions: string[];
  rawPreview: string;
}

interface VersionPreviewSubpartLike {
  contentBlocks: unknown[];
}

interface VersionPreviewPartLike {
  contentBlocks: unknown[];
  subparts: VersionPreviewSubpartLike[];
}

export interface VersionPreviewQuestionLike {
  marks?: unknown;
  contentBlocks: unknown[];
  parts: VersionPreviewPartLike[];
}

interface VersionPreviewSavedTestLike<TQuestion extends VersionPreviewQuestionLike> {
  name: string;
  frontMatter: {
    subjectTitle?: string;
    assessmentTitle?: string;
  };
  questions: TQuestion[];
}

export interface ProjectFileVersionPreviewOptions<TQuestion extends VersionPreviewQuestionLike> {
  parseSavedTest: (value: unknown) => VersionPreviewSavedTestLike<TQuestion> | null;
  questionMarks: (question: TQuestion) => number;
  formatCreatedAt?: (value: string) => string;
}

function defaultFormatCreatedAt(value: string) {
  return new Date(value).toLocaleString();
}

export function projectFileVersionRawPreview(content: string) {
  return content.length > 6000 ? `${content.slice(0, 6000)}\n...` : content;
}

export function buildProjectFileVersionPreview<TQuestion extends VersionPreviewQuestionLike>(
  version: ProjectFileVersion,
  { parseSavedTest, questionMarks, formatCreatedAt = defaultFormatCreatedAt }: ProjectFileVersionPreviewOptions<TQuestion>,
): ProjectFileVersionPreviewSummary {
  const rawPreview = projectFileVersionRawPreview(version.content);
  try {
    const parsed = JSON.parse(version.content) as unknown;
    const savedTest = parseSavedTest(parsed);
    if (!savedTest) throw new Error("Unsupported saved test");
    const totalMarks = savedTest.questions.reduce((sum, question) => sum + questionMarks(question), 0);
    return {
      kind: "test",
      title: savedTest.name || `Revision ${version.revision}`,
      subtitle: [savedTest.frontMatter.subjectTitle, savedTest.frontMatter.assessmentTitle].filter(Boolean).join(" - "),
      details: [
        `${savedTest.questions.length} question${savedTest.questions.length === 1 ? "" : "s"}`,
        `${totalMarks} mark${totalMarks === 1 ? "" : "s"}`,
        `Saved ${formatCreatedAt(version.createdAt)}`,
      ],
      questions: savedTest.questions.slice(0, 8).map((question, index) => {
        const marks = questionMarks(question);
        const partCount = question.parts.length;
        const blockCount =
          question.contentBlocks.length +
          question.parts.reduce(
            (partSum, part) =>
              partSum +
              part.contentBlocks.length +
              part.subparts.reduce((subpartSum, subpart) => subpartSum + subpart.contentBlocks.length, 0),
            0,
          );
        return `Question ${index + 1}: ${marks} mark${marks === 1 ? "" : "s"}, ${partCount || blockCount} ${
          partCount ? `part${partCount === 1 ? "" : "s"}` : `module${blockCount === 1 ? "" : "s"}`
        }`;
      }),
      rawPreview,
    };
  } catch {
    return {
      kind: "raw",
      title: `Revision ${version.revision}`,
      subtitle: version.fileType ? `${version.fileType} file` : "File snapshot",
      details: [`Saved ${formatCreatedAt(version.createdAt)}`, `${formatProjectFileSize(version.content.length)} text`],
      questions: [],
      rawPreview,
    };
  }
}
