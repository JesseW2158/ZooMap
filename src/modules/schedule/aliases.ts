/**
 * Calendar location text that the generic matcher gets wrong or cannot see, checked first by
 * `resolvePlace`. Patterns run on normalised text (lower case, abbreviations expanded,
 * punctuation removed, room numbers kept). Add a line when a common location fails to resolve.
 */
export const LOCATION_ALIASES: [RegExp, string][] = [
  // Morrill Science Center wings: "Morrill Sci Ctr (II) 222", "Morrill 4 North 341"
  [/\bmorrill\b.*\b(iv|4)\s*(n|north)\b/, "w110428294"],
  [/\bmorrill\b.*\b(iv|4)\s*(s|south)\b/, "w1353190386"],
  [/\bmorrill\b.*\b(iv|4)\b/, "w110428294"],
  [/\bmorrill\b.*\b(iii|3)\b/, "w267026966"],
  [/\bmorrill\b.*\b(ii|2)\b/, "w131281207"],
  [/\bmorrill\b.*\b(i|1)\b/, "w267026965"],
  // Lederle: the tower vs the low-rise (rooms A–G are the low-rise)
  [/\blederle\b.*\b(tower|twr)\b|\blgrt\b/, "w122196717"],
  [/\blederle\b|\blgrc\b/, "w122196721"],
  // "Hasbrouck Lab Add 126", "Goessmann Lab Add 64": the Additions are part of the main building here
  [/\bhasbrouck\b/, "w110428293"],
  [/\bgoessmann\b/, "w51648973"],
  // "Engineering Lab II 119" vs "Engineering Lab 323"
  [/\b(engineering laboratory|elab)\s*(ii|2)\b/, "w149698363"],
  [/\b(engineering laboratory|elab)\b/, "w149698371"],
  [/\bintegrative learning\b|\bilc\b/, "w292876549"],
  [/\binteg\w* sciences?\b|\bisb\b/, "w217244017"],
  [/\bisenberg\b|\bschool of management\b/, "r17798539"],
  [/\bagricultural engineering\b/, "w304036835"],
  [/\bcampus center\b/, "w30698361"],
  [/\bstudent union\b/, "w30698362"],
  [/\bdu ?bois\b/, "r4054634"],
];

/** Abbreviations seen in SPIRE and Canvas locations, expanded before matching. */
export const ABBREVIATIONS: [RegExp, string][] = [
  [/\binteg\b/g, "integrative"],
  [/\bctr\b/g, "center"],
  [/\bcntr\b/g, "center"],
  [/\bbldg\b/g, "building"],
  [/\bbld\b/g, "building"],
  [/\bres\b/g, "research"],
  [/\bgrad\b/g, "graduate"],
  [/\bsci\b/g, "science"],
  [/\bsciences\b/g, "sciences"],
  [/\baud\b/g, "auditorium"],
  [/\bengin\b/g, "engineering"],
  [/\beng\b/g, "engineering"],
  [/\blab\b/g, "laboratory"],
  [/\blabs\b/g, "laboratories"],
  [/\bschl\b/g, "school"],
  [/\bmgmt\b/g, "management"],
  [/\bhl\b/g, "hall"],
  [/\bcomp sci\b/g, "computer science"],
  [/\bphys\b/g, "physical"],
  [/\btwr\b/g, "tower"],
];
