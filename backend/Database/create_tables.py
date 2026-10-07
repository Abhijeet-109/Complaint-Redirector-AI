
from backend.Database.connection import Base, engine
from backend.Database.models import User, Department


print('Creating Database Tables...')

Base.metadata.create_all(
    bind = engine
)

print("Database tables Created successfully!")
