package main

// The state matrix (definition of done, rule 3) for GET /media?sample=<id>, written before the handler. The control here is the
// route; the page that plays it is useSamplePlayer, which has its own matrix. Each cell names its test.
//
//	empty (no samples, no project)   TestMediaSampleOfAProjectWithNoSamplesIs404, TestMediaSampleWithNoProjectIs404
//	one, many                        TestMediaSampleServesAListedClip (the second sample is not served by the first's id)
//	huge                             not tested: ServeContent streams the file and the clip is at most 30 s; the 200 MiB limit is the store's (voicesample tests)
//	loading                          TestMediaSampleSupportsRangeRequests (the player seeks and prefetches by Range)
//	refused                          TestMediaSampleRefusesAnythingButAListedIntactClip (a path with a sample, two samples, an id of the wrong shape, an unlisted id)
//	failed / stale                   TestMediaSampleRefusesAClipThatChanged (missing, another size, same size other bytes)
//	long text, right-to-left, emoji  TestMediaSampleRefusesAnythingButAListedIntactClip (the id is the only input and must be 32 lowercase hex)
//	rapid double-fire                TestMediaSampleCanBeFetchedTwiceInARow (each fetch re-verifies; neither consumes the clip)
//	reload / leave mid-action        not tested: the handler keeps no state between requests
//	hand-edited samples.json         internal/voicesample TestHandEditedFileNamesAreIgnored (the path comes from the id alone)
//	paths                            internal/voicesample TestPathFixtures (ClipPath and Clip); here the project is a temp folder
//	the track route stays            the existing TestMediaMiddleware* tests; TestMediaPathStillServesATrackNextToSamples

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"desktop/internal/voicesample"
)

// markedSample marks "Alice." of the fixture recording as a sample of a character and answers its id and where its clip is.
func markedSample(t *testing.T, host *Host, character string) (string, string) {
	t.Helper()
	answer := voiceAnswerOf(t)(host.VoiceSampleMark(aliceRequest(currentRecordID(t, host), character)))
	if answer.Status != "saved" || answer.Sample == nil {
		t.Fatalf("mark answered %+v", answer)
	}
	path, ok := voicesample.ClipPath(host.config.projectFolder, answer.Sample.ID)
	if !ok {
		t.Fatalf("no clip path for %q", answer.Sample.ID)
	}
	return answer.Sample.ID, path
}

func getMedia(t *testing.T, host *Host, query string, header ...string) *httptest.ResponseRecorder {
	t.Helper()
	request := httptest.NewRequest(http.MethodGet, mediaRoute+"?"+query, nil)
	for i := 0; i+1 < len(header); i += 2 {
		request.Header.Set(header[i], header[i+1])
	}
	recorder := httptest.NewRecorder()
	host.mediaMiddleware(passthrough(t)).ServeHTTP(recorder, request)
	return recorder
}

func TestMediaSampleServesAListedClip(t *testing.T) {
	host, _ := voiceSamplesHost(t)
	id, clip := markedSample(t, host, voiceCharacter)
	want, err := os.ReadFile(clip)
	if err != nil {
		t.Fatal(err)
	}

	recorder := getMedia(t, host, "sample="+id)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body = %s", recorder.Code, recorder.Body.String())
	}
	if recorder.Body.String() != string(want) {
		t.Fatalf("the body is not the clip's %d bytes", len(want))
	}
	if kind := recorder.Header().Get("Content-Type"); !strings.HasPrefix(kind, "audio/") {
		t.Fatalf("Content-Type = %q, want an audio type", kind)
	}

	// A second sample is served by its own id and the first id still serves the first.
	other := voiceAnswerOf(t)(host.VoiceSampleMark(aliceRequest(currentRecordID(t, host), voicesample.NarrationCharacterID)))
	if other.Sample == nil || other.Sample.ID == id {
		t.Fatalf("second mark answered %+v", other)
	}
	otherWant, err := os.ReadFile(filepath.Join(voicesample.Dir(host.config.projectFolder), "clips", other.Sample.ID+".wav"))
	if err != nil {
		t.Fatal(err)
	}
	if got := getMedia(t, host, "sample="+other.Sample.ID).Body.String(); got != string(otherWant) {
		t.Fatal("the second id did not serve the second clip")
	}
}

func TestMediaSampleSupportsRangeRequests(t *testing.T) {
	host, _ := voiceSamplesHost(t)
	id, clip := markedSample(t, host, voiceCharacter)
	want, err := os.ReadFile(clip)
	if err != nil {
		t.Fatal(err)
	}

	recorder := getMedia(t, host, "sample="+id, "Range", "bytes=44-63")

	if recorder.Code != http.StatusPartialContent {
		t.Fatalf("status = %d, want 206", recorder.Code)
	}
	if recorder.Body.String() != string(want[44:64]) {
		t.Fatal("the body is not the requested byte range")
	}
	if recorder.Header().Get("Accept-Ranges") != "bytes" {
		t.Fatalf("Accept-Ranges = %q", recorder.Header().Get("Accept-Ranges"))
	}
}

func TestMediaSampleCanBeFetchedTwiceInARow(t *testing.T) {
	host, _ := voiceSamplesHost(t)
	id, _ := markedSample(t, host, voiceCharacter)
	for i := 0; i < 3; i++ {
		if code := getMedia(t, host, "sample="+id).Code; code != http.StatusOK {
			t.Fatalf("fetch %d: status = %d, want 200", i+1, code)
		}
	}
}

func TestMediaSampleRefusesAnythingButAListedIntactClip(t *testing.T) {
	host, project := voiceSamplesHost(t)
	id, _ := markedSample(t, host, voiceCharacter)
	track := filepath.Join(project, "media", "take.wav")
	unlisted := strings.Repeat("a", 32)
	if unlisted == id {
		unlisted = strings.Repeat("b", 32)
	}

	cases := map[string]string{
		"unlisted id":                       "sample=" + unlisted,
		"a path together with a listed id":  "sample=" + id + "&path=" + url.QueryEscape(track),
		"an empty path with a listed id":    "sample=" + id + "&path=",
		"two sample ids":                    "sample=" + id + "&sample=" + id,
		"a listed id and an unlisted one":   "sample=" + id + "&sample=" + unlisted,
		"no id":                             "sample=",
		"id in capitals":                    "sample=" + strings.ToUpper(id),
		"31 hex characters":                 "sample=" + id[:31],
		"33 hex characters":                 "sample=" + id + "0",
		"not hex":                           "sample=" + strings.Repeat("g", 32),
		"a path in place of an id":          "sample=" + url.QueryEscape(filepath.Join("clips", id+".wav")),
		"a traversal":                       "sample=" + url.QueryEscape("../../samples.json"),
		"the id with a file extension":      "sample=" + id + ".wav",
		"the id with a trailing space":      "sample=" + id + "%20",
		"the id with a NUL":                 "sample=" + id + "%00",
		"right-to-left and emoji text":      "sample=" + url.QueryEscape("\u202e🦎🍺"),
		"the samples file's name":           "sample=samples.json",
		"an all-zero id that is not stored": "sample=" + strings.Repeat("0", 32),
	}
	for name, query := range cases {
		t.Run(name, func(t *testing.T) {
			recorder := getMedia(t, host, query)
			if recorder.Code != http.StatusNotFound {
				t.Fatalf("status = %d, want 404; body = %.60q", recorder.Code, recorder.Body.String())
			}
		})
	}
}

func TestMediaSampleRefusesAClipThatChanged(t *testing.T) {
	for name, change := range map[string]func(t *testing.T, clip string){
		"deleted": func(t *testing.T, clip string) {
			if err := os.Remove(clip); err != nil {
				t.Fatal(err)
			}
		},
		"a folder in its place": func(t *testing.T, clip string) {
			if err := os.Remove(clip); err != nil {
				t.Fatal(err)
			}
			if err := os.Mkdir(clip, 0o755); err != nil {
				t.Fatal(err)
			}
		},
		"another size": func(t *testing.T, clip string) {
			data, err := os.ReadFile(clip)
			if err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(clip, append(data, 0), 0o600); err != nil {
				t.Fatal(err)
			}
		},
		"the same size and other bytes": func(t *testing.T, clip string) {
			data, err := os.ReadFile(clip)
			if err != nil {
				t.Fatal(err)
			}
			data[len(data)-1] ^= 0xff
			if err := os.WriteFile(clip, data, 0o600); err != nil {
				t.Fatal(err)
			}
		},
	} {
		t.Run(name, func(t *testing.T) {
			host, _ := voiceSamplesHost(t)
			id, clip := markedSample(t, host, voiceCharacter)
			if code := getMedia(t, host, "sample="+id).Code; code != http.StatusOK {
				t.Fatalf("before the change: status = %d, want 200", code)
			}
			change(t, clip)
			recorder := getMedia(t, host, "sample="+id)
			if recorder.Code != http.StatusNotFound {
				t.Fatalf("status = %d, want 404 for a clip that is not the file that was saved", recorder.Code)
			}
		})
	}
}

func TestMediaSampleOfAProjectWithNoSamplesIs404(t *testing.T) {
	host := newTestHostForMedia(t, t.TempDir())
	if code := getMedia(t, host, "sample="+strings.Repeat("a", 32)).Code; code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", code)
	}
}

func TestMediaSampleWithNoProjectIs404(t *testing.T) {
	host := newTestHostForMedia(t, "")
	if code := getMedia(t, host, "sample="+strings.Repeat("a", 32)).Code; code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", code)
	}
}

// The route keeps serving a track source by path, and a sample's clip is not a track source: its path is refused as a path.
func TestMediaPathStillServesATrackNextToSamples(t *testing.T) {
	host, project := voiceSamplesHost(t)
	_, clip := markedSample(t, host, voiceCharacter)

	if code := getMedia(t, host, "path="+url.QueryEscape(filepath.Join(project, "media", "take.wav"))).Code; code != http.StatusOK {
		t.Fatalf("a track source by path: status = %d, want 200", code)
	}
	if code := getMedia(t, host, "path="+url.QueryEscape(clip)).Code; code != http.StatusNotFound {
		t.Fatalf("a clip by path: status = %d, want 404 (a clip is named by its id, never by a path)", code)
	}
}
