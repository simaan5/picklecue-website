"""Shared helpers mirrored from the WordPress plugin's Utils class.

Keeping these in sync with wp-content/plugins/anstelias-store-tools/includes/
class-utils.php guarantees the standalone importer and the in-WP importer make
the same categorization and duplicate-key decisions.
"""
from __future__ import annotations

import re
from typing import Optional

ATTRIBUTES = [
    "Brand", "Model", "MPN", "Condition", "Tested Status", "Cosmetic Condition",
    "Included Accessories", "Storage Capacity", "RAM", "CPU", "GPU",
    "Form Factor", "Interface", "Part Number", "Warranty/Return Window", "Notes",
]

# (keywords, (top, sub|None), score) — earlier higher-score rules win.
CATEGORY_RULES = [
    (["mac pro", "apple mac pro"], ("Apple Mac Pro", None), 0.95),
    (["ddr4", "ddr5", "ddr3", "sodimm", "dimm", "rdimm", "udimm"], ("Storage & Memory", "RAM / Memory"), 0.9),
    (["nvme", "m.2", "sata ssd", "ssd"], ("Storage & Memory", "SSDs"), 0.85),
    (["hard drive", "hdd", "sas drive", "sata hdd", "7200rpm", "5400rpm"], ("Storage & Memory", "Hard Drives"), 0.85),
    (["access point", "unifi ap", "wireless ap"], ("Networking", "Access Points"), 0.85),
    (["switch", "catalyst", "sfp", "poe switch"], ("Networking", "Switches"), 0.8),
    (["router", "firewall", "edgerouter"], ("Networking", "Routers"), 0.8),
    (["cisco", "unifi", "ubiquiti", "mikrotik", "netgear"], ("Networking", None), 0.7),
    # Complete-machine MODEL names outrank component mentions (ssd/hdd/ram) so a
    # full PC that lists its drive/memory is filed as the machine, not a part.
    # Generic words (laptop/desktop/server) are scored BELOW components so e.g.
    # "SODIMM Laptop Memory" stays in RAM, not Laptops.
    (["precision", "z4", "z6", "z8", "threadripper", "workstation"], ("Computers & Workstations", "Workstations"), 0.93),
    (["poweredge", "proliant", "rack server"], ("Computers & Workstations", "Servers"), 0.92),
    (["optiplex", "elitedesk", "thinkcentre", "prodesk", "mini pc", "micro pc", "tiny desktop"], ("Computers & Workstations", "Mini PCs"), 0.94),
    (["thinkpad", "latitude", "elitebook", "macbook"], ("Computers & Workstations", "Laptops"), 0.92),
    (["laptop", "notebook"], ("Computers & Workstations", "Laptops"), 0.72),
    (["desktop", "tower pc"], ("Computers & Workstations", "Desktops"), 0.7),
    (["server"], ("Computers & Workstations", "Servers"), 0.72),
    (["cpu", "processor", "xeon", "core i7", "core i5", "core i9", "ryzen"], ("Components", "CPUs / Processors"), 0.75),
    (["gpu", "graphics card", "geforce", "radeon", "quadro", "rtx", "gtx"], ("Components", "GPUs / Graphics Cards"), 0.8),
    (["monitor", "display", "lcd panel"], ("Monitors & Displays", None), 0.8),
    (["printer", "scanner", "toner", "laserjet"], ("Printers & Scanners", None), 0.8),
    (["pos", "barcode", "receipt printer", "cash drawer", "point of sale"], ("POS Equipment", None), 0.85),
    (["nvr", "dvr", "poe camera", "security camera", "ip camera", "cctv"], ("Cameras & Security", None), 0.85),
    (["projector", "capture card", "broadcast", "sdi", "hdmi matrix"], ("Video Equipment", None), 0.75),
    (["microphone", "mixer", "pro audio", "instrument", "synthesizer"], ("Musical / Pro Audio Equipment", None), 0.75),
    (["amplifier", "receiver", "speaker", "audio"], ("Audio Equipment", None), 0.65),
    (["film camera", "lens", "photography", "dslr", "mirrorless"], ("Film / Camera Equipment", None), 0.75),
    (["vacuum tube", "radio tube", "nos tube"], ("Radio / Vacuum Tubes", None), 0.85),
    (["vintage", "retro", "antique"], ("Vintage Electronics", None), 0.6),
    (["oscilloscope", "multimeter", "signal generator", "test equipment"], ("Test Equipment", None), 0.8),
    (["ups", "pdu", "surge protector", "power distribution"], ("Power & Accessories", "Power Protection & Distribution"), 0.8),
    (["power supply", "psu", "ac adapter", "power adapter", "charger"], ("Power & Accessories", "Power Supplies & Adapters"), 0.75),
    (["cable", "connector", "adapter cable", "patch cable"], ("Power & Accessories", "Computer Cables & Connectors"), 0.6),
]

SPECIFIC_ALIASES = {
    "model": "Model", "manufacturer": "Brand", "brand": "Brand",
    "memory": "RAM", "ram": "RAM", "ram size": "RAM",
    "processor": "CPU", "cpu": "CPU", "processor type": "CPU",
    "gpu": "GPU", "graphics": "GPU", "graphics processing type": "GPU",
    "storage": "Storage Capacity", "ssd capacity": "Storage Capacity",
    "hard drive capacity": "Storage Capacity", "capacity": "Storage Capacity",
    "form factor": "Form Factor", "interface": "Interface", "mpn": "MPN",
}


def normalize_title(title: str) -> str:
    title = re.sub(r"[^a-z0-9 ]+", " ", (title or "").lower())
    return re.sub(r"\s+", " ", title).strip()


def duplicate_key(record: dict) -> tuple[str, str]:
    """Return (key_type, key_value) using the same priority as the PHP side."""
    if record.get("ebay_item_id"):
        return ("ebay_item_id", str(record["ebay_item_id"]))
    if record.get("sku"):
        return ("sku", str(record["sku"]))
    norm = normalize_title(record.get("title", ""))
    if norm:
        return ("norm_title", norm)
    if record.get("brand") and record.get("mpn"):
        return ("brand_mpn", f"{record['brand']}|{record['mpn']}".lower())
    return ("none", "")


def apply_markup(price: float, percent: float) -> float:
    return round(price * (1 + percent / 100.0), 2) if percent > 0 else price
