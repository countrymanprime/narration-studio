[Using the app](README.md) › Getting started

# Getting started

Launching the app without a project folder attached shows **Choose your project** instead of the workspace: **New project** at the top,
and the recent projects below it, each with an **Open** button.

![Choose your project - New project, the recent projects with Open and Remove, and Browse folders](../../images/ui/project-picker.webp)

- **Open** opens that project. The date is when you last opened it.
- The folder button at the top of the list, **Browse folders…**, opens a folder chooser for a project that is not in the list.
- **×** on a row takes the project off the list. Its files are kept, and a message offers **Undo** for a few seconds.
- A project whose folder has been moved or deleted drops off the list by itself.

![A removed recent project - the row is gone and the toast offers Undo](../../images/ui/project-picker-removed.webp)

## Where new projects go

**New project** asks for a name. The line under the field lists what a name cannot be: any of `< > : " / \ | ? *`, ending with a period,
or a reserved Windows name such as CON, NUL or COM1. **Location** shows the folder the project goes in: the default projects folder
(`NarrationStudio` in your user folder) until you pick another with **Change location…**. If you already have a `NarrationUtils` folder there and no `NarrationStudio` one, the app keeps using it; it never moves your projects.

![New Project - the name rules, and the location line showing the default projects folder with Change location](../../images/ui/project-new-dialog.webp)

A new project opens on [Script](script.md), which says it has no manuscript yet. **Import manuscript** takes you to
[Production](production.md), where the import runs.

## If you record in Audacity

The installer adds a second Start Menu entry, **Narration Studio for Audacity**. Pin it next to Audacity's own shortcut. It opens
the app in Audacity mode on the picker above, and the project you pick or create opens as an Audacity project. Audacity cannot
start other programs, so there is no Audacity macro or plug-in to install.

- Audacity support targets **Audacity 3.x**. Audacity 4.0 has no scripting pipe, and the app needs that pipe to reach Audacity.
- Bringing findings into Audacity is not available yet. A review in an Audacity project says "Audacity support is not available
  yet" instead of trying to reach REAPER.
- If the app is already open, the entry brings its window forward and leaves the open project and mode as they are.
Once a project is open, the [sidebar](navigation.md) takes you to each page, and
[Production](production.md) is where you import the manuscript that most other pages depend on.

---

[Index](README.md) · [Navigation →](navigation.md)
