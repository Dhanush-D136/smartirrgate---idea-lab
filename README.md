# SmartIrrigate — vel greenish
> **IoT-Based Smart Irrigation and Remote Monitoring System Using ESP32 and Raspberry Pi 4B**  
> *Tagline: Sense. Decide. Irrigate.*  
> *Aesthetic: Nature-inspired UI (Greenish Dribbble visual identity)*

---

## 🌿 Highlights

- **Nature-Inspired Design System**: Forest green (`#244B36`), botanical sage (`#A9BBA0`), warm ivory (`#FAF8F1`), and glassmorphism with responsive mobile portrait bottom navigation & desktop dashboard.
- **3-Stage Physical Pump Feedback**: Commands move strictly from `Sent` -> `ESP32 Acknowledged` -> `State Confirmed`. Never assumes the pump is watering without hardware verification.
- **Deterministic Edge Automation**: Python rule engine with hysteresis, continuous runtime limits (watchdog auto-shutoff), cooldown intervals, and precautionary rain pause.
- **Full-Stack Working Architecture**: FastAPI backend, SQLite/PostgreSQL persistence, JWT authentication, Mosquitto MQTT broker, and live WebSocket streaming.
- **Interactive Test Rig (Hardware Simulator)**: Built-in simulation drawer for testing physical telemetry curves and relay ACKs without hardware connected, with clear synthetic labeling.
- **Hardware Integration Artifacts**: Complete C++ Arduino firmware (`smartirrigate_esp32.ino`) and Raspberry Pi edge daemon (`edge_service.py`).

---

## 📁 Repository Structure

```
SmartIrrigate/
├── backend/
│   ├── app/
│   │   ├── api/             # FastAPI route controllers (auth, dashboard, devices, sensors, irrigation, settings, diagnostics, simulation, ws)
│   │   ├── core/            # Config, SQLAlchemy DB engine, JWT & bcrypt security
│   │   ├── models/          # Persistent tables (users, devices, readings, settings, commands, events, alerts)
│   │   ├── schemas/         # Pydantic v2 data contracts
│   │   ├── services/        # MQTT service, irrigation rule engine, WebSocket manager
│   │   └── main.py          # FastAPI application entrypoint
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/      # Navbar, BottomNav, SimulatorDrawer, PumpControlModal
│   │   ├── pages/           # Dashboard, Devices, Irrigation, History, Settings, Diagnostics, Login
│   │   ├── context/         # AuthContext, RealtimeContext
│   │   └── services/        # API client & WebSocket handler
│   ├── public/assets/       # Planter hero visual assets
│   ├── Dockerfile
│   └── vite.config.ts
├── edge/
│   └── raspberry_pi/
│       └── edge_service.py  # Local Python edge gateway with offline SQLite buffer
├── firmware/
│   └── esp32/
│       └── smartirrigate_esp32.ino # ESP32 DevKit V1 C++ Arduino firmware
├── simulator/
│   └── device_mock.py       # Standalone CLI mock runner
├── tests/
│   ├── unit/                # Decision engine & threshold tests
│   └── integration/         # FastAPI endpoints & command handshake tests
├── docs/
│   └── commissioning_guide.md # Wiring, sensor calibration & relay safety
├── docker-compose.yml       # Mosquitto, Postgres, backend, frontend
├── .env.example
└── README.md
```

---

## 🚀 Quickstart Guide

### 1. Prerequisites
- **Python 3.12+**
- **Node.js 18+** & npm

### 2. Launch Backend (FastAPI)
```bash
# In repository root
.\venv\Scripts\activate
uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```
- API Docs: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- Default Farm Admin Credentials:
  - **Email**: `admin@smartirrigate.io`
  - **Password**: `SmartAdmin2026!`

### 3. Launch Frontend (Vite + React)
```bash
cd frontend
npm install
npm run dev
```
- Open [http://localhost:5173](http://localhost:5173) in your browser.

### 4. Running Automated Tests
```bash
.\venv\Scripts\pytest -v
```
All 11 unit and integration tests will verify the rule engine, hysteresis, max runtime cutoff, cooldown, JWT access, and command-ack pipeline.

---

## 🐳 Docker Deployment
To launch the complete stack with Mosquitto MQTT Broker and PostgreSQL:
```bash
docker compose up -d --build
```

---

## 🔒 Security Principles
- Passwords hashed with salted bcrypt.
- State-changing pump commands require authenticated bearer tokens.
- Hardware failsafe: Pump relay initialized strictly to `LOW` on boot.
- Watchdog auto-shutoff: Even if network drops, ESP32 turns pump off after continuous runtime limit (300 seconds).
