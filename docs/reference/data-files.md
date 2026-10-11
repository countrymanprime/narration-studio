# Data files

The files the app writes and reads back for the narrator: where each one lives, what writes and reads it, where its shape is pinned, and how long it is kept. Use it to find what the app keeps in a project or a user profile, what to back up, and what is cleared when the manuscript is replaced.

A file from outside the app (a manuscript, a REAPER or Audacity project, an archive, a downloaded file, an answered query file from an author) is not listed here; its row is in the [threat model](../architecture/threat-model.md).

## How the app reads a file back

Every file on this page is written by the app and read back by the app for the same Windows user. Both ends run as that user, and there is no privilege boundary between two programs one person runs ([threat model, attackers](../architecture/threat-model.md#how-to-read-it)), so the file is inside the trust boundary.

On read, the host checks the file before using it: its shape, its version where it carries one, and the limits named in its row. A file written by a newer version of the app is refused and left alone. A file that does not decode is handled by the class of data in it, disposable or narrator data, as [Persisted files](../architecture/wire-contracts.md#persisted-files-appsdesktopinternalpersist) describes (`apps/desktop/internal/persist`). A row's notes say where a file departs from that.

A hand edit of one of these files can change only the narrator's own data the app shows or judges by: a note, a mark, a status, a verdict. It must not make the app run a program, open or write a path, fetch a URL, or put markup into the page; a file that can is a vulnerability, reported as [SECURITY.md](../../SECURITY.md) says. The exception is a file whose job is to name a path the host opens, a command it runs or a URL it fetches: its row says so, and it also has its own row in the threat model, which bounds what the named target can do.

## Columns

| Column | Holds |
| --- | --- |
| File | The file name, linked to the code that owns it |
| Location | The path under the project folder or the per-user folder |
| Written by | The bindings or jobs that write it |
| Read by | The bindings or jobs that read it back |
| Schema or golden | The schema, golden payload or test that pins its shape |
| Retention | When it is created, replaced or cleared, and whether it is safe to delete |
| Notes | Limits, what is checked on read, and any departure from the read-back rules above |

## Project files

Files under the project's own `narration-utils/` folder. They travel with the project.

| File | Location | Written by | Read by | Schema or golden | Retention | Notes |
| --- | --- | --- | --- | --- | --- | --- |

Rows pending: filled from the code in a later change of the [docs placement plan](../research/docs-placement-audit.md#52-slices-in-order) (B1).

## Per-user files

Files under `%APPDATA%\narration-utils`. They belong to the Windows user, not to a project.

| File | Location | Written by | Read by | Schema or golden | Retention | Notes |
| --- | --- | --- | --- | --- | --- | --- |

Rows pending: filled with the project files (B1).
