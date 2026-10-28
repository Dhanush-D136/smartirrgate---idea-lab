import datetime
import uuid
import json
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import desc
from pydantic import BaseModel
from backend.app.core.database import get_db
from backend.app.core.config import settings
from backend.app.core.security import get_current_user
from backend.app.models.models import (
    User, IrrigationSetting, IrrigationCommand, IrrigationEvent,
    ProposedAction, SystemState
)
from backend.app.schemas.schemas import (
    CommandRequest, CommandResponse, ModeToggleRequest,
    IrrigationEventResponse, PermissionModeUpdateRequest
)
from backend.app.services.state_manager import state_manager
from backend.app.services.simulation_service import simulation_engine
from backend.app.services.mqtt_service import mqtt_service

router = APIRouter(prefix="/irrigation", tags=["Irrigation Control"])

class ActionApprovalRequest(BaseModel):
    action_id: int
    decision: str # "APPROVE" or "REJECT"

@router.get("/status")
def get_irrigation_status(db: Session = Depends(get_db)):
    target_id = settings.DEFAULT_ESP32_ID
    setting = db.query(IrrigationSetting).filter(IrrigationSetting.device_id == target_id).first()
    if not setting:
        setting = IrrigationSetting(device_id=target_id)
        db.add(setting)
        db.commit()

    system_mode = state_manager.get_mode()
    permission_mode = state_manager.get_permission_mode()
    current_pump_state = state_manager.get_authoritative_pump_state()
    now = datetime.datetime.now(datetime.timezone.utc)
    
    # Calculate runtime remaining
    runtime_elapsed_secs = 0
    runtime_remaining_secs = 0
    pump_started_at = None
    
    if system_mode == "SIMULATION":
        if simulation_engine.pump_state == "RUNNING" and simulation_engine.pump_started_at:
            pump_started_at = simulation_engine.pump_started_at
            runtime_elapsed_secs = simulation_engine.session_runtime
            runtime_remaining_secs = max(0, setting.max_runtime_seconds - runtime_elapsed_secs)
    else:
        if mqtt_service.current_pump_state == "ON" and mqtt_service.pump_started_at:
            pump_started_at = mqtt_service.pump_started_at
            delta = (now - mqtt_service.pump_started_at).total_seconds()
            runtime_elapsed_secs = int(delta)
            runtime_remaining_secs = max(0, setting.max_runtime_seconds - runtime_elapsed_secs)

    # Cooldown calculation
    cooldown_remaining_secs = 0
    last_end = simulation_engine.last_irrigation_end if system_mode == "SIMULATION" else mqtt_service.last_irrigation_end
    if last_end:
        elapsed = (now - last_end).total_seconds()
        total_cooldown = setting.cooldown_minutes * 60
        if elapsed < total_cooldown:
            cooldown_remaining_secs = int(total_cooldown - elapsed)

    last_command = db.query(IrrigationCommand)\
        .filter(IrrigationCommand.device_id == target_id)\
        .order_by(desc(IrrigationCommand.issued_at))\
        .first()

    return {
        "device_id": target_id,
        "system_mode": system_mode,
        "permission_mode": permission_mode,
        "auto_mode_enabled": setting.auto_mode_enabled,
        "current_pump_state": current_pump_state,
        "pump_started_at": pump_started_at.isoformat() if pump_started_at else None,
        "runtime_elapsed_secs": runtime_elapsed_secs,
        "runtime_remaining_secs": runtime_remaining_secs,
        "cooldown_remaining_secs": cooldown_remaining_secs,
        "max_runtime_limit_secs": setting.max_runtime_seconds,
        "last_command": {
            "command_id": last_command.command_id if last_command else None,
            "action": last_command.action if last_command else None,
            "status": last_command.status if last_command else None,
            "issued_at": last_command.issued_at.isoformat() if last_command else None,
            "confirmed_pump_state": last_command.confirmed_pump_state if last_command else None
        } if last_command else None
    }

@router.post("/commands", response_model=CommandResponse)
def execute_irrigation_command(
    cmd_in: CommandRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    target_id = cmd_in.device_id or settings.DEFAULT_ESP32_ID
    
    if cmd_in.action not in ["START_PUMP", "STOP_PUMP", "EMERGENCY_STOP"]:
        raise HTTPException(status_code=400, detail="Invalid action. Must be START_PUMP, STOP_PUMP, or EMERGENCY_STOP")

    setting = db.query(IrrigationSetting).filter(IrrigationSetting.device_id == target_id).first()
    max_duration = cmd_in.duration_seconds or (setting.max_runtime_seconds if setting else 300)
    now = datetime.datetime.now(datetime.timezone.utc)
    expires_at = now + datetime.timedelta(seconds=settings.COMMAND_ACK_TIMEOUT_SECONDS)

    command_id = str(uuid.uuid4())
    cmd_record = IrrigationCommand(
        command_id=command_id,
        device_id=target_id,
        action=cmd_in.action,
        parameters_json=json.dumps({"duration_seconds": max_duration, "reason": cmd_in.reason}),
        issued_at=now,
        expires_at=expires_at,
        status="SENT",
        issued_by_user_id=current_user.id
    )
    db.add(cmd_record)
    db.commit()
    db.refresh(cmd_record)

    try:
        if cmd_in.action == "START_PUMP":
            res = state_manager.start_irrigation(
                duration_seconds=max_duration,
                reason=cmd_in.reason or f"Manual start by {current_user.email}",
                user_email=current_user.email
            )
            return CommandResponse(
                command_id=command_id,
                device_id=target_id,
                action="START_PUMP",
                status="SENT",
                issued_at=now,
                expires_at=expires_at,
                confirmed_pump_state=res.get("pump_state", "RUNNING"),
                message=res.get("message", "Irrigation started successfully.")
            )

        elif cmd_in.action == "STOP_PUMP":
            res = state_manager.stop_irrigation(
                reason=cmd_in.reason or f"Manual stop by {current_user.email}",
                user_email=current_user.email
            )
            return CommandResponse(
                command_id=command_id,
                device_id=target_id,
                action="STOP_PUMP",
                status="SENT",
                issued_at=now,
                expires_at=expires_at,
                confirmed_pump_state=res.get("pump_state", "OFF"),
                message=res.get("message", "Irrigation stopped successfully.")
            )


        elif cmd_in.action == "EMERGENCY_STOP":
            res = state_manager.emergency_stop(user_email=current_user.email)
            return CommandResponse(
                command_id=f"estop-{int(now.timestamp())}",
                device_id=target_id,
                action="EMERGENCY_STOP",
                status="SUCCESS",
                issued_at=now,
                expires_at=expires_at,
                confirmed_pump_state="OFF",
                message="Emergency stop executed successfully across all controllers."
            )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Command execution error: {e}")

@router.post("/mode")
def set_irrigation_mode(
    req: ModeToggleRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    target_id = req.device_id or settings.DEFAULT_ESP32_ID
    setting = db.query(IrrigationSetting).filter(IrrigationSetting.device_id == target_id).first()
    if not setting:
        setting = IrrigationSetting(device_id=target_id)
        db.add(setting)

    setting.auto_mode_enabled = req.auto_mode_enabled
    setting.updated_by = current_user.email
    db.commit()

    mode_str = "AUTOMATIC" if req.auto_mode_enabled else "MANUAL"
    return {
        "device_id": target_id,
        "auto_mode_enabled": setting.auto_mode_enabled,
        "message": f"Irrigation operating mode updated to {mode_str}"
    }

@router.get("/permission")
def get_permission_mode():
    return {
        "status": "SUCCESS",
        "permission_mode": state_manager.get_permission_mode()
    }

@router.post("/permission")
def set_permission_mode(
    req: PermissionModeUpdateRequest
):
    try:
        updated = state_manager.set_permission_mode(req.permission_mode)
        return {
            "status": "SUCCESS",
            "permission_mode": updated,
            "message": f"Automation permission updated to {updated}"
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/approve-action")
def decide_proposed_action(
    req: ActionApprovalRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    action = db.query(ProposedAction).filter(ProposedAction.id == req.action_id).first()
    if not action:
        raise HTTPException(status_code=404, detail="Proposed action not found.")
        
    now = datetime.datetime.now(datetime.timezone.utc)
    if req.decision == "APPROVE":
        action.status = "APPROVED"
        action.decided_at = now
        action.decided_by = current_user.email
        db.commit()
        
        # Execute the approved irrigation
        res = state_manager.start_irrigation(
            duration_seconds=300,
            reason=f"Approved proposed action #{action.id}: {action.reason}",
            user_email=current_user.email
        )
        return {
            "status": "APPROVED",
            "message": "Proposed irrigation approved and started.",
            "result": res
        }
    else:
        action.status = "REJECTED"
        action.decided_at = now
        action.decided_by = current_user.email
        db.commit()
        return {
            "status": "REJECTED",
            "message": "Proposed irrigation action was rejected by operator."
        }

@router.get("/events", response_model=List[IrrigationEventResponse])
def get_irrigation_events(
    limit: Optional[int] = 50,
    device_id: Optional[str] = None,
    mode: Optional[str] = None, # "simulation", "hardware", or None for all
    db: Session = Depends(get_db)
):
    target_id = device_id or settings.DEFAULT_ESP32_ID
    query = db.query(IrrigationEvent).filter(IrrigationEvent.device_id == target_id)
    
    if mode == "simulation":
        query = query.filter(IrrigationEvent.triggered_by.in_(["SIMULATOR", "SYSTEM_AUTO", "USER:operator"]))
    elif mode == "hardware":
        query = query.filter(IrrigationEvent.triggered_by != "SIMULATOR")

    events = query.order_by(desc(IrrigationEvent.start_time)).limit(limit).all()
    return events
