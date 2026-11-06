"""Exercise the importer and SQLite export without external services."""
import io
import runpy
import sqlite3
import sys
import unittest
from contextlib import closing, redirect_stdout, redirect_stderr
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import Mock, patch

from sqlalchemy import create_engine

from canteen_backend import app as backend
from canteen_backend.app import app, db, init_database, Category, Canteen, RatingHistory

with patch.dict(sys.modules, {"app": backend}):
    from canteen_backend import sync_canteens as sync


MENU = '区一\n区二\n---\n区一\n食堂\n食堂-03 早餐\n---\n区二\n---\n食堂\n2 面々\n2 面\n1一2 粉\n5# 餐\n0\n无编号'


class ToolTests(unittest.TestCase):
    def test_sync_parser_and_network_fallback(self):
        with self.assertRaises(RuntimeError):
            sync.parse_hidden_level_data('<html>')
        with self.assertRaises(RuntimeError):
            sync.parse_hierarchy('')
        html = f'<input id="hfLevelData" value="{MENU}">'
        with self.assertRaises(RuntimeError):
            sync.collect_menu(html)
        areas = sync.parse_hierarchy(MENU)
        restaurants, stalls = len(areas[0]["restaurants"]), len(areas[0]["restaurants"][0]["stalls"])
        self.assertEqual(restaurants, 1)
        self.assertEqual(stalls, 5)
        self.assertEqual(areas[0]["restaurants"][0]["stalls"], ["02 面", "01-02 粉", "5# 餐", "无编号", "03 早餐"])
        with patch.dict('os.environ', {'WJX_PROXY': ''}), patch.object(sync.requests, 'get', side_effect=[OSError(), Mock()]) as get:
            sync.request_with_fallback('https://test.invalid')
            self.assertEqual(get.call_count, 2)
            self.assertIsNone(get.call_args.kwargs['proxies'])
        with patch.dict('os.environ', {'WJX_PROXY': 'http://proxy.invalid'}), patch.object(sync.requests, 'get', side_effect=OSError()):
            with self.assertRaises(RuntimeError):
                sync.request_with_fallback('https://test.invalid')
        with patch.object(sync, 'request_with_fallback', return_value=Mock(text='bad')):
            with self.assertRaises(RuntimeError):
                sync.fetch_survey_menu()
        with patch.object(sync, 'request_with_fallback', side_effect=[Mock(text='var activityId = DecodeId(123)'), Mock(text=html)]):
            self.assertEqual(sync.fetch_survey_menu()[1], html)

    def test_sync_preserves_campus_and_dry_run(self):
        with app.app_context():
            old_engine = db.engines[None]
            engine = create_engine('sqlite://')
            db.engines[None] = engine
            try:
                init_database()
                db.session.add_all([Category(id=1, name='食堂'), Category(id=2, name='旧食堂')])
                db.session.flush()
                db.session.add_all([
                    Canteen(id=1, name='01 面', category_id=1), Canteen(id=2, name='03 旧', category_id=1),
                    Canteen(id=3, name='有评价', category_id=1), Canteen(id=4, name='已下架', category_id=1, is_active=False),
                    Canteen(id=5, name='校内独立店', category_id=100001),
                ])
                db.session.flush()
                db.session.add_all([RatingHistory(canteen_id=3), RatingHistory(canteen_id=4)])
                db.session.commit()
                areas = [{'restaurants': [{'name': '食堂', 'stalls': ['02 面', '03 新', '04 新开']},
                                          {'name': '新增食堂', 'stalls': ['新档口']}]}]
                result = sync.sync_database(areas, dry_run=True)
                self.assertEqual(len(result['created_categories']), 1)
                self.assertEqual(db.session.get(Canteen, 1).name, '01 面')
                result = sync.sync_database(areas)
                self.assertEqual(len(result['updated_canteens']), 2)
                self.assertFalse(db.session.get(Canteen, 3).is_active)
                self.assertTrue(db.session.get(Canteen, 5).is_active)
                self.assertIsNotNone(db.session.get(Category, 100002))
                self.assertIsNone(db.session.get(Category, 2))
            finally:
                db.session.remove()
                db.engines[None] = old_engine
                engine.dispose()

    def test_sync_cli_and_compatibility_entry(self):
        module_path = str(Path(sync.__file__).parent)
        with patch.object(sync, 'fetch_survey_menu', return_value=('', f'<input id="hfLevelData" value="{MENU}">')), \
                patch.object(sync, 'collect_menu', return_value=([], 1, 50)), \
                patch.object(sync, 'sync_database', return_value={key: [] for key in (
                    'created_categories','created_canteens','updated_canteens','archived_canteens','deleted_canteens'
                )} | {'report':'report'}), patch('builtins.open', unittest.mock.mock_open()), redirect_stdout(io.StringIO()):
            for args in (['sync'], ['sync', '--dry-run']):
                with patch.object(sys, 'argv', args):
                    sync.main()
        with patch.dict(sys.modules, {'sync_canteens': sync}), patch.object(sync, 'main') as main, redirect_stdout(io.StringIO()):
            runpy.run_path(str(Path(module_path, 'import_canteens.py')))
            main.assert_not_called()
            runpy.run_path(str(Path(module_path, 'import_canteens.py')), run_name='__main__')
            main.assert_called_once_with()

    def test_export_keeps_blobs_excludes_tokens_and_handles_legacy(self):
        with TemporaryDirectory() as temporary:
            folder = Path(temporary)
            src = folder / 'source.db'
            out = folder / 'export.sql'
            with closing(sqlite3.connect(src)) as db, db:
                for migration in sorted(Path('cloudflare/migrations').glob('*.sql')):
                    db.executescript(migration.read_text(encoding='utf-8'))
                db.executescript("INSERT INTO users(id,username,password,token,avatar) VALUES(1,'o''neil','hash','private',X'ABCD');"
                                 "INSERT INTO canteens(id,name) VALUES(1,'A');"
                                 "INSERT INTO ratings(id,user_id,canteen_id,score) VALUES(1,1,1,4);"
                                 "INSERT INTO review_photos(rating_id,photo) VALUES(1,X'1234');")
            with patch.object(sys, 'argv', ['export', str(src), str(out)]):
                runpy.run_path('cloudflare/export_sqlite.py', run_name='__main__')
            payload = out.read_text(encoding='utf-8')
            self.assertNotIn('private', payload)
            self.assertIn("o''neil", payload)
            with closing(sqlite3.connect(':memory:')) as target:
                for migration in sorted(Path('cloudflare/migrations').glob('*.sql')):
                    target.executescript(migration.read_text(encoding='utf-8'))
                target.executescript(payload)
                self.assertEqual(target.execute('SELECT token,hex(avatar) FROM users').fetchone(), (None, 'ABCD'))
                self.assertEqual(target.execute('SELECT hex(photo) FROM review_photos').fetchone()[0], '1234')
            with closing(sqlite3.connect(src)) as db, db:
                db.execute('UPDATE ratings SET photo=zeroblob(1500001)')
            with patch.object(sys, 'argv', ['export', str(src), str(folder / 'large.sql')]), self.assertRaises(SystemExit):
                runpy.run_path('cloudflare/export_sqlite.py', run_name='__main__')
            with patch.object(sys, 'argv', ['export', str(src), str(folder / 'bad.txt')]), redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                runpy.run_path('cloudflare/export_sqlite.py', run_name='__main__')
