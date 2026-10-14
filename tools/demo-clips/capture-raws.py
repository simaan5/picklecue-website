#!/usr/bin/env python3
"""Capture the ten clip source screens from the CURRENT build on the iPhone 17 Pro Max simulator.
Same routes, world args and settle times as qa/store-screenshots/build-213-deck-v4/tools/capture-raws-v4.py
(the deck's capture runner), writing to raw-215/ with a manifest. Prereqs: sim booted, Debug app from
origin/main installed, snapshot installed (qa/marketing-account/install-snapshot.sh <UDID>)."""
import hashlib, json, subprocess, sys, time
from datetime import datetime, timezone
from pathlib import Path
BID = "com.andrewsimaan.PickleCue"
UDID = "9EFA1D3E-2A6E-409B-9A5D-241FEEC39112"
OUT = Path(__file__).resolve().parent / "raw-215"
SIZE = (1320, 2868)
WORLD = ["-marketingCapture", "maya-la-v1", "-qaTheme", "default", "-appThemeMode", "2"]
SUMMER_SMASH = "a11a0008-1a5e-4000-8a00-000000000002"
CITY_LIGHTS = "a11a0006-1a5e-4000-8a00-000000000002"
ROUTES = [
    ("s1-play-open-games", ["-previewPlay", "-previewPlayScreen", "main"], 9),
    ("s2-live-scoring", ["-previewLogMatch", "live"], 8),
    ("s3a-courts-pinfocus", ["-previewMainTab", "-startTab", "courts", "-CourtsPreviewState", "pinFocus"], 10),
    ("s4-bracket-summer-smash", ["-previewTournaments", "-previewTournamentScreen", "bracket", "-marketingTournamentID", SUMMER_SMASH], 9),
    ("s5b-league-standings", ["-previewLeagues", "-previewLeagueScreen", "standings", "-marketingLeagueID", CITY_LIGHTS], 9),
    ("s6-player-stats", ["-previewMarketing", "playerStats"], 8),
    ("s7-lock-screen", ["-previewMarketing", "liveActivity"], 14),
    ("s8-chat-thread", ["-previewMarketing", "chatThread"], 9),
    # The host has no "schedule" screen (falls through to the paywall); HomeFeedContentView opens the Full
    # Schedule sheet itself from -homeSheet schedule (DEBUG), 2.5 s after the home feed settles.
    ("s9-week-schedule", ["-previewMarketing", "home", "-homeSheet", "schedule"], 15),
    ("s10-home-dashboard", ["-previewMarketing", "home"], 12),
]
def run(*cmd, check=True):
    return subprocess.run(cmd, check=check, capture_output=True, text=True)
only = sys.argv[1].split(",") if len(sys.argv) > 1 else None
OUT.mkdir(exist_ok=True)
if only == ["--manifest-only"]:
    ver = run("/usr/libexec/PlistBuddy", "-c", "Print :CFBundleVersion", run("xcrun", "simctl", "get_app_container", UDID, BID).stdout.strip() + "/Info.plist").stdout.strip()
    rows = []
    for name, args, settle in ROUTES:
        png = OUT / f"{name}.png"
        if not png.exists(): continue
        dims = tuple(int(l.split(":")[1]) for l in run("sips", "-g", "pixelWidth", "-g", "pixelHeight", str(png)).stdout.splitlines() if "pixel" in l)
        rows.append({"raw": png.name, "sha256": hashlib.sha256(png.read_bytes()).hexdigest(), "device": "PickleCue App Store — iPhone 17 Pro Max",
                     "resolution": f"{dims[0]}x{dims[1]}", "route": " ".join(args), "settle": settle, "appBuild": ver})
    (OUT / "CAPTURES.json").write_text(json.dumps({"capturedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"), "captures": rows,
        "note": "build 215 (origin/main f98a7d22) on iOS 26.0.1; s7 and s9 captured from the fix/marketing-lockscreen-date binary (bcfd048e), which differs from main only in the lock-screen date label"}, indent=1))
    print("manifest rebuilt:", len(rows)); sys.exit(0)
run("xcrun", "simctl", "status_bar", UDID, "override", "--time", "9:41", "--wifiBars", "3", "--wifiMode", "active",
    "--cellularBars", "4", "--cellularMode", "active", "--batteryState", "charged", "--batteryLevel", "100")
run("xcrun", "simctl", "ui", UDID, "appearance", "dark")
build = run("xcrun", "simctl", "get_app_container", UDID, BID).stdout.strip()
ver = run("/usr/libexec/PlistBuddy", "-c", "Print :CFBundleVersion", f"{build}/Info.plist").stdout.strip()
results = []
for name, args, settle in ROUTES:
    if only and not any(name.startswith(o) for o in only): continue
    run("xcrun", "simctl", "terminate", UDID, BID, check=False); time.sleep(1)
    run("xcrun", "simctl", "launch", UDID, BID, *args, *WORLD); time.sleep(settle)
    png = OUT / f"{name}.png"
    run("xcrun", "simctl", "io", UDID, "screenshot", str(png))
    dims = tuple(int(l.split(":")[1]) for l in run("sips", "-g", "pixelWidth", "-g", "pixelHeight", str(png)).stdout.splitlines() if "pixel" in l)
    if dims != SIZE: raise SystemExit(f"BAD DIMENSIONS {dims} for {png}")
    results.append({"raw": png.name, "sha256": hashlib.sha256(png.read_bytes()).hexdigest(), "device": "PickleCue App Store — iPhone 17 Pro Max",
                    "resolution": f"{dims[0]}x{dims[1]}", "route": " ".join(args), "settle": settle, "appBuild": ver})
    print(f"{name} -> {dims[0]}x{dims[1]} OK (build {ver})")
run("xcrun", "simctl", "terminate", UDID, BID, check=False)
# Merge with earlier runs (a partial re-capture must not drop the other screens from the manifest).
mp = OUT / "CAPTURES.json"
existing = json.loads(mp.read_text())["captures"] if mp.exists() else []
merged = [c for c in existing if c["raw"] not in {r["raw"] for r in results}] + results
merged.sort(key=lambda c: [r[0] for r in ROUTES].index(c["raw"][:-4]) if c["raw"][:-4] in [r[0] for r in ROUTES] else 99)
mp.write_text(json.dumps({"capturedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"), "captures": merged}, indent=1))
print("wrote", OUT / "CAPTURES.json")
