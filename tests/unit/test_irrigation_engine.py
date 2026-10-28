import datetime
import pytest
from backend.app.services.irrigation_engine import IrrigationEngine

def test_auto_irrigation_starts_when_soil_dry():
    now = datetime.datetime(2026, 10, 28, 12, 0, 0, tzinfo=datetime.timezone.utc)
    decision = IrrigationEngine.evaluate(
        soil_moisture_percent=25.0,  # Below 35% dry threshold
        rain_detected=False,
        light_percent=50.0,
        current_pump_state="OFF",
        pump_started_at=None,
        last_irrigation_end=None,
        auto_mode_enabled=True,
        dry_threshold_percent=35.0,
        target_moisture_percent=70.0,
        max_runtime_seconds=300,
        cooldown_minutes=30,
        rain_pause_enabled=True,
        daylight_only=False,
        now=now
    )
    assert decision.action == "START"
    assert decision.should_change_state is True
    assert "below dry threshold" in decision.reason

def test_auto_irrigation_stops_when_target_reached():
    now = datetime.datetime(2026, 10, 28, 12, 5, 0, tzinfo=datetime.timezone.utc)
    decision = IrrigationEngine.evaluate(
        soil_moisture_percent=72.0,  # Above 70% target
        rain_detected=False,
        light_percent=50.0,
        current_pump_state="ON",
        pump_started_at=now - datetime.timedelta(seconds=60),
        last_irrigation_end=None,
        auto_mode_enabled=True,
        dry_threshold_percent=35.0,
        target_moisture_percent=70.0,
        max_runtime_seconds=300,
        cooldown_minutes=30,
        rain_pause_enabled=True,
        daylight_only=False,
        now=now
    )
    assert decision.action == "STOP"
    assert decision.should_change_state is True
    assert "Target soil moisture reached" in decision.reason

def test_rain_pauses_irrigation():
    now = datetime.datetime(2026, 10, 28, 12, 0, 0, tzinfo=datetime.timezone.utc)
    # Soil is dry (20%), but rain is detected and rain_pause is enabled
    decision = IrrigationEngine.evaluate(
        soil_moisture_percent=20.0,
        rain_detected=True,
        light_percent=40.0,
        current_pump_state="OFF",
        pump_started_at=None,
        last_irrigation_end=None,
        auto_mode_enabled=True,
        dry_threshold_percent=35.0,
        target_moisture_percent=70.0,
        max_runtime_seconds=300,
        cooldown_minutes=30,
        rain_pause_enabled=True,
        daylight_only=False,
        now=now
    )
    assert decision.action == "HOLD"
    assert decision.should_change_state is False
    assert decision.safety_block == "RAIN_PAUSE"

def test_max_runtime_cutoff():
    now = datetime.datetime(2026, 10, 28, 12, 10, 0, tzinfo=datetime.timezone.utc)
    # Pump has been running for 350 seconds (exceeding 300s limit)
    decision = IrrigationEngine.evaluate(
        soil_moisture_percent=40.0, # Not at target yet
        rain_detected=False,
        light_percent=50.0,
        current_pump_state="ON",
        pump_started_at=now - datetime.timedelta(seconds=350),
        last_irrigation_end=None,
        auto_mode_enabled=True,
        dry_threshold_percent=35.0,
        target_moisture_percent=70.0,
        max_runtime_seconds=300,
        cooldown_minutes=30,
        rain_pause_enabled=True,
        daylight_only=False,
        now=now
    )
    assert decision.action == "STOP"
    assert decision.should_change_state is True
    assert decision.safety_block == "MAX_RUNTIME_EXCEEDED"

def test_cooldown_enforcement():
    now = datetime.datetime(2026, 10, 28, 12, 15, 0, tzinfo=datetime.timezone.utc)
    # Pump finished watering 10 minutes ago, but cooldown is 30 minutes
    decision = IrrigationEngine.evaluate(
        soil_moisture_percent=20.0, # Soil dry again
        rain_detected=False,
        light_percent=50.0,
        current_pump_state="OFF",
        pump_started_at=None,
        last_irrigation_end=now - datetime.timedelta(minutes=10),
        auto_mode_enabled=True,
        dry_threshold_percent=35.0,
        target_moisture_percent=70.0,
        max_runtime_seconds=300,
        cooldown_minutes=30,
        rain_pause_enabled=True,
        daylight_only=False,
        now=now
    )
    assert decision.action == "HOLD"
    assert decision.should_change_state is False
    assert decision.safety_block == "COOLDOWN_ACTIVE"

def test_invalid_sensor_failsafe():
    now = datetime.datetime(2026, 10, 28, 12, 0, 0, tzinfo=datetime.timezone.utc)
    # Soil moisture is None while pump is running
    decision = IrrigationEngine.evaluate(
        soil_moisture_percent=None,
        rain_detected=False,
        light_percent=50.0,
        current_pump_state="ON",
        pump_started_at=now - datetime.timedelta(seconds=30),
        last_irrigation_end=None,
        auto_mode_enabled=True,
        dry_threshold_percent=35.0,
        target_moisture_percent=70.0,
        max_runtime_seconds=300,
        cooldown_minutes=30,
        rain_pause_enabled=True,
        daylight_only=False,
        now=now
    )
    assert decision.action == "STOP"
    assert decision.should_change_state is True
    assert decision.safety_block == "INVALID_SENSOR_DATA"
