"""Exercise the hosted API on loopback, the same transport used by its proxy."""

import json
import os
import secrets
import socket
import subprocess
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = "https://floodwatch-monitoring.vercel.app"


def run():
    with tempfile.TemporaryDirectory(prefix="floodwatch-hosted-test-") as temp:
        with socket.socket() as reservation:
            reservation.bind(("127.0.0.1", 0))
            port = reservation.getsockname()[1]
        url = f"http://127.0.0.1:{port}"
        directory = Path(temp)
        key_file = directory / "device-key.txt"
        key = secrets.token_hex(32)
        key_file.write_text(key, encoding="ascii")
        env = dict(
            os.environ,
            FLOODWATCH_URL=url,
            FLOODWATCH_HOSTED="true",
            FLOODWATCH_DASHBOARD_ORIGIN=ORIGIN,
            FLOODWATCH_PUBLIC_GPS="false",
            FLOODWATCH_LOCAL_DASHBOARD="false",
            FLOODWATCH_DATA_DIR=str(directory / "data"),
            DEVICE_API_KEY_FILE=str(key_file),
        )
        dll = ROOT / "backend/bin/Release/net10.0/FloodWatch.Api.dll"

        def call(path, method="GET", body=None, **headers):
            if body is not None:
                headers["Content-Type"] = "application/json"
                body = json.dumps(body).encode()
            request = Request(url + path, data=body, headers=headers, method=method)
            try:
                response = urlopen(request, timeout=3)
            except HTTPError as error:
                response = error
            with response:
                raw = response.read()
                return response.status, response.headers, json.loads(raw) if raw else None

        with subprocess.Popen(["dotnet", str(dll)], env=env, cwd=temp, stdout=subprocess.DEVNULL) as api:
            try:
                for _ in range(40):
                    if api.poll() is not None:
                        raise RuntimeError("Hosted API exited on startup")
                    try:
                        if call("/api/health")[0] == 200:
                            break
                    except OSError:
                        time.sleep(0.15)
                else:
                    raise RuntimeError("Hosted API did not become ready")

                code, headers, settings = call("/api/settings", Origin=ORIGIN)
                assert code == 200 and headers["Access-Control-Allow-Origin"] == ORIGIN
                assert settings["publicGps"] is False
                assert call("/api/settings", Origin="https://outside.example.org")[1].get("Access-Control-Allow-Origin") is None
                assert call("/api/settings", "PUT", dict(settings, name="Disallowed"))[0] == 403

                sample = dict(
                    deviceId="FW-001", bootId="hosted-check", sequence=1,
                    observedAtUtc=datetime.now(timezone.utc).isoformat(),
                    distanceCm=90, latitude=14.25, longitude=120.5,
                )
                assert call("/api/readings", "POST", sample)[0] == 401
                assert call("/api/readings", "POST", sample, **{"X-Device-Key": key})[0] == 201
                code, headers, readings = call("/api/readings?demo=false", Origin=ORIGIN)
                assert code == 200 and headers["Access-Control-Allow-Origin"] == ORIGIN
                assert headers["Cache-Control"] == "no-store"
                assert readings[0]["levelCm"] == 60 and readings[0]["latitude"] is None and readings[0]["longitude"] is None
                stored = json.loads((directory / "data/readings.json").read_text())
                assert stored[0]["Latitude"] == 14.25 and stored[0]["Longitude"] == 120.5
                print("PASS hosted API: approved CORS origin, settings write locked, authenticated ingestion, private GPS storage.")
            finally:
                api.terminate()


if __name__ == "__main__":
    run()
