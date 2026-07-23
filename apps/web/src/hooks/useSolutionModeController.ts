import { useDeferredValue, useLayoutEffect, useRef, useState } from "react";

import { solutionModeInsertedBlockVisibility, type SolutionInsertionBlockKind } from "@/lib/solutionBlockVisibility";

interface SolutionModeFrontMatter {
  titlePageTemplate?: string;
}

export function useSolutionModeController(frontMatter: SolutionModeFrontMatter) {
  const [showSolutions, setShowSolutions] = useState(false);
  const showSolutionsRef = useRef(showSolutions);
  const isNotesTemplate = frontMatter.titlePageTemplate === "notes";
  const isInvestigationTemplate = frontMatter.titlePageTemplate === "investigation";
  const supportsSolutionTools = !isNotesTemplate;
  const supportsSolutionValidation = supportsSolutionTools && !isInvestigationTemplate;
  const effectiveShowSolutions = supportsSolutionTools ? showSolutions : false;
  const previewShowSolutions = useDeferredValue(effectiveShowSolutions);
  const insertedBlockVisibilityForKind = (kind: SolutionInsertionBlockKind) =>
    solutionModeInsertedBlockVisibility(kind, effectiveShowSolutions);
  const studentModeLabel = "Student";
  const solutionModeLabel = isInvestigationTemplate ? "Teacher" : "Solutions";
  const printModeLabel = isNotesTemplate ? "Notes" : effectiveShowSolutions ? solutionModeLabel : studentModeLabel;
  const printModeTitle = isNotesTemplate
    ? "Print output is currently the notes copy."
    : isInvestigationTemplate
      ? effectiveShowSolutions
        ? "Print output includes the student brief and teacher rubric. Switch to Student to print only the student brief."
        : "Print output is currently the student investigation brief. Switch to Teacher to include the rubric."
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
    isInvestigationTemplate,
    supportsSolutionTools,
    supportsSolutionValidation,
    effectiveShowSolutions,
    previewShowSolutions,
    insertedBlockVisibilityForKind,
    printModeLabel,
    printModeTitle,
    studentModeLabel,
    solutionModeLabel,
  };
}
