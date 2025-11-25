# TODO — Polo Sanca v1 (Lean MVP) Delivery Milestones

Canonical engineering checklist to deliver [`PRD.md`](./PRD.md) (v1 / Phase 1 MVP) and [`openapi.yaml`](./openapi.yaml) in **shippable vertical milestones (`M0`–`M5`)**.

> **Terminology note:** `M0`–`M5` track vertical slices inside the **v1 MVP**, keeping **"Phase 2"** reserved for the post-MVP roadmap in [`PRD.md` Section 8](./PRD.md).

---

## M0 — Data Integrity, Read Scalability, AIP Contract & CUJ Test Harness *(Done ✅)*

- [x] **Harden SQLAlchemy models for data integrity & read scalability (`app/models/__init__.py`)**:
  - **Fixed `0.0°C` falsiness bug**: `is not None` used on `Numeric` fields in `Telemetry.to_dict()` and `AlertRule.to_dict()`
  - **Removed destructive `delete-orphan` / `CASCADE` deletes** on `Company` and `Equipment` historical relationships (`telemetry`, `alerts`, `maintenance_records`, `branches`, `users`) in favor of `ON DELETE RESTRICT` + soft-deactivation
  - `Branch`: added `manager_contact` and `UNIQUE (id, company_id)` (`uq_branches_id_company_id`) backing composite FK `fk_equipments_branch_company` on `Equipment`
  - `Equipment`: added `is_active`, unindexed `current_data` (`JSONB` live snapshot with `fillfactor = 80` for PostgreSQL HOT updates), `last_maintenance_date`, `next_maintenance_date`, and `SHA-256` hashed `api_key`
  - `User`, `AlertRule`, `Telemetry`, `AuditLog`: added domain `CHECK` constraints (`ck_users_role_company_id`, `ck_alert_rules_threshold_operator`, `ck_alert_rules_scope_id`, `ck_telemetry_source_fields`), composite index `ix_telemetry_equipment_time`, partial idempotency index `ix_telemetry_equipment_request_id`, composite PK `(time, equipment_id, id)`, and keyset index `ix_audit_logs_created_id`
  - `Alert`: added PostgreSQL partial unique index `uq_open_alert_per_rule` on `(equipment_id, alert_rule_id) WHERE status IN ('active', 'acknowledged') AND alert_rule_id IS NOT NULL`
- [x] **Initialize Alembic migrations (`migrations/`)**:
  - Created `0001_initial_hardened_schema.py` with all constraints, partial indexes, `ALTER TABLE equipments SET (fillfactor = 80)`, and conditional TimescaleDB hypertable, 7-day compression, 2-year retention, and `telemetry_hourly` / `telemetry_daily` continuous aggregates
- [x] **Core integrity, status recomputation & pagination helpers (`app/utils/integrity.py`)**:
  - `recompute_equipment_status` serialized with `SELECT ... FOR UPDATE` (`offline` after `600s` > `critical` > `warning` > `operational`)
  - `create_alert_if_not_open` using PostgreSQL `INSERT ... ON CONFLICT DO NOTHING` against `uq_open_alert_per_rule`
  - Standardized timezone-aware `utc_now()`, `clamp_pagination`, `encode_page_token` / `decode_page_token`, and global `IntegrityError` / `500` `db.session.rollback()` handlers
- [x] **Zero N+1 read scalability & non-destructive lifecycle across core routes**:
  - Single-query aggregate counts (`branches_count`, `equipment_count`), `joinedload(Equipment.branch)`, `contains_eager(Alert.equipment)`, `GET /v1/telemetry/realtime` (`equipments.current_data`), `POST /v1/equipments/<id>/rotate-api-key`, `GET /v1/audit-logs`, and `interval` (`raw`, `5min`, `1hour`, `1day`) bucketed/CAGG telemetry queries
  - Soft-deactivation on `DELETE /v1/equipments/<id>` (`is_active = False`) and `DELETE /v1/companies/<id>` (`status = inactive`), plus `409 Conflict` guards on `DELETE /v1/branches/<id>`
- [x] **Google AIP contract alignment**:
  - `201` resource body on `POST /v1/alert-rules` & `204` on `DELETE /v1/alert-rules/<id>` (AIP-133/135), `POST` on `/v1/alerts/<id>/acknowledge` & `.../resolve` (AIP-136), optional `Idempotency-Key` / `request_id` deduplication on `POST /v1/equipments/telemetry` (AIP-155), and keyset `page_token` / `next_page_token` cursor pagination on `/v1/equipments/<id>/telemetry` & `/v1/audit-logs` (AIP-158)
- [x] **12-suite API CUJ & integrity test harness (`tests/test_01_*.py`–`tests/test_12_*.py`)**:
  - Maps `test_01`–`test_11` 1-to-1 with `PRD.md` Sections `5.1`–`5.11` (with `xfail(strict=True)` contract tests guarding pending milestone endpoints)

---

## M1 — Identity, Tenant Security & Audit Trail *(Unblocks safe real logins)*

- [x] **Lock down `users.py` RBAC (`app/routes/users.py`)**:
  - Restrict `GET /v1/users`, `GET /v1/users/<id>`, `PATCH /v1/users/<id>`, and `DELETE /v1/users/<id>` to `global_admin` or owning `company_admin`
  - Prevent `company_admin` from promoting any user to `global_admin` or mutating users outside their company; restrict raw `POST /v1/users` to `global_admin` in favor of `/v1/users/invite`
- [x] **Invitation acceptance & account self-service**:
  - `POST /v1/users/accept-invitation` (redeem 7-day token, hash password, transition `status` from `pending` to `active`, clear token)
  - Add `User` password-reset token & expiration columns (`1h` TTL) via Alembic migration + implement `PATCH /v1/auth/me` (`name` update), `POST /v1/auth/change-password`, `POST /v1/auth/forgot-password`, and `POST /v1/auth/reset-password`
- [x] **Redis JWT revocation & rate limiting**:
  - Wire JWT JTI blocklist in Redis (with in-process fallback) on `POST /v1/auth/logout` and immediate token rejection on user/company deactivation (`DELETE /v1/users/<id>`, `DELETE /v1/companies/<id>`)
  - Configure `Flask-Limiter` backed by Redis (`/v1/auth/login` 10/min, `/v1/auth/forgot-password` 10/min, `/v1/equipments/telemetry` 12/min per API key, 100/min user & 1000/min Global Admin defaults) and remove unused `Flask-SocketIO` from `requirements.txt`, `config.py`, `run.py`, and `app/__init__.py` (deferred to PRD Phase 2)
- [x] **Administrative mutation audit logging**:
  - Add reusable `record_audit_log(...)` helper and record mutations across `companies`, `branches`, `equipments`, `users`, `auth`, `alerts`, `alert_rules`, and `maintenance` into `audit_logs`
- [x] **Exit gate**: Promote `xfail` tests in `test_01_auth_flow.py` (`test_13`), `test_02_company_onboarding_flow.py` (`test_09`), and `test_05_user_invitation_flow.py` (`test_12`) to passing (CUJs `5.1`, `5.2`, `5.5`, `5.6`, `5.10` 100% green)

---

## M2 — Core Alerting Engine & Offline Operations *(Core product value)* — Completed

- [x] **Shared rule-priority service & read-only rule visibility**:
  - Implement shared `(rule_type, severity)` rule resolution helper (`equipment` > `company` > `global` priority)
  - Allow `company_admin` read-only access on `GET /v1/alert-rules` and `GET /v1/alert-rules/<id>` scoped to `global` + own `company`/`equipment` rules
  - Implement `GET /v1/equipments/<id>/alert-rules` returning applicable rules annotated with `priority` and `is_effective`
- [x] **Celery + Celery Beat background evaluation (`app/services/`)**:
  - Evaluate threshold & `door_open` rules across `is_active = True` equipment (`duration_seconds` persistence check, race-free insert via `create_alert_if_not_open` / `uq_open_alert_per_rule`, `recompute_equipment_status`)
  - Enforce **60-second sustained normal-reading hysteresis** before auto-resolving open threshold/door alerts (preventing sensor-flapping email storms)
  - Periodic 60s offline heartbeat sweep: flip `equipment.status` to `offline` after **10 minutes (`600s`)** of hardware silence by default; trigger `equipment_offline` alert when an active rule matches
  - Single async email notification (`Flask-Mail` with Celery `autoretry_for` + exponential backoff) sent to **active Company Admins + permitted active Company Viewers (filtered by `UserBranchAccess`)** when an alert transitions to `active`
- [x] **Manual offline temperature fallback**:
  - Implement `POST /v1/equipments/<id>/telemetry/manual` (Global/Company Admin only while equipment is `offline`; `source = 'manual'`, keeps status `offline` and leaves `last_seen_at`/`current_data` unchanged; `409 Conflict` if online)
- [x] **Exit gate**: Promote `xfail` tests in `test_08_alert_rule_configuration_flow.py` (`test_03`) and `test_09_equipment_data_ingestion_flow.py` (`test_11`) + add Celery 60s hysteresis & 10-min sweep tests (CUJs `5.3`, `5.8`, `5.9`, `5.11` 100% green)

---

## M3 — Core Operations Frontend (`frontend/` — `pt-BR` MVP Slice 1) — Completed

- [x] Install `antd` (configured with `ptBR` locale) and `recharts`
- [x] Update `frontend/src/api.js` to read `import.meta.env.VITE_API_URL` (default `http://localhost:5000/v1`) and automatically refresh expired access tokens via `/v1/auth/refresh`
- [x] Build end-to-end daily operations UI in Brazilian Portuguese (`pt-BR`):
  - Login, Invitation Acceptance, and Password Reset flows
  - Live Equipment Monitoring Dashboard (30-second `/v1/telemetry/realtime` HTTP polling, branch/type/status filters)
  - Equipment Detail view (Recharts temperature/pressure trends, component badges, manual offline temperature modal, one-time API key modal)
  - Active Alerts feed with Acknowledge (notes) and Resolve actions

---

## M4 — Reporting, CSV Exports & Operational Hardening

- [x] **Streamed CSV exports (`yield_per` server-side cursors)**:
  - `GET /v1/equipments/<id>/telemetry/export` (`text/csv`; enforce **90-day max window** on `interval=raw` with `400 Bad Request`, allowing up to **2 years** for `1hour` / `1day` aggregates)
  - `GET /v1/alerts/export` (`text/csv`, respecting role and `UserBranchAccess` filters)
- [x] **Alert & rule analytics endpoints**:
  - `GET /v1/alerts/statistics` and `GET /v1/alert-rules/<id>/statistics`
- [x] **Operational readiness & request validation**:
  - Deep `/health` check (`app/__init__.py`) verifying PostgreSQL (`SELECT 1`) and Redis (`PING`) readiness
  - Update `init_db.py` to apply Alembic `upgrade()` and idempotently seed demo data instead of `db.drop_all()` / `db.create_all()`
  - Standardize Marshmallow request schema validation across routes
- [x] **Exit gate**: Promote remaining `xfail` tests in `test_04_equipment_monitoring_flow.py` (`test_04`) and `test_07_alert_management_flow.py` (`test_05`) — **all 12 API suites 100% passing (`0 xfail`)**

---

## M5 — Admin & Compliance Frontend (`frontend/` — `pt-BR` MVP Slice 2)

- [x] Companies (Global Admin) & Branches management pages
- [x] Users & Branch Access management page (invite, resend invitation, role/branch updates, soft-deactivation)
- [x] Alert Rules management page (Global Admin CRUD; Company Admin read-only view + per-equipment priority view)
- [x] Equipment Maintenance Logbook UI (log/edit/delete records + next-maintenance summary)
- [x] CSV export download triggers on Telemetry & Alerts pages + Global Admin Audit Logs viewer (`/v1/audit-logs` with cursor pagination)
