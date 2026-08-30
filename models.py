from sqlalchemy import Column, Integer, Float, create_engine, func
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

Base = declarative_base()

class Trip(Base):
    __tablename__ = 'trips'
    id = Column(Integer, primary_key=True, autoincrement=True)
    km = Column(Float, nullable=False)
    cargo_kg = Column(Float, nullable=False)
    fine = Column(Float, nullable=False)
    price = Column(Float, nullable=False)

# Engine and session will be configured by init_db
engine = None
Session = None

def init_db(db_url: str):
    """Initialize the SQLAlchemy engine and session.

    Args:
        db_url: Database URL – can be a SQLite file path (e.g. ``sqlite:///my.db``) or a PostgreSQL URL.
    """
    global engine, Session
    # Directly use the provided URL; SQLAlchemy will handle the appropriate driver.
    engine = create_engine(db_url, echo=False, connect_args={"check_same_thread": False} if db_url.startswith('sqlite') else {})
    Session = sessionmaker(bind=engine)
    Base.metadata.create_all(engine)
    # Expose a global session for convenience
    global db_session
    db_session = Session()
