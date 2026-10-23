package brand

import "bytes"

// NamePlaceholder stands for Name in a golden file, so a golden records what the app writes without the product name and a
// rename changes no golden. Identity values stay as they are: they do not follow a rename.
const NamePlaceholder = "{{brand.name}}"

// Golden is text the app wrote, with every Name in it replaced by NamePlaceholder, ready to compare with or write as a golden file.
func Golden(text []byte) []byte {
	return bytes.ReplaceAll(text, []byte(Name), []byte(NamePlaceholder))
}
