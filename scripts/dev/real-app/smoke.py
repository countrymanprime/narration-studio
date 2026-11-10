"""Smoke test for real_app.py: the host's first screen reads "Choose your project" and its buttons press.

Run after start-host.sh, as docs/operations/real-app-driver.md says. Exits non-zero when the page does not read as expected.
"""

import real_app

heading = real_app.find("heading", "Choose your project", timeout=45).name
buttons = {n.name.lower() for n in real_app.find_all("push button")}
assert {"open folder…", "new project", "settings"} <= buttons, f"missing buttons, found {sorted(buttons)}"
real_app.click(real_app.find("push button", "Settings"))
real_app.find("heading", "Settings", timeout=15)
print("real-app smoke: ok:", heading)
