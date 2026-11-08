from repro import build_detail, FALLBACK


def test_too_long_uses_field_label():
    errs = [{"loc": ("body", "title"), "type": "string_too_long", "ctx": {"max_length": 50}}]
    assert build_detail(errs) == "标题太长了，最多 50 字"


def test_body_only_error_returns_fallback():
    errs = [{"loc": ("body",), "type": "model_attributes_type"}]
    assert build_detail(errs) == FALLBACK
