from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..models.models import Appointment, AuditLog, Doctor, LabReport, Laboratory, Patient, User
from ..schemas.schemas import AdminSummaryResponse
from .deps import get_current_user

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/dashboard", response_model=AdminSummaryResponse)
def get_admin_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return AdminSummaryResponse(
        patients=db.query(Patient).count(),
        doctors=db.query(Doctor).count(),
        hospitals=(
            db.query(Doctor.hospital_name).filter(Doctor.hospital_name.isnot(None)).distinct().count()
        ),
        labs=db.query(Laboratory).count(),
        appointments=db.query(Appointment).count(),
        reports=db.query(LabReport).count(),
        recent_logs=[
            log.action
            for log in db.query(AuditLog).order_by(AuditLog.log_time.desc()).limit(10).all()
        ],
    )
