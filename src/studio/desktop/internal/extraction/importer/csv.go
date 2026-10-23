package importer

import (
	"fmt"
	"strings"
)

// refusal is an error whose text is the sentence the narrator reads.
type refusal string

func (r refusal) Error() string { return string(r) }

type record struct {
	line  int
	cells []string
}

// tokenize reads RFC 4180 text: quoted cells may hold the delimiter, doubled quotes and line breaks. Each record keeps the
// line it started on, and blank records are dropped. It stops with an error at the first oversized cell or too many records.
func tokenize(s string, delim byte) ([]record, error) {
	var rows []record
	var cells []string
	var cell strings.Builder
	quoted := false
	line, start := 1, 1
	endCell := func() error {
		if cell.Len() > MaxFieldBytes {
			return refusal(fmt.Sprintf("A cell on line %d is over the %d KB limit for one field.", start, MaxFieldBytes/1024))
		}
		cells = append(cells, cell.String())
		cell.Reset()
		return nil
	}
	endRow := func() error {
		if err := endCell(); err != nil {
			return err
		}
		for _, c := range cells {
			if strings.TrimSpace(c) != "" {
				if len(rows) >= MaxRows+1 {
					return refusal(fmt.Sprintf("The sheet has more than %d rows.", MaxRows))
				}
				rows = append(rows, record{start, cells})
				break
			}
		}
		cells = nil
		return nil
	}
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case quoted:
			switch {
			case c == '"' && i+1 < len(s) && s[i+1] == '"':
				cell.WriteByte('"')
				i++
			case c == '"':
				quoted = false
			default:
				cell.WriteByte(c)
				if c == '\n' {
					line++
				}
			}
			if cell.Len() > MaxFieldBytes {
				return nil, refusal(fmt.Sprintf("A cell on line %d is over the %d KB limit for one field.", start, MaxFieldBytes/1024))
			}
		case c == '"' && cell.Len() == 0:
			quoted = true
		case c == delim:
			if err := endCell(); err != nil {
				return nil, err
			}
		case c == '\n' || c == '\r':
			if c == '\r' && i+1 < len(s) && s[i+1] == '\n' {
				i++
			}
			if err := endRow(); err != nil {
				return nil, err
			}
			line++
			start = line
		default:
			cell.WriteByte(c)
		}
	}
	if cell.Len() > 0 || len(cells) > 0 {
		if err := endRow(); err != nil {
			return nil, err
		}
	}
	return rows, nil
}

// sniffDelimiter picks the comma, semicolon or tab that splits the first line into the most cells. Ties go to the comma.
func sniffDelimiter(text string) byte {
	head, _, _ := strings.Cut(text, "\n")
	best, most := byte(','), 0
	for _, d := range []byte{',', ';', '\t'} {
		if n := strings.Count(head, string(d)); n > most {
			best, most = d, n
		}
	}
	return best
}

func parseCSV(text string) Result {
	out := Result{Format: FormatCSV}
	table, err := tokenize(text, sniffDelimiter(text))
	if err != nil {
		return refuse(FormatCSV, err.Error())
	}
	if len(table) == 0 {
		return refuse(FormatCSV, "Nothing to import.")
	}
	head := make([]string, len(table[0].cells))
	for i, h := range table[0].cells {
		head[i] = strings.Join(strings.FieldsFunc(strings.ToLower(strings.TrimSpace(h)), func(r rune) bool { return r == ' ' || r == '\t' || r == '-' }), "_")
	}
	index := map[string]int{}
	for i, h := range head {
		if _, seen := index[h]; !seen {
			index[h] = i
		}
	}
	if _, ok := index["record"]; !ok {
		out.Errors = append(out.Errors, RowError{Row: table[0].line, Where: "header", Reason: "The first row must have a “record” column (entry, property, relationship, claim or speaker)."})
		return out
	}
	for _, r := range table[1:] {
		where := fmt.Sprintf("row %d", r.line)
		f := fields{}
		for name, i := range index {
			if i < len(r.cells) {
				f[name] = strings.TrimSpace(r.cells[i])
			}
		}
		rec := Record(strings.ToLower(f["record"].(string)))
		known := false
		for _, k := range Records {
			known = known || k == rec
		}
		if !known {
			reason := "record is required"
			if rec != "" {
				names := make([]string, len(Records))
				for i, k := range Records {
					names[i] = string(k)
				}
				reason = fmt.Sprintf("“%s” is not a record type (use %s).", rec, strings.Join(names, ", "))
			}
			out.Errors = append(out.Errors, RowError{Row: r.line, Where: where, Reason: reason})
			continue
		}
		item, msg := build(rec, f)
		if msg != "" {
			out.Errors = append(out.Errors, RowError{Row: r.line, Where: where, Reason: msg})
			continue
		}
		out.Rows = append(out.Rows, Row{Row: r.line, Where: where, Item: item})
	}
	if len(out.Rows) == 0 && len(out.Errors) == 0 {
		return refuse(FormatCSV, "Nothing to import.")
	}
	return out
}
