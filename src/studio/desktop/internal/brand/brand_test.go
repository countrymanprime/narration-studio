package brand_test

import (
	"desktop/internal/brand"
	"encoding/json"
	"os"
	"testing"

	"desktop/internal/layout"
)

// TestGeneratedConstantsMatchTheBrandFile fails when brand_gen.go was edited by hand or the brand file changed without
// `pnpm run brand:sync`.
func TestGeneratedConstantsMatchTheBrandFile(t *testing.T) {
	text, err := os.ReadFile(layout.RepoFile(layout.BrandFile))
	if err != nil {
		t.Fatal(err)
	}
	var file struct {
		Name     string            `json:"name"`
		Identity map[string]string `json:"identity"`
	}
	if err := json.Unmarshal(text, &file); err != nil {
		t.Fatal(err)
	}
	if file.Name != brand.Name {
		t.Errorf("Name = %q, the brand file says %q", brand.Name, file.Name)
	}
	identity := map[string]string{
		"dataFolder": brand.DataFolder, "projectFolder": brand.ProjectFolder, "defaultProjectsFolder": brand.DefaultProjectsFolder,
		"executable": brand.Executable, "releaseAssetPrefix": brand.ReleaseAssetPrefix, "installFolder": brand.InstallFolder,
		"uninstallKey": brand.UninstallKey, "reaperExtPrefix": brand.ReaperExtPrefix, "reaperLauncher": brand.ReaperLauncher,
		"reaperResourceFolder": brand.ReaperResourceFolder, "audacityLabelTrack": brand.AudacityLabelTrack,
		"credentialEntropy": brand.CredentialEntropy, "envPrefix": brand.EnvPrefix,
	}
	if len(identity) != len(file.Identity) {
		t.Errorf("the brand file has %d identity values, the package %d", len(file.Identity), len(identity))
	}
	for key, value := range identity {
		if file.Identity[key] != value {
			t.Errorf("identity %s = %q, the brand file says %q", key, value, file.Identity[key])
		}
	}
}
