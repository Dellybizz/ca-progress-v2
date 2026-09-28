"""Exercise the production APK's device-only guest workspace in an emulator."""
import re
import subprocess
import time
import xml.etree.ElementTree as ET
from pathlib import Path

PACKAGE = "in.zanisheluxe.caprogress"
OUTPUT = Path("emulator-evidence")
OUTPUT.mkdir(exist_ok=True)


def adb(*args, binary=False):
    return subprocess.check_output(["adb", *args], stderr=subprocess.STDOUT, timeout=60, text=not binary)


def find(label, bottom=False):
    adb("shell", "uiautomator", "dump", "/sdcard/guest-window.xml")
    xml = adb("exec-out", "cat", "/sdcard/guest-window.xml")
    matches = []
    for node in ET.fromstring(xml).iter("node"):
        value = node.get("text", "") + " " + node.get("content-desc", "")
        bound = re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", node.get("bounds", ""))
        if label.lower() in value.lower() and bound:
            left, top, right, end = map(int, bound.groups())
            if right > left and end > top:
                matches.append(((left + right) // 2, (top + end) // 2))
    if not matches:
        raise AssertionError(f"Guest screen does not show {label!r}")
    return max(matches, key=lambda point: point[1]) if bottom else min(matches, key=lambda point: point[1])


def wait_for(label, timeout=40):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            return find(label)
        except (AssertionError, ET.ParseError, subprocess.CalledProcessError):
            time.sleep(1)
    capture("guest-failure")
    raise AssertionError(f"Guest screen did not show {label!r}")


def tap(label, bottom=False):
    x, y = wait_for(label)
    if bottom:
        x, y = find(label, bottom=True)
    adb("shell", "input", "tap", str(x), str(y))
    time.sleep(0.7)


def capture(name):
    (OUTPUT / f"{name}.png").write_bytes(adb("exec-out", "screencap", "-p", binary=True))


adb("shell", "wm", "size", "390x800")
adb("shell", "wm", "density", "160")
adb("install", "-r", "android/app/build/outputs/apk/debug/app-debug.apk")
adb("shell", "pm", "clear", PACKAGE)
adb("shell", "monkey", "-p", PACKAGE, "1")
# The credential form makes the optional guest entry scroll below the fold.
time.sleep(2)
adb("shell", "input", "swipe", "180", "650", "180", "190", "450")
wait_for("Continue as guest on this device")
tap("Continue as guest on this device")
wait_for("Guest · device only")
capture("guest-dashboard")
tap("Plan", bottom=True)
# WebView placeholders are drawn but omitted from Android's accessibility tree.
# Locate the visible submit button and focus the input immediately above it.
button_x, button_y = wait_for("Add task")
adb("shell", "input", "tap", str(button_x), str(button_y - 55))
adb("shell", "input", "text", "GuestOfflineTask")
tap("Add task")
wait_for("GuestOfflineTask")
capture("guest-local-task")
adb("shell", "am", "force-stop", PACKAGE)
adb("shell", "monkey", "-p", PACKAGE, "1")
wait_for("Guest · device only")
tap("Plan", bottom=True)
wait_for("GuestOfflineTask")
capture("guest-task-after-restart")
print("Guest task persisted after production APK restart without authentication", flush=True)
