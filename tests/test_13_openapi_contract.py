"""
OpenAPI 3.0 Contract Verification Suite
Validates live Flask API responses and registered routes directly against openapi.yaml
so backend responses cannot drift from the canonical OpenAPI spec (and generated TS types).
"""

from pathlib import Path

import jsonschema
import yaml

from tests.conftest import get_auth_headers, login_user

OPENAPI_PATH = Path(__file__).resolve().parent.parent / "openapi.yaml"


def _load_openapi_spec() -> dict:
    with OPENAPI_PATH.open("r", encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def _resolve_ref(spec: dict, ref: str) -> dict:
    if not ref.startswith("#/"):
        raise ValueError(f"Unsupported external $ref: {ref}")
    node = spec
    for part in ref[2:].split("/"):
        node = node[part]
    return node


def _oas3_to_jsonschema(spec: dict, schema: dict, _seen: frozenset[str] = frozenset()) -> dict:
    """Convert an OpenAPI 3.0 schema object (with $ref, nullable, allOf) into JSON Schema Draft 7."""
    if "$ref" in schema:
        ref = schema["$ref"]
        if ref in _seen:
            return {}
        target = _resolve_ref(spec, ref)
        converted = _oas3_to_jsonschema(spec, target, _seen | {ref})
        if schema.get("nullable"):
            return {"anyOf": [converted, {"type": "null"}]}
        return converted

    result: dict = {}
    nullable = bool(schema.get("nullable", False))

    for key, val in schema.items():
        if key in ("nullable", "example", "examples", "discriminator", "xml", "externalDocs", "deprecated"):
            continue
        if key == "properties" and isinstance(val, dict):
            result["properties"] = {k: _oas3_to_jsonschema(spec, v, _seen) for k, v in val.items()}
        elif key == "items" and isinstance(val, dict):
            result["items"] = _oas3_to_jsonschema(spec, val, _seen)
        elif key == "additionalProperties" and isinstance(val, dict):
            result["additionalProperties"] = _oas3_to_jsonschema(spec, val, _seen)
        elif key in ("allOf", "anyOf", "oneOf") and isinstance(val, list):
            result[key] = [_oas3_to_jsonschema(spec, sub, _seen) for sub in val]
        else:
            result[key] = val

    if "properties" in result and "additionalProperties" not in result:
        result["additionalProperties"] = False

    if nullable:
        if "enum" in result and None not in result["enum"]:
            result["enum"] = [*result["enum"], None]
        if "type" in result:
            t = result["type"]
            if isinstance(t, str) and t != "null":
                result["type"] = [t, "null"]
            elif isinstance(t, list) and "null" not in t:
                result["type"] = [*t, "null"]
        else:
            return {"anyOf": [result, {"type": "null"}]}

    return result


def _assert_matches_openapi(spec: dict, path_template: str, method: str, response) -> None:
    """Assert that a Flask test response's status code and JSON body match openapi.yaml."""
    method_lower = method.lower()
    assert path_template in spec["paths"], f"Path {path_template} missing from openapi.yaml"
    op = spec["paths"][path_template].get(method_lower)
    assert op is not None, f"Method {method.upper()} {path_template} missing from openapi.yaml"

    status_key = str(response.status_code)
    resp_spec = op["responses"].get(status_key)
    assert resp_spec is not None, (
        f"Status {status_key} for {method.upper()} {path_template} not documented in openapi.yaml "
        f"(documented: {list(op['responses'].keys())})"
    )
    if "$ref" in resp_spec:
        resp_spec = _resolve_ref(spec, resp_spec["$ref"])

    content = resp_spec.get("content", {})
    if "application/json" not in content:
        return

    raw_schema = content["application/json"]["schema"]
    json_schema = _oas3_to_jsonschema(spec, raw_schema)
    payload = response.get_json()
    validator = jsonschema.Draft7Validator(
        json_schema,
        format_checker=jsonschema.Draft7Validator.FORMAT_CHECKER,
    )
    errors = sorted(validator.iter_errors(payload), key=lambda e: list(e.path))
    if errors:
        formatted = "\n".join(
            f"  - path={'.'.join(str(p) for p in err.path) or '<root>'}: {err.message}" for err in errors[:10]
        )
        raise AssertionError(
            f"OpenAPI contract violation for {method.upper()} {path_template} ({status_key}):\n{formatted}"
        )


def _flask_rule_to_oas_path(rule_str: str) -> str:
    """Convert Flask route rule '/v1/equipments/<equipment_id>' -> '/equipments/{equipment_id}'."""
    path = rule_str.removeprefix("/v1")
    parts = []
    for segment in path.split("/"):
        if segment.startswith("<") and segment.endswith(">"):
            inner = segment[1:-1]
            param_name = inner.split(":", 1)[-1]
            parts.append("{" + param_name + "}")
        else:
            parts.append(segment)
    return "/".join(parts)


def test_00_openapi_yaml_is_up_to_date_with_pydantic_models():
    """Ensure committed openapi.yaml matches the spec generated from Pydantic v2 + Flask routes."""
    from scripts.generate_openapi import render_openapi_yaml

    assert OPENAPI_PATH.read_text(encoding="utf-8") == render_openapi_yaml(), (
        "openapi.yaml is out of date with Pydantic schemas. Run: python scripts/generate_openapi.py"
    )


def test_01_all_flask_v1_routes_documented_in_openapi(app):
    """Ensure every registered Flask /v1/* route+method matches openapi.yaml bidirectionally."""
    spec = _load_openapi_spec()
    spec_paths = spec["paths"]

    flask_routes: set[tuple[str, str]] = set()
    for rule in app.url_map.iter_rules():
        if not rule.rule.startswith("/v1/"):
            continue
        oas_path = _flask_rule_to_oas_path(rule.rule)
        for method in sorted(rule.methods - {"HEAD", "OPTIONS"}):
            flask_routes.add((method, oas_path))

    spec_routes: set[tuple[str, str]] = set()
    for oas_path, ops in spec_paths.items():
        for method in ops:
            spec_routes.add((method.upper(), oas_path))

    undocumented = sorted(f"{m} {p}" for m, p in flask_routes - spec_routes)
    stale = sorted(f"{m} {p}" for m, p in spec_routes - flask_routes)

    assert not undocumented, "Undocumented Flask /v1 routes missing from openapi.yaml:\n" + "\n".join(undocumented)
    assert not stale, "Stale routes in openapi.yaml not registered in Flask:\n" + "\n".join(stale)


def test_02_auth_and_error_responses_match_openapi(client, init_database):
    """Validate login, /auth/me, /auth/logout, and error responses against openapi.yaml."""
    spec = _load_openapi_spec()

    # 400 Bad Request (empty body)
    bad_resp = client.post("/v1/auth/login", json={})
    assert bad_resp.status_code == 400
    _assert_matches_openapi(spec, "/auth/login", "POST", bad_resp)

    # 401 Unauthorized
    unauth_resp = client.get("/v1/auth/me")
    assert unauth_resp.status_code == 401
    _assert_matches_openapi(spec, "/auth/me", "GET", unauth_resp)

    # 200 Login
    login_resp = client.post("/v1/auth/login", json={"email": "admin@polosanca.com", "password": "admin123"})
    assert login_resp.status_code == 200
    _assert_matches_openapi(spec, "/auth/login", "POST", login_resp)
    token = login_resp.get_json()["access_token"]

    # 200 Me
    me_resp = client.get("/v1/auth/me", headers=get_auth_headers(token))
    assert me_resp.status_code == 200
    _assert_matches_openapi(spec, "/auth/me", "GET", me_resp)

    # 200 Logout
    logout_resp = client.post("/v1/auth/logout", headers=get_auth_headers(token))
    assert logout_resp.status_code == 200
    _assert_matches_openapi(spec, "/auth/logout", "POST", logout_resp)


def test_03_companies_branches_and_users_match_openapi(client, init_database):
    """Validate companies, branches, and users list/detail responses against openapi.yaml."""
    spec = _load_openapi_spec()
    token, _ = login_user(client, "admin@polosanca.com", "admin123")
    headers = get_auth_headers(token)

    companies_resp = client.get("/v1/companies", headers=headers)
    assert companies_resp.status_code == 200
    _assert_matches_openapi(spec, "/companies", "GET", companies_resp)
    company_id = companies_resp.get_json()["companies"][0]["id"]

    company_resp = client.get(f"/v1/companies/{company_id}", headers=headers)
    assert company_resp.status_code == 200
    _assert_matches_openapi(spec, "/companies/{company_id}", "GET", company_resp)

    branches_resp = client.get("/v1/branches", headers=headers)
    assert branches_resp.status_code == 200
    _assert_matches_openapi(spec, "/branches", "GET", branches_resp)
    branch_id = branches_resp.get_json()["branches"][0]["id"]

    branch_resp = client.get(f"/v1/branches/{branch_id}", headers=headers)
    assert branch_resp.status_code == 200
    _assert_matches_openapi(spec, "/branches/{branch_id}", "GET", branch_resp)

    users_resp = client.get("/v1/users", headers=headers)
    assert users_resp.status_code == 200
    _assert_matches_openapi(spec, "/users", "GET", users_resp)
    user_id = users_resp.get_json()["users"][0]["id"]

    user_resp = client.get(f"/v1/users/{user_id}", headers=headers)
    assert user_resp.status_code == 200
    _assert_matches_openapi(spec, "/users/{user_id}", "GET", user_resp)


def test_04_equipments_telemetry_alerts_rules_maintenance_audit_match_openapi(client, init_database):
    """Validate equipment, telemetry, alert, alert-rule, maintenance, and audit-log responses against openapi.yaml."""
    spec = _load_openapi_spec()
    token, _ = login_user(client, "admin@polosanca.com", "admin123")
    headers = get_auth_headers(token)

    # Equipments list & detail
    eqs_resp = client.get("/v1/equipments", headers=headers)
    assert eqs_resp.status_code == 200
    _assert_matches_openapi(spec, "/equipments", "GET", eqs_resp)
    eq = eqs_resp.get_json()["equipment"][0]
    eq_id = eq["id"]

    eq_resp = client.get(f"/v1/equipments/{eq_id}", headers=headers)
    assert eq_resp.status_code == 200
    _assert_matches_openapi(spec, "/equipments/{equipment_id}", "GET", eq_resp)

    # Create equipment to get a known plaintext API key for hardware telemetry ingestion
    branches_resp = client.get("/v1/branches", headers=headers)
    branch_id = branches_resp.get_json()["branches"][0]["id"]
    create_eq_resp = client.post(
        "/v1/equipments",
        headers=headers,
        json={"serial": "CONTRACT-EQ-001", "type": "freezer", "branch_id": branch_id},
    )
    assert create_eq_resp.status_code == 201
    _assert_matches_openapi(spec, "/equipments", "POST", create_eq_resp)
    created_eq = create_eq_resp.get_json()
    created_eq_id = created_eq["id"]
    api_key = created_eq["api_key"]

    # Hardware telemetry submission + history + realtime
    tel_post = client.post(
        "/v1/equipments/telemetry",
        headers={"X-API-Key": api_key},
        json={
            "serial": "CONTRACT-EQ-001",
            "temperature": -18.5,
            "pressure": 102.3,
            "door": 0,
            "heater": 0,
            "compressor": 1,
            "fan": 1,
        },
    )
    assert tel_post.status_code == 200
    _assert_matches_openapi(spec, "/equipments/telemetry", "POST", tel_post)

    tel_get = client.get(f"/v1/equipments/{created_eq_id}/telemetry", headers=headers)
    assert tel_get.status_code == 200
    _assert_matches_openapi(spec, "/equipments/{equipment_id}/telemetry", "GET", tel_get)

    rt_resp = client.get("/v1/telemetry/realtime", headers=headers)
    assert rt_resp.status_code == 200
    _assert_matches_openapi(spec, "/telemetry/realtime", "GET", rt_resp)

    ov_resp = client.get("/v1/telemetry/overview", headers=headers)
    assert ov_resp.status_code == 200
    _assert_matches_openapi(spec, "/telemetry/overview", "GET", ov_resp)

    # Alerts & statistics
    alerts_resp = client.get("/v1/alerts", headers=headers)
    assert alerts_resp.status_code == 200
    _assert_matches_openapi(spec, "/alerts", "GET", alerts_resp)

    stats_resp = client.get("/v1/alerts/statistics", headers=headers)
    assert stats_resp.status_code == 200
    _assert_matches_openapi(spec, "/alerts/statistics", "GET", stats_resp)

    # Alert Rules create, list, detail, equipment effective rules
    rule_post = client.post(
        "/v1/alert-rules",
        headers=headers,
        json={
            "name": "Contract High Temp",
            "rule_type": "temperature_high",
            "threshold_value": 5.0,
            "comparison_operator": ">",
            "duration_seconds": 300,
            "severity": "critical",
            "scope": "global",
            "is_active": True,
        },
    )
    assert rule_post.status_code == 201
    _assert_matches_openapi(spec, "/alert-rules", "POST", rule_post)
    rule_id = rule_post.get_json()["id"]

    rules_resp = client.get("/v1/alert-rules", headers=headers)
    assert rules_resp.status_code == 200
    _assert_matches_openapi(spec, "/alert-rules", "GET", rules_resp)

    rule_get = client.get(f"/v1/alert-rules/{rule_id}", headers=headers)
    assert rule_get.status_code == 200
    _assert_matches_openapi(spec, "/alert-rules/{rule_id}", "GET", rule_get)

    eq_rules_resp = client.get(f"/v1/equipments/{created_eq_id}/alert-rules", headers=headers)
    assert eq_rules_resp.status_code == 200
    _assert_matches_openapi(spec, "/equipments/{equipment_id}/alert-rules", "GET", eq_rules_resp)

    # Maintenance create + list
    maint_post = client.post(
        f"/v1/equipments/{created_eq_id}/maintenance-records",
        headers=headers,
        json={
            "type": "routine_inspection",
            "description": "Quarterly compressor check",
            "performed_by": "Carlos Silva",
        },
    )
    assert maint_post.status_code == 201
    _assert_matches_openapi(spec, "/equipments/{equipment_id}/maintenance-records", "POST", maint_post)

    maint_list = client.get(f"/v1/equipments/{created_eq_id}/maintenance-records", headers=headers)
    assert maint_list.status_code == 200
    _assert_matches_openapi(spec, "/equipments/{equipment_id}/maintenance-records", "GET", maint_list)

    # Audit logs
    audit_resp = client.get("/v1/audit-logs", headers=headers)
    assert audit_resp.status_code == 200
    _assert_matches_openapi(spec, "/audit-logs", "GET", audit_resp)
