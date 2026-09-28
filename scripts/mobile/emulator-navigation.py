"""Capture an installed, disposable fixture APK at compact Android widths."""
import os
import re
import subprocess
import time
import xml.etree.ElementTree as ET
from pathlib import Path

PACKAGE = "in.zanisheluxe.caprogress"
OUTPUT = Path(os.environ.get("CA_EMULATOR_EVIDENCE", "emulator-evidence"))
OUTPUT.mkdir(parents=True, exist_ok=True)


def adb(*args, binary=False):
    return subprocess.check_output(["adb", *args], stderr=subprocess.STDOUT, timeout=60, text=not binary)


def nodes():
    adb("shell", "uiautomator", "dump", "/sdcard/window.xml")
    xml = adb("exec-out", "cat", "/sdcard/window.xml")
    (OUTPUT / "last-hierarchy.xml").write_text(xml)
    return list(ET.fromstring(xml).iter("node"))


def find(label, bottom=False):
    matches = []
    for node in nodes():
        text = node.get("text", "") + " " + node.get("content-desc", "")
        bound = re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", node.get("bounds", ""))
        if label.lower() in text.lower() and bound:
            left, top, right, end = map(int, bound.groups())
            if right > left and end > top:
                matches.append(((left + right) // 2, (top + end) // 2))
    if not matches:
        raise AssertionError(f"'{label}' was not in the installed app accessibility tree")
    return max(matches, key=lambda point: point[1]) if bottom else min(matches, key=lambda point: point[1])


def wait_for(label, timeout=25):
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        try:
            return find(label)
        except (AssertionError, ET.ParseError, subprocess.CalledProcessError):
            time.sleep(1)
    (OUTPUT / f"failure-{re.sub('[^a-z0-9]+', '-', label.lower()).strip('-')}.png").write_bytes(adb("exec-out", "screencap", "-p", binary=True))
    raise AssertionError(f"'{label}' did not appear after app launch")


def tap(label, bottom=False):
    x, y = find(label, bottom)
    adb("shell", "input", "tap", str(x), str(y))
    time.sleep(0.7)


def capture(name, expected):
    # Android WebView sometimes exposes only the underlying document in the
    # accessibility dump while a modal sheet is visible. Save that screenshot
    # for visual inspection; assert the interactive page views by text.
    if expected:
        wait_for(expected)
    else:
        nodes()
    (OUTPUT / f"{name}.png").write_bytes(adb("exec-out", "screencap", "-p", binary=True))
    (OUTPUT / f"{name}.xml").write_text((OUTPUT / "last-hierarchy.xml").read_text())
    print(f"Captured {name}: {expected or 'visual overlay'}", flush=True)


def launch(width):
    adb("shell", "wm", "size", f"{width}x800")
    adb("shell", "wm", "density", "160")
    adb("shell", "am", "force-stop", PACKAGE)
    adb("shell", "pm", "clear", PACKAGE)
    adb("shell", "monkey", "-p", PACKAGE, "1")
    wait_for("Explore", 40)


try:
    adb("install", "-r", "android/app/build/outputs/apk/debug/app-debug.apk")
    for width in (320, 360, 390, 430):
        launch(width)
        capture(f"{width}-dashboard", "Layout fixture")
        tap("Today", bottom=True)
        capture(f"{width}-today", "Your study plan")
        tap("Study", bottom=True)
        capture(f"{width}-study", "Practice & Tests")
        tap("Progress", bottom=True)
        capture(f"{width}-progress", "First coverage")
        tap("Explore", bottom=False)
        capture(f"{width}-explore", None)
        adb("shell", "input", "keyevent", "4")
    launch(390)
    tap("Focus", bottom=True)
    capture("390-focus", "Focus timer")
    tap("Plan", bottom=True)
    capture("390-plan", "Planner")
    tap("Study", bottom=True)
    tap("Accounting", bottom=False)
    capture("390-subject", "Accounting standards")
    tap("Accounting standards", bottom=False)
    capture("390-chapter", "Chapter progress")
    adb("shell", "settings", "put", "system", "font_scale", "1.3")
    launch(320)
    tap("Study", bottom=True)
    capture("320-large-text-study", "Practice & Tests")
finally:
    adb("shell", "settings", "put", "system", "font_scale", "1.0")
    adb("shell", "wm", "size", "reset")
    adb("shell", "wm", "density", "reset")
