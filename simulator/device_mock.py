#!/usr/bin/env python3
"""
SmartIrrigate — Hardware Simulation Runner
Allows testing end-to-end telemetry and pump control workflows without physical boards plugged in.
All packets sent by this simulator are explicitly tagged with is_simulated=True.
"""

import time
import random
import requests
import argparse

BACKEND_URL = "http://127.0.0.1:8000"

def run_simulation(interval=5, interactive=False):
    print("==========================================================")
    print("  SmartIrrigate — vel greenish ESP32 Hardware Simulator")
    print("  Tagged: is_simulated = True")
    print("==========================================================")
    
    current_moisture = 42.0
    pump_state = "OFF"
    
    try:
        while True:
            # Check backend irrigation status to see if pump was commanded ON
            try:
                status_res = requests.get(f"{BACKEND_URL}/api/irrigation/status", timeout=3)
                if status_res.status_code == 200:
                    status_data = status_res.json()
                    last_cmd = status_data.get("last_command")
                    if last_cmd and last_cmd.get("status") == "SENT":
                        action = last_cmd.get("action")
                        cmd_id = last_cmd.get("command_id")
                        print(f"\n[SIMULATOR HARDWARE] Intercepted in-flight command: {action} ({cmd_id})")
                        time.sleep(1.0) # Realistic physical relay switching delay
                        if action in ["START_PUMP"]:
                            pump_state = "ON"
                        elif action in ["STOP_PUMP", "EMERGENCY_STOP"]:
                            pump_state = "OFF"
                        
                        # Send ACK back to backend
                        ack_res = requests.post(f"{BACKEND_URL}/api/simulation/ack", json={
                            "command_id": cmd_id,
                            "confirmed_pump_state": pump_state,
                            "status": "ACKNOWLEDGED"
                        })
                        print(f"[SIMULATOR HARDWARE] Published ACK -> Pump confirmed: {pump_state}")
            except Exception as e:
                pass

            # Simulate moisture physics
            if pump_state == "ON":
                current_moisture = min(85.0, current_moisture + random.uniform(3.0, 5.5))
            else:
                current_moisture = max(18.0, current_moisture - random.uniform(0.2, 0.6))

            temp_c = round(24.0 + random.uniform(-1.0, 1.5), 1)
            humidity_pct = round(62.0 + random.uniform(-2.0, 3.0), 1)
            light_raw = int(2200 + random.uniform(-200, 200))
            rain_detected = False

            payload = {
                "soil_moisture_percent": round(current_moisture, 1),
                "temperature_c": temp_c,
                "humidity_percent": humidity_pct,
                "light_raw": light_raw,
                "rain_detected": rain_detected,
                "pump_state": pump_state
            }

            try:
                res = requests.post(f"{BACKEND_URL}/api/simulation/telemetry", json=payload, timeout=3)
                if res.status_code == 200:
                    print(f"[TELEMETRY EMITTED] Moisture: {current_moisture:.1f}% | Pump: {pump_state} | Temp: {temp_c}°C | RH: {humidity_pct}%")
                else:
                    print(f"[ERROR] Backend responded {res.status_code}: {res.text}")
            except requests.exceptions.ConnectionError:
                print(f"[WAITING] Backend not running at {BACKEND_URL}. Retrying in {interval}s...")

            time.sleep(interval)
    except KeyboardInterrupt:
        print("\nSimulator stopped.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SmartIrrigate ESP32 Simulation Runner")
    parser.add_argument("--interval", type=int, default=5, help="Telemetry interval in seconds")
    args = parser.parse_args()
    run_simulation(interval=args.interval)
