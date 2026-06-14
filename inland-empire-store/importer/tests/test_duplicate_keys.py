from src.utils import duplicate_key, normalize_title


def test_item_id_takes_priority():
    rec = {"ebay_item_id": "123", "sku": "ABC", "title": "Thing"}
    assert duplicate_key(rec) == ("ebay_item_id", "123")


def test_sku_when_no_item_id():
    rec = {"ebay_item_id": "", "sku": "ABC", "title": "Thing"}
    assert duplicate_key(rec) == ("sku", "ABC")


def test_normalized_title_fallback():
    rec = {"ebay_item_id": "", "sku": "", "title": "Dell  OptiPlex 7060!!"}
    kind, val = duplicate_key(rec)
    assert kind == "norm_title"
    assert val == "dell optiplex 7060"


def test_brand_mpn_last_resort():
    rec = {"ebay_item_id": "", "sku": "", "title": "", "brand": "HP", "mpn": "Z240"}
    assert duplicate_key(rec) == ("brand_mpn", "hp|z240")


def test_normalize_title_collapses_punct_and_case():
    assert normalize_title("  HP-Z240   (Tested) ") == "hp z240 tested"
