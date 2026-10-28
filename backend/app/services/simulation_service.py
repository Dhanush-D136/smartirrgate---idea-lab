import datetime
import logging
import threading
import time
import random
import uuid
from typing import Optional, Dict, Any
from backend.app.core.config import settings
from backend.app.core.database import SessionLocal
from backend.app.models.models import (
    SensorReading, IrrigationSetting, IrrigationEvent, SystemAlert,
    ProposedAction, Device
)
from backend.app.services.irrigation_engine import IrrigationEngine
from backend.app.services.websocket_manager import ws_manager
import asyncio

logger = logging.getLogger("smartirrigate.simulation")

def make_aware(dt: Optional[datetime.datetime]) -> Optional[datetime.datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=datetime.timezone.utc)
    return dt

class SimulationEngine:
    """
    Authoritative, backend-managed software simulation engine.
    Ensures deterministic, continuous, time-stepped irrigation simulation.
    Runs a single background thread so all frontend tabs stay perfectly synchronized.
    """
    def __init__(self):
        self.lock = threading.RLock()
        self.is_running: bool = True       # Active simulation loop

        self.is_paused: bool = False       # Paused state
        self.speed: int = 1                # 1x, 2x, 5x
        
        # Environmental state
        self.soil_moisture: float = 29.5   # Calibrated percentage
        self.temperature_c: float = 24.2
        self.humidity_percent: float = 64.0
        self.light_raw: int = 2100
        self.rain_detected: bool = False
        self.sensor_fault: bool = False
        
        # Actuator state
        self.pump_state: str = "OFF"       # "OFF", "RUNNING"
        self.pump_started_at: Optional[datetime.datetime] = None
        self.last_irrigation_end: Optional[datetime.datetime] = None
        self.session_runtime: int = 0
        self.active_session_id: Optional[str] = None
        self.start_soil_moisture: Optional[float] = None
        
        # Automation & Decision tracking
        self.last_decision_reason: str = "System initialized in simulation mode"
        self.last_decision_action: str = "HOLD"
        self.last_tick_time: datetime.datetime = datetime.datetime.now(datetime.timezone.utc)
        
        # Thread & Async loop
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._async_loop: Optional[asyncio.AbstractEventLoop] = None
        self._tick_counter: int = 0

    def set_async_loop(self, loop: asyncio.AbstractEventLoop):
        self._async_loop = loop

    def start_loop(self):
        with self.lock:
            if self._thread and self._thread.is_alive():
                return
            self._stop_event.clear()
            self._thread = threading.Thread(target=self._run_loop, daemon=True, name="SimulationEngineLoop")
            self._thread.start()
            logger.info("SimulationEngine background loop started.")

    def stop_loop(self):
        self._stop_event.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=3)
        self.is_running = False
        self.pump_state = "OFF"
        logger.info("SimulationEngine background loop stopped.")

    def pause(self):
        with self.lock:
            self.is_paused = True
            logger.info("SimulationEngine paused.")

    def resume(self):
        with self.lock:
            self.is_paused = False
            self.is_running = True
            logger.info("SimulationEngine resumed.")

    def reset(self, initial_moisture: float = 29.5):
        with self.lock:
            self.stop_pump("Simulation reset by operator")
            self.soil_moisture = max(5.0, min(95.0, initial_moisture))
            self.temperature_c = 24.0
            self.humidity_percent = 65.0
            self.light_raw = 2200
            self.rain_detected = False
            self.sensor_fault = False
            self.is_paused = False
            self.is_running = True
            self.last_decision_reason = "Simulation state reset to default parameters"
            logger.info(f"SimulationEngine reset (initial moisture: {self.soil_moisture}%).")

    def start_pump(self, duration_seconds: int = 300, reason: str = "Manual start in simulation") -> Dict[str, Any]:
        with self.lock:
            now = datetime.datetime.now(datetime.timezone.utc)
            self.pump_state = "RUNNING"
            self.pump_started_at = now
            self.target_duration = duration_seconds
            self.session_runtime = 0
            self.start_soil_moisture = self.soil_moisture
            self.active_session_id = str(uuid.uuid4())
            if self.is_paused:
                self.is_paused = False  # Auto-resume simulation if pump starts
            self.last_decision_reason = reason
            self.last_decision_action = "START"
            
            # Record event in DB
            db = SessionLocal()
            try:
                evt = IrrigationEvent(
                    device_id=settings.DEFAULT_ESP32_ID,
                    trigger_type="SIMULATION_START",
                    action="START",
                    start_time=now,
                    start_soil_moisture=self.soil_moisture,
                    reason=reason,
                    triggered_by="SIMULATOR"
                )
                db.add(evt)
                
                alert = SystemAlert(
                    device_id=settings.DEFAULT_ESP32_ID,
                    severity="INFO",
                    category="PUMP",
                    title="Pump Started (Simulated)",
                    message=f"Irrigation started: {reason}. Initial soil moisture: {self.soil_moisture:.1f}%",
                    source_mode="SIMULATION",
                    status="ACTIVE"
                )
                db.add(alert)
                db.commit()
            except Exception as e:
                db.rollback()
                logger.error(f"Error persisting simulated pump start event: {e}")
            finally:
                db.close()
                
            # Immediately persist a reading so the graph immediately marks the pump as ON!
            self._persist_reading(now)
            self._broadcast_state()
            return {
                "status": "SUCCESS",
                "pump_state": "RUNNING",
                "message": "Irrigation started successfully (Simulated)."
            }

    def stop_pump(self, reason: str = "Irrigation stopped successfully") -> Dict[str, Any]:
        with self.lock:
            if self.pump_state == "OFF":
                return {
                    "status": "SUCCESS",
                    "pump_state": "OFF",
                    "message": "Pump is already stopped."
                }
            now = datetime.datetime.now(datetime.timezone.utc)
            duration = 0
            if self.pump_started_at:
                duration = int((now - make_aware(self.pump_started_at)).total_seconds())
                
            self.pump_state = "OFF"
            self.last_irrigation_end = now
            self.last_decision_reason = reason
            self.last_decision_action = "STOP"
            
            db = SessionLocal()
            try:
                evt = IrrigationEvent(
                    device_id=settings.DEFAULT_ESP32_ID,
                    trigger_type="SIMULATION_STOP",
                    action="STOP",
                    start_time=self.pump_started_at or now,
                    end_time=now,
                    duration_seconds=duration,
                    start_soil_moisture=self.start_soil_moisture,
                    end_soil_moisture=self.soil_moisture,
                    reason=reason,
                    triggered_by="SIMULATOR"
                )
                db.add(evt)
                
                alert = SystemAlert(
                    device_id=settings.DEFAULT_ESP32_ID,
                    severity="INFO",
                    category="PUMP",
                    title="Pump Stopped (Simulated)",
                    message=f"{reason}. Duration: {duration}s. Final moisture: {self.soil_moisture:.1f}%",
                    source_mode="SIMULATION",
                    status="ACTIVE"
                )
                db.add(alert)
                db.commit()
            except Exception as e:
                db.rollback()
                logger.error(f"Error persisting simulated pump stop event: {e}")
            finally:
                db.close()

            self.pump_started_at = None
            self.session_runtime = 0
            self._persist_reading(now)
            self._broadcast_state()
            
            return {
                "status": "SUCCESS",
                "pump_state": "OFF",
                "message": "Irrigation stopped successfully."
            }

    def toggle_rain(self, rain: Optional[bool] = None) -> bool:
        with self.lock:
            if rain is None:
                self.rain_detected = not self.rain_detected
            else:
                self.rain_detected = rain
            logger.info(f"Simulated rain state changed to {self.rain_detected}")
            self._broadcast_state()
            return self.rain_detected

    def toggle_sensor_fault(self, fault: Optional[bool] = None) -> bool:
        with self.lock:
            if fault is None:
                self.sensor_fault = not self.sensor_fault
            else:
                self.sensor_fault = fault
            logger.info(f"Simulated sensor fault state changed to {self.sensor_fault}")
            self._broadcast_state()
            return self.sensor_fault

    def set_speed(self, speed: int):
        with self.lock:
            self.speed = max(1, min(10, speed))

    def _run_loop(self):
        """Continuous simulation thread running every 2 seconds."""
        while not self._stop_event.is_set():
            try:
                time.sleep(2.0)
                if not self.is_running or self.is_paused:
                    continue
                self._tick()
            except Exception as e:
                logger.error(f"Error in simulation loop tick: {e}")

    def _tick(self):
        with self.lock:
            now = datetime.datetime.now(datetime.timezone.utc)
            self.last_tick_time = now
            self._tick_counter += 1
            
            # Fetch active irrigation settings
            db = SessionLocal()
            try:
                setting = db.query(IrrigationSetting).filter(IrrigationSetting.device_id == settings.DEFAULT_ESP32_ID).first()
                dry_thresh = setting.dry_threshold_percent if setting else 35.0
                target_thresh = setting.target_moisture_percent if setting else 70.0
                max_runtime = setting.max_runtime_seconds if setting else 300
                rain_pause = setting.rain_pause_enabled if setting else True
                auto_mode = setting.auto_mode_enabled if setting else True
                
                # Check permission mode
                from backend.app.models.models import SystemState
                sys_state = db.query(SystemState).first()
                perm_mode = sys_state.permission_mode if sys_state else "AUTHORIZED_AUTO"
            except Exception as e:
                logger.error(f"Error fetching settings in tick: {e}")
                dry_thresh, target_thresh, max_runtime, rain_pause, auto_mode, perm_mode = 35.0, 70.0, 300, True, True, "AUTHORIZED_AUTO"
            finally:
                db.close()

            # 1. Update environmental readings
            # Diurnal temperature and humidity oscillation
            hour = now.hour
            is_day = 6 <= hour <= 18
            target_temp = 22.0 + (6.0 if is_day else 1.0)
            self.temperature_c += (target_temp - self.temperature_c) * 0.05 + random.uniform(-0.1, 0.1)
            target_hum = 75.0 - (18.0 if is_day else 4.0)
            self.humidity_percent += (target_hum - self.humidity_percent) * 0.05 + random.uniform(-0.2, 0.2)
            self.light_raw = int(2800 + random.uniform(-100, 100)) if is_day else int(450 + random.uniform(-30, 30))

            # 2. Moisture physics
            if self.sensor_fault:
                effective_moisture = -1.0 # Simulate sensor open-circuit fault
            else:
                effective_moisture = self.soil_moisture

            if self.pump_state == "RUNNING":
                # Gradual soil saturation: increases smoothly with irrigation
                rate = 1.0 * self.speed
                self.soil_moisture = min(98.0, self.soil_moisture + rate)
                self.session_runtime += int(2 * self.speed)
                
                # In AI Mode: Automatically shut off pump when target moisture is reached!
                # In Manual Mode: Do NOT shut off on target; user can run the pump for extended long hours as desired.
                is_ai_mode = (perm_mode in ["AUTHORIZED_AUTO", "ASK_BEFORE_ACTION"])
                if is_ai_mode and self.soil_moisture >= target_thresh:
                    logger.info(f"Simulation AI Mode: Target moisture {target_thresh}% reached ({self.soil_moisture:.1f}%). Stopping pump.")
                    self.stop_pump(f"AI Target moisture reached ({self.soil_moisture:.1f}% >= target {target_thresh:.1f}%). Irrigation stopped successfully.")
                    return

                # Duration limit check
                allowed_duration = getattr(self, "target_duration", None) or (86400 if perm_mode == "MANUAL_CONTROL" else max_runtime)
                if self.session_runtime >= allowed_duration:
                    logger.warning(f"Simulation: Runtime limit {allowed_duration}s reached. Stopping pump.")
                    self.stop_pump(f"Irrigation duration limit of {allowed_duration}s reached. Irrigation stopped.")
                    return

                # RECORD A READING ON EVERY TICK WHILE PUMP IS RUNNING SO THE GRAPH SHOWS THE MOTOR IS ON!
                self._persist_reading(now)

            else:
                # Gradual natural soil drying (evaporation + plant water uptake)
                dry_rate = 0.08 * self.speed
                self.soil_moisture = max(12.0, self.soil_moisture - dry_rate)

                # AI Mode Evaluation when Pump is OFF
                if auto_mode and not self.sensor_fault:
                    if self.soil_moisture < dry_thresh:
                        if rain_pause and self.rain_detected:
                            self.last_decision_reason = "Watering paused because the configured rain policy is active."
                            self.last_decision_action = "HOLD"
                        else:
                            # Soil is dry and rain is clear!
                            if perm_mode == "AUTHORIZED_AUTO":
                                reason = f"AI Mode started irrigation: soil moisture fell below dry threshold ({self.soil_moisture:.1f}% < {dry_thresh:.1f}%)."
                                logger.info(f"Simulation AI: {reason}")
                                self.start_pump(duration_seconds=max_runtime, reason=reason)
                                return
                            elif perm_mode == "ASK_BEFORE_ACTION":
                                self.last_decision_reason = f"Proposed action: AI recommends starting irrigation (Moisture {self.soil_moisture:.1f}% < {dry_thresh:.1f}%). Awaiting operator approval."
                                self.last_decision_action = "PROPOSED_START"
                                self._propose_action("START_IRRIGATION", self.last_decision_reason)
                            else:
                                self.last_decision_reason = "Pump remains off because system is in Manual Control mode."
                                self.last_decision_action = "HOLD"
                    else:
                        self.last_decision_reason = f"Pump remains off because soil moisture ({self.soil_moisture:.1f}%) is within optimal range (Target: {target_thresh:.1f}%)."
                        self.last_decision_action = "HOLD"

                # Persist sensor reading every 5 ticks (10s) when idle
                if self._tick_counter % 5 == 0:
                    self._persist_reading(now)

            # Broadcast live state
            self._broadcast_state()

    def _propose_action(self, action: str, reason: str):
        db = SessionLocal()
        try:
            # Check if there is already an active pending action
            existing = db.query(ProposedAction).filter(ProposedAction.status == "PENDING").first()
            if not existing:
                pa = ProposedAction(
                    action=action,
                    reason=reason,
                    soil_moisture_percent=self.soil_moisture,
                    status="PENDING"
                )
                db.add(pa)
                db.commit()
        except Exception as e:
            db.rollback()
            logger.error(f"Error creating proposed action: {e}")
        finally:
            db.close()

    def _persist_reading(self, timestamp: datetime.datetime):
        db = SessionLocal()
        try:
            # Capacitive ADC raw inversion (3200 dry, 1400 wet)
            raw = int(3200.0 - (self.soil_moisture / 100.0) * 1800.0)
            light_pct = round((self.light_raw / 4095.0) * 100.0, 1)
            
            reading = SensorReading(
                device_id=settings.DEFAULT_ESP32_ID,
                timestamp=timestamp,
                sequence=self._tick_counter,
                soil_moisture_raw=raw,
                soil_moisture_percent=round(self.soil_moisture, 1),
                temperature_c=round(self.temperature_c, 1),
                humidity_percent=round(self.humidity_percent, 1),
                light_raw=self.light_raw,
                light_percent=light_pct,
                rain_detected=self.rain_detected,
                pump_state=self.pump_state,
                is_simulated=True
            )
            db.add(reading)
            db.commit()
        except Exception as e:
            db.rollback()
            logger.error(f"Error persisting simulated reading: {e}")
        finally:
            db.close()

    def _broadcast_state(self):
        if self._async_loop and not self._async_loop.is_closed():
            payload = {
                "event": "telemetry",
                "device_id": settings.DEFAULT_ESP32_ID,
                "timestamp": self.last_tick_time.isoformat(),
                "soil_moisture_percent": round(self.soil_moisture, 1),
                "soil_moisture_raw": int(3200 - (self.soil_moisture / 100.0) * 1800),
                "temperature_c": round(self.temperature_c, 1),
                "humidity_percent": round(self.humidity_percent, 1),
                "light_percent": round((self.light_raw / 4095.0) * 100.0, 1),
                "rain_detected": self.rain_detected,
                "pump_state": self.pump_state,
                "is_simulated": True,
                "simulation": {
                    "is_running": self.is_running,
                    "is_paused": self.is_paused,
                    "speed": self.speed,
                    "sensor_fault": self.sensor_fault,
                    "decision_reason": self.last_decision_reason,
                    "decision_action": self.last_decision_action,
                    "runtime_seconds": self.session_runtime
                }
            }
            asyncio.run_coroutine_threadsafe(ws_manager.broadcast(payload), self._async_loop)

    def get_status(self) -> Dict[str, Any]:
        with self.lock:
            return {
                "is_running": self.is_running,
                "is_paused": self.is_paused,
                "speed": self.speed,
                "soil_moisture_percent": round(self.soil_moisture, 1),
                "temperature_c": round(self.temperature_c, 1),
                "humidity_percent": round(self.humidity_percent, 1),
                "light_raw": self.light_raw,
                "rain_detected": self.rain_detected,
                "sensor_fault": self.sensor_fault,
                "pump_state": self.pump_state,
                "pump_started_at": self.pump_started_at.isoformat() if self.pump_started_at else None,
                "session_runtime": self.session_runtime,
                "last_decision_reason": self.last_decision_reason,
                "last_decision_action": self.last_decision_action,
                "last_tick_time": self.last_tick_time.isoformat()
            }

simulation_engine = SimulationEngine()
