from app import storage
from app.models import Deliverable
from app.schemas import ProjectCreate, ProjectUpdate


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


def test_update_project_and_query_projects():
    web_project = storage.create_project(
        ProjectCreate(
            title="Planning Desk",
            description="Collaborative planning app",
            target_users="Founders",
            platform="web",
            complexity="medium",
        )
    )
    storage.create_project(
        ProjectCreate(
            title="CLI Notes",
            description="Terminal notes app",
            target_users="Developers",
            platform="cli",
            complexity="simple",
        )
    )

    updated = storage.update_project(
        web_project.id,
        ProjectUpdate(
            title="Planning Desk Pro",
            description="Collaborative planning app with exports",
            target_users="Startup teams",
            platform="web",
            tech_preferences="React",
            complexity="complex",
            constraints="Private beta",
            extra_context="Ship quickly",
        ),
    )

    assert updated is not None
    assert updated.title == "Planning Desk Pro"
    assert updated.complexity == "complex"

    web_results = storage.list_projects(platform="web")
    query_results = storage.list_projects(q="terminal")
    limited_results = storage.list_projects(limit=1)

    assert [project.id for project in web_results] == [web_project.id]
    assert len(query_results) == 1
    assert query_results[0].title == "CLI Notes"
    assert len(limited_results) == 1
