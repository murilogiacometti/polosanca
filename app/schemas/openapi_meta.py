"""
Declarative OpenAPI Metadata Decorator for Flask Routes.
Attaches typed Pydantic request, query, and response models directly to Flask
view functions so openapi.yaml is generated straight from live route code.
"""

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import TypeVar

from pydantic import BaseModel

_F = TypeVar("_F", bound=Callable[..., object])

OPENAPI_META_ATTR = "__openapi_meta__"


@dataclass(frozen=True)
class OpenApiRouteMeta:
    """Declarative OpenAPI operation metadata attached to a Flask route handler."""

    summary: str
    tags: tuple[str, ...]
    description: str | None = None
    security: tuple[str, ...] = ("BearerAuth",)
    request_body: type[BaseModel] | None = None
    query_params: type[BaseModel] | None = None
    responses: dict[int, type[BaseModel] | str | None] = field(default_factory=dict)
    operation_id: str | None = None


def openapi_meta(
    *,
    summary: str,
    tags: list[str],
    description: str | None = None,
    security: list[str] | None = None,
    request_body: type[BaseModel] | None = None,
    query_params: type[BaseModel] | None = None,
    responses: dict[int, type[BaseModel] | str | None] | None = None,
    operation_id: str | None = None,
) -> Callable[[_F], _F]:
    """Attach OpenAPI metadata to a Flask route view function."""
    resolved_security = ("BearerAuth",) if security is None else tuple(security)
    meta = OpenApiRouteMeta(
        summary=summary,
        tags=tuple(tags),
        description=description,
        security=resolved_security,
        request_body=request_body,
        query_params=query_params,
        responses=dict(responses) if responses else {},
        operation_id=operation_id,
    )

    def decorator(func: _F) -> _F:
        setattr(func, OPENAPI_META_ATTR, meta)
        return func

    return decorator
