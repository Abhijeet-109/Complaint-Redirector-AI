from fastapi import APIRouter, Depends
from sqlalchemy import case, func
from sqlalchemy.orm import Session, aliased

from backend.Database.models import ComplaintRedirection, Department
from backend.auth.dependencies import get_db, require_role


router = APIRouter(
    prefix="/api/v1/admin",
    tags=["Redirection Analytics"],
)


@router.get("/redirection-kpis")
def get_redirection_kpis(
    db: Session = Depends(get_db),
    current_user=Depends(require_role("admin", "super_admin")),
):
    """
    Redirection analytics for Admin and Super Admin.

    Counts:
    - Unique complaints forwarded at least once.
    - Total department-transfer events.
    - Transfer events grouped by reason.
    - Department-to-department transfer breakdown.
    """

    # Aggregate the totals from the existing redirection history table.
    totals = db.query(
        func.count(ComplaintRedirection.id).label(
            "total_transfer_events"
        ),
        func.count(
            func.distinct(ComplaintRedirection.complaint_id)
        ).label("total_complaints_forwarded"),
        func.coalesce(
            func.sum(
                case(
                    (
                        ComplaintRedirection.reason == "model_fault",
                        1,
                    ),
                    else_=0,
                )
            ),
            0,
        ).label("model_fault_transfers"),
        func.coalesce(
            func.sum(
                case(
                    (
                        ComplaintRedirection.reason
                        == "further_processing",
                        1,
                    ),
                    else_=0,
                )
            ),
            0,
        ).label("further_processing_transfers"),
    ).one()

    # The Department table is joined twice: once for the source
    # department and once for the destination department.
    source_department = aliased(Department)
    target_department = aliased(Department)

    route_rows = (
        db.query(
            ComplaintRedirection.from_department_id.label(
                "from_department_id"
            ),
            source_department.name.label("from_department"),
            ComplaintRedirection.to_department_id.label(
                "to_department_id"
            ),
            target_department.name.label("to_department"),
            func.count(
                func.distinct(ComplaintRedirection.complaint_id)
            ).label("unique_complaints_forwarded"),
            func.count(
                ComplaintRedirection.id
            ).label("total_transfer_events"),
            func.coalesce(
                func.sum(
                    case(
                        (
                            ComplaintRedirection.reason == "model_fault",
                            1,
                        ),
                        else_=0,
                    )
                ),
                0,
            ).label("model_fault_transfers"),
            func.coalesce(
                func.sum(
                    case(
                        (
                            ComplaintRedirection.reason
                            == "further_processing",
                            1,
                        ),
                        else_=0,
                    )
                ),
                0,
            ).label("further_processing_transfers"),
        )
        .join(
            source_department,
            source_department.id
            == ComplaintRedirection.from_department_id,
        )
        .join(
            target_department,
            target_department.id
            == ComplaintRedirection.to_department_id,
        )
        .group_by(
            ComplaintRedirection.from_department_id,
            source_department.name,
            ComplaintRedirection.to_department_id,
            target_department.name,
        )
        .order_by(
            func.count(ComplaintRedirection.id).desc(),
            source_department.name,
            target_department.name,
        )
        .all()
    )

    department_routes = [
        {
            "from_department_id": row.from_department_id,
            "from_department": row.from_department,
            "to_department_id": row.to_department_id,
            "to_department": row.to_department,
            "unique_complaints_forwarded": int(
                row.unique_complaints_forwarded or 0
            ),
            "total_transfer_events": int(
                row.total_transfer_events or 0
            ),
            "model_fault_transfers": int(
                row.model_fault_transfers or 0
            ),
            "further_processing_transfers": int(
                row.further_processing_transfers or 0
            ),
        }
        for row in route_rows
    ]

    return {
        "summary": {
            "total_complaints_forwarded": int(
                totals.total_complaints_forwarded or 0
            ),
            "total_transfer_events": int(
                totals.total_transfer_events or 0
            ),
            "model_fault_transfers": int(
                totals.model_fault_transfers or 0
            ),
            "further_processing_transfers": int(
                totals.further_processing_transfers or 0
            ),
        },
        "by_department_route": department_routes,
    }