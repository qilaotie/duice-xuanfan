"""Serve the real app against disposable fixtures for browser tests."""
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

from sqlalchemy import create_engine
from werkzeug.security import generate_password_hash
from werkzeug.serving import make_server

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from canteen_backend.app import app, db, init_database, Category, Canteen, User

with TemporaryDirectory() as directory:
    with app.app_context():
        db.engines[None] = create_engine(f"sqlite:///{Path(directory, 'test.db').as_posix()}")
        init_database()
        db.session.add_all([
            Category(id=1, name="测试食堂"),
            Category(id=6, name="竹园一层餐厅"), Category(id=7, name="竹园二层餐厅"),
            Category(id=8, name="竹园三层餐厅"), Category(id=13, name="东区一层餐厅"),
            Category(id=14, name="西军电餐厅"),
            Canteen(id=1, name="01 测试面馆", category_id=1),
            Canteen(id=2, name="测试轻食店", category_id=100001),
            Canteen(id=3, name="竹园面馆", category_id=6), Canteen(id=4, name="竹园饭馆", category_id=7),
            Canteen(id=5, name="竹园粉店", category_id=8), Canteen(id=6, name="东区小吃", category_id=13),
            Canteen(id=7, name="西军电咖啡", category_id=14),
            User(username="admin", password=generate_password_hash("test-admin-password"), is_admin=True),
        ])
        db.session.commit()
    server = make_server("127.0.0.1", 0, app)
    print(server.server_port, flush=True)
    server.serve_forever()
