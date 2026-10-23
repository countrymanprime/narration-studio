// Package brand holds the product name and the values derived from it, generated from config/brand.json by
// scripts/brand/sync.mjs (docs/research/app-name-injection.md). Code that shows the name uses Name; code that writes or finds
// something on a narrator's machine or in a project uses an identity constant, which does not follow a rename.
//
// Comments elsewhere in the host write <app> for ProjectFolder (as in <project>/<app>/marks.json) and <data> for DataFolder
// (as in %APPDATA%/<data>/global-settings.json), so they do not name the product either.
package brand
