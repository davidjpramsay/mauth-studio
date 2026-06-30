import { useDeferredValue, useLayoutEffect, useRef, useState } from "react";

import { solutionModeInsertedBlockVisibility, type SolutionInsertionBlockKind } from "@/lib/solutionBlockVisibility";

interface SolutionModeFrontMatter {
  titlePageTemplate?: string;
}

export function useSolutionModeController(frontMatter: SolutionModeFrontMatter) {
  const [showSolutions, setShowSolutions] = useState(false);
  const showSolutionsRef = useRef(showSolutions);
  const isNotesTemplate = frontMatter.titlePageTemplate === "notes";
  const supportsSolutionTools = !isNotesTemplate;
  const effectiveShowSolutions = supportsSolutionTools ? showSolutions : false;
  const previewShowSolutions = useDeferredValue(effectiveShowSolutions);
  const insertedBlockVisibilityForKind = (kind: SolutionInsertionBlockKind) =>
    solutionModeInsertedBlockVisibility(kind, effectiveShowSolutions);
  const printModeLabel = isNotesTemplate ? "Notes" : effectiveShowSolutions ? "Solutions" : "Student";
  const printModeTitle = isNotesTemplate
    ? "Print output is currently the notes copy."
    : effectiveShowSolutions
      ? "Print output is currently the solutions copy. Hide solutions before printing the student copy."
      : "Print output is currently the student copy. Show solutions before printing the solutions copy.";

  useLayoutEffect(() => {
    showSolutionsRef.current = showSolutions;
  }, [showSolutions]);

  return {
    showSolutions,
    setShowSolutions,
    showSolutionsRef,
    isNotesTemplate,
    supportsSolutionTools,
    effectiveShowSolutions,
    previewShowSolutions,
    insertedBlockVisibilityForKind,
    printModeLabel,
    printModeTitle,
  };
}
