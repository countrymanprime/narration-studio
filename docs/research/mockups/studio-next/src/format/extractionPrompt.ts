import { VERIFY_BELOW } from '@/config/extraction'
import { CSV_COLUMNS, RECORDS } from './extractionImport'

const JSON_DESCRIPTION = `JSON: {"entries": [{"name", "type", "aliases": [], "description", "appears_in": [], "confidence",
  "properties": [{"key", "value", "evidence", "chapter", "paragraph", "confidence"}],
  "relationships": [{"to", "relation", "confidence"}],
  "claims": [{"kind": "talk" | "act" | "know", "text", "evidence", "chapter", "paragraph", "confidence"}]}],
 "speakers": [{"quote", "speaker", "paragraph", "confidence"}]}`

const csvDescription = (): string =>
  'CSV with this header row: ' + CSV_COLUMNS.join(',') + '\nOne record per row; record is one of ' + RECORDS.join(', ') + '. For property, relationship and claim rows, name is the entry they belong to; to is the other entry. List cells (aliases, appears_in) separate items with semicolons. Quote any cell that has a comma.'

/** Fill the template for one format. */
export function buildPrompt(template: string, format: 'json' | 'csv', example: string): string {
  return template
    .replace('{{FORMAT}}', format === 'json' ? 'JSON' : 'CSV')
    .replace('{{DESCRIPTION}}', format === 'json' ? JSON_DESCRIPTION : csvDescription())
    .replace('{{THRESHOLD}}', String(Math.round(VERIFY_BELOW * 100)))
    .replace('{{EXAMPLE}}', example)
}
