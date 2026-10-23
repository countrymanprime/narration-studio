[Using the app](README.md) › Delivery

# Delivery

Delivery is the last step of finishing a book. It names the delivery profile the project is judged against,
checks every chapter against it, and builds the platform's package from the files you mastered and encoded in
[Master & QC](master-and-qc.md). It sits under **Finish**, after Master & QC, and needs an imported
manuscript: without one the page asks you to import one.
While the chapters are being read, **Before you build** shows grey blocks in place of the chapter checks.

![Delivery judged against ACX with nothing measured: the profile, its checks and files, Output with Build off, and Before you build with every chapter waiting](../../images/ui/delivery-default.webp)

## The delivery profile

The first panel's header holds the page title, **Delivery**, and on the right the **Profile** label, the profile menu
and, for a built-in profile, a **Built in** pill. The menu lists **ACX (built in)** and each custom profile.
Choosing one makes it the project's profile; the files already checked keep the profile they were checked
against until you check them again in Master & QC. **Checks on every chapter** lists the profile's
measured limits (RMS, peak, noise floor, room tone at the head and tail), and **Files** its sample rate,
longest file, MP3 format and channels. A built-in profile is read-only, and a one-sided limit reads in words ("at most −3 dBFS").

A custom profile's name, its limits (a lowest and a highest box each) and its longest file can be changed in
place; the change is saved when you press Enter or leave the box, and a rule it turned off reads **Off**. A
blank name, a name over 80 characters or a limit that is not a number is ignored (a minus typed as "−" or "-" is
read as one, and "-0" is 0), a sentence under the card says so
("A profile needs a name, so the name was left as it was.") and the box shows the saved value again. The name box
sits on the same row as the title and the profile menu. If the lowest
is above the highest, or the host refuses the change for another reason, its sentence appears under the card
and the box shows the saved value again. To make a custom profile, duplicate ACX in [Settings, Delivery](settings.md);
turning a rule off and deleting a profile are there too. If you had set your own limits before delivery
profiles, they were moved into a custom profile named **Your limits** (or ACX, when they were ACX's numbers),
so your files are judged the same way as before.

![Delivery judged against a custom profile: its name and each limit can be edited in place](../../images/ui/delivery-custom-profile.webp)

The card reads the profiles again when you return to the window, so a profile you changed or deleted in
Settings is picked up. If the profiles cannot be read, the card says so, when the host last answered, and
offers **Check again**.

## Before you build

**Before you build**, on the right, counts the chapters passing and lists each chapter, named as the
manuscript's headings name it, with the opening credits first and the closing credits last (each judged by its
own file, "Opening credits.wav"). Each shows **Pass**, **Fails N checks**, **Not mastered**, or, for a chapter that is not mastered and has open
pickups, **Waiting on N pickups** (counted from the Pickups list, as Production counts them). Pressing a
chapter opens its file in [Master & QC](master-and-qc.md); the arrow button in the panel's header opens Master & QC
itself. A book with more than a hundred chapters lists the first hundred and a **Show the other N chapters**
button for the rest; the count above the list is always the whole book.

![Delivery with the book checked: the chapters that pass counted in Before you build, and Output waiting on the rest](../../images/ui/delivery-measured.webp)

The list is read when the page opens, when you return to the window and when a measurement ends. While a
measurement is still running in Master & QC the panel says so and Build stays off. Nothing is judged until the
chapters, the credits and the measurement have each been read.

If any of them cannot be read, Delivery does not guess. It says "Can't tell which chapters pass", when the host
last answered and why, and offers **Check again**, which reads all three again. It reads the measurement again
by itself every two seconds while the message is up, and the chapters when you return to the window. If a list was
already showing, it stays, marked "The list below may be out of date".

## Output

**Folder** says where the package went. Before a build it reads "Chosen when you build": Windows opens its own
folder window when you press **Build ACX package** (named for the profile), and the app never takes a typed
path. Pressing the button twice opens the window once. If you close it without choosing a folder, Delivery says
no package was built. A package cannot be saved inside the project's own <!-- brand:identity.projectFolder -->narration-studio<!-- /brand --> folder.

Build is on once every chapter passes, and files have been mastered and encoded in Master & QC. Until then it
says how many chapters fail and how many are not ready, that there are no chapters, that you must master all
to spec in Master & QC first, or that Master & QC is still preparing the files. While Build is off, a red line
under it names the first chapter in the way, so you do not have to open Master & QC to learn why. For a failing
chapter it gives the rule it misses, its value and the limit ("Chapter 8: noise floor −57.8 dBFS (limit ≤ −60
dBFS), and 1 more rule."). When no chapter fails, it names the first chapter that is not ready and why: it has no
measured file, its file is not measured yet or could not be read, or part of it could not be measured. Until
something is measured, the line is left off and the count beside Build says so.

While Build is off it is dimmed but still reachable with Tab, and a screen reader reads the reason beside it as
its description. Pressing it builds nothing and announces "Nothing was built" with that reason.

![Delivery with every chapter passing and the files encoded: Build ACX package is on](../../images/ui/delivery-ready.webp)

While the package builds, the button is busy, **Cancel** is offered and a bar shows the work. A cancelled or failed
build leaves no files in the folder, so the same build can be started again; a package never overwrites a file that
is already there and says which one is in the way.

![Delivery with a started build running: the busy Build button, Cancel and the progress bar](../../images/ui/delivery-building.webp)

When the package is built, **Built** shows how many files were written and where, with a **Written** mark for each
file. The folder button beside it (**Open the folder**) opens that folder in Explorer. The list shows only for the
profile that built it: choose another profile and it goes away until you build again.

![Delivery after Build ACX package: Built, 15 files in the folder the host chose, and each file Written](../../images/ui/delivery-built.webp)

If the host refuses or the build fails, Delivery shows its words under Build and writes nothing. It does not also
pop up a message while you are on this page; from another page the message appears there. A file that was encoded
empty or is gone is named and refused before anything is written ("is empty (0 bytes); encode it again"), and so
is a chapter whose title makes a file name longer than Windows allows.

![Delivery after the host refused the build: its reason under Build, and nothing written](../../images/ui/delivery-build-failed.webp)

If the host stops answering while a build runs, Delivery says "Can't tell how the build is going", when it last
heard and when it last asked. **Check again** reads again at once and answers your press: "You checked again just now:
the host still did not answer." The build keeps running on the host and **Cancel** is still there. Beside Build the
sentence read before the host went quiet ("Every chapter passes.") is left out until it answers again.

![Delivery with a running build and a host that no longer answers: the message with Check again](../../images/ui/delivery-host-quiet.webp)

**Cancel** with a quiet host cannot be confirmed, so Delivery says "Cancel was sent, but the host did not confirm
it, so the build may still be running." and keeps the quiet message. It says "Packaging cancelled." only when the
host reports that the build ended; **Check again** asks for that.

![Delivery with a host that no longer answers, after Check again and Cancel: each press is answered, and the cancel is marked unconfirmed](../../images/ui/delivery-host-quiet-cancelled.webp)

## Profile rules

**Profile rules**, below Output, says where the rules come from and how many of them the app checks, how many
it does not check, how many are for you to listen for, how many are off and how many are still to verify.
Open **Rules and their sources** for every rule with what the platform requires, how the app checks it,
and whether that requirement was read on the platform's own page (**Verified**), is still **To verify**,
or has **Conflicting sources** (room tone at the head of a file: ACX's page was read as 1 to 5 s, current
guides say 0.5 to 1 s, so the app judges the looser 0.5 to 5 s). The profile is a measurement, not ACX's
approval.

![The ACX profile's rules and their sources](../../images/ui/delivery-profile-rules.webp)

---

[← Master & QC](master-and-qc.md) · [Index](README.md) · [Settings →](settings.md)
