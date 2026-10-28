import pytest
from fastapi.testclient import TestClient
from backend.app.main import app, init_db_defaults

@pytest.fixture(scope="session", autouse=True)
def setup_database():
    init_db_defaults()

client = TestClient(app)

def test_api_health():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "database" in data

def test_dashboard_public_read():
    response = client.get("/api/dashboard")
    assert response.status_code == 200
    data = response.json()
    assert "system_status" in data
    assert "esp32_status" in data
    assert "operating_mode" in data

def test_devices_list():
    response = client.get("/api/devices")
    assert response.status_code == 200
    data = response.json()
    assert "devices" in data
    assert len(data["devices"]) >= 5

def test_auth_login_default_admin():
    response = client.post("/api/auth/login", json={
        "email": "admin@smartirrigate.io",
        "password": "SmartAdmin2026!"
    })
    assert response.status_code == 200
    token_data = response.json()
    assert "access_token" in token_data
    token = token_data["access_token"]

    # Test me endpoint with token
    headers = {"Authorization": f"Bearer {token}"}
    me_resp = client.get("/api/auth/me", headers=headers)
    assert me_resp.status_code == 200
    assert me_resp.json()["email"] == "admin@smartirrigate.io"

def test_simulation_telemetry_and_command_ack():
    # 1. Login to get token
    login_resp = client.post("/api/auth/login", json={
        "email": "admin@smartirrigate.io",
        "password": "SmartAdmin2026!"
    })
    token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Inject simulated telemetry
    sim_resp = client.post("/api/simulation/telemetry", json={
        "soil_moisture_percent": 31.0,
        "temperature_c": 25.5,
        "humidity_percent": 60.0,
        "light_raw": 1900,
        "rain_detected": False,
        "pump_state": "OFF"
    })
    assert sim_resp.status_code == 200

    # 3. Check dashboard now shows non-empty reading
    dash_resp = client.get("/api/dashboard")
    assert dash_resp.status_code == 200
    reading = dash_resp.json()["latest_reading"]
    assert reading is not None
    assert reading["soil_moisture_percent"] == 31.0
    assert reading["is_simulated"] is True

    # 4. Dispatch a manual pump command
    cmd_resp = client.post("/api/irrigation/commands", json={
        "action": "START_PUMP",
        "duration_seconds": 120,
        "reason": "Test integration run"
    }, headers=headers)
    assert cmd_resp.status_code == 200
    cmd_data = cmd_resp.json()
    command_id = cmd_data["command_id"]
    assert cmd_data["status"] == "SENT"

    # 5. Simulate ESP32 acknowledging the command
    ack_resp = client.post("/api/simulation/ack", json={
        "command_id": command_id,
        "confirmed_pump_state": "ON",
        "status": "ACKNOWLEDGED"
    })
    assert ack_resp.status_code == 200

    # 6. Check irrigation status confirms physical pump state is ON or RUNNING
    status_resp = client.get("/api/irrigation/status")
    assert status_resp.status_code == 200
    irr_status = status_resp.json()
    assert irr_status["current_pump_state"] in ["ON", "RUNNING"]
    assert irr_status["last_command"]["confirmed_pump_state"] == "ON"

