"""
OpenAPI 3.0.3 Generator from Live Flask Routes & Pydantic v2 Models.
Introspects Flask's url_map + @openapi_meta decorators and converts Pydantic v2
JSON Schema 2020-12 definitions into Spectral-compliant OpenAPI 3.0.3 YAML.
"""

import re
from collections.abc import Mapping

from flask import Flask
from pydantic import BaseModel
from pydantic.json_schema import JsonSchemaMode, models_json_schema

from app.schemas.openapi_meta import OPENAPI_META_ATTR, OpenApiRouteMeta
from app.schemas.responses import Error

_PATH_PARAM_RE = re.compile(r"<(?:[^:<>]+:)?([^<>]+)>")

_STATUS_DESCRIPTIONS: dict[int, str] = {
    200: "Success",
    201: "Created",
    204: "No Content",
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    409: "Conflict",
    429: "Too Many Requests",
}


def _flask_rule_to_openapi_path(rule: str) -> tuple[str, list[str]]:
    """Convert '/v1/equipments/<equipment_id>' -> ('/equipments/{equipment_id}', ['equipment_id'])."""
    stripped = rule.removeprefix("/v1")
    params = _PATH_PARAM_RE.findall(stripped)
    oas_path = _PATH_PARAM_RE.sub(r"{\1}", stripped)
    return oas_path, params


def _convert_anyof_nullable(variants: list[object]) -> dict[str, object] | None:
    """Convert JSON Schema 2020-12 anyOf: [T, {type: null}] into OpenAPI 3.0.3 nullable schema."""
    non_null = [v for v in variants if not (isinstance(v, dict) and v == {"type": "null"})]
    has_null = len(non_null) < len(variants)
    if not has_null:
        return None
    if len(non_null) == 1 and isinstance(non_null[0], dict):
        base = _to_oas3_schema(non_null[0])
        if "$ref" in base:
            return {"allOf": [base], "nullable": True}
        base["nullable"] = True
        return base
    converted = [_to_oas3_schema(v) for v in non_null if isinstance(v, dict)]
    return {"anyOf": converted, "nullable": True}


def _convert_schema_value(key: str, val: object) -> object:
    """Convert a single JSON Schema 2020-12 property value into OpenAPI 3.0.3."""
    if key == "properties" and isinstance(val, dict):
        return {k: _to_oas3_schema(v) for k, v in val.items() if isinstance(v, dict)}
    if key in ("items", "additionalProperties") and isinstance(val, dict):
        return _to_oas3_schema(val)
    if key in ("allOf", "anyOf", "oneOf") and isinstance(val, list):
        return [_to_oas3_schema(sub) for sub in val if isinstance(sub, dict)]
    return val


def _to_oas3_schema(node: Mapping[str, object]) -> dict[str, object]:
    """Recursively convert a Pydantic JSON Schema 2020-12 object to OpenAPI 3.0.3."""
    if "anyOf" in node and isinstance(node["anyOf"], list):
        nullable_converted = _convert_anyof_nullable(node["anyOf"])
        if nullable_converted is not None:
            for extra_key in ("description", "default", "title"):
                if extra_key in node and extra_key not in nullable_converted:
                    if extra_key == "default" and node[extra_key] is None:
                        continue
                    nullable_converted[extra_key] = node[extra_key]
            return nullable_converted

    result: dict[str, object] = {}
    for key, val in node.items():
        if key == "$defs":
            continue
        if key == "default" and val is None:
            continue
        if key == "const":
            result["enum"] = [val]
        else:
            result[key] = _convert_schema_value(key, val)
    return result


def _collect_route_models(
    routes: list[tuple[str, str, list[str], OpenApiRouteMeta]],
) -> list[tuple[type[BaseModel], JsonSchemaMode]]:
    """Collect every unique Pydantic model referenced across all route metadata with its schema mode."""
    seen: set[type[BaseModel]] = {Error}
    models: list[tuple[type[BaseModel], JsonSchemaMode]] = [(Error, "serialization")]

    def _add(model_cls: type[BaseModel], mode: JsonSchemaMode) -> None:
        if model_cls not in seen:
            seen.add(model_cls)
            models.append((model_cls, mode))

    for _, _, _, meta in routes:
        if meta.request_body is not None:
            _add(meta.request_body, "validation")
        for resp_val in meta.responses.values():
            if isinstance(resp_val, type) and issubclass(resp_val, BaseModel):
                _add(resp_val, "serialization")
    return models


def _build_query_parameters(query_cls: type[BaseModel]) -> list[dict[str, object]]:
    """Convert a Pydantic query-parameter model into OpenAPI query parameter objects."""
    raw = query_cls.model_json_schema(ref_template="#/components/schemas/{model}")
    props = raw.get("properties", {})
    required_set = set(raw.get("required", [])) if isinstance(raw.get("required"), list) else set()
    params: list[dict[str, object]] = []
    if not isinstance(props, dict):
        return params
    for name, prop_schema in props.items():
        if not isinstance(prop_schema, dict):
            continue
        converted = _to_oas3_schema(prop_schema)
        converted.pop("title", None)
        converted.pop("default", None)
        params.append(
            {
                "name": name,
                "in": "query",
                "required": name in required_set,
                "schema": converted,
            }
        )
    return params


def _build_operation_responses(meta: OpenApiRouteMeta) -> dict[str, object]:
    """Build the OpenAPI responses map for a single route operation."""
    responses: dict[str, object] = {}
    for code, spec_val in sorted(meta.responses.items()):
        desc = _STATUS_DESCRIPTIONS.get(code, "Response")
        if spec_val is None:
            responses[str(code)] = {"description": desc}
        elif isinstance(spec_val, str):
            responses[str(code)] = {
                "description": desc,
                "content": {spec_val: {"schema": {"type": "string"}}},
            }
        else:
            responses[str(code)] = {
                "description": desc,
                "content": {
                    "application/json": {
                        "schema": {"$ref": f"#/components/schemas/{spec_val.__name__}"},
                    }
                },
            }

    default_error_codes = (400, 401, 403, 404) if meta.security else (400, 404)
    for err_code in default_error_codes:
        if str(err_code) not in responses:
            responses[str(err_code)] = {
                "description": _STATUS_DESCRIPTIONS[err_code],
                "content": {"application/json": {"schema": {"$ref": "#/components/schemas/Error"}}},
            }
    return responses


def _build_operation(path_params: list[str], meta: OpenApiRouteMeta) -> dict[str, object]:
    """Construct a single OpenAPI 3.0.3 Operation object from route metadata."""
    op: dict[str, object] = {
        "summary": meta.summary,
        "tags": list(meta.tags),
    }
    if meta.description:
        op["description"] = meta.description
    if meta.operation_id:
        op["operationId"] = meta.operation_id

    if meta.security:
        op["security"] = [{scheme: []} for scheme in meta.security]
    else:
        op["security"] = []

    parameters: list[dict[str, object]] = [
        {
            "name": param,
            "in": "path",
            "required": True,
            "schema": {"type": "string", "format": "uuid"} if param.endswith("_id") else {"type": "string"},
        }
        for param in path_params
    ]
    if meta.query_params is not None:
        parameters.extend(_build_query_parameters(meta.query_params))
    if parameters:
        op["parameters"] = parameters

    if meta.request_body is not None:
        op["requestBody"] = {
            "required": True,
            "content": {
                "application/json": {
                    "schema": {"$ref": f"#/components/schemas/{meta.request_body.__name__}"},
                }
            },
        }

    op["responses"] = _build_operation_responses(meta)
    return op


def _extract_v1_routes(app: Flask) -> list[tuple[str, str, list[str], OpenApiRouteMeta]]:
    """Collect all registered /v1/* Flask routes that carry @openapi_meta."""
    collected: list[tuple[str, str, list[str], OpenApiRouteMeta]] = []
    for rule in app.url_map.iter_rules():
        if not rule.rule.startswith("/v1/"):
            continue
        view_func = app.view_functions.get(rule.endpoint)
        meta = getattr(view_func, OPENAPI_META_ATTR, None)
        if not isinstance(meta, OpenApiRouteMeta):
            raise RuntimeError(f"Flask route {rule.rule} ({rule.endpoint}) is missing @openapi_meta(...) decorator")
        oas_path, path_params = _flask_rule_to_openapi_path(rule.rule)
        for method in sorted((rule.methods or set()) - {"HEAD", "OPTIONS"}):
            collected.append((oas_path, method.lower(), path_params, meta))
    collected.sort(key=lambda item: (item[0], item[1]))
    return collected


def build_openapi_spec(app: Flask) -> dict[str, object]:
    """Generate the complete OpenAPI 3.0.3 specification dict from the Flask app."""
    routes = _extract_v1_routes(app)
    models = _collect_route_models(routes)

    _, top_level = models_json_schema(
        models,
        ref_template="#/components/schemas/{model}",
    )
    raw_defs = top_level.get("$defs", {})
    schemas: dict[str, object] = {}
    if isinstance(raw_defs, dict):
        for name in sorted(raw_defs.keys()):
            schema_obj = raw_defs[name]
            if isinstance(schema_obj, dict):
                converted = _to_oas3_schema(schema_obj)
                converted.pop("title", None)
                schemas[name] = converted

    paths: dict[str, dict[str, object]] = {}
    for oas_path, method, path_params, meta in routes:
        paths.setdefault(oas_path, {})[method] = _build_operation(path_params, meta)

    return {
        "openapi": "3.0.3",
        "info": {
            "title": "Polo Sanca Telemetry API",
            "version": "1.0.0",
            "description": (
                "Multi-tenant SaaS telemetry platform for real-time monitoring of refrigeration "
                "and cold storage equipment. Generated directly from Pydantic v2 models and Flask routes."
            ),
            "contact": {"name": "Polo Sanca Engineering"},
        },
        "servers": [
            {"url": "http://localhost:5000/v1", "description": "Local Development"},
        ],
        "paths": paths,
        "components": {
            "securitySchemes": {
                "BearerAuth": {
                    "type": "http",
                    "scheme": "bearer",
                    "bearerFormat": "JWT",
                },
                "ApiKeyAuth": {
                    "type": "apiKey",
                    "in": "header",
                    "name": "X-API-Key",
                },
            },
            "schemas": schemas,
        },
    }
