"""2.0 的对外接口必须**装得下已经发出去的老包**。

跑法：cd backend && python -m pytest tests/test_api_contract_1x.py -q

为什么这一条要单独有守卫：现网那批 1.9.x 是装在别人手机里的，不会因为我们又发了新版而自己更新。
老包里的字段名是抄死在代码里的——服务端把一个字段改名，那一版小程序在那台手机上就当场读成空，
而且**不会报错**：界面只是少了一行字，或者云上的对象没人去删。这类破坏没有任何一条现有用例抓得到，
因为其余测试打的都是当前这一版的模型。

基线是从 `master`（1.x 线）用 `scripts/dump_api_contract.py` 抄下来的，快照里记着 commit。
口径三条，全在 `api_contract.diff()` 里：响应字段只增不改、请求必填只能减不能加、路由不许消失。
"""
import importlib.util
import json
import os
import sys
from pathlib import Path

os.environ["DATABASE_URL"] = "sqlite:////tmp/tumaibiji_pytest_contract.db"
os.environ["JWT_SECRET_KEY"] = "pytest-only-secret-not-a-real-one"
os.environ["EXTRACT_PROVIDER"] = "none"

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

_spec = importlib.util.spec_from_file_location("api_contract", BACKEND / "scripts" / "api_contract.py")
api_contract = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(api_contract)

from app.main import app  # noqa: E402

BASELINE_FILE = BACKEND / "contract" / "1x-response-fields.json"


def _current():
    return api_contract.collect(app)


def test_基线是从一版真实代码抄的():
    raw = json.loads(BASELINE_FILE.read_text(encoding="utf-8"))
    meta = raw.get("_meta") or {}
    assert meta.get("source_commit"), "快照里没有基线 commit，下一次没人知道对的是哪一版"
    assert meta.get("routes"), "快照里没有条数"
    routes = {k: v for k, v in raw.items() if not k.startswith("_")}
    assert len(routes) >= 30, f"基线只有 {len(routes)} 条路由，不像一份完整的 1.x 接口表"
    # 基线里不该已经带 2.0 才有的东西——带了就说明抄错了分支，这条守卫会从今往后一直绿。
    assert not any("/assets" in k for k in routes), "基线里出现了 2.0 的配图路由，说明抄的是 2.0 分支"
    print(f"基线 commit={meta['source_commit']} 路由={len(routes)} 条")


def test_老包打的每一条路由还在且字段没改没少():
    bad = api_contract.diff(api_contract.load_baseline(), _current())
    assert not bad, "接口破坏了老包读得到的东西：\n  " + "\n  ".join(bad)


def test_守卫自己抓得住三种破坏():
    """反向自证。一条永远绿的守卫比没有守卫更糟——它让人以为有人看着。

    三种破坏都在内存里造，不改快照文件（改文件的反向验证要用 worktree 或 stash，
    这个仓库里有过"验证串上破坏性 git 丢了一轮改动"的先例，不重来）。
    """
    baseline = api_contract.load_baseline()
    key = "GET /api/notes/{note_id}"
    assert key in baseline and baseline[key].get("response"), "基线里这一条没字段可破坏，样本选错了"

    lost_field = json.loads(json.dumps(_current()))
    lost_field[key]["response"].pop("title")
    assert any("响应字段没了" in m and "title" in m for m in api_contract.diff(baseline, lost_field)), \
        "把老包在读的字段删掉，守卫没响"

    renamed = json.loads(json.dumps(_current()))
    renamed[key]["response"]["title"] = "integer"
    assert any("换了类型" in m for m in api_contract.diff(baseline, renamed)), \
        "字段换了类型，守卫没响"

    route_gone = json.loads(json.dumps(_current()))
    route_gone.pop(key)
    assert any("路由没了" in m for m in api_contract.diff(baseline, route_gone)), \
        "整条路由删掉，守卫没响"

    extra_required = json.loads(json.dumps(_current()))
    sample = next(k for k, v in baseline.items() if v.get("request"))
    extra_required[sample]["request_required"] = sorted(
        set(extra_required[sample].get("request_required") or []) | {"a_brand_new_must_have"}
    )
    assert any("请求新加必填" in m for m in api_contract.diff(baseline, extra_required)), \
        "给老接口新加一个必填字段，守卫没响（老包不会发它，线上是整片 422）"


def test_配图那三条与公开页那一列已经进契约():
    """2.0 新增的这几列，从此也归这份快照管——以后谁改名要有人报警。"""
    cur = _current()
    for route in ("POST /api/notes/{note_id}/assets", "GET /api/notes/{note_id}/assets",
                  "GET /api/user/storage-quota"):
        assert route in cur, f"{route} 不在接口表里"
    assert cur["GET /api/notes/{note_id}/assets"]["response"].get("[].cloud_url") == "string"
    assert cur["GET /api/shares/{token}"]["response"].get("assets.[].cloud_url") == "string", \
        "分享带图那一列没进快照"
    assert cur["DELETE /api/notes/{note_id}"]["response"].get("file_ids") == "array<string>", \
        "删笔记回体里的 file_ids 没进快照（裸 dict 的回体不受保护，所以要给它 response_model）"
    assert cur["POST /api/user/deactivate"]["response"].get("file_ids") == "array<string>"
    assert cur["GET /api/user/storage-quota"]["response"].get("used_ratio") == "number"


def test_比值那一列不能改成按人算():
    """和 test_note_assets 那条重复一遍：这条口径漂了，界面上那句"快满了"就永远不响。"""
    cur = _current()
    q = cur["GET /api/user/storage-quota"]["response"]
    assert {"user_bytes", "total_bytes", "used_ratio"} <= set(q), "配额回体少列了"
