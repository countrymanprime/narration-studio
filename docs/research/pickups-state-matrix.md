# Pickups page: state matrix

Written before the fixes, per [the definition of done](../../.claude/rules/definition-of-done.md). Each cell is **tested** (names the test), **probed** (driven by hand in the dev:mock app, with the result), or **not tested** with the reason. The matrix is updated in the PR as cells change.

| Control or area | Empty | One | Many / huge | Loading | Refused | Failed | Stale | Long / RTL / emoji | Rapid double-fire | Reload / leave mid-action |
| - | - | - | - | - | - | - | - | - | - | - |
| Opening the list | to do | to do | to do | to do | n/a (host does not refuse a read) | to do | to do | to do | to do | to do |
| Include box / Space | n/a | to do | to do | n/a | to do | to do | to do | n/a | to do | to do |
| Mark recorded / open again | n/a | to do | to do | n/a | to do (DAW says no) | to do | to do | n/a | to do | to do |
| Remove and Undo | n/a | to do | to do | n/a | to do | to do | to do | n/a | to do | to do |
| Add by hand | to do | to do | n/a | to do | to do | to do | n/a | to do | to do | to do |
| Chapter stepper / scope | to do | to do | to do | n/a | n/a | n/a | to do | to do | to do | to do |
| Check recordings | to do | n/a | n/a | n/a | to do (DAW away) | n/a | n/a | n/a | to do | to do |
| Open N in Booth / row hand-off | to do | to do | to do | n/a | n/a | to do | to do | to do | to do | to do |
| Add N as markers | to do | to do | to do | n/a | to do | to do | to do | n/a | to do | to do |
| Copy the pickup script | to do | to do | to do | n/a | n/a | to do | n/a | to do | to do | n/a |
| Row context menu | n/a | to do | to do | n/a | n/a | n/a | to do | n/a | to do | to do |

Integration cells (the DAW and the Booth hand-off): no answer, late, out of order, lost or repeated event, wrong project open: **to do**.

Overlays (row menu, Add popover, stepper menu, Check recordings dialog, toasts, tooltips) at each window edge and corner, beside the sidebar and nav, over scrolled content, narrow, with another overlay open: **to do**.
