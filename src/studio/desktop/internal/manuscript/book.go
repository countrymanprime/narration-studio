package manuscript

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"slices"
	"sync/atomic"

	"desktop/internal/brand"
	"desktop/internal/persist"
)

// Book is one parse of manuscript.json with its indexes, immutable once built: every answer comes from the same bytes, and
// many goroutines may ask one. Service.Book reads and hashes the whole file, so a pass over chapters, paragraphs or findings
// takes one Book and asks it; it never calls a Service method for each item.
type Book struct {
	// digest is of the bytes the book was parsed from. A file's size and modification time can both survive a change of its
	// content, so the bytes are what a held parse is valid for (issue 3896).
	digest persist.Digest
	data   map[string]any
	// titles is each chapter's title by id (front matter is not a chapter), so a title lookup builds no chapter payload.
	titles map[string]string
	// refs is the same chapters in manuscript order, with their kind and subtitle.
	refs []ChapterRef
	// paragraphs is each chapter's paragraphs in file order, so asking for one chapter's lines walks only those (issue 3560).
	paragraphs map[string][]map[string]any
}

// ChapterRef is what the host needs to name and match a chapter: no status, word count or paragraph ids, so listing them builds no
// chapter payload.
type ChapterRef struct{ ID, Title, Subtitle, ContentKind string }

var reads, parses atomic.Int64

// Reads is how many times this process has read manuscript.json whole, a test's way to count what a call costs.
func Reads() int64 { return reads.Load() }

// Parses is how many times this process has decoded a manuscript, a test's way to tell a held book from a new one.
func Parses() int64 { return parses.Load() }

// Book is the project's manuscript as its file reads now. Each call reads manuscript.json and hashes it (SHA-256); the
// parse is skipped when the hash is the held book's. Two calls that race may both parse; each answers the bytes it read.
func (s *Service) Book() (*Book, error) {
	s.mu.Lock()
	project := s.project
	s.mu.Unlock()
	if project == "" {
		return nil, fmt.Errorf("save the REAPER project and import a manuscript first")
	}
	raw, err := persist.ReadFile(filepath.Join(project, brand.ProjectFolder, "manuscript", "manuscript.json"))
	if err != nil {
		return nil, fmt.Errorf("import a manuscript first")
	}
	reads.Add(1)
	digest := persist.Sum(raw)
	if held := s.book.Load(); held != nil && held.digest == digest {
		return held, nil
	}
	book, err := parseBook(raw, digest)
	if err != nil {
		return nil, err
	}
	s.book.Store(book)
	return book, nil
}

// put holds the book that encoded, the bytes just written to manuscript.json, decodes to, so the next Book parses nothing.
// It decodes the bytes and never keeps the writer's own value: the held book is what the file reads.
func (s *Service) put(encoded []byte) {
	if book, err := parseBook(encoded, persist.Sum(encoded)); err == nil {
		s.book.Store(book)
	}
}

func parseBook(raw []byte, digest persist.Digest) (*Book, error) {
	parses.Add(1)
	var data map[string]any
	if err := json.Unmarshal(raw, &data); err != nil {
		return nil, fmt.Errorf("the canonical manuscript data could not be read")
	}
	if data["schemaVersion"] != float64(1) {
		return nil, fmt.Errorf("this manuscript data uses an unsupported schema version")
	}
	book := &Book{digest: digest, data: data, titles: map[string]string{}, paragraphs: map[string][]map[string]any{}}
	for _, paragraph := range objects(data["paragraphs"]) {
		id := text(paragraph, "chapterId")
		book.paragraphs[id] = append(book.paragraphs[id], paragraph)
	}
	for _, chapter := range objects(data["chapters"]) {
		if !isFrontMatter(chapter) {
			book.titles[text(chapter, "id")] = text(chapter, "title")
			book.refs = append(book.refs, ChapterRef{ID: text(chapter, "id"), Title: text(chapter, "title"), Subtitle: text(chapter, "subtitle"), ContentKind: text(chapter, "contentKind")})
		}
	}
	return book, nil
}

// Load is the canonical manuscript as its file reads now (Book), for a caller that reads it once.
func (s *Service) Load() (map[string]any, error) {
	book, err := s.Book()
	if err != nil {
		return nil, err
	}
	return book.data, nil
}

// Data is the decoded manuscript.json. Callers only read it: every holder of the book shares the one map.
func (b *Book) Data() map[string]any { return b.data }

// Paragraphs is chapterID's paragraphs in manuscript order as the reader contract sends them, and empty for an unknown chapter.
func (b *Book) Paragraphs(chapterID string) []map[string]any {
	result := []map[string]any{}
	for _, paragraph := range b.paragraphs[chapterID] {
		result = append(result, paragraphPayload(paragraph))
	}
	return result
}

// ParagraphID resolves a chapter's globalIndex-th manuscript paragraph (the reader contract's global "index" field, shared
// with Transcript Compare's resolve_global_paragraph) to its stable paragraph id.
func (b *Book) ParagraphID(chapterID string, globalIndex int) (id string, ok bool) {
	for _, paragraph := range b.paragraphs[chapterID] {
		index, isNumber := paragraph["index"].(float64)
		if isNumber && int(index) == globalIndex {
			return text(paragraph, "id"), true
		}
	}
	return "", false
}

// ChapterIDByTitle resolves a chapter title to its manuscript id, for adapters (Transcript Compare's) that only receive a
// title from a data source outside the manuscript. ambiguous is true when more than one chapter shares the title exactly;
// ok is still true, but callers should treat the match as provisional.
func (b *Book) ChapterIDByTitle(title string) (id string, ambiguous, ok bool) {
	for _, chapter := range objects(b.data["chapters"]) {
		if text(chapter, "title") != title {
			continue
		}
		if ok {
			return id, true, true
		}
		id, ok = text(chapter, "id"), true
	}
	return id, false, ok
}

// ChapterTitle is the title of the manuscript's chapter id, and false when the manuscript has no such chapter (front matter
// and the credits are not manuscript chapters). It reads an index built with the parse: no chapter payload is built, where
// Chapters and ChaptersUnmeasured build one for every chapter of the book (issue 3272).
func (b *Book) ChapterTitle(id string) (string, bool) {
	title, ok := b.titles[id]
	return title, ok
}

// ChapterRefs is the manuscript's own chapters (front matter and the credits are not among them) in order: no chapter
// payload is built.
func (b *Book) ChapterRefs() []ChapterRef { return slices.Clone(b.refs) }

// ChapterIDByTitle is Book.ChapterIDByTitle of the manuscript as its file reads now; no chapter matches when it cannot be read.
func (s *Service) ChapterIDByTitle(title string) (id string, ambiguous, ok bool) {
	book, err := s.Book()
	if err != nil {
		return "", false, false
	}
	return book.ChapterIDByTitle(title)
}

// ParagraphID is Book.ParagraphID of the manuscript as its file reads now; no paragraph matches when it cannot be read.
func (s *Service) ParagraphID(chapterID string, globalIndex int) (id string, ok bool) {
	book, err := s.Book()
	if err != nil {
		return "", false
	}
	return book.ParagraphID(chapterID, globalIndex)
}

// Paragraphs is Book.Paragraphs of the manuscript as its file reads now. Each call reads the whole file: a caller with more
// than one chapter takes a Book.
func (s *Service) Paragraphs(chapterID string) ([]map[string]any, error) {
	book, err := s.Book()
	if err != nil {
		return nil, err
	}
	return book.Paragraphs(chapterID), nil
}

// ChapterTitle is Book.ChapterTitle of the manuscript as its file reads now.
func (s *Service) ChapterTitle(id string) (string, bool, error) {
	book, err := s.Book()
	if err != nil {
		return "", false, err
	}
	title, ok := book.ChapterTitle(id)
	return title, ok, nil
}

// ChapterRefs is Book.ChapterRefs of the manuscript as its file reads now.
func (s *Service) ChapterRefs() ([]ChapterRef, error) {
	book, err := s.Book()
	if err != nil {
		return nil, err
	}
	return book.ChapterRefs(), nil
}
