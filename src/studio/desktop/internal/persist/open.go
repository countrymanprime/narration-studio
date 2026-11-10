package persist

import "io"

// ReadFile is os.ReadFile that, on Windows, does not stop a save from renaming over the file while it reads (see Open). Read every
// file the host also rewrites with WriteFile or Rename through it, not through os.ReadFile.
func ReadFile(name string) ([]byte, error) {
	file, err := Open(name)
	if err != nil {
		return nil, err
	}
	defer func() { _ = file.Close() }()
	return io.ReadAll(file)
}
