from Database.connection import engine


try:
    with engine.connect() as connection:

        print("PostgreSQL connection Successfully!")

except Exception as e:
    print('Postgress connection failed!')
    print(e)