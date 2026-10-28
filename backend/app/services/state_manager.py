import datetime
import logging
from typing import Optional, Dict, Any, Tuple
from backend.app.core.config import settings
from backend.app.core.database import SessionLocal
from backend.app.models.models import SystemState, IrrigationCommand, IrrigationEvent, SystemAlert, Device
from backend.app.services.simulation_service import simulation_engine
from backend.app.services.mqtt_service import mqtt_service

logger = logging.getLogger("smartirrigate.state_manager")

def make_aware(dt: Optional[datetime.datetime]) -> Optional[datetime.datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=datetime.timezone.utc)
    return dt

class SystemStateManager:
    """
    Single authoritative state manager for SmartIrrigate.
    Ensures complete, unambiguous synchronization between Dashboard, Management,
    Devices, and Analytics, with strict isolation between Simulator and Hardware modes.
    """
    
    @classmethod
    def get_system_state(cls) -> SystemState:
        db = SessionLocal()
        try:
            state = db.query(SystemState).first()
            if not state:
                state = SystemState(
                    operating_mode="SIMULATION",
                    permission_mode="AUTHORIZED_AUTO",
                    authoritative_pump_state="OFF"
                )
                db.add(state)
                db.commit()
                db.refresh(state)
            return state
        finally:
            db.close()

    @classmethod
    def get_mode(cls) -> str:
        state = cls.get_system_state()
        return state.operating_mode or "SIMULATION"

    @classmethod
    def get_operating_mode(cls, db=None) -> str:
        return cls.get_mode()

    @classmethod
    def set_mode(cls, new_mode: str) -> Dict[str, Any]:
        if new_mode not in ["SIMULATION", "HARDWARE"]:
            raise ValueError("Invalid operating mode. Must be 'SIMULATION' or 'HARDWARE'.")
            
        current_mode = cls.get_mode()
        if current_mode == new_mode:
            return {"status": "NO_CHANGE", "mode": current_mode}

        # If pump is currently running, safely stop it before switching modes
        current_pump = cls.get_authoritative_pump_state()
        if current_pump == "RUNNING":
            cls.stop_irrigation(reason=f"Safely stopped before switching mode to {new_mode}")

        db = SessionLocal()
        try:
            state = db.query(SystemState).first()
            if state:
                state.operating_mode = new_mode
                state.authoritative_pump_state = "OFF"
                state.updated_at = datetime.datetime.now(datetime.timezone.utc)
                db.commit()
        finally:
            db.close()

        # Manage simulation loop based on mode
        if new_mode == "SIMULATION":
            simulation_engine.resume()
        else:
            simulation_engine.pause()

        logger.info(f"Operating mode successfully switched from {current_mode} to {new_mode}")
        return {
            "status": "SUCCESS",
            "previous_mode": current_mode,
            "mode": new_mode,
            "message": f"Switched to {new_mode} Mode."
        }

    @classmethod
    def get_permission_mode(cls) -> str:
        state = cls.get_system_state()
        return state.permission_mode or "AUTHORIZED_AUTO"

    @classmethod
    def set_permission_mode(cls, new_perm: str) -> str:
        if new_perm not in ["AUTHORIZED_AUTO", "ASK_BEFORE_ACTION", "MANUAL_CONTROL"]:
            raise ValueError("Invalid permission mode.")
            
        db = SessionLocal()
        try:
            state = db.query(SystemState).first()
            if state:
                state.permission_mode = new_perm
                state.updated_at = datetime.datetime.now(datetime.timezone.utc)
                db.commit()
            
            # Synchronize auto_mode_enabled with permission mode
            setting = db.query(IrrigationSetting).filter(IrrigationSetting.device_id == settings.DEFAULT_ESP32_ID).first()
            if setting:
                setting.auto_mode_enabled = (new_perm != "MANUAL_CONTROL")
                db.commit()

            return new_perm
        finally:
            db.close()

    @classmethod
    def get_authoritative_pump_state(cls, db=None) -> str:
        mode = cls.get_mode()
        if mode == "SIMULATION":
            return simulation_engine.pump_state or "OFF"
        else:
            # In Hardware Mode: verify physical device connectivity
            db = SessionLocal()
            try:
                esp32 = db.query(Device).filter(Device.device_id == settings.DEFAULT_ESP32_ID).first()
                now = datetime.datetime.now(datetime.timezone.utc)
                is_online = False
                if esp32 and esp32.last_seen:
                    delta = (now - make_aware(esp32.last_seen)).total_seconds()
                    if delta < settings.STALE_DATA_TIMEOUT_SECONDS:
                        is_online = True
                
                if not is_online:
                    # Hardware is not connected: NEVER assume pump is running!
                    return "OFF"
                return mqtt_service.current_pump_state or "OFF"
            finally:
                db.close()

    @classmethod
    def start_irrigation(cls, duration_seconds: int = 300, reason: str = "Manual start", user_email: str = "operator") -> Dict[str, Any]:
        mode = cls.get_mode()
        
        if mode == "SIMULATION":
            res = simulation_engine.start_pump(duration_seconds=duration_seconds, reason=reason)
            cls._update_persisted_pump_state("RUNNING")
            return res
        else:
            # Hardware mode
            db = SessionLocal()
            try:
                esp32 = db.query(Device).filter(Device.device_id == settings.DEFAULT_ESP32_ID).first()
                now = datetime.datetime.now(datetime.timezone.utc)
                if not esp32 or not esp32.last_seen or (now - make_aware(esp32.last_seen)).total_seconds() > settings.STALE_DATA_TIMEOUT_SECONDS:
                    return {
                        "status": "FAILED",
                        "pump_state": "OFF",
                        "message": "Hardware not connected. Connect and verify your devices in Settings."
                    }
                    
                cmd = mqtt_service.dispatch_pump_command(
                    device_id=settings.DEFAULT_ESP32_ID,
                    action="START_PUMP",
                    reason=reason,
                    triggered_by=f"USER:{user_email}",
                    duration_seconds=duration_seconds
                )
                cls._update_persisted_pump_state("STARTING")
                return {
                    "status": "PENDING",
                    "pump_state": "STARTING",
                    "command_id": cmd.command_id,
                    "message": "Start command dispatched to ESP32. Awaiting controller state confirmation."
                }
            finally:
                db.close()

    @classmethod
    def stop_irrigation(cls, reason: str = "Irrigation stopped successfully", user_email: str = "operator") -> Dict[str, Any]:
        mode = cls.get_mode()
        
        if mode == "SIMULATION":
            res = simulation_engine.stop_pump(reason=reason)
            cls._update_persisted_pump_state("OFF")
            return res
        else:
            # Hardware mode
            db = SessionLocal()
            try:
                esp32 = db.query(Device).filter(Device.device_id == settings.DEFAULT_ESP32_ID).first()
                now = datetime.datetime.now(datetime.timezone.utc)
                is_online = False
                if esp32 and esp32.last_seen and (now - make_aware(esp32.last_seen)).total_seconds() < settings.STALE_DATA_TIMEOUT_SECONDS:
                    is_online = True
                    
                if not is_online:
                    cls._update_persisted_pump_state("OFF")
                    return {
                        "status": "WARNING",
                        "pump_state": "OFF",
                        "message": "Unable to confirm that irrigation has stopped. Check device connectivity."
                    }
                    
                cmd = mqtt_service.dispatch_pump_command(
                    device_id=settings.DEFAULT_ESP32_ID,
                    action="STOP_PUMP",
                    reason=reason,
                    triggered_by=f"USER:{user_email}"
                )
                cls._update_persisted_pump_state("STOPPING")
                return {
                    "status": "PENDING",
                    "pump_state": "STOPPING",
                    "command_id": cmd.command_id,
                    "message": "Stop command dispatched to ESP32. Awaiting controller state confirmation."
                }
            finally:
                db.close()

    @classmethod
    def emergency_stop(cls, user_email: str = "operator") -> Dict[str, Any]:
        # Always stops simulation AND issues hardware emergency stop
        simulation_engine.stop_pump("EMERGENCY STOP TRIGGERED")
        cls._update_persisted_pump_state("OFF")
        
        try:
            mqtt_service.dispatch_pump_command(
                device_id=settings.DEFAULT_ESP32_ID,
                action="EMERGENCY_STOP",
                reason="Operator Emergency Stop",
                triggered_by=f"USER:{user_email}"
            )
        except Exception:
            pass
            
        return {
            "status": "SUCCESS",
            "pump_state": "OFF",
            "message": "Emergency Stop executed across all controllers."
        }

    @classmethod
    def _update_persisted_pump_state(cls, state: str):
        db = SessionLocal()
        try:
            sys_state = db.query(SystemState).first()
            if sys_state:
                sys_state.authoritative_pump_state = state
                sys_state.updated_at = datetime.datetime.now(datetime.timezone.utc)
                db.commit()
        except Exception as e:
            db.rollback()
            logger.error(f"Error updating persisted pump state: {e}")
        finally:
            db.close()

state_manager = SystemStateManager()
