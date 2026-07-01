import { STARTER_LOGOS } from "./logoLibrary.ts";

export type TitlePageTemplate = "standard" | "exam" | "worksheet" | "notes";

export type ExamSectionPresetId = "section-one-calculator-free" | "section-two-calculator-assumed";

export interface ExamStructureRowConfig {
  id: string;
  section: string;
  useCurrentDocument?: boolean;
  questionsAvailable: number;
  questionsToBeAnswered: number;
  workingTimeMinutes: number;
  marksAvailable: number;
  percentage: number;
}

export interface ExamTitlePageConfig {
  sectionPreset: ExamSectionPresetId;
  documentCode: string;
  authorityName: string;
  examHeading: string;
  bookletTitle: string;
  candidateLabelText: string;
  studentNumberLabel: string;
  studentNumberFiguresLabel: string;
  studentNumberWordsLabel: string;
  timeTitle: string;
  readingTimeLabel: string;
  readingTime: string;
  workingTimeLabel: string;
  workingTime: string;
  additionalBookletsLabel: string;
  materialsTitle: string;
  supervisorMaterialsTitle: string;
  supervisorMaterials: string;
  candidateMaterialsTitle: string;
  standardItemsLabel: string;
  standardItems: string;
  specialItemsLabel: string;
  specialItems: string;
  importantNoteTitle: string;
  importantNoteBody: string;
  referenceText: string;
  bookletCode: string;
  courseHeader: string;
  sectionHeader: string;
  structureTitle: string;
  structureRows: ExamStructureRowConfig[];
  instructionsTitle: string;
  instructionsBody: string;
  footerText: string;
  endOfQuestionsFooterText: string;
  supplementaryPageTitle: string;
  supplementaryQuestionNumberLabel: string;
  supplementaryPageCount: number;
}

export interface FrontMatterConfig {
  titlePageTemplate: TitlePageTemplate;
  logoId: string;
  schoolName: string;
  subjectTitle: string;
  assessmentTitle: string;
  nameLabel: string;
  markLabel: string;
  startQuestionNumber: number;
  showAssessmentSubtitle: boolean;
  assessmentSubtitle: string;
  showDeclaration: boolean;
  declarationTitle: string;
  declarationBody: string;
  signatureLabel: string;
  signatureRole: string;
  showInstructions: boolean;
  instructionsTitle: string;
  instructionsBody: string;
  exam?: ExamTitlePageConfig;
}

export const DEFAULT_FRONT_MATTER: FrontMatterConfig = {
  titlePageTemplate: "standard",
  logoId: STARTER_LOGOS[0].id,
  schoolName: "AUSTRALIAN\nCHRISTIAN COLLEGE",
  subjectTitle: "YEAR 10 MATHEMATICS",
  assessmentTitle: "TEST 2",
  nameLabel: "Name",
  markLabel: "Mark",
  startQuestionNumber: 1,
  showAssessmentSubtitle: false,
  assessmentSubtitle: "Calculator Free Section",
  showDeclaration: true,
  declarationTitle: "Parent/Guardian Declaration:",
  declarationBody:
    'I hereby confirm that the student named in this test has undertaken it according to the "Test Conditions" specified underneath, and that the completed assessment is the student\'s own work.',
  signatureLabel: "Signed:",
  signatureRole: "(parent/guardian)",
  showInstructions: true,
  instructionsTitle: "Test Conditions:",
  instructionsBody:
    "Time: 60 mins\n\n**All calculations** should be shown for full marks.\n\nPermitted items: ruler, pencils (or pens) and an eraser.\n\nStudents may use a scientific calculator.",
};

export const DEFAULT_EXAM_TITLE_PAGE: ExamTitlePageConfig = {
  sectionPreset: "section-one-calculator-free",
  documentCode: "",
  authorityName: "",
  examHeading: "Semester One Examination, 2021",
  bookletTitle: "Question/Answer booklet",
  candidateLabelText: "",
  studentNumberLabel: "NAME:",
  studentNumberFiguresLabel: "",
  studentNumberWordsLabel: "",
  timeTitle: "Time allowed for this section",
  readingTimeLabel: "Reading time before commencing work:",
  readingTime: "five minutes",
  workingTimeLabel: "Working time:",
  workingTime: "fifty minutes",
  additionalBookletsLabel: "Number of additional\nanswer booklets used\n(if applicable):",
  materialsTitle: "Materials required/recommended for this section",
  supervisorMaterialsTitle: "To be provided by the supervisor",
  supervisorMaterials: "This Question/Answer booklet\nFormula sheet",
  candidateMaterialsTitle: "To be provided by the candidate",
  standardItemsLabel: "Standard items:",
  standardItems:
    "pens (blue/black preferred), pencils (including coloured), sharpener,\ncorrection fluid/tape, eraser, ruler, highlighters",
  specialItemsLabel: "Special items:",
  specialItems: "nil",
  importantNoteTitle: "Important note to candidates",
  importantNoteBody:
    "No other items may be taken into the examination room. It is your responsibility to ensure that you do not have any unauthorised material. If you have any unauthorised material with you, hand it to the supervisor before reading any further.",
  referenceText: "",
  bookletCode: "",
  courseHeader: "METHODS UNIT 3",
  sectionHeader: "CALCULATOR-FREE",
  structureTitle: "Structure of this paper",
  structureRows: [
    {
      id: "section-one",
      section: "Section One:\nCalculator-free",
      useCurrentDocument: true,
      questionsAvailable: 9,
      questionsToBeAnswered: 9,
      workingTimeMinutes: 50,
      marksAvailable: 53,
      percentage: 35,
    },
    {
      id: "section-two",
      section: "Section Two:\nCalculator-assumed",
      useCurrentDocument: false,
      questionsAvailable: 12,
      questionsToBeAnswered: 12,
      workingTimeMinutes: 100,
      marksAvailable: 97,
      percentage: 65,
    },
  ],
  instructionsTitle: "Instructions to candidates",
  instructionsBody:
    "1. The rules for the conduct of the Western Australian external examinations are detailed in the Year 12 Information Handbook 2020: Part II Examinations. Sitting this examination implies that you agree to abide by these rules.\n\n2. Write your answers in this Question/Answer booklet preferably using a blue/black pen. Do not use erasable or gel pens.\n\n3. You must be careful to confine your answers to the specific questions asked and to follow any instructions that are specific to a particular question.\n\n4. Show all your working clearly. Your working should be in sufficient detail to allow your answers to be checked readily and for marks to be awarded for reasoning. Incorrect answers given without supporting reasoning cannot be allocated any marks. For any question or part question worth more than two marks, valid working or justification is required to receive full marks. If you repeat any question, ensure that you cancel the answer you do not wish to have marked.\n\n5. It is recommended that you do not use pencil, except in diagrams.\n\n6. Supplementary pages for planning/continuing your answers to questions are provided at the end of this Question/Answer booklet. If you use these pages to continue an answer, indicate at the original answer where the answer is continued, i.e. give the page number.\n\n7. The Formula sheet is not to be handed in with your Question/Answer booklet.",
  footerText: "See next page",
  endOfQuestionsFooterText: "End of questions",
  supplementaryPageTitle: "Supplementary page",
  supplementaryQuestionNumberLabel: "Question number:",
  supplementaryPageCount: 0,
};

export const DEFAULT_EXAM_FRONT_MATTER: FrontMatterConfig = {
  ...DEFAULT_FRONT_MATTER,
  titlePageTemplate: "exam",
  subjectTitle: "MATHEMATICS\nMETHODS\nUNIT 3",
  assessmentTitle: "Semester One Examination, 2021",
  showAssessmentSubtitle: true,
  assessmentSubtitle: "Section One:\nCalculator-free",
  showDeclaration: false,
  showInstructions: false,
  exam: DEFAULT_EXAM_TITLE_PAGE,
};

export const DEFAULT_WORKSHEET_FRONT_MATTER: FrontMatterConfig = {
  ...DEFAULT_FRONT_MATTER,
  titlePageTemplate: "worksheet",
  subjectTitle: "Mathematics",
  assessmentTitle: "Worksheet",
  showAssessmentSubtitle: false,
  assessmentSubtitle: "",
  showDeclaration: false,
  showInstructions: false,
};

export const DEFAULT_NOTES_FRONT_MATTER: FrontMatterConfig = {
  ...DEFAULT_FRONT_MATTER,
  titlePageTemplate: "notes",
  subjectTitle: "Mathematics",
  assessmentTitle: "Math Notes",
  nameLabel: "",
  markLabel: "",
  showAssessmentSubtitle: true,
  assessmentSubtitle: "Definitions, worked examples, diagrams, and reminders",
  showDeclaration: false,
  showInstructions: false,
};

export const EXAM_SECTION_PRESETS: Array<{
  id: ExamSectionPresetId;
  label: string;
  assessmentSubtitle: string;
  sectionHeader: string;
  readingTime: string;
  workingTime: string;
  startQuestionNumber: number;
  supervisorMaterials: string;
  specialItems: string;
  currentRowId: string;
}> = [
  {
    id: "section-one-calculator-free",
    label: "Section One: Calculator-free",
    assessmentSubtitle: "Section One:\nCalculator-free",
    sectionHeader: "CALCULATOR-FREE",
    readingTime: "five minutes",
    workingTime: "fifty minutes",
    startQuestionNumber: 1,
    supervisorMaterials: "This Question/Answer booklet\nFormula sheet",
    specialItems: "nil",
    currentRowId: "section-one",
  },
  {
    id: "section-two-calculator-assumed",
    label: "Section Two: Calculator-assumed",
    assessmentSubtitle: "Section Two:\nCalculator-assumed",
    sectionHeader: "CALCULATOR-ASSUMED",
    readingTime: "ten minutes",
    workingTime: "one hundred minutes",
    startQuestionNumber: 10,
    supervisorMaterials: "This Question/Answer booklet\nFormula sheet (retained from Section One)",
    specialItems:
      "drawing instruments, templates, notes on one unfolded sheet of A4 paper,\nand up to three calculators, which can include scientific, graphic and\nComputer Algebra System (CAS) calculators, are permitted in this ATAR\ncourse examination",
    currentRowId: "section-two",
  },
];

function id(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function assessmentTitleText(value: string) {
  return value
    .split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g)
    .map((segment) => (segment.startsWith("$") ? segment : segment.toUpperCase()))
    .join("");
}

export function titlePageTemplateFromValue(value: unknown): TitlePageTemplate {
  if (value === "exam" || value === "worksheet" || value === "notes") return value;
  return "standard";
}

export function titlePageTemplateLabel(template: TitlePageTemplate) {
  if (template === "exam") return "School exam booklet";
  if (template === "worksheet") return "Worksheet";
  if (template === "notes") return "Math notes";
  return "School test title page";
}

function stringOrDefault(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

export function nonNegativeNumberOrDefault(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : fallback;
}

export function examSectionPresetFromValue(
  value: unknown,
  fallback: ExamSectionPresetId = "section-one-calculator-free",
): ExamSectionPresetId {
  return EXAM_SECTION_PRESETS.some((preset) => preset.id === value) ? (value as ExamSectionPresetId) : fallback;
}

function inferExamSectionPreset(record: Record<string, unknown> | null | undefined): ExamSectionPresetId {
  const stored = examSectionPresetFromValue(record?.sectionPreset, "section-one-calculator-free");
  if (EXAM_SECTION_PRESETS.some((preset) => preset.id === record?.sectionPreset)) return stored;

  const sectionHeader = typeof record?.sectionHeader === "string" ? record.sectionHeader.toLowerCase() : "";
  const assessmentSubtitle = typeof record?.assessmentSubtitle === "string" ? record.assessmentSubtitle.toLowerCase() : "";
  const combined = `${sectionHeader} ${assessmentSubtitle}`;
  return combined.includes("assumed") || combined.includes("section two") ? "section-two-calculator-assumed" : stored;
}

export function examSectionPresetById(sectionPresetId: ExamSectionPresetId) {
  return EXAM_SECTION_PRESETS.find((preset) => preset.id === sectionPresetId) ?? EXAM_SECTION_PRESETS[0];
}

export function examStructureRowsForSectionPreset(sectionPresetId: ExamSectionPresetId): ExamStructureRowConfig[] {
  const preset = examSectionPresetById(sectionPresetId);
  return DEFAULT_EXAM_TITLE_PAGE.structureRows.map((row) => ({
    ...row,
    useCurrentDocument: row.id === preset.currentRowId,
  }));
}

export function examSectionPresetPatch(exam: ExamTitlePageConfig, sectionPresetId: ExamSectionPresetId): Partial<FrontMatterConfig> {
  const preset = examSectionPresetById(sectionPresetId);
  return {
    startQuestionNumber: preset.startQuestionNumber,
    showAssessmentSubtitle: true,
    assessmentSubtitle: preset.assessmentSubtitle,
    exam: {
      ...exam,
      sectionPreset: preset.id,
      sectionHeader: preset.sectionHeader,
      readingTime: preset.readingTime,
      workingTime: preset.workingTime,
      supervisorMaterials: preset.supervisorMaterials,
      specialItems: preset.specialItems,
      structureRows: examStructureRowsForSectionPreset(preset.id),
    },
  };
}

function normalizeExamStructureRow(value: unknown, fallback: ExamStructureRowConfig): ExamStructureRowConfig {
  const record = asRecord(value);
  return {
    id: stringOrDefault(record?.id, fallback.id || id("exam-section")),
    section: stringOrDefault(record?.section, fallback.section),
    useCurrentDocument: typeof record?.useCurrentDocument === "boolean" ? record.useCurrentDocument : fallback.useCurrentDocument,
    questionsAvailable: nonNegativeNumberOrDefault(record?.questionsAvailable, fallback.questionsAvailable),
    questionsToBeAnswered: nonNegativeNumberOrDefault(record?.questionsToBeAnswered, fallback.questionsToBeAnswered),
    workingTimeMinutes: nonNegativeNumberOrDefault(record?.workingTimeMinutes, fallback.workingTimeMinutes),
    marksAvailable: nonNegativeNumberOrDefault(record?.marksAvailable, fallback.marksAvailable),
    percentage: nonNegativeNumberOrDefault(record?.percentage, fallback.percentage),
  };
}

export function normalizeExamTitlePage(value: unknown): ExamTitlePageConfig {
  const record = asRecord(value);
  const defaultRows = DEFAULT_EXAM_TITLE_PAGE.structureRows;
  const sourceRows = Array.isArray(record?.structureRows) && record.structureRows.length ? record.structureRows : defaultRows;
  const structureRows = sourceRows.map((row, index) => normalizeExamStructureRow(row, defaultRows[index] ?? defaultRows[0]));

  return {
    sectionPreset: inferExamSectionPreset(record),
    documentCode: stringOrDefault(record?.documentCode, DEFAULT_EXAM_TITLE_PAGE.documentCode),
    authorityName: stringOrDefault(record?.authorityName, DEFAULT_EXAM_TITLE_PAGE.authorityName),
    examHeading: stringOrDefault(record?.examHeading, DEFAULT_EXAM_TITLE_PAGE.examHeading),
    bookletTitle: stringOrDefault(record?.bookletTitle, DEFAULT_EXAM_TITLE_PAGE.bookletTitle),
    candidateLabelText: stringOrDefault(record?.candidateLabelText, DEFAULT_EXAM_TITLE_PAGE.candidateLabelText),
    studentNumberLabel: stringOrDefault(record?.studentNumberLabel, DEFAULT_EXAM_TITLE_PAGE.studentNumberLabel),
    studentNumberFiguresLabel: stringOrDefault(record?.studentNumberFiguresLabel, DEFAULT_EXAM_TITLE_PAGE.studentNumberFiguresLabel),
    studentNumberWordsLabel: stringOrDefault(record?.studentNumberWordsLabel, DEFAULT_EXAM_TITLE_PAGE.studentNumberWordsLabel),
    timeTitle: stringOrDefault(record?.timeTitle, DEFAULT_EXAM_TITLE_PAGE.timeTitle),
    readingTimeLabel: stringOrDefault(record?.readingTimeLabel, DEFAULT_EXAM_TITLE_PAGE.readingTimeLabel),
    readingTime: stringOrDefault(record?.readingTime, DEFAULT_EXAM_TITLE_PAGE.readingTime),
    workingTimeLabel: stringOrDefault(record?.workingTimeLabel, DEFAULT_EXAM_TITLE_PAGE.workingTimeLabel),
    workingTime: stringOrDefault(record?.workingTime, DEFAULT_EXAM_TITLE_PAGE.workingTime),
    additionalBookletsLabel: stringOrDefault(record?.additionalBookletsLabel, DEFAULT_EXAM_TITLE_PAGE.additionalBookletsLabel),
    materialsTitle: stringOrDefault(record?.materialsTitle, DEFAULT_EXAM_TITLE_PAGE.materialsTitle),
    supervisorMaterialsTitle: stringOrDefault(record?.supervisorMaterialsTitle, DEFAULT_EXAM_TITLE_PAGE.supervisorMaterialsTitle),
    supervisorMaterials: stringOrDefault(record?.supervisorMaterials, DEFAULT_EXAM_TITLE_PAGE.supervisorMaterials),
    candidateMaterialsTitle: stringOrDefault(record?.candidateMaterialsTitle, DEFAULT_EXAM_TITLE_PAGE.candidateMaterialsTitle),
    standardItemsLabel: stringOrDefault(record?.standardItemsLabel, DEFAULT_EXAM_TITLE_PAGE.standardItemsLabel),
    standardItems: stringOrDefault(record?.standardItems, DEFAULT_EXAM_TITLE_PAGE.standardItems),
    specialItemsLabel: stringOrDefault(record?.specialItemsLabel, DEFAULT_EXAM_TITLE_PAGE.specialItemsLabel),
    specialItems: stringOrDefault(record?.specialItems, DEFAULT_EXAM_TITLE_PAGE.specialItems),
    importantNoteTitle: stringOrDefault(record?.importantNoteTitle, DEFAULT_EXAM_TITLE_PAGE.importantNoteTitle),
    importantNoteBody: stringOrDefault(record?.importantNoteBody, DEFAULT_EXAM_TITLE_PAGE.importantNoteBody),
    referenceText: stringOrDefault(record?.referenceText, DEFAULT_EXAM_TITLE_PAGE.referenceText),
    bookletCode: stringOrDefault(record?.bookletCode, DEFAULT_EXAM_TITLE_PAGE.bookletCode),
    courseHeader: stringOrDefault(record?.courseHeader, DEFAULT_EXAM_TITLE_PAGE.courseHeader),
    sectionHeader: stringOrDefault(record?.sectionHeader, DEFAULT_EXAM_TITLE_PAGE.sectionHeader),
    structureTitle: stringOrDefault(record?.structureTitle, DEFAULT_EXAM_TITLE_PAGE.structureTitle),
    structureRows,
    instructionsTitle: stringOrDefault(record?.instructionsTitle, DEFAULT_EXAM_TITLE_PAGE.instructionsTitle),
    instructionsBody: stringOrDefault(record?.instructionsBody, DEFAULT_EXAM_TITLE_PAGE.instructionsBody),
    footerText: stringOrDefault(record?.footerText, DEFAULT_EXAM_TITLE_PAGE.footerText),
    endOfQuestionsFooterText: stringOrDefault(record?.endOfQuestionsFooterText, DEFAULT_EXAM_TITLE_PAGE.endOfQuestionsFooterText),
    supplementaryPageTitle: stringOrDefault(record?.supplementaryPageTitle, DEFAULT_EXAM_TITLE_PAGE.supplementaryPageTitle),
    supplementaryQuestionNumberLabel: stringOrDefault(
      record?.supplementaryQuestionNumberLabel,
      DEFAULT_EXAM_TITLE_PAGE.supplementaryQuestionNumberLabel,
    ),
    supplementaryPageCount: nonNegativeNumberOrDefault(record?.supplementaryPageCount, DEFAULT_EXAM_TITLE_PAGE.supplementaryPageCount),
  };
}

export function normalizeFrontMatter(value: unknown): FrontMatterConfig | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<FrontMatterConfig> & { showSectionHeading?: unknown; sectionHeading?: unknown };
  const startQuestionNumber =
    typeof candidate.startQuestionNumber === "number" && Number.isFinite(candidate.startQuestionNumber)
      ? Math.max(1, Math.floor(candidate.startQuestionNumber))
      : DEFAULT_FRONT_MATTER.startQuestionNumber;
  const showAssessmentSubtitle =
    typeof candidate.showAssessmentSubtitle === "boolean"
      ? candidate.showAssessmentSubtitle
      : typeof candidate.showSectionHeading === "boolean"
        ? candidate.showSectionHeading
        : DEFAULT_FRONT_MATTER.showAssessmentSubtitle;
  const assessmentSubtitle =
    typeof candidate.assessmentSubtitle === "string"
      ? candidate.assessmentSubtitle
      : typeof candidate.sectionHeading === "string"
        ? candidate.sectionHeading
        : DEFAULT_FRONT_MATTER.assessmentSubtitle;
  const titlePageTemplate = titlePageTemplateFromValue(candidate.titlePageTemplate);
  const rawAssessmentTitle =
    typeof candidate.assessmentTitle === "string" ? candidate.assessmentTitle : DEFAULT_FRONT_MATTER.assessmentTitle;
  return {
    titlePageTemplate,
    logoId: typeof candidate.logoId === "string" ? candidate.logoId : DEFAULT_FRONT_MATTER.logoId,
    schoolName: typeof candidate.schoolName === "string" ? candidate.schoolName : DEFAULT_FRONT_MATTER.schoolName,
    subjectTitle: typeof candidate.subjectTitle === "string" ? candidate.subjectTitle : DEFAULT_FRONT_MATTER.subjectTitle,
    assessmentTitle:
      titlePageTemplate === "worksheet" || titlePageTemplate === "notes" ? rawAssessmentTitle : assessmentTitleText(rawAssessmentTitle),
    nameLabel: typeof candidate.nameLabel === "string" ? candidate.nameLabel : DEFAULT_FRONT_MATTER.nameLabel,
    markLabel: typeof candidate.markLabel === "string" ? candidate.markLabel : DEFAULT_FRONT_MATTER.markLabel,
    startQuestionNumber,
    showAssessmentSubtitle,
    assessmentSubtitle,
    showDeclaration: typeof candidate.showDeclaration === "boolean" ? candidate.showDeclaration : DEFAULT_FRONT_MATTER.showDeclaration,
    declarationTitle: typeof candidate.declarationTitle === "string" ? candidate.declarationTitle : DEFAULT_FRONT_MATTER.declarationTitle,
    declarationBody: typeof candidate.declarationBody === "string" ? candidate.declarationBody : DEFAULT_FRONT_MATTER.declarationBody,
    signatureLabel: typeof candidate.signatureLabel === "string" ? candidate.signatureLabel : DEFAULT_FRONT_MATTER.signatureLabel,
    signatureRole: typeof candidate.signatureRole === "string" ? candidate.signatureRole : DEFAULT_FRONT_MATTER.signatureRole,
    showInstructions: typeof candidate.showInstructions === "boolean" ? candidate.showInstructions : DEFAULT_FRONT_MATTER.showInstructions,
    instructionsTitle:
      typeof candidate.instructionsTitle === "string" ? candidate.instructionsTitle : DEFAULT_FRONT_MATTER.instructionsTitle,
    instructionsBody: typeof candidate.instructionsBody === "string" ? candidate.instructionsBody : DEFAULT_FRONT_MATTER.instructionsBody,
    ...(titlePageTemplate === "exam" || candidate.exam ? { exam: normalizeExamTitlePage(candidate.exam) } : {}),
  };
}
