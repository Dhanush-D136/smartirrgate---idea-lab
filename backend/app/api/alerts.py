import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from pydantic import BaseModel
from backend.app.core.database import get_db
from backend.app.models.models import SystemAlert, User
from backend.app.core.security import get_current_user
from backend.app.schemas.schemas import AlertResponse
from backend.app.services.state_manager import state_manager

router = APIRouter(prefix="/alerts", tags=["Critical Alerts Management"])

class AlertStatusUpdate(BaseModel):
    status: str # "ACKNOWLEDGED", "RESOLVED"

@router.get("", response_model=List[AlertResponse])
def get_alerts(
    status: Optional[str] = None, # "ACTIVE", "ACKNOWLEDGED", "RESOLVED", or None for all
    severity: Optional[str] = None, # "CRITICAL", "WARNING", "INFO"
    mode: Optional[str] = None, # "SIMULATION", "HARDWARE"
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db)
):
    query = db.query(SystemAlert)
    
    active_mode = mode or state_manager.get_mode()
    if active_mode:
        query = query.filter(SystemAlert.source_mode == active_mode)
        
    if status:
        query = query.filter(SystemAlert.status == status.upper())
    if severity:
        query = query.filter(SystemAlert.severity == severity.upper())

    alerts = query.order_by(desc(SystemAlert.created_at)).limit(limit).all()
    return alerts

@router.get("/{alert_id}", response_model=AlertResponse)
def get_alert_detail(alert_id: int, db: Session = Depends(get_db)):
    alert = db.query(SystemAlert).filter(SystemAlert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found.")
    return alert

@router.post("/{alert_id}/acknowledge")
def acknowledge_alert(
    alert_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    alert = db.query(SystemAlert).filter(SystemAlert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found.")
        
    alert.status = "ACKNOWLEDGED"
    alert.is_read = True
    db.commit()
    return {"status": "SUCCESS", "message": f"Alert #{alert_id} acknowledged."}

@router.post("/{alert_id}/resolve")
def resolve_alert(
    alert_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    alert = db.query(SystemAlert).filter(SystemAlert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found.")
        
    alert.status = "RESOLVED"
    alert.is_read = True
    alert.resolved_at = datetime.datetime.now(datetime.timezone.utc)
    db.commit()
    return {"status": "SUCCESS", "message": f"Alert #{alert_id} resolved."}
