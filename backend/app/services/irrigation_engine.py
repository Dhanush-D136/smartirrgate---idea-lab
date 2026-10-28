import datetime
from typing import Optional, Dict, Any, Tuple
from dataclasses import dataclass

@dataclass
class EngineDecision:
    action: str  # "START", "STOP", "HOLD"
    should_change_state: bool
    reason: str
    safety_block: Optional[str] = None
    details: Dict[str, Any] = None

class IrrigationEngine:
    """
    Transparent, deterministic rule-based automatic irrigation decision engine.
    Ensures safe, hysteresis-managed pump control without runaway watering.
    """
    
    @staticmethod
    def evaluate(
        soil_moisture_percent: Optional[float],
        rain_detected: bool,
        light_percent: Optional[float],
        current_pump_state: str, # "ON" or "OFF"
        pump_started_at: Optional[datetime.datetime],
        last_irrigation_end: Optional[datetime.datetime],
        auto_mode_enabled: bool,
        dry_threshold_percent: float,
        target_moisture_percent: float,
        max_runtime_seconds: int,
        cooldown_minutes: int,
        rain_pause_enabled: bool,
        daylight_only: bool,
        now: Optional[datetime.datetime] = None
    ) -> EngineDecision:
        if now is None:
            now = datetime.datetime.now(datetime.timezone.utc)
            
        details = {
            "soil_moisture_percent": soil_moisture_percent,
            "rain_detected": rain_detected,
            "light_percent": light_percent,
            "current_pump_state": current_pump_state,
            "auto_mode_enabled": auto_mode_enabled,
            "dry_threshold": dry_threshold_percent,
            "target_threshold": target_moisture_percent,
            "evaluated_at": now.isoformat()
        }

        # 1. Critical safety check: Max Continuous Runtime
        if current_pump_state == "ON" and pump_started_at is not None:
            runtime_seconds = (now - pump_started_at).total_seconds()
            details["current_runtime_seconds"] = runtime_seconds
            if runtime_seconds >= max_runtime_seconds:
                return EngineDecision(
                    action="STOP",
                    should_change_state=True,
                    reason=f"Safety interlock: Max continuous runtime of {max_runtime_seconds}s exceeded ({runtime_seconds:.0f}s elapsed)",
                    safety_block="MAX_RUNTIME_EXCEEDED",
                    details=details
                )

        # 2. Check if Auto Mode is enabled
        if not auto_mode_enabled:
            return EngineDecision(
                action="HOLD",
                should_change_state=False,
                reason="Auto mode disabled by operator; relying on manual control",
                details=details
            )

        # 3. Sensor validity check
        if soil_moisture_percent is None or not (0.0 <= soil_moisture_percent <= 100.0):
            if current_pump_state == "ON":
                return EngineDecision(
                    action="STOP",
                    should_change_state=True,
                    reason="Safety failsafe: Invalid soil moisture sensor telemetry while pump is running",
                    safety_block="INVALID_SENSOR_DATA",
                    details=details
                )
            return EngineDecision(
                action="HOLD",
                should_change_state=False,
                reason="Cannot start irrigation: Invalid or missing soil moisture telemetry",
                safety_block="INVALID_SENSOR_DATA",
                details=details
            )

        # 4. If pump is currently running, check target threshold or rain pause
        if current_pump_state == "ON":
            if soil_moisture_percent >= target_moisture_percent:
                return EngineDecision(
                    action="STOP",
                    should_change_state=True,
                    reason=f"Target soil moisture reached ({soil_moisture_percent:.1f}% >= target {target_moisture_percent:.1f}%)",
                    details=details
                )
            if rain_pause_enabled and rain_detected:
                return EngineDecision(
                    action="STOP",
                    should_change_state=True,
                    reason="Precautionary stop: Rain detected while pump was running",
                    safety_block="RAIN_DETECTED",
                    details=details
                )
            return EngineDecision(
                action="HOLD",
                should_change_state=False,
                reason=f"Pump is currently watering (Moisture {soil_moisture_percent:.1f}% < Target {target_moisture_percent:.1f}%)",
                details=details
            )

        # 5. Pump is currently OFF: Check if we should START
        if soil_moisture_percent < dry_threshold_percent:
            # Check Rain pause policy
            if rain_pause_enabled and rain_detected:
                return EngineDecision(
                    action="HOLD",
                    should_change_state=False,
                    reason="Soil dry, but irrigation paused due to active rain detection",
                    safety_block="RAIN_PAUSE",
                    details=details
                )

            # Check Cooldown period
            if last_irrigation_end is not None:
                elapsed_minutes = (now - last_irrigation_end).total_seconds() / 60.0
                details["minutes_since_last_cycle"] = elapsed_minutes
                if elapsed_minutes < cooldown_minutes:
                    return EngineDecision(
                        action="HOLD",
                        should_change_state=False,
                        reason=f"Cooldown active: {elapsed_minutes:.1f}m elapsed of {cooldown_minutes}m required cooldown",
                        safety_block="COOLDOWN_ACTIVE",
                        details=details
                    )

            # Check Daylight-only policy
            if daylight_only and light_percent is not None and light_percent < 15.0:
                return EngineDecision(
                    action="HOLD",
                    should_change_state=False,
                    reason="Irrigation restricted to daylight hours; ambient light level too low",
                    safety_block="NIGHT_RESTRICTION",
                    details=details
                )

            # All start conditions met!
            return EngineDecision(
                action="START",
                should_change_state=True,
                reason=f"Soil moisture ({soil_moisture_percent:.1f}%) below dry threshold ({dry_threshold_percent:.1f}%). All safety checks passed.",
                details=details
            )

        # Soil is between dry threshold and target: hysteresis buffer zone
        return EngineDecision(
            action="HOLD",
            should_change_state=False,
            reason=f"Soil moisture ({soil_moisture_percent:.1f}%) is within optimal range [{dry_threshold_percent:.1f}% - {target_moisture_percent:.1f}%]",
            details=details
        )
