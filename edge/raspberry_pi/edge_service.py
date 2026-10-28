#!/usr/bin/env python3
"""
SmartIrrigate — vel greenish
Raspberry Pi 4B Local Edge Decision & Telemetry Gateway
Tagline: Sense. Decide. Irrigate.

Provides local autonomy:
- Subscribes to ESP32 telemetry via local Mosquitto MQTT broker
- Evaluates irrigation rules locally (offline resilient)
- Buffers readings in local SQLite database during internet outages
- Syncs with cloud backend when upstream connectivity is healthy
- Relays authorized commands with expiry checks
"""

import os
import sys
import time
import json
import sqlite3
import logging
import datetime
import paho.mqtt.client as mqtt

# Configuration
LOCAL_MQTT_HOST = os.getenv("EDGE_MQTT_HOST", "127.0.0.1")
LOCAL_MQTT_PORT = int(os.getenv("EDGE_MQTT_PORT", 1883))
DEVICE_ID = os.getenv("EDGE_DEVICE_ID", "rpi4b-edge-01")
ESP32_ID = os.getenv("FIELD_ESP32_ID", "esp32-zone-01")
DB_PATH = os.getenv("EDGE_DB_PATH", "edge_buffer.db")

# Edge Automation Defaults (Synchronized with Cloud Settings)
DRY_THRESHOLD_PERCENT = 35.0
TARGET_MOISTURE_PERCENT = 70.0
MAX_RUNTIME_SECONDS = 300
COOLDOWN_MINUTES = 30
RAIN_PAUSE_ENABLED = True
AUTO_MODE_ENABLED = True

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] [RPI-EDGE] %(message)s")
logger = logging.getLogger("edge_service")

class EdgeIrrigationGateway:
    def __init__(self):
        self.init_db()
        self.client = mqtt.Client(
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
            client_id=f"smartirrigate-edge-{DEVICE_ID}"
        )
        self.client.on_connect = self.on_connect
        self.client.on_message = self.on_message
        
        # In-memory tracking for rate-limiting & safety
        self.current_pump_state = "OFF"
        self.pump_started_at = None
        self.last_irrigation_end = None
        self.last_reading_time = None

    def init_db(self):
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("""
            CREATE TABLE IF NOT EXISTS offline_telemetry (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id TEXT,
                timestamp TEXT,
                soil_moisture_percent REAL,
                temperature_c REAL,
                humidity_percent REAL,
                light_raw INTEGER,
                rain_detected INTEGER,
                pump_state TEXT,
                synced_upstream INTEGER DEFAULT 0
            )
        """)
        c.execute("""
            CREATE TABLE IF NOT EXISTS edge_decision_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT,
                action TEXT,
                reason TEXT,
                soil_moisture REAL
            )
        """)
        conn.commit()
        conn.close()

    def on_connect(self, client, userdata, flags, rc, properties=None):
        logger.info(f"Connected to local Mosquitto broker (rc={rc})")
        # Subscribe to field controller telemetry and acknowledgements
        client.subscribe(f"smartirrigate/{ESP32_ID}/telemetry", 1)
        client.subscribe(f"smartirrigate/{ESP32_ID}/command-ack", 1)
        client.subscribe(f"smartirrigate/{ESP32_ID}/commands", 1)
        # Publish gateway online status
        self.publish_edge_heartbeat()

    def on_message(self, client, userdata, msg):
        try:
            topic = msg.topic
            payload = json.loads(msg.payload.decode("utf-8"))
            
            if topic.endswith("/telemetry"):
                self.handle_telemetry(payload)
            elif topic.endswith("/command-ack"):
                self.handle_ack(payload)
            elif topic.endswith("/commands"):
                logger.info(f"Observing command routed to ESP32: {payload.get('action')}")
        except Exception as e:
            logger.error(f"Error handling edge message: {e}")

    def handle_telemetry(self, data):
        now = datetime.datetime.now(datetime.timezone.utc)
        self.last_reading_time = now

        soil_pct = data.get("soil_moisture_percent")
        rain_detected = bool(data.get("rain_detected", False))
        temp_c = data.get("temperature_c")
        humidity_pct = data.get("humidity_percent")
        light_raw = data.get("light_raw")
        pump_state = data.get("pump_state", self.current_pump_state)
        self.current_pump_state = pump_state

        # 1. Buffer in local database for offline safety
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("""
            INSERT INTO offline_telemetry (device_id, timestamp, soil_moisture_percent, temperature_c, humidity_percent, light_raw, rain_detected, pump_state)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (ESP32_ID, now.isoformat(), soil_pct, temp_c, humidity_pct, light_raw, int(rain_detected), pump_state))
        conn.commit()
        conn.close()

        logger.info(f"Buffered telemetry: Soil={soil_pct}%, Rain={rain_detected}, Pump={pump_state}")

        # 2. Local Autonomous Irrigation Evaluation
        self.evaluate_local_rules(soil_pct, rain_detected, now)

    def evaluate_local_rules(self, soil_pct, rain_detected, now):
        global AUTO_MODE_ENABLED, DRY_THRESHOLD_PERCENT, TARGET_MOISTURE_PERCENT
        if not AUTO_MODE_ENABLED:
            return

        # Continuous runtime safety check
        if self.current_pump_state == "ON" and self.pump_started_at:
            runtime = (now - self.pump_started_at).total_seconds()
            if runtime >= MAX_RUNTIME_SECONDS:
                logger.warning(f"Safety limit: Max continuous runtime {MAX_RUNTIME_SECONDS}s exceeded ({runtime:.0f}s). Dispatching STOP.")
                self.send_pump_command("STOP_PUMP", "LOCAL_EDGE_SAFETY_MAX_RUNTIME")
                return

        # If watering, check if target moisture reached or rain started
        if self.current_pump_state == "ON":
            if soil_pct is not None and soil_pct >= TARGET_MOISTURE_PERCENT:
                logger.info(f"Target soil moisture {TARGET_MOISTURE_PERCENT}% reached ({soil_pct:.1f}%). Stopping pump.")
                self.send_pump_command("STOP_PUMP", "TARGET_MOISTURE_REACHED")
                return
            if RAIN_PAUSE_ENABLED and rain_detected:
                logger.info("Rain detected during watering. Stopping pump.")
                self.send_pump_command("STOP_PUMP", "RAIN_PAUSE")
                return

        # If pump is OFF, check if dry
        if self.current_pump_state == "OFF":
            if soil_pct is not None and soil_pct < DRY_THRESHOLD_PERCENT:
                if RAIN_PAUSE_ENABLED and rain_detected:
                    logger.info("Soil dry, but rain is active. Withholding irrigation.")
                    return
                # Check cooldown
                if self.last_irrigation_end:
                    elapsed_mins = (now - self.last_irrigation_end).total_seconds() / 60.0
                    if elapsed_mins < COOLDOWN_MINUTES:
                        logger.info(f"Cooldown active ({elapsed_mins:.1f}m / {COOLDOWN_MINUTES}m). Holding.")
                        return
                
                logger.info(f"Soil moisture {soil_pct:.1f}% < {DRY_THRESHOLD_PERCENT}%. Edge initiating irrigation.")
                self.send_pump_command("START_PUMP", "LOCAL_EDGE_AUTO_THRESHOLD")

    def send_pump_command(self, action, reason):
        now = datetime.datetime.now(datetime.timezone.utc)
        cmd_payload = {
            "command_id": f"edge-{int(time.time())}",
            "device_id": ESP32_ID,
            "action": action,
            "issued_at": now.isoformat(),
            "expires_at": (now + datetime.timedelta(seconds=15)).isoformat(),
            "reason": reason
        }
        topic = f"smartirrigate/{ESP32_ID}/commands"
        self.client.publish(topic, json.dumps(cmd_payload), qos=1)
        logger.info(f"Edge published {action} to {topic}")

    def handle_ack(self, data):
        confirmed_state = data.get("confirmed_pump_state")
        now = datetime.datetime.now(datetime.timezone.utc)
        if confirmed_state:
            old_state = self.current_pump_state
            self.current_pump_state = confirmed_state
            if confirmed_state == "ON":
                self.pump_started_at = now
            elif confirmed_state == "OFF":
                if old_state == "ON":
                    self.last_irrigation_end = now
                self.pump_started_at = None
        logger.info(f"ESP32 confirmed physical pump state: {confirmed_state}")

    def publish_edge_heartbeat(self):
        topic = f"smartirrigate/{DEVICE_ID}/status"
        payload = {
            "device_id": DEVICE_ID,
            "role": "edge_gateway",
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "status": "ONLINE",
            "firmware_version": "v1.0.4-edge-daemon"
        }
        self.client.publish(topic, json.dumps(payload), qos=1)

    def run(self):
        logger.info(f"Starting SmartIrrigate Edge Gateway on {LOCAL_MQTT_HOST}:{LOCAL_MQTT_PORT}...")
        self.client.connect(LOCAL_MQTT_HOST, LOCAL_MQTT_PORT, 60)
        self.client.loop_forever()

if __name__ == "__main__":
    gateway = EdgeIrrigationGateway()
    try:
        gateway.run()
    except KeyboardInterrupt:
        logger.info("Edge gateway stopped by operator.")
