import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class Settings(BaseSettings):
    PROJECT_NAME: str = "SmartIrrigate — vel greenish"
    PROJECT_VERSION: str = "1.0.0"
    API_PREFIX: str = "/api"
    
    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./smartirrigate.db")
    
    # Security
    SECRET_KEY: str = os.getenv("SECRET_KEY", "smartirrigate-velgreenish-super-secure-key-2026-very-secret-token")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7 # 7 days
    
    # MQTT Configuration
    MQTT_BROKER_HOST: str = os.getenv("MQTT_BROKER_HOST", "127.0.0.1")
    MQTT_BROKER_PORT: int = int(os.getenv("MQTT_BROKER_PORT", "1883"))
    MQTT_USERNAME: Optional[str] = os.getenv("MQTT_USERNAME", None)
    MQTT_PASSWORD: Optional[str] = os.getenv("MQTT_PASSWORD", None)
    MQTT_TOPIC_PREFIX: str = os.getenv("MQTT_TOPIC_PREFIX", "smartirrigate")
    
    # Default Hardware identifiers
    DEFAULT_ESP32_ID: str = "esp32-zone-01"
    DEFAULT_RPI_ID: str = "rpi4b-edge-01"
    
    # Simulation / Stale thresholds
    STALE_DATA_TIMEOUT_SECONDS: int = 120 # 2 minutes without telemetry = STALE
    COMMAND_ACK_TIMEOUT_SECONDS: int = 10 # 10 seconds timeout for command ack
    
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True)

settings = Settings()
