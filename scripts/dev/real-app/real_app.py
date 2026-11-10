"""Read and drive the real desktop host's window through AT-SPI (the accessibility bus), the way a screen reader does.

Run with the system Python that has pyatspi (python3.12 on Ubuntu 24.04: apt install python3-pyatspi at-spi2-core), with
DBUS_SESSION_BUS_ADDRESS set to the address start-host.sh prints. A page is read as its accessibility tree: role and name of each node.
"""

import sys
import time

import pyatspi


def app(name="ns-host", timeout=30.0):
    """The host's accessibility application, waiting for it to appear."""
    end = time.time() + timeout
    while time.time() < end:
        for candidate in pyatspi.Registry.getDesktop(0):
            if candidate and candidate.name == name:
                return candidate
        time.sleep(0.5)
    raise TimeoutError(f"no accessible application named {name!r}; is start-host.sh running and DBUS_SESSION_BUS_ADDRESS set?")


def walk(node, depth=0, limit=12):
    """Yields (depth, node) for every node under `node`, down to `limit` levels."""
    yield depth, node
    if depth < limit:
        for child in node:
            if child:
                yield from walk(child, depth + 1, limit)


def tree(root=None, limit=12):
    """The page as indented 'role: name' lines, nodes with neither a name nor children of interest left in."""
    return [f"{'  ' * d}{n.getRoleName()}: {n.name}" for d, n in walk(root or app(), 0, limit)]


def find_all(role, name=None, root=None):
    """Nodes of `role` ('push button', 'heading', ...) whose name equals `name` (case-insensitive) or, when `name` is None, any."""
    want = name.lower() if name else None
    return [n for _, n in walk(root or app()) if n.getRoleName() == role and (want is None or n.name.lower() == want)]


def find(role, name=None, root=None, timeout=10.0):
    """The first matching node, waiting for it; raises with the page's tree when it never shows."""
    end = time.time() + timeout
    while True:
        found = find_all(role, name, root)
        if found:
            return found[0]
        if time.time() > end:
            raise LookupError(f"no {role} named {name!r}\n" + "\n".join(tree()))
        time.sleep(0.4)


def click(node):
    """Does the node's default action (a button's press, a link's follow)."""
    node.queryAction().doAction(0)


def type_into(node, text):
    """Replaces the text of an editable node."""
    editable = node.queryEditableText()
    editable.setTextContents(text)


def texts(root=None):
    """Every non-empty name on the page, in order: what a narrator reads."""
    return [n.name for _, n in walk(root or app()) if n.name]


if __name__ == "__main__":
    print("\n".join(tree(limit=int(sys.argv[1]) if len(sys.argv) > 1 else 12)))
