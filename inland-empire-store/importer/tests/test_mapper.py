from src.csv_loader import normalize_row
from src.mapper import build_attributes, to_wc_payload


def test_build_attributes_maps_specifics():
    record = {
        "brand": "Dell", "mpn": "OptiPlex 7060", "condition": "Used",
        "specifics": {"RAM Size": "16 GB", "Processor": "Intel i7", "Storage": "512GB SSD"},
    }
    attrs = {a["name"]: a["options"][0] for a in build_attributes(record)}
    assert attrs["Brand"] == "Dell"
    assert attrs["Condition"] == "Used"
    assert attrs["RAM"] == "16 GB"
    assert attrs["CPU"] == "Intel i7"
    assert attrs["Storage Capacity"] == "512GB SSD"
    assert attrs["MPN"] == "OptiPlex 7060"


def test_payload_is_always_draft_and_hidden():
    record = {"title": "Cisco Switch", "price": "100", "quantity": 2, "specifics": {}}
    payload = to_wc_payload(record)
    assert payload["status"] == "draft"
    assert payload["catalog_visibility"] == "hidden"
    assert payload["stock_quantity"] == 2


def test_payload_marks_low_confidence_needs_review():
    record = {"title": "Mystery thingamajig", "price": "5", "quantity": 1, "specifics": {}}
    payload = to_wc_payload(record)
    status_meta = [m for m in payload["meta_data"] if m["key"] == "_anstelias_import_status"][0]
    assert status_meta["value"] == "needs_review"


def test_csv_normalize_row_splits_images_and_specifics():
    row = {
        "Item number": "123", "Title": "HP Z240", "Current price": "199.99",
        "Available quantity": "1", "Picture URL": "https://a/1.jpg|https://a/2.jpg",
        "Some Spec": "Value",
    }
    rec = normalize_row(row)
    assert rec["ebay_item_id"] == "123"
    assert rec["price"] == "199.99"
    assert rec["images"] == ["https://a/1.jpg", "https://a/2.jpg"]
    assert rec["specifics"]["Some Spec"] == "Value"
