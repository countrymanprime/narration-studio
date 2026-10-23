---
title: Master & QC
lead: Check your rendered chapter files against your platform's delivery profile, rule by rule, then master and encode them to spec.
---

Every project is judged against **ACX (September 2026)** until you choose another profile on [Delivery](delivery.md). Your files are only read: mastering and encoding write new files. The page needs an imported manuscript, not a DAW project.

## Check your files

1. Press **Check files…** and pick one or more rendered chapter files. Only WAV files are measured.
2. Watch the bar, or press **Cancel**; files already measured keep their results.
3. Read the files table: a row per chapter, then the opening and closing credits and the retail sample. Each measured row shows **Length**, **RMS**, **Peak**, **Noise floor**, **Head / tail** and its **Result** (**Pass**, **Fail**, **Not judged** or **Waiting**).
4. After a new render, press **Re-check 3 files** (named for your file count) to measure the same files again, or **Choose other files…** to pick others.

![Three files checked against ACX, with a 48 kHz render selected and why it fails](../../../docs/images/ui/master-measured.webp "Files checked against ACX")

## See why a file fails

1. Select a file in the table with the arrow keys and Enter, or a click.
2. Read **Why it fails** below the table: every rule measured for it, with **Pass** or **Fail**, the value and the profile's limit.
3. Decide on each failed rule on [Proof](proof.md#delivery-checks), where it appears as a **Delivery check** note.

## Master to spec

1. Press **Master all to spec…** and pick the rendered files.
2. Give each file its **Role** (**Chapter**, **Opening credits**, **Closing credits** or **Retail sample**) and each chapter its **Title**.
3. Press **Master & encode**. With **Master before encoding** on (the default), each file is mastered by the built-in chain (EQ, Limiter, Gain) to the platform's numbers, then encoded.
4. Read each row's **Status** for whether it is waiting, mastering, encoding, ready or failed and why.

![Master all to spec with five files picked and given a role](../../../docs/images/ui/master-to-spec-picked.webp "Master to spec")

## Go on to delivery

1. Check the **Delivery package** panel on the right: the package checks from the profile's rules, the files that fail and how many chapters are not ready.
2. Press **Open Delivery** to build the package. To build for several platforms from the same mastered files, use **Multi-platform export** below it.
3. Press **Export report**, at the bottom of the page, to write the last check and diagnostics as an HTML and a JSON file in your project's `narration-studio/delivery` folder.

> **Note:** The report is a measurement, not a distributor's approval.
