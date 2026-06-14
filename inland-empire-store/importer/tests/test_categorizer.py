from src.categorizer import categorize, needs_review


def test_ram_high_confidence():
    res = categorize("Samsung 16GB DDR4 SODIMM Laptop Memory")
    assert res["top"] == "Storage & Memory"
    assert res["sub"] == "RAM / Memory"
    assert res["confidence"] >= 0.85
    assert not needs_review(res["confidence"])


def test_ssd_over_generic_storage():
    res = categorize("Samsung 970 EVO 1TB NVMe M.2 SSD")
    assert res["sub"] == "SSDs"


def test_mac_pro_wins():
    res = categorize("Apple Mac Pro 2013 Xeon Workstation")
    # Mac Pro rule has the highest score (0.95) and should win over workstation.
    assert res["top"] == "Apple Mac Pro"


def test_workstation():
    res = categorize("Dell Precision T5810 Xeon Workstation")
    assert res["top"] == "Computers & Workstations"
    assert res["sub"] == "Workstations"


def test_networking_switch():
    res = categorize("Cisco Catalyst 2960 48-port PoE Switch")
    assert res["top"] == "Networking"
    assert res["sub"] == "Switches"


def test_unknown_falls_back_to_misc_low_confidence():
    res = categorize("Mystery widget thingamajig")
    assert res["top"] == "Miscellaneous"
    assert needs_review(res["confidence"])
