/**
 * What kind of thing a calendar title is, from its words. Canvas titles look like
 * "Midterm 2 [MATH 132]", "Final Project Proposal", "HW 7", "Reading Quiz 4".
 * - `exam`: midterm, final, exam, prelim, test. Reminded a week, 3 days and a day before.
 * - `quiz`: smaller, reminded the day before.
 * - `project`: project, paper, essay, presentation, report, proposal, portfolio.
 * - `assignment`: anything else that is due.
 * - null: not something to prepare for (a class, a plan).
 */
export type WorkKind = "exam" | "quiz" | "project" | "assignment";

const PROJECT = /\b(projects?|papers?|essays?|presentations?|reports?|proposals?|portfolios?|thesis|capstone)\b/;
const QUIZ = /\b(quiz(?:zes)?)\b/;
const EXAM = /\b(mid-?terms?|finals?|exams?|examinations?|prelims?|tests?)\b/;
// "test" in titles like "Unit testing lab" or "Test-driven development" is not an exam
const NOT_EXAM = /\b(testing|test-driven|test cases?|practice exam|exam review|review session)\b/;

export function classifyTitle(title: string, isDeadline: boolean): WorkKind | null {
  const t = title.toLowerCase();
  if (PROJECT.test(t)) return "project";
  if (QUIZ.test(t)) return "quiz";
  if (EXAM.test(t) && !NOT_EXAM.test(t)) return "exam";
  return isDeadline ? "assignment" : null;
}
