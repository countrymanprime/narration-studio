---
title: Delivery
lead: Choose the delivery profile the project is judged against, confirm every chapter passes, and build the platform's package.
---

Delivery builds the package from the files you mastered and encoded in [Master & QC](master-and-qc.md). It needs an imported manuscript.

## Choose the delivery profile

1. Choose a profile from the **Profile** menu: **ACX (built in)** or one of your custom profiles. It becomes the project's profile.
2. Read **Checks on every chapter** (RMS, peak, noise floor, room tone at the head and tail) and **Files** (sample rate, longest file, MP3 format, channels).
3. To change limits, edit a custom profile's boxes in place; a built-in profile is read-only. Make a custom profile by duplicating ACX in [Settings](settings.md).

> **Note:** Files already checked keep the profile they were checked against until you check them again in Master & QC.

## Check the chapters

1. Read **Before you build**: each chapter, with the opening credits first and the closing credits last, shows **Pass**, **Fails N checks**, **Not mastered** or **Waiting on N pickups**.
2. Press a chapter to open its file in Master & QC and fix what fails.

![Delivery with the book checked: the chapters that pass counted in Before you build](../../../docs/images/ui/delivery-measured.webp "Before you build")

## Build the package

Build is on once every chapter passes and the files have been mastered and encoded in Master & QC. While it is off, a red line under it names the first chapter in the way and why.

1. Press **Build ACX package** (named for the profile).
2. Choose a folder in the window that opens. A package cannot be saved inside the folder the app keeps in the project.
3. Watch the bar, or press **Cancel**. A cancelled or failed build leaves no files in the folder.
4. Read **Built**: how many files were written and where, with a **Written** mark for each. Press **Open the folder** to open it.

![Delivery after Build ACX package: Built, 15 files in the chosen folder, each marked Written](../../../docs/images/ui/delivery-built.webp "A built package")

## Read the profile's rules

Open **Rules and their sources**, under **Profile rules**, for every rule with what the platform requires, how the app checks it, and whether that requirement is **Verified**, still **To verify**, or has **Conflicting sources**. The profile is a measurement, not ACX's approval.
