#!/usr/bin/env python3
"""Isolated API regression smoke test. Creates a TEMPORARY database, never accesses a live one."""
from __future__ import annotations

import json
import os
import pathlib
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from datetime import date

ROOT = pathlib.Path(__file__).resolve().parents[1]
DLL = ROOT / "backend" / "bin" / "Release" / "net10.0" / "WorkAccounting.Api.dll"
ADMIN_PASSWORD = "LocalCIOnly-StrongPassword-987"


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def make_api(base_url: str):
    def api(method: str, path: str, token: str | None = None, body: dict | None = None):
        data = None if body is None else json.dumps(body).encode("utf-8")
        headers = {"Content-Type": "application/json"} if data is not None else {}
        if token:
            headers["Authorization"] = "Bearer " + token
        request = urllib.request.Request(base_url + path, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=8) as response:
                status, result = response.status, response.read()
        except urllib.error.HTTPError as e:
            status, result = e.code, e.read()
        try:
            decoded = json.loads(result.decode("utf-8")) if result else None
        except ValueError:
            decoded = result.decode("utf-8", errors="replace")
        return status, decoded
    return api


def expect(api, method, path, token=None, body=None, status=200):
    actual, value = api(method, path, token, body)
    assert actual == status, f"{method} {path}: expected {status}, got {actual}: {value!r}"
    return value


def main():
    assert DLL.exists(), f"Build first: dotnet build backend/WorkAccounting.Api.csproj -c Release ({DLL})"
    port = free_port()
    endpoint = f"http://127.0.0.1:{port}"
    api = make_api(endpoint)
    with tempfile.TemporaryDirectory(prefix="workaccounting-ci-") as td:
        logfile = pathlib.Path(td) / "server.log"
        env = dict(os.environ, ASPNETCORE_URLS=endpoint, WORK_ADMIN_PASSWORD=ADMIN_PASSWORD)
        with logfile.open("w", encoding="utf-8") as out:
            proc = subprocess.Popen(["dotnet", str(DLL)], cwd=td, env=env, stdout=out, stderr=subprocess.STDOUT)
            try:
                for _ in range(160):
                    if proc.poll() is not None:
                        break
                    try:
                        status, _ = api("GET", "/api/health")
                        if status == 200:
                            break
                    except (OSError, TimeoutError):
                        pass
                    time.sleep(.25)
                else:
                    raise AssertionError("API startup timeout")
                assert proc.poll() is None, "API exited during startup"
                admin = expect(api, "POST", "/api/auth/login",
                               body={"login": "admin", "password": ADMIN_PASSWORD})["token"]
                c1 = expect(api, "POST", "/api/contracts", admin, {"name": "A", "code": "A"})["id"]
                c2 = expect(api, "POST", "/api/contracts", admin, {"name": "B", "code": "B"})["id"]
                s1 = expect(api, "POST", "/api/sections", admin, {"name": "Section Alpha"})["id"]
                s2 = expect(api, "POST", "/api/sections", admin, {"name": "Section Beta"})["id"]
                v1 = expect(api, "POST", "/api/vehicles", admin, {"contract_id": c1, "number": "CAR-1"})["id"]
                expect(api, "POST", "/api/vehicles", admin, {"contract_id": c2, "number": "CAR-2"})
                template = expect(api, "POST", "/api/contract_works", admin,
                                  {"contract_id": c1, "section_id": s1, "name": "Welding", "norm_hours": 10})["id"]
                expect(api, "POST", "/api/contract_works", admin,
                       {"contract_id": c2, "section_id": s2, "name": "Assembly", "norm_hours": 4})
                user_id = expect(api, "POST", "/api/users", admin,
                                 {"login": "master_one", "password": "master-local-ci-password",
                                  "role": "Master"})["id"]
                expect(api, "PUT", f"/api/users/{user_id}/sections", admin, {"section_ids": [s1]})
                master = expect(api, "POST", "/api/auth/login",
                                body={"login": "master_one", "password": "master-local-ci-password"})["token"]
                # Agreed behavior 1: all authorized masters READ shared production information.
                contracts = expect(api, "GET", "/api/contracts", master)
                assert {c1, c2}.issubset({row["id"] for row in contracts})
                works = expect(api, "GET", "/api/works", master)
                assert len(works) >= 2
                work_id = next(w["id"] for w in works if w["vehicle_id"] == v1 and w["contract_work_id"] == template)
                day = date.today().isoformat()
                def snapshot(section, percent, hours):
                    return {"contract_id": c1, "section_id": section, "date": day,
                            "hours": hours, "entries": [{"work_id": work_id, "percent": percent}]}
                # Agreed behavior 2: masters cannot WRITE outside assigned sections.
                expect(api, "PUT", "/api/section-report", master, snapshot(s2, 25, 4), 403)
                expect(api, "PUT", "/api/section-report", master, snapshot(s1, 20, 6))
                # Agreed behavior 3: same-date re-save replaces daily percent, not accumulates.
                expect(api, "PUT", "/api/section-report", master, snapshot(s1, 35, 8))
                daily = expect(api, "GET", "/api/daily", master)
                matching = [r for r in daily if r["work_id"] == work_id and r["date"] == day]
                assert len(matching) == 1 and matching[0]["percent"] == 35, matching
                current = next(w for w in expect(api, "GET", "/api/works", master) if w["id"] == work_id)
                assert current["progress"] == 35, current
                # Completion is atomic; rejected material write-off cannot increment progress.
                mat = expect(api, "POST", "/api/materials", admin, {"name": "Test metal", "unit": "kg"})["id"]
                expect(api, "POST", f"/api/materials/{mat}/receive", admin, {"quantity": 4})
                expect(api, "POST", "/api/work_materials", admin,
                       {"material_id": mat, "work_id": work_id, "quantity": 5})
                tomorrow = date.fromordinal(date.today().toordinal() + 1).isoformat()
                finish = {"contract_id": c1, "section_id": s1, "date": tomorrow, "hours": 8,
                          "entries": [{"work_id": work_id, "percent": 65}]}
                expect(api, "PUT", "/api/section-report", master, finish, 400)
                still = next(w for w in expect(api, "GET", "/api/works", admin) if w["id"] == work_id)
                assert still["progress"] == 35, still
                expect(api, "POST", f"/api/materials/{mat}/receive", admin, {"quantity": 2})
                expect(api, "PUT", "/api/section-report", master, finish)
                final = next(w for w in expect(api, "GET", "/api/works", master) if w["id"] == work_id)
                assert final["progress"] == 100, final
                material = next(m for m in expect(api, "GET", "/api/materials", admin) if m["id"] == mat)
                assert material["balance"] == 1, material
                # Manager role is read-only, but can inspect all shared reports.
                manager_id = expect(api, "POST", "/api/users", admin,
                                    {"login": "manager_ci", "password": "manager-local-ci-password",
                                     "role": "Manager"})["id"]
                assert manager_id > 0
                manager = expect(api, "POST", "/api/auth/login",
                                 body={"login": "manager_ci", "password": "manager-local-ci-password"})["token"]
                expect(api, "GET", "/api/report/contracts", manager)
                expect(api, "PUT", "/api/section-report", manager, snapshot(s1, 0, 3), 403)
                # Unauthorized requests and invalid bearer token must never reveal data.
                expect(api, "GET", "/api/contracts", status=401)
                expect(api, "GET", "/api/contracts", "invalid-bearer", status=401)
                # Explicitly revoked session is not valid after logout.
                expect(api, "POST", "/api/auth/logout", manager)
                expect(api, "GET", "/api/report/contracts", manager, status=401)
                # Login brute-force protection: requests beyond the configured eight/minute return 429.
                attempts = [api("POST", "/api/auth/login",
                                body={"login": "admin", "password": "bad password"})[0]
                            for _ in range(12)]
                assert 429 in attempts, attempts
                print("PASS: shared reads, scoped writes, manager read-only, session revocation, same-day replacement, atomic stock, login rate limiting")
            except Exception:
                print("--- SERVER OUTPUT ---")
                print(logfile.read_text(encoding="utf-8")[-12000:])
                raise
            finally:
                proc.terminate()
                try:
                    proc.wait(timeout=8)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait(timeout=8)


if __name__ == "__main__":
    main()
