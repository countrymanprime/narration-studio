/**
 * The prompt the narrator can copy and paste, with the manuscript, into any LLM of their choice. {{...}} marks what the app fills in
 * from the format itself (format/extractionImport.ts), so the prompt and the importer cannot disagree.
 */
export const PROMPT_TEMPLATE = `You are helping an audiobook narrator prepare a Story Bible from a book manuscript.
Read the manuscript I paste after the line MANUSCRIPT and answer with {{FORMAT}} only, no commentary, in exactly this format.

{{DESCRIPTION}}

Rules:
- One entry for each character, place, item or event that matters. Put every other name for it in aliases.
- properties are facts about an entry (appearance, role, habits). claims say what a character says (talk), does (act) or knows (know).
- evidence is a short quote copied exactly, character for character, from the manuscript. Never paraphrase it. If you cannot quote it, leave evidence empty.
- paragraph and chapter are optional; give them if the manuscript numbers them.
- speakers: for quoted lines, give the quote exactly and who says it.
- confidence is a number from 0 to 1 for how sure you are. Be honest. Leave it empty if you do not know. The narrator checks anything under {{THRESHOLD}}%.
- Do not invent anything the manuscript does not say.

Example:
{{EXAMPLE}}

MANUSCRIPT
`
