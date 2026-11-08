"""时间戳出口必须带时区标记，否则小程序会按本地解释、整体差 8 小时。

这条用例钉的是**响应里的字符串形状**，不是数据库里的值——库里存 UTC naive 是对的，
错的是"不带偏移的 ISO 串"到了 `new Date()` 手里被当成本地时间。
"""
import os
import sys
from datetime import datetime, timedelta, timezone

os.environ["DATABASE_URL"] = "sqlite:////tmp/tumaibiji_pytest_tz.db"
os.environ["JWT_SECRET_KEY"] = "pytest-only-secret-not-a-real-one"
os.environ["EXTRACT_PROVIDER"] = "none"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from fastapi.testclient import TestClient

from app.core.auth import _create_token
from app.core.timefmt import _as_utc_iso
from app.db.database import Base, SessionLocal, engine
from app.main import app
from app.models.user import User


def test_naive串按UTC补Z_带偏移的换算成UTC_空值和字符串原样():
    assert _as_utc_iso(datetime(2026, 9, 22, 10, 17, 52)) == '2026-09-22T10:17:52Z'
    assert _as_utc_iso(datetime(2026, 9, 22, 18, 17, 52, tzinfo=timezone(timedelta(hours=8)))) \
        == '2026-09-22T10:17:52Z'
    assert _as_utc_iso(None) is None
    assert _as_utc_iso('2026-09-22T10:17:52Z') == '2026-09-22T10:17:52Z'


@pytest.fixture(scope="module")
def client():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    s = SessionLocal()
    u = User(openid="pytest-openid-tz")
    s.add(u)
    s.commit()
    client = TestClient(app)
    yield client, str(u.id)
    s.close()


def test_新建笔记的响应时间是无歧义的瞬时点(client):
    c, uid = client
    r = c.post('/api/notes/', headers={'Authorization': 'Bearer ' + _create_token(int(uid))},
               json={'title': '时区用例', 'source_type': 'manual'})
    assert r.status_code == 200
    stamp = r.json()['created_at']
    assert stamp.endswith('Z'), f"响应时间没带时区标记，小程序会按本地解释：{stamp}"
    got = datetime.fromisoformat(stamp.replace('Z', '+00:00'))
    drift = abs((datetime.now(timezone.utc) - got).total_seconds())
    assert drift < 60, f"补了 Z 但瞬时点不对，偏差 {drift:.0f} 秒"


def test_列表与详情同一条的时间标记一致(client):
    c, uid = client
    h = {'Authorization': 'Bearer ' + _create_token(int(uid))}
    created = c.post('/api/notes/', headers=h, json={'title': '列表一致性', 'source_type': 'manual'}).json()
    listed = next(n for n in c.get('/api/notes/', headers=h).json() if n['id'] == created['id'])
    detail = c.get(f"/api/notes/{created['id']}", headers=h).json()
    assert listed['created_at'] == created['created_at'] == detail['created_at']
    assert listed['created_at'].endswith('Z')
