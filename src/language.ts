import verbs from "./content/verbs.json";
export const subjects = ["je", "tu", "il", "nous", "vous", "ils"];
export function conjugate(id: string, person: number): string {
  const verb = verbs.find((v) => v.id === id);
  if (!verb || !Number.isInteger(person) || person < 0 || person > 5)
    throw new Error("Conjugaison inconnue");
  if (verb.forms) return verb.forms[person];
  const stem = verb.infinitive.slice(0, -2);
  return (
    stem +
    (verb.regular === "er"
      ? ["e", "es", "e", "ons", "ez", "ent"]
      : ["is", "is", "it", "issons", "issez", "issent"])[person]
  );
}
export function phrase(id: string, person: number): string {
  const form = conjugate(id, person);
  return person === 0 && /^[aeiouéèêh]/.test(form)
    ? `j’${form}`
    : `${subjects[person]} ${form}`;
}
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/œ/g, "oe")
    .replace(/[’']/g, "'")
    .replace(/\s*'\s*/g, "'")
    .trim()
    .replace(/\s+/g, " ");
}
export function checkAnswer(answer: string, expected: string) {
  return {
    correct: normalize(answer) === normalize(expected),
    accentNote:
      normalize(answer) === normalize(expected) &&
      answer.toLowerCase().replace(/'/g, "’").trim() !==
        expected.toLowerCase().trim(),
  };
}
