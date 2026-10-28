import json
import logging
import datetime
import uuid
import threading
import time
from typing import Optional, Dict, Any
import paho.mqtt.client as mqtt

from backend.app.core.config import settings
from backend.app.core.database import SessionLocal
from backend.app.models.models import (
    Device, SensorReading, IrrigationSetting, IrrigationCommand,
    IrrigationEvent, SystemAlert, DeviceHeartbeat
)
from backend.app.services.irrigation_engine import IrrigationEngine
from backend.app.services.websocket_manager import ws_manager
import asyncio

logger = logging.getLogger("smartirrigate.mqtt")

class MQTTService:
    def __init__(self):
        self.client: Optional[mqtt.Client] = None
        self.is_connected: bool = False
        self.last_telemetry_time: Optional[datetime.datetime] = None
        self.last_command_time: Optional[datetime.datetime] = None
        self.last_ack_status: Optional[str] = None
        self.current_pump_state: str = "OFF"
        self.pump_started_at: Optional[datetime.datetime] = None
        self.last_irrigation_end: Optional[datetime.datetime] = None
        self.loop_thread: Optional[threading.Thread] = None
        self._async_loop: Optional[asyncio.AbstractEventLoop] = None

    def set_async_loop(self, loop: asyncio.AbstractEventLoop):
        self._async_loop = loop

    def start(self):
        try:
            # Paho MQTT 2.0+ client init
            self.client = mqtt.Client(
                callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
                client_id=f"smartirrigate-backend-{uuid.uuid4().hex[:8]}"
            )
            
            if settings.MQTT_USERNAME and settings.MQTT_PASSWORD:
                self.client.username_pw_set(settings.MQTT_USERNAME, settings.MQTT_PASSWORD)

            self.client.on_connect = self._on_connect
            self.client.on_disconnect = self._on_disconnect
            self.client.on_message = self._on_message

            logger.info(f"Connecting to MQTT Broker at {settings.MQTT_BROKER_HOST}:{settings.MQTT_BROKER_PORT}...")
            self.client.connect_async(settings.MQTT_BROKER_HOST, settings.MQTT_BROKER_PORT, keepalive=60)
            self.client.loop_start()
        except Exception as e:
            logger.warning(f"Could not connect to MQTT broker ({e}). Backend will run in disconnected/simulation-ready mode.")
            self.is_connected = False

    def stop(self):
        if self.client:
            try:
                self.client.loop_stop()
                self.client.disconnect()
            except Exception:
                pass
            self.is_connected = False

    def _on_connect(self, client, userdata, flags, rc, properties=None):
        if rc == 0:
            self.is_connected = True
            logger.info("Connected successfully to MQTT Broker.")
            # Subscribe to all SmartIrrigate device topics
            prefix = settings.MQTT_TOPIC_PREFIX
            topics = [
                (f"{prefix}/+/telemetry", 1),
                (f"{prefix}/+/status", 1),
                (f"{prefix}/+/command-ack", 1),
                (f"{prefix}/+/events", 1),
            ]
            client.subscribe(topics)
            logger.info(f"Subscribed to topics: {[t[0] for t in topics]}")
        else:
            self.is_connected = False
            logger.error(f"MQTT Connection failed with return code {rc}")

    def _on_disconnect(self, client, userdata, flags, rc, properties=None):
        self.is_connected = False
        logger.warning(f"Disconnected from MQTT broker (rc: {rc})")

    def _on_message(self, client, userdata, msg):
        try:
            topic = msg.topic
            payload_str = msg.payload.decode("utf-8")
            data = json.loads(payload_str)
            logger.debug(f"MQTT message received on {topic}: {payload_str}")

            parts = topic.split("/")
            if len(parts) >= 3:
                device_id = parts[1]
                subtopic = parts[2]
                
                if subtopic == "telemetry":
                    self.process_telemetry(device_id, data)
                elif subtopic == "command-ack":
                    self.process_command_ack(device_id, data)
                elif subtopic == "status":
                    self.process_heartbeat(device_id, data)
        except Exception as e:
            logger.error(f"Error handling MQTT message on {msg.topic}: {e}")

    def process_telemetry(self, device_id: str, data: dict):
        self.last_telemetry_time = datetime.datetime.now(datetime.timezone.utc)
        db = SessionLocal()
        try:
            # 1. Update or create device
            device = db.query(Device).filter(Device.device_id == device_id).first()
            if not device:
                device = Device(
                    device_id=device_id,
                    name=f"Controller ({device_id})",
                    device_type="esp32",
                    status="ONLINE",
                    last_seen=self.last_telemetry_time,
                    is_simulated=data.get("is_simulated", False)
                )
                db.add(device)
            else:
                device.status = "ONLINE"
                device.last_seen = self.last_telemetry_time
                if "is_simulated" in data:
                    device.is_simulated = data["is_simulated"]

            # 2. Extract values
            soil_raw = data.get("soil_moisture_raw")
            soil_pct = data.get("soil_moisture_percent")
            # If raw provided and pct not provided, calculate calibrated approx:
            # Typical capacitive sensor: air ~3200 (dry=0%), water ~1400 (wet=100%)
            if soil_pct is None and soil_raw is not None:
                calibrated = (3200.0 - float(soil_raw)) / (3200.0 - 1400.0) * 100.0
                soil_pct = round(max(0.0, min(100.0, calibrated)), 1)

            light_raw = data.get("light_raw")
            light_pct = None
            if light_raw is not None:
                # LDR 0 (bright) to 4095 (dark) or vice-versa; standard ESP32 divider: 0-4095
                light_pct = round(max(0.0, min(100.0, (float(light_raw) / 4095.0) * 100.0)), 1)

            pump_state = data.get("pump_state", self.current_pump_state)
            self.current_pump_state = pump_state

            reading = SensorReading(
                device_id=device_id,
                timestamp=self.last_telemetry_time,
                sequence=data.get("sequence"),
                soil_moisture_raw=soil_raw,
                soil_moisture_percent=soil_pct,
                temperature_c=data.get("temperature_c"),
                humidity_percent=data.get("humidity_percent"),
                light_raw=light_raw,
                light_percent=light_pct,
                rain_detected=bool(data.get("rain_detected", False)),
                pump_state=pump_state,
                is_simulated=bool(data.get("is_simulated", False))
            )
            db.add(reading)
            db.commit()

            # 3. Automatic rule evaluation
            settings_obj = db.query(IrrigationSetting).filter(IrrigationSetting.device_id == device_id).first()
            if not settings_obj:
                settings_obj = IrrigationSetting(device_id=device_id)
                db.add(settings_obj)
                db.commit()

            decision = IrrigationEngine.evaluate(
                soil_moisture_percent=soil_pct,
                rain_detected=reading.rain_detected,
                light_percent=light_pct,
                current_pump_state=self.current_pump_state,
                pump_started_at=self.pump_started_at,
                last_irrigation_end=self.last_irrigation_end,
                auto_mode_enabled=settings_obj.auto_mode_enabled,
                dry_threshold_percent=settings_obj.dry_threshold_percent,
                target_moisture_percent=settings_obj.target_moisture_percent,
                max_runtime_seconds=settings_obj.max_runtime_seconds,
                cooldown_minutes=settings_obj.cooldown_minutes,
                rain_pause_enabled=settings_obj.rain_pause_enabled,
                daylight_only=settings_obj.daylight_only,
                now=self.last_telemetry_time
            )

            # If rule triggers a state change
            if decision.should_change_state:
                if decision.action == "START" and self.current_pump_state != "ON":
                    logger.info(f"Auto Irrigation START: {decision.reason}")
                    self.dispatch_pump_command(
                        device_id=device_id,
                        action="START_PUMP",
                        reason=decision.reason,
                        triggered_by="SYSTEM_AUTO",
                        duration_seconds=settings_obj.max_runtime_seconds
                    )
                elif decision.action == "STOP" and self.current_pump_state != "OFF":
                    logger.info(f"Auto Irrigation STOP: {decision.reason}")
                    self.dispatch_pump_command(
                        device_id=device_id,
                        action="STOP_PUMP",
                        reason=decision.reason,
                        triggered_by="SYSTEM_AUTO"
                    )

            # 4. Broadcast to WebSockets
            if self._async_loop and not self._async_loop.is_closed():
                payload = {
                    "event": "telemetry",
                    "device_id": device_id,
                    "timestamp": self.last_telemetry_time.isoformat(),
                    "soil_moisture_percent": soil_pct,
                    "soil_moisture_raw": soil_raw,
                    "temperature_c": reading.temperature_c,
                    "humidity_percent": reading.humidity_percent,
                    "light_percent": light_pct,
                    "rain_detected": reading.rain_detected,
                    "pump_state": self.current_pump_state,
                    "is_simulated": reading.is_simulated,
                    "decision": {
                        "action": decision.action,
                        "reason": decision.reason,
                        "safety_block": decision.safety_block
                    }
                }
                asyncio.run_coroutine_threadsafe(ws_manager.broadcast(payload), self._async_loop)

        except Exception as e:
            logger.error(f"Error processing telemetry for {device_id}: {e}")
            db.rollback()
        finally:
            db.close()

    def process_command_ack(self, device_id: str, data: dict):
        command_id = data.get("command_id")
        status_val = data.get("status", "ACKNOWLEDGED")
        confirmed_state = data.get("confirmed_pump_state")
        self.last_ack_status = status_val
        now = datetime.datetime.now(datetime.timezone.utc)
        
        db = SessionLocal()
        try:
            cmd = db.query(IrrigationCommand).filter(IrrigationCommand.command_id == command_id).first()
            if cmd:
                cmd.status = status_val
                cmd.ack_received_at = now
                cmd.confirmed_pump_state = confirmed_state
                if data.get("error_message"):
                    cmd.rejection_reason = data["error_message"]
                db.commit()

            if confirmed_state:
                old_state = self.current_pump_state
                self.current_pump_state = confirmed_state
                if confirmed_state == "ON":
                    self.pump_started_at = now
                elif confirmed_state == "OFF":
                    if old_state == "ON" and self.pump_started_at:
                        duration = int((now - self.pump_started_at).total_seconds())
                        self.last_irrigation_end = now
                        # Record event
                        evt = IrrigationEvent(
                            device_id=device_id,
                            trigger_type="COMMAND_COMPLETED",
                            action="STOP",
                            start_time=self.pump_started_at,
                            end_time=now,
                            duration_seconds=duration,
                            reason=f"Pump turned off (Duration {duration}s)",
                            triggered_by="PUMP_ACK"
                        )
                        db.add(evt)
                        db.commit()

            # Broadcast ACK
            if self._async_loop and not self._async_loop.is_closed():
                payload = {
                    "event": "command_ack",
                    "command_id": command_id,
                    "device_id": device_id,
                    "status": status_val,
                    "confirmed_pump_state": confirmed_state,
                    "timestamp": now.isoformat()
                }
                asyncio.run_coroutine_threadsafe(ws_manager.broadcast(payload), self._async_loop)

        except Exception as e:
            logger.error(f"Error processing command ack: {e}")
            db.rollback()
        finally:
            db.close()

    def process_heartbeat(self, device_id: str, data: dict):
        db = SessionLocal()
        try:
            device = db.query(Device).filter(Device.device_id == device_id).first()
            now = datetime.datetime.now(datetime.timezone.utc)
            if device:
                device.status = "ONLINE"
                device.last_seen = now
                if data.get("firmware_version"):
                    device.firmware_version = data["firmware_version"]
                if data.get("ip_address"):
                    device.ip_address = data["ip_address"]
            
            hb = DeviceHeartbeat(
                device_id=device_id,
                timestamp=now,
                battery_level=data.get("battery_level"),
                signal_strength=data.get("signal_strength"),
                uptime_seconds=data.get("uptime_seconds"),
                status="ONLINE"
            )
            db.add(hb)
            db.commit()
        except Exception as e:
            logger.error(f"Error processing heartbeat: {e}")
            db.rollback()
        finally:
            db.close()

    def dispatch_pump_command(
        self,
        device_id: str,
        action: str, # "START_PUMP", "STOP_PUMP", "EMERGENCY_STOP"
        reason: str = "Command dispatched",
        triggered_by: str = "OPERATOR_REMOTE",
        duration_seconds: Optional[int] = None,
        user_id: Optional[int] = None
    ) -> IrrigationCommand:
        now = datetime.datetime.now(datetime.timezone.utc)
        expires_at = now + datetime.timedelta(seconds=settings.COMMAND_ACK_TIMEOUT_SECONDS)
        command_id = str(uuid.uuid4())

        db = SessionLocal()
        try:
            cmd = IrrigationCommand(
                command_id=command_id,
                device_id=device_id,
                action=action,
                parameters_json=json.dumps({"duration_seconds": duration_seconds, "reason": reason}),
                issued_at=now,
                expires_at=expires_at,
                status="SENT",
                issued_by_user_id=user_id
            )
            db.add(cmd)
            
            # Record an event log
            evt = IrrigationEvent(
                device_id=device_id,
                trigger_type="COMMAND_ISSUED",
                action=action,
                start_time=now,
                reason=reason,
                triggered_by=triggered_by
            )
            db.add(evt)
            db.commit()
            db.refresh(cmd)
            
            self.last_command_time = now

            # Send over MQTT
            topic = f"{settings.MQTT_TOPIC_PREFIX}/{device_id}/commands"
            payload = {
                "command_id": command_id,
                "device_id": device_id,
                "action": action,
                "duration_seconds": duration_seconds,
                "issued_at": now.isoformat(),
                "expires_at": expires_at.isoformat(),
                "reason": reason
            }
            
            if self.client and self.is_connected:
                self.client.publish(topic, json.dumps(payload), qos=1)
                logger.info(f"Published command {action} ({command_id}) to {topic}")
            else:
                logger.warning(f"MQTT not connected; command {action} queued in database.")

            return cmd
        except Exception as e:
            db.rollback()
            raise e
        finally:
            db.close()

mqtt_service = MQTTService()
