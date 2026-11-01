"""Apply the Alembic migration chain for a fresh or existing database."""

from alembic import command
from alembic.config import Config


def upgrade_database() -> None:
    config = Config("alembic.ini")
    command.upgrade(config, "head")


if __name__ == "__main__":
    upgrade_database()
