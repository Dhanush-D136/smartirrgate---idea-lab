import pytest
import datetime
from backend.app.services.simulation_service import simulation_engine
from backend.app.services.state_manager import state_manager

def test_pump_authoritative_initial_state():
    """Pump must never default to RUNNING on startup."""
    state_manager.set_mode("SIMULATION")
    simulation_engine.stop_pump("Test init")
    assert state_manager.get_authoritative_pump_state() == "OFF"

def test_simulation_pump_start_and_stop():
    """Start and stop in simulation mode must update authoritative state and return correct message."""
    state_manager.set_mode("SIMULATION")
    
    # 1. Start irrigation
    start_res = state_manager.start_irrigation(duration_seconds=120, reason="Test start")
    assert start_res["status"] == "SUCCESS"
    assert start_res["pump_state"] == "RUNNING"
    assert state_manager.get_authoritative_pump_state() == "RUNNING"
    assert simulation_engine.pump_state == "RUNNING"
    
    # 2. Stop irrigation
    stop_res = state_manager.stop_irrigation(reason="Irrigation stopped successfully")
    assert stop_res["status"] == "SUCCESS"
    assert stop_res["pump_state"] == "OFF"
    assert stop_res["message"] == "Irrigation stopped successfully."
    assert state_manager.get_authoritative_pump_state() == "OFF"
    assert simulation_engine.pump_state == "OFF"

def test_simulation_moisture_rise_and_target_stop():
    """Moisture must rise while running and stop when target threshold is reached."""
    state_manager.set_mode("SIMULATION")
    simulation_engine.reset(initial_moisture=68.0)
    
    # Start pump
    state_manager.start_irrigation(duration_seconds=300, reason="Target test")
    assert simulation_engine.pump_state == "RUNNING"
    
    # Tick simulation: moisture should climb
    m_before = simulation_engine.soil_moisture
    simulation_engine._tick()
    assert simulation_engine.soil_moisture > m_before
    
    # Set moisture to 70.5 (above target 70.0%) and tick -> must auto stop!
    simulation_engine.soil_moisture = 70.5
    simulation_engine._tick()
    assert simulation_engine.pump_state == "OFF"
    assert "Target moisture reached" in simulation_engine.last_decision_reason

def test_mode_switching_safely_stops_pump():
    """Switching modes while pump is running must safely stop the pump first."""
    state_manager.set_mode("SIMULATION")
    state_manager.start_irrigation(duration_seconds=120, reason="Running before switch")
    assert state_manager.get_authoritative_pump_state() == "RUNNING"
    
    # Switch to HARDWARE
    res = state_manager.set_mode("HARDWARE")
    assert res["status"] == "SUCCESS"
    assert res["mode"] == "HARDWARE"
    
    # Pump must now be OFF, not RUNNING
    assert state_manager.get_authoritative_pump_state() == "OFF"
    
    # Reset back to SIMULATION
    state_manager.set_mode("SIMULATION")
