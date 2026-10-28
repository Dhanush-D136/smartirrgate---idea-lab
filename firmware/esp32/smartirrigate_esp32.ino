/*
 * SmartIrrigate — vel greenish
 * IoT-Based Smart Irrigation Field Controller Firmware
 * Platform: ESP32 DevKit V1 (30-Pin)
 * Tagline: Sense. Decide. Irrigate.
 *
 * Pinout:
 *   - Soil Moisture (Analog): GPIO 34 (ADC1_CH6)
 *   - LDR Light Sensor (Analog): GPIO 35 (ADC1_CH7)
 *   - Rain Sensor (Digital): GPIO 32
 *   - DHT22 / DHT11 (Digital): GPIO 4
 *   - Pump Relay (Output): GPIO 23 (Active HIGH)
 *   - Status LED: GPIO 2 (Built-in)
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <DHT.h>

// ========== HARDWARE PIN DEFINITIONS ==========
#define PIN_SOIL_ADC     34
#define PIN_LDR_ADC      35
#define PIN_RAIN_DIGITAL 32
#define PIN_DHT_DATA     4
#define PIN_PUMP_RELAY   23
#define PIN_STATUS_LED   2

// ========== SENSOR CONFIGURATION ==========
#define DHTTYPE DHT22  // Change to DHT11 if using DHT11
DHT dht(PIN_DHT_DATA, DHTTYPE);

// Calibration constants (Calibrated in air vs submerged in water)
const int SOIL_DRY_RAW = 3200; // Sensor suspended in dry air
const int SOIL_WET_RAW = 1400; // Sensor placed in cup of water

// Local Hardware Safety Interlocks
const unsigned long LOCAL_MAX_RUNTIME_MS = 300000; // 5 min hardware watchdog auto-cutoff
const unsigned long TELEMETRY_INTERVAL_MS = 10000; // Publish every 10 seconds

// ========== NETWORK & MQTT CREDENTIALS ==========
// Update with your network credentials or use WiFiManager
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

const char* MQTT_BROKER = "192.168.1.200"; // Raspberry Pi or Cloud IP
const int   MQTT_PORT = 1883;
const char* MQTT_USER = "smartirrigate_device";
const char* MQTT_PASS = "secure_device_token_2026";
const char* DEVICE_ID = "esp32-zone-01";

// Topic templates
char topicTelemetry[64];
char topicStatus[64];
char topicCommands[64];
char topicCommandAck[64];

WiFiClient espClient;
PubSubClient mqttClient(espClient);

// Runtime State Variables
bool isPumpRunning = false;
unsigned long pumpStartedTimestamp = 0;
unsigned long lastTelemetryTimestamp = 0;
unsigned long messageSequence = 0;

// Function Prototypes
void setupWiFi();
void setupMQTT();
void reconnectMQTT();
void publishTelemetry();
void publishHeartbeat();
void mqttCallback(char* topic, byte* payload, unsigned int length);
void setPumpState(bool state, const char* reason, const char* commandId = nullptr);
float readCalibratedSoilMoisture(int rawValue);

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=============================================");
  Serial.println("  SmartIrrigate — vel greenish ESP32 Firmware");
  Serial.println("  Sense. Decide. Irrigate.");
  Serial.println("=============================================");

  // Initialize GPIOs
  pinMode(PIN_PUMP_RELAY, OUTPUT);
  pinMode(PIN_STATUS_LED, OUTPUT);
  pinMode(PIN_RAIN_DIGITAL, INPUT_PULLUP);
  pinMode(PIN_SOIL_ADC, INPUT);
  pinMode(PIN_LDR_ADC, INPUT);

  // CRITICAL FAILSAFE: Ensure pump is strictly OFF on boot
  digitalWrite(PIN_PUMP_RELAY, LOW);
  digitalWrite(PIN_STATUS_LED, LOW);
  isPumpRunning = false;

  // Initialize DHT sensor
  dht.begin();

  // Configure MQTT topics
  snprintf(topicTelemetry, sizeof(topicTelemetry), "smartirrigate/%s/telemetry", DEVICE_ID);
  snprintf(topicStatus, sizeof(topicStatus), "smartirrigate/%s/status", DEVICE_ID);
  snprintf(topicCommands, sizeof(topicCommands), "smartirrigate/%s/commands", DEVICE_ID);
  snprintf(topicCommandAck, sizeof(topicCommandAck), "smartirrigate/%s/command-ack", DEVICE_ID);

  setupWiFi();
  setupMQTT();
}

void loop() {
  if (!mqttClient.connected()) {
    reconnectMQTT();
  }
  mqttClient.loop();

  unsigned long currentMillis = millis();

  // 1. HARDWARE SAFETY INTERLOCK: Max continuous runtime watchdog
  if (isPumpRunning && (currentMillis - pumpStartedTimestamp >= LOCAL_MAX_RUNTIME_MS)) {
    Serial.println("[SAFETY WATCHDOG] Maximum continuous pump runtime exceeded! Forcing pump OFF.");
    setPumpState(false, "SAFETY_MAX_RUNTIME_EXCEEDED");
  }

  // 2. Periodic Telemetry Transmission
  if (currentMillis - lastTelemetryTimestamp >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryTimestamp = currentMillis;
    publishTelemetry();
    publishHeartbeat();
  }
}

void setupWiFi() {
  Serial.printf("[WIFI] Connecting to %s...", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    digitalWrite(PIN_STATUS_LED, !digitalRead(PIN_STATUS_LED));
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[WIFI] Connected! IP Address: %s, RSSI: %d dBm\n", WiFi.localIP().toString().c_str(), WiFi.RSSI());
    digitalWrite(PIN_STATUS_LED, HIGH);
  } else {
    Serial.println("\n[WIFI] Connection failed. Will retry in background loop.");
    digitalWrite(PIN_STATUS_LED, LOW);
  }
}

void setupMQTT() {
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
}

void reconnectMQTT() {
  static unsigned long lastReconnectAttempt = 0;
  unsigned long now = millis();
  if (now - lastReconnectAttempt < 5000) return;
  lastReconnectAttempt = now;

  if (WiFi.status() != WL_CONNECTED) return;

  Serial.print("[MQTT] Attempting broker connection...");
  String clientId = String(DEVICE_ID) + "-" + String(random(0xffff), HEX);
  if (mqttClient.connect(clientId.c_str(), MQTT_USER, MQTT_PASS)) {
    Serial.println(" Connected!");
    mqttClient.subscribe(topicCommands, 1);
    Serial.printf("[MQTT] Subscribed to %s\n", topicCommands);
    publishHeartbeat();
  } else {
    Serial.printf(" Failed, rc=%d. Will retry in 5s\n", mqttClient.state());
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  char message[512];
  if (length >= sizeof(message)) length = sizeof(message) - 1;
  memcpy(message, payload, length);
  message[length] = '\0';

  Serial.printf("[MQTT RECV] Topic: %s | Payload: %s\n", topic, message);

  StaticJsonDocument<512> doc;
  DeserializationError error = deserializeJson(doc, message);
  if (error) {
    Serial.printf("[JSON] Deserialization failed: %s\n", error.c_str());
    return;
  }

  const char* commandId = doc["command_id"] | "unknown";
  const char* action = doc["action"] | "";

  // Verify command validity
  if (strcmp(action, "START_PUMP") == 0) {
    setPumpState(true, "MANUAL_REMOTE_CMD", commandId);
  } else if (strcmp(action, "STOP_PUMP") == 0) {
    setPumpState(false, "MANUAL_REMOTE_CMD", commandId);
  } else if (strcmp(action, "EMERGENCY_STOP") == 0) {
    setPumpState(false, "EMERGENCY_STOP_CMD", commandId);
  } else {
    Serial.printf("[COMMAND] Unrecognized action: %s\n", action);
  }
}

void setPumpState(bool state, const char* reason, const char* commandId) {
  isPumpRunning = state;
  digitalWrite(PIN_PUMP_RELAY, state ? HIGH : LOW);

  if (state) {
    pumpStartedTimestamp = millis();
  } else {
    pumpStartedTimestamp = 0;
  }

  Serial.printf("[ACTUATOR] Physical pump state set to: %s (Reason: %s)\n", state ? "ON" : "OFF", reason);

  // Publish immediate state confirmation and command-ack handshake
  StaticJsonDocument<256> ack;
  ack["command_id"] = commandId ? commandId : "local-event";
  ack["device_id"] = DEVICE_ID;
  ack["status"] = "ACKNOWLEDGED";
  ack["confirmed_pump_state"] = state ? "ON" : "OFF";
  ack["timestamp"] = millis();
  ack["reason"] = reason;

  char ackBuffer[256];
  serializeJson(ack, ackBuffer);
  mqttClient.publish(topicCommandAck, ackBuffer, true);
}

float readCalibratedSoilMoisture(int rawValue) {
  // Linear calibration mapping
  float percent = (float)(SOIL_DRY_RAW - rawValue) / (float)(SOIL_DRY_RAW - SOIL_WET_RAW) * 100.0;
  if (percent < 0.0) percent = 0.0;
  if (percent > 100.0) percent = 100.0;
  return percent;
}

void publishTelemetry() {
  // 1. Read Soil Moisture (Take 8-sample smoothed average)
  long soilRawSum = 0;
  for (int i = 0; i < 8; i++) {
    soilRawSum += analogRead(PIN_SOIL_ADC);
    delay(5);
  }
  int soilRaw = soilRawSum / 8;
  float soilMoisturePct = readCalibratedSoilMoisture(soilRaw);

  // 2. Read DHT22
  float tempC = dht.readTemperature();
  float humidityPct = dht.readHumidity();

  // 3. Read LDR Light Sensor
  int lightRaw = analogRead(PIN_LDR_ADC);

  // 4. Read Rain Sensor (Active LOW on most FC-37 boards: LOW = Rain droplet detected)
  bool rainDetected = (digitalRead(PIN_RAIN_DIGITAL) == LOW);

  // Construct Telemetry JSON Payload
  StaticJsonDocument<384> doc;
  doc["device_id"] = DEVICE_ID;
  doc["sequence"] = ++messageSequence;
  doc["soil_moisture_raw"] = soilRaw;
  doc["soil_moisture_percent"] = isnan(soilMoisturePct) ? (float)0.0 : round(soilMoisturePct * 10) / 10.0;
  doc["temperature_c"] = isnan(tempC) ? (float)0.0 : round(tempC * 10) / 10.0;
  doc["humidity_percent"] = isnan(humidityPct) ? (float)0.0 : round(humidityPct * 10) / 10.0;
  doc["light_raw"] = lightRaw;
  doc["rain_detected"] = rainDetected;
  doc["pump_state"] = isPumpRunning ? "ON" : "OFF";
  doc["is_simulated"] = false;

  char buffer[384];
  serializeJson(doc, buffer);
  mqttClient.publish(topicTelemetry, buffer);
  Serial.printf("[TELEMETRY] Sent seq #%lu -> Soil: %.1f%%, Temp: %.1fC, Rain: %s, Pump: %s\n",
    messageSequence, soilMoisturePct, tempC, rainDetected ? "YES" : "NO", isPumpRunning ? "ON" : "OFF");
}

void publishHeartbeat() {
  StaticJsonDocument<256> doc;
  doc["device_id"] = DEVICE_ID;
  doc["uptime_seconds"] = millis() / 1000;
  doc["signal_strength"] = WiFi.RSSI();
  doc["firmware_version"] = "v1.2.0-secure";
  doc["ip_address"] = WiFi.localIP().toString();

  char buffer[256];
  serializeJson(doc, buffer);
  mqttClient.publish(topicStatus, buffer);
}
