from app import storage
from app.models import Deliverable
from app.schemas import ProjectCreate


def setup_function():
    storage.configure_database("sqlite+pysqlite:///:memory:")
    storage.init_db()


def test_project_lifecycle_persists_deliverables():
    project = storage.create_project(
        ProjectCreate(
            title="Pi Library",
            description="Save generated build docs",
            target_users="Me",
            platform="web",
            tech_preferences="React, FastAPI, MariaDB",
            complexity="medium",
            constraints="Personal network only",
            extra_context="Use a Raspberry Pi database",
        )
    )

    storage.save_deliverables(
        project.id,
        Deliverable(spec="# Spec", implementation_plan="# Plan"),
    )

    saved = storage.get_project(project.id)
    summaries = storage.list_projects()

    assert saved is not None
    assert saved.project.title == "Pi Library"
    assert saved.deliverables is not None
    assert saved.deliverables.spec == "# Spec"
    assert len(summaries) == 1
    assert summaries[0].id == project.id
    assert summaries[0].has_spec is True
    assert summaries[0].has_implementation_plan is True
    assert summaries[0].has_agent_prompt is False

    assert storage.delete_project(project.id) is True
    assert storage.get_project(project.id) is None
    assert storage.delete_project(project.id) is False
