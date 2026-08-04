import os
import uuid
from datetime import UTC, datetime

from dotenv import load_dotenv
from sqlalchemy import DateTime, ForeignKey, String, Text, create_engine, or_, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from app.models import Deliverable, Project, ProjectSummary, ProjectWithDeliverables
from app.schemas import ProjectCreate, ProjectUpdate

load_dotenv()

DEFAULT_DATABASE_URL = (
    "mysql+pymysql://buildbrief:password@raspberrypi.local:3306/buildbrief"
)


class Base(DeclarativeBase):
    pass


class ProjectRecord(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    target_users: Mapped[str] = mapped_column(Text, nullable=False)
    platform: Mapped[str] = mapped_column(String(32), nullable=False)
    tech_preferences: Mapped[str] = mapped_column(Text, nullable=False, default="")
    complexity: Mapped[str] = mapped_column(String(32), nullable=False)
    constraints: Mapped[str] = mapped_column(Text, nullable=False, default="")
    extra_context: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class DeliverableRecord(Base):
    __tablename__ = "deliverables"

    project_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("projects.id", ondelete="CASCADE"),
        primary_key=True,
    )
    spec: Mapped[str | None] = mapped_column(Text, nullable=True)
    implementation_plan: Mapped[str | None] = mapped_column(Text, nullable=True)
    agent_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)


_engine = None
_SessionLocal: sessionmaker[Session] | None = None


def configure_database(database_url: str | None = None) -> None:
    """Configure the database engine. Tests can call this with a temporary URL."""
    global _engine, _SessionLocal
    url = database_url or os.getenv("DATABASE_URL") or DEFAULT_DATABASE_URL
    # MariaDB drops idle connections after wait_timeout. Without pre_ping, the first
    # request after a quiet period gets a dead pooled connection and a 500.
    _engine = create_engine(
        url,
        future=True,
        pool_pre_ping=True,
        pool_recycle=1800,
    )
    _SessionLocal = sessionmaker(bind=_engine, autoflush=False, expire_on_commit=False)


def _session() -> Session:
    if _SessionLocal is None:
        configure_database()
    if _SessionLocal is None:
        raise RuntimeError("Database session is not configured")
    return _SessionLocal()


def init_db() -> None:
    if _engine is None:
        configure_database()
    if _engine is None:
        raise RuntimeError("Database engine is not configured")
    Base.metadata.create_all(_engine)


def _to_project(record: ProjectRecord) -> Project:
    return Project(
        id=record.id,
        title=record.title,
        description=record.description,
        target_users=record.target_users,
        platform=record.platform,
        tech_preferences=record.tech_preferences,
        complexity=record.complexity,
        constraints=record.constraints,
        extra_context=record.extra_context,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


def _to_deliverable(record: DeliverableRecord | None) -> Deliverable | None:
    if record is None:
        return None
    return Deliverable(
        spec=record.spec,
        implementation_plan=record.implementation_plan,
        agent_prompt=record.agent_prompt,
    )


def create_project(body: ProjectCreate) -> Project:
    now = datetime.now(UTC)
    record = ProjectRecord(
        id=str(uuid.uuid4()),
        created_at=now,
        updated_at=now,
        **body.model_dump(),
    )
    with _session() as session:
        session.add(record)
        session.commit()
        return _to_project(record)


def update_project(project_id: str, body: ProjectUpdate) -> Project | None:
    with _session() as session:
        record = session.get(ProjectRecord, project_id)
        if record is None:
            return None

        for field, value in body.model_dump().items():
            setattr(record, field, value)
        record.updated_at = datetime.now(UTC)
        session.commit()
        return _to_project(record)


def get_project(project_id: str) -> ProjectWithDeliverables | None:
    with _session() as session:
        project = session.get(ProjectRecord, project_id)
        if project is None:
            return None
        deliverable = session.get(DeliverableRecord, project_id)
        return ProjectWithDeliverables(
            project=_to_project(project),
            deliverables=_to_deliverable(deliverable),
        )


def list_projects(
    q: str | None = None,
    platform: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[ProjectSummary]:
    with _session() as session:
        statement = (
            select(ProjectRecord, DeliverableRecord)
            .outerjoin(
                DeliverableRecord,
                ProjectRecord.id == DeliverableRecord.project_id,
            )
        )

        normalized_q = q.strip() if q else ""
        if normalized_q:
            pattern = f"%{normalized_q}%"
            statement = statement.where(
                or_(
                    ProjectRecord.title.ilike(pattern),
                    ProjectRecord.description.ilike(pattern),
                )
            )
        if platform and platform != "all":
            statement = statement.where(ProjectRecord.platform == platform)

        limit = min(max(limit, 1), 100)
        offset = max(offset, 0)
        rows = session.execute(
            statement
            .order_by(ProjectRecord.updated_at.desc(), ProjectRecord.created_at.desc())
            .limit(limit)
            .offset(offset)
        ).all()
        return [
            ProjectSummary(
                id=project.id,
                title=project.title,
                description=project.description,
                target_users=project.target_users,
                platform=project.platform,
                complexity=project.complexity,
                created_at=project.created_at,
                updated_at=project.updated_at,
                has_spec=bool(deliverable and deliverable.spec),
                has_implementation_plan=bool(
                    deliverable and deliverable.implementation_plan
                ),
                has_agent_prompt=bool(deliverable and deliverable.agent_prompt),
            )
            for project, deliverable in rows
        ]


def save_deliverables(project_id: str, deliverable: Deliverable) -> Deliverable | None:
    with _session() as session:
        project = session.get(ProjectRecord, project_id)
        if project is None:
            return None

        record = session.get(DeliverableRecord, project_id)
        if record is None:
            record = DeliverableRecord(project_id=project_id)
            session.add(record)

        updates = deliverable.model_dump()
        for field, value in updates.items():
            if value is not None:
                setattr(record, field, value)

        project.updated_at = datetime.now(UTC)
        session.commit()
        return _to_deliverable(record)


def delete_project(project_id: str) -> bool:
    with _session() as session:
        project = session.get(ProjectRecord, project_id)
        if project is None:
            return False
        deliverable = session.get(DeliverableRecord, project_id)
        if deliverable is not None:
            session.delete(deliverable)
        session.delete(project)
        session.commit()
        return True
