"""
Generate openapi.yaml directly from Flask routes and Pydantic v2 models.

Usage:
    python scripts/generate_openapi.py          # write openapi.yaml
    python scripts/generate_openapi.py --check  # exit non-zero if openapi.yaml is out of date
"""

import os
import sys
from pathlib import Path

import yaml

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

os.environ.setdefault("FLASK_ENV", "testing")
os.environ.setdefault("SECRET_KEY", "openapi-export-secret")
os.environ.setdefault("JWT_SECRET_KEY", "openapi-export-jwt-secret")

from app import create_app  # noqa: E402
from app.schemas.openapi_gen import build_openapi_spec  # noqa: E402

OPENAPI_PATH = ROOT_DIR / "openapi.yaml"
HEADER_COMMENT = (
    "# AUTO-GENERATED FILE — DO NOT EDIT MANUALLY.\n"
    "# Source of truth: app/schemas/ (Pydantic v2) + @openapi_meta decorators in app/routes/.\n"
    "# Regenerate with: python scripts/generate_openapi.py\n"
)


def render_openapi_yaml() -> str:
    app = create_app("testing")
    spec = build_openapi_spec(app)
    body = str(yaml.safe_dump(spec, sort_keys=False, allow_unicode=True, width=120))
    return HEADER_COMMENT + body


def main() -> int:
    rendered = render_openapi_yaml()
    if "--check" in sys.argv:
        existing = OPENAPI_PATH.read_text(encoding="utf-8") if OPENAPI_PATH.exists() else ""
        if existing != rendered:
            sys.stderr.write("openapi.yaml is out of date. Run: python scripts/generate_openapi.py\n")
            return 1
        print("openapi.yaml is up to date.")
        return 0

    OPENAPI_PATH.write_text(rendered, encoding="utf-8")
    print(f"Wrote {OPENAPI_PATH} ({len(rendered)} bytes).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
