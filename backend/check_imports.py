import sys
sys.path.insert(0, '.')
from app.api.doctor import router
print('Doctor API imports OK')
from app.schemas.schemas import DoctorDashboardResponse, ConsultationCreate
print('Schemas OK')
print('All checks passed')
