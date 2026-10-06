
import sys
import os

sys.path.insert(
    0,
    os.path.abspath(
        os.path.join(
            os.path.dirname(__file__),
            ".."
        )
    )
)
from Database.connection import engine, Base
from Database.models import User


print('Creating Database Tables...')

Base.metadata.create_all(
    bind = engine
)

print("Database tables Created successfully!")
