import type { ProjectFileSaveRequest } from "@mauth-studio/shared";

import type { EditorDocumentState } from "./editorApplicationRuntime.ts";
import { serializeProjectDocumentSnapshot, type ProjectDocumentSerializationRuntime } from "./projectDocumentSerialization.ts";
import { testFileDisplayName, testPathBasename } from "./projectFiles.ts";
import type { LogoAsset } from "./logoLibrary.ts";

export interface EditorProjectFileDuplicatePlan {
  filePath: string;
  request: ProjectFileSaveRequest;
  fingerprint: string;
}

export function createEditorProjectFileDuplicatePlan({
  targetFilePath,
  targetTestPath,
  document,
  logos,
  runtime,
}: {
  targetFilePath: string;
  targetTestPath: string;
  document: EditorDocumentState;
  logos: LogoAsset[];
  runtime: ProjectDocumentSerializationRuntime;
}): EditorProjectFileDuplicatePlan {
  const serialized = serializeProjectDocumentSnapshot({
    filePath: targetFilePath,
    testName: testFileDisplayName(testPathBasename(targetTestPath)),
    document,
    logos,
    runtime,
  });

  return {
    filePath: targetFilePath,
    request: {
      content: serialized.content,
      kind: "file",
      fileType: serialized.fileType,
      metadata: {
        format: "saved-test-json",
        source: "mauth-studio",
      },
    },
    fingerprint: serialized.fingerprint,
  };
}
