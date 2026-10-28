# SmartIrrigate — Commissioning & Hardware Integration Guide

**System**: IoT-Based Smart Irrigation and Remote Monitoring System Using ESP32 and Raspberry Pi 4B  
**Tagline**: *Sense. Decide. Irrigate.*  
**Branding**: *vel greenish*

---

## 1. Hardware Architecture Overview

```
[Soil Probe (ADC 34)]
[LDR Light  (ADC 35)]  --->  [ESP32 DevKit V1]  ---(MQTT WiFi)--->  [Raspberry Pi 4B Gateway]
[DHT22 Temp (GPIO 4)]        (30-Pin Micro)                         - Local Mosquitto Broker
[Rain Sensor (GPIO 32)]      - FreeRTOS Failsafe                     - Python Rule Engine
[12V Pump Relay (GPIO 23)]   - 300s HW Watchdog                      - SQLite Buffer & Sync
                                                                           |
                                                                           v
                                                            [FastAPI + React Dashboard]
```

---

## 2. Pinout & Wiring Specification

| Component | ESP32 Pin | Interface | Working Voltage | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Capacitive Soil Moisture v1.2** | `GPIO 34` | Analog (ADC1_CH6) | 3.3V VCC | Corrosion-resistant capacitive probe |
| **LDR Photoresistor (5528)** | `GPIO 35` | Analog (ADC1_CH7) | 3.3V VCC | 10kΩ pulldown voltage divider |
| **DHT22 (AM2302) Temp/RH** | `GPIO 4` | Digital Single-Bus | 3.3V VCC | 4.7kΩ pull-up resistor to 3.3V |
| **FC-37 Rain Detector Board** | `GPIO 32` | Digital Input | 3.3V VCC | Digital DO pin (LOW on wet droplet) |
| **10A Optocoupled Relay Module** | `GPIO 23` | Digital Output | 5V VCC (Opto) | Active HIGH; Controls 12V DC Pump |
| **Built-in Status LED** | `GPIO 2` | Digital Output | Internal | Fast blink = WiFi connect; Solid = Online |

> [!CAUTION]
> **Electrical Safety Notice:**
> 1. ESP32 GPIOs output a maximum of **3.3V @ 12mA** and **CANNOT** directly drive an inductive motor or water pump.
> 2. Always use an **optocoupled relay module** with an external 12V 2A DC power supply.
> 3. Connect a **1N4007 flyback diode** across the DC pump terminals (cathode to +12V, anode to GND) to absorb inductive back-EMF spikes that could reset the microcontrollers.

---

## 3. Capacitive Soil Moisture Sensor Calibration Procedure

Do not use raw uncalibrated readings. Perform this 2-step calibration before installing the probe into soil:

1. **Air Reading (0% Volumetric Water Content - Completely Dry):**
   - Hold the sensor dry in the air.
   - Record the ADC reading from serial (`Serial.println(analogRead(34))`).
   - Typical ESP32 12-bit value: `~3200`. Set `SOIL_DRY_RAW = 3200` in `smartirrigate_esp32.ino`.

2. **Water Reading (100% Volumetric Water Content - Saturated):**
   - Submerge the sensor blade into a cup of tap water up to the white stop line (do not submerge the electronic components at the top).
   - Record the ADC value.
   - Typical ESP32 12-bit value: `~1400`. Set `SOIL_WET_RAW = 1400` in `smartirrigate_esp32.ino`.

3. **Formula used by firmware & backend:**
   $$\text{Moisture \%} = \frac{\text{SOIL\_DRY\_RAW} - \text{Raw Value}}{\text{SOIL\_DRY\_RAW} - \text{SOIL\_WET\_RAW}} \times 100\%$$

---

## 4. Safe Pump Commissioning Checklist

Before clicking **Start Pump** or enabling automatic watering:

- [ ] Relay module VCC is connected to 5V; relay GND is tied to common ground with ESP32.
- [ ] Relay IN pin is wired to `GPIO 23`.
- [ ] ESP32 boots with relay strictly **OFF** (verified with multimeter).
- [ ] External 12V pump power supply is on an independent breaker or isolated adapter.
- [ ] Pump suction hose is primed with water (never run submersible pumps dry).
- [ ] Hardware watchdog verified: If WiFi or backend disconnects while watering, ESP32 will auto-shutoff the pump after 300 seconds.

---

## 5. MQTT Topic Architecture

The system communicates over authenticated MQTT topics:

| Topic | Publisher | Subscriber | Purpose |
| :--- | :--- | :--- | :--- |
| `smartirrigate/{device_id}/telemetry` | ESP32 | Backend / RPi | Telemetry packets every 10s |
| `smartirrigate/{device_id}/status` | ESP32 / RPi | Backend | Heartbeat, RSSI, uptime |
| `smartirrigate/{device_id}/commands` | Backend / RPi | ESP32 | Remote commands (`START_PUMP`, `STOP_PUMP`, `EMERGENCY_STOP`) |
| `smartirrigate/{device_id}/command-ack` | ESP32 | Backend | Immediate state acknowledgment & confirmed relay status |

---

## 6. Simulation & Testing (Without Hardware)

If physical hardware is not yet wired, you can verify every single software path:
1. Open the web app at `http://localhost:5173`.
2. Click the amber **Simulator** button in the header.
3. Adjust the soil moisture slider (e.g. to `26%` below dry threshold).
4. Click **Transmit ESP32 Telemetry** or **Seed 24-Hour Historical Sensor Trend**.
5. Observe the live dashboard update in real-time over WebSockets!
6. Click **Confirm & Start Pump** -> Click **ACK Pump ON** in the simulator drawer to test the complete 3-stage command confirmation handshake!
