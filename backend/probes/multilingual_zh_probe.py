"""现网探针：「原文翻译」开那一档，多种语言真的能整理成中文吗（2026-10-14 站长一句「世界主流多国语言帮我跑一下」）。

测的是 `/api/ingest/text` 带 `translate: true` 那一条——**这是全产品唯一一处"转成中文"的显式开关**
（`ingest.py:60` 的 `translate` 只挂在 `/text` 上；`/url` 与截图两条调 `extract_knowledge` 时不传这个参数，
走 `llm.py` 里 `None` 那一档，行为一字不变）。所以这一支证的不是"模型会几种语言"，
而是**我们这一行提示词 `_LANG_ZH` 到底兑现到什么程度**。

用法（服务器上跑，**必须先 cd 到项目目录**：家目录那份 .env 是另一个项目的）：

    cd /home/ubuntu/wtsj-backend && .venv/bin/python probes/multilingual_zh_probe.py

只用 deploy-test（users.id=1）这一个账号，建的笔记全部按 id 删净并回读断言笔记数回到起点。
送检次数：18 趟提交 × (标题+原文) ≈ 36 次 msgSecCheck，当天额度 100 次。

**语料设计**：同一段事实（杭州城市书房），16 种语言各写一份等义文本，里面埋四个可核的数
—— **2019 / 24 / 87 / 36000**。判"翻译对了"不看它写得顺不顺，看**那四个数在中文摘要里还在不在**：
数丢了就是没读懂，数在但输出不是中文就是没照指令办。两种失败分得开。

每语两问：① 输出是不是中文（CJK 占比 ≥0.6，且源文字脚本零残留）；② 四个事实点命中几个。
外加两趟**对照组**（英、俄各一趟 `translate: false`），钉的是"关掉开关就该跟着原文语言走"。
"""
import os
import sys
import time
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import httpx

from app.core.auth import _create_token
from app.db.database import SessionLocal
from app.models.note import Note
from app.models.user import User

BASE = "https://api.agentsbin.cn/wtsj"
MARK = uuid.uuid4().hex[:6]

# 源文字脚本表：输出里出现任何一个，就说明"没整理成中文"。
# 中文那一族（含 Ext A）不列在这里——它是允许的，算进"残留"会把正常中文摘要判红。
FOREIGN = {
    "Latin": r"[A-Za-zÀ-ɏ]",
    "Cyrillic": r"[Ѐ-ӿ]",
    "Greek": r"[Ͱ-Ͽ]",
    "HiraganaKatakana": r"[ぁ-ヿ]",
    "Hangul": r"[가-힯]",
    "Arabic": r"[؀-ۿ]",
    "Devanagari": r"[ऀ-ॿ]",
    "Thai": r"[฀-๿]",
}
import re

CJK = re.compile(r"[㐀-䶿一-鿿]")
SCRIPTS = {k: re.compile(v) for k, v in FOREIGN.items()}

# 「36000」这一项**不能拿子串 "36" 去查**——摘要里写的是「3.6万」，"36" 对不上，
# 16 语会齐刷刷判成 3/4，那是尺子的假红不是模型的丢信息。每一种写法各给一条。
FACTS = {
    "2019": (r"2019",),
    "24小时": (r"24",),
    "87间": (r"87",),
    "3.6万": (r"3\.6\s*万", r"36[,.]?000", r"3万6", r"36\s*千", r"36\s*thousand", r"36\s*mil"),
}

CORPUS = [
    ("en", "英语", "The Hangzhou Public Library opened its first 24-hour city reading room in 2019, and readers can reserve a seat with their phones. By the end of 2025 the city had 87 such rooms, serving an average of 36,000 visits a month. Staff say the biggest change has not been the equipment but the fact that many people now treat it as a second study after work."),
    ("ja", "日语", "杭州図書館は2019年に最初の24時間開いている都市書房を開室し、利用者はスマートフォンで座席を予約できる。2025年末までに市内にはこうした書房が87室あり、月平均で3.6万人が訪れている。担当者は「いちばん変わったのは設備ではなく、退勤後にここを第二の書斎として使う人が増えたことだ」と話す。"),
    ("ko", "韩语", "항저우 시립 도서관은 2019년 처음으로 24시간 개방하는 도시 서재를 열었고, 이용자는 휴대전화로 좌석을 예약할 수 있다. 2025년 말까지 시내에는 이런 서재가 87곳 생겼으며 한 달 평균 3만 6천 명이 찾는다. 담당자는 가장 큰 변화는 시설이 아니라 퇴근 뒤 이곳을 두 번째 서재로 삼는 사람이 늘었다는 점이라고 말했다."),
    ("fr", "法语", "La bibliothèque municipale de Hangzhou a ouvert en 2019 sa première salle de lecture urbaine ouverte 24 heures sur 24 ; les lecteurs peuvent réserver une place depuis leur téléphone. Fin 2025, la ville comptait 87 salles de ce type, pour une moyenne de 36 000 visites par mois. Le personnel explique que le plus grand changement n'est pas le matériel, mais le nombre de gens qui y viennent après le travail comme dans un second cabinet de lecture."),
    ("de", "德语", "Die Stadtbibliothek Hangzhou eröffnete 2019 ihr erstes 24-Stunden-Lesezimmer; Leser können einen Platz per Smartphone reservieren. Bis Ende 2025 gab es in der Stadt 87 solche Räume, mit durchschnittlich 36.000 Besuchen pro Monat. Die Mitarbeiter sagen, die größte Veränderung sei nicht die Ausstattung, sondern dass viele Menschen den Raum nach der Arbeit wie ein zweites Lesezimmer nutzten."),
    ("es", "西班牙语", "La Biblioteca Pública de Hangzhou abrió en 2019 su primera sala de lectura urbana de 24 horas, y los lectores pueden reservar asiento desde el móvil. A finales de 2025 la ciudad ya contaba con 87 salas de este tipo, con una media de 36.000 visitas al mes. El personal señala que el mayor cambio no ha sido el equipamiento, sino que muchas personas la usan como un segundo estudio después del trabajo."),
    ("ru", "俄语", "Библиотека Ханчжоу в 2019 году открыла первый круглосуточный городской читальный зал, где читатели могут забронировать место с телефона. К концу 2025 года в городе работало уже 87 таких залов, в среднем их посещали 36 тысяч человек в месяц. Сотрудники говорят, что самые большие перемены не в оборудовании, а в том, что многие приходят сюда после работы, как во второй кабинет."),
    ("ar", "阿拉伯语", "افتتحت مكتبة هانغتشو العامة في عام ٢٠٩ أول قاعة قراءة حضرية تعمل على مدار ٢٤ ساعة، ويستطيع القرّاء حجز مقعد عبر الهاتف. وبحلول نهاية عام ٢٠٢٥ كان في المدينة ٨٧ قاعة من هذا النوع، تستقبل في المتوسط ٣٦ ألف زائر شهرياً. ويقول الموظفون إن أكبر تغيير ليس في التجهيزات، بل في أن كثيرين صاروا يأتون إليها بعد العمل كأنها مكتبهم الثاني."),
    ("pt", "葡萄牙语", "A Biblioteca Pública de Hangzhou abriu em 2019 a sua primeira sala de leitura urbana aberta 24 horas, e os leitores podem reservar lugar pelo telemóvel. No final de 2025 a cidade já tinha 87 salas desse tipo, com uma média de 36 mil visitas por mês. Os funcionários dizem que a maior mudança não foi o equipamento, mas o facto de muitas pessoas a usarem como um segundo escritório depois do trabalho."),
    ("it", "意大利语", "La biblioteca pubblica di Hangzhou ha aperto nel 2019 la sua prima sala di lettura urbana aperta 24 ore su 24; i lettori possono prenotare un posto dal telefono. A fine 2025 la città contava 87 sale di questo tipo, con una media di 36 mila visite al mese. Il personale racconta che il cambiamento più grande non è stato nelle attrezzature, ma nel fatto che in molti ormai la usano come secondo studio dopo il lavoro."),
    ("th", "泰语", "ห้องสมุดหางโจวเปิดห้องอ่านหนังสือเมืองที่เปิดตลอด 24 ชั่วโมงแห่งแรกเมื่อปี 2019 ผู้อ่านจองที่นั่งผ่านโทรศัพท์ได้ จนถึงสิ้นปี 2025 ทั้งเมืองมีห้องแบบนี้ 87 ห้อง รองรับผู้เข้าใช้เฉลี่ย 36,000 คนต่อเดือน เจ้าหน้าที่บอกว่าสิ่งที่เปลี่ยนมากที่สุดไม่ใช่เครื่องอำนวยความสะดวก แต่คือคนจำนวนมากมาใช้ที่นี่เป็นห้องอ่านหนังสือที่สองหลังเลิกงาน"),
    ("vi", "越南语", "Thư viện Hàng Châu mở phòng đọc đô thị hoạt động 24 giờ đầu tiên vào năm 2019, bạn đọc có thể đặt chỗ bằng điện thoại. Đến cuối năm 2025, toàn thành phố đã có 87 phòng như vậy, trung bình phục vụ 36.000 lượt mỗi tháng. Cán bộ thư viện nói thay đổi lớn nhất không nằm ở cơ sở vật chất, mà là nhiều người coi đây như phòng đọc thứ hai sau giờ làm."),
    ("hi", "印地语", "हाँग्ज़ू की नगर पुस्तकालय ने 2019 में पहला 24 घंटे खुलने वाला सिटी रीडिंग रूम खोला, जहाँ पाठक फ़ोन से सीट बुक कर सकते हैं। 2025 के अंत तक शहर में ऐसे 87 कक्ष हो गए थे, जहाँ मासिक औसतन 36,000 लोग आते हैं। कर्मचारियों के अनुसार सबसे बड़ा बदलाव उपकरणों में नहीं, बल्कि यह है कि कई लोग काम के बाद इसे दूसरे पढ़ने के कमरे की तरह इस्तेमाल करते हैं।"),
    ("id", "印尼语", "Perpustakaan Hangzhou membuka ruang baca kota 24 jam pertamanya pada 2019, dan pembaca dapat memesan kursi lewat ponsel. Sampai akhir 2025 kota ini punya 87 ruang seperti itu, dengan rata-rata 36.000 kunjungan per bulan. Petugas mengatakan perubahan terbesar bukan pada fasilitasnya, melainkan banyaknya orang yang menjadikannya ruang baca kedua setelah jam kerja."),
    ("tr", "土耳其语", "Hangzhou Halk Kütüphanesi 2019'da gün boyu 24 saat açık ilk şehir okuma odasını açtı; okurlar telefonla yer ayırtabiliyor. 2025 sonuna kadar şehirde bu tür 87 oda oldu ve aylık ortalama 36.000 ziyaretçi ağırladı. Görevliler en büyük değişimin donanımda değil, birçok kişinin burayı işten sonra ikinci bir okuma odası gibi kullanmasında olduğunu söylüyor."),
    ("nl", "荷兰语", "De openbare bibliotheek van Hangzhou opende in 2019 de eerste 24-uurs stadsleeskamer; lezers kunnen via hun telefoon een plek reserveren. Eind 2025 telde de stad 87 zulke kamers, met gemiddeld 36.000 bezoeken per maand. Medewerkers zeggen dat de grootste verandering niet in de faciliteiten zit, maar dat veel mensen hier na het werk komen alsof het een tweede werkkamer is."),
]

# 对照组：这两语再各跑一趟 translate=false，钉"关掉就该跟着原文语言走"
CONTROL = [("en", "英语"), ("ru", "俄语")]


def cjk_ratio(text):
    chars = [c for c in text if not c.isspace()]
    if not chars:
        return 0.0
    return len(CJK.findall(text)) / len(chars)


def foreign_scripts(text):
    """输出里残留的源文字脚本（中文与数字标点不算）。"""
    hit = [name for name, rx in SCRIPTS.items()
           if name != "Han" and rx.search(text)]
    return hit


def fact_hits(text):
    return [name for name, pats in FACTS.items() if any(re.search(x, text) for x in pats)]


def submit(client, hdr, title, content, translate):
    r = client.post("/api/ingest/text",
                    json={"title": title, "content": content, "translate": translate},
                    headers=hdr)
    j = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    return j.get("task_id"), r.status_code, j


def wait(client, hdr, task_id, rounds=25, pause=3):
    for _ in range(rounds):
        time.sleep(pause)
        t = client.get(f"/api/tasks/{task_id}", headers=hdr)
        task = t.json() if t.status_code == 200 else {}
        if task.get("status") in ("completed", "failed"):
            return task
    return {"status": "timeout"}


def main():
    db = SessionLocal()
    user = db.query(User).filter(User.openid == "deploy-test").first()
    if not user:
        print("✗ 找不到 deploy-test 账号，探针不做任何写操作")
        return 1
    hdr = {"Authorization": "Bearer " + _create_token(user.id, user.generation)}
    client = httpx.Client(base_url=BASE, timeout=40)
    before = db.query(Note).filter(Note.user_id == str(user.id)).count()
    print(f"起点：deploy-test id={user.id} 名下 {before} 篇 · 署名 {MARK}\n")

    made = []
    rows = []
    try:
        # PROBE_LANGS=en,ar,th 只跑子集，用来复尺（改判据之后不必重跑全 16 语）
        only = os.environ.get("PROBE_LANGS")
        corpus = [c for c in CORPUS if not only or c[0] in only.split(",")]
        for code, cname, text in corpus:
            title = f"多语探针{MARK}-{code}"
            tid, sc, j = submit(client, hdr, title, text, True)
            task = wait(client, hdr, tid) if tid else {"status": "no-task"}
            nid = (task.get("result") or {}).get("note_id")
            if nid:
                made.append(nid)
            d = client.get(f"/api/notes/{nid}", headers=hdr).json() if nid else {}
            summary = (d.get("summary") or "").strip()
            pts = " / ".join((d.get("key_points") or [])[:2])
            rows.append({
                "lang": f"{cname}({code})", "mode": "译中",
                "status": task.get("status"),
                "degraded": (task.get("result") or {}).get("degraded"),
                "zh": round(cjk_ratio(summary), 2),
                "foreign": foreign_scripts(summary),
                "facts": fact_hits(summary),
                "summary": summary[:46],
                "points": pts[:30],
            })
            print(f"  {cname:<5} 状态={task.get('status')} degraded={rows[-1]['degraded']} "
                  f"中文占比={rows[-1]['zh']} 事实={len(rows[-1]['facts'])}/4 "
                  f"残留={rows[-1]['foreign'] or '无'}")

        for code, cname in [c for c in CONTROL if not only or c[0] in only.split(',')]:
            text = dict((c, t) for c, _, t in CORPUS)[code]
            title = f"多语探针{MARK}-{code}-off"
            tid, sc, j = submit(client, hdr, title, text, False)
            task = wait(client, hdr, tid) if tid else {"status": "no-task"}
            nid = (task.get("result") or {}).get("note_id")
            if nid:
                made.append(nid)
            d = client.get(f"/api/notes/{nid}", headers=hdr).json() if nid else {}
            summary = (d.get("summary") or "").strip()
            rows.append({
                "lang": f"{cname}({code})", "mode": "关开关",
                "status": task.get("status"),
                "degraded": (task.get("result") or {}).get("degraded"),
                "zh": round(cjk_ratio(summary), 2),
                "foreign": foreign_scripts(summary),
                "facts": fact_hits(summary),
                "summary": summary[:46], "points": "",
            })
            print(f"  {cname:<5}〔对照〕中文占比={rows[-1]['zh']} "
                  f"主脚本={[s for s in rows[-1]['foreign']] or '无'}")

        # ---------- 判读 ----------
        print("\n" + "=" * 76)
        ok = [r for r in rows if r["mode"] == "译中"]
        good = [r for r in ok if r["status"] == "completed" and r["degraded"] is False
                and r["zh"] >= 0.6 and not r["foreign"] and len(r["facts"]) == len(FACTS)]
        print(f"译中这一档：{len(good)}/{len(ok)} 语全过（completed + 非降级 + 中文占比≥0.6 "
              f"+ 源文字零残留 + 四个事实点全中）")
        for r in ok:
            tag = "✓" if r in good else "✗"
            why = ""
            if r not in good:
                bad = []
                if r["status"] != "completed":
                    bad.append(f"状态={r['status']}")
                if r["degraded"] is not False:
                    bad.append(f"degraded={r['degraded']}")
                if r["zh"] < 0.6:
                    bad.append(f"中文占比={r['zh']}")
                if r["foreign"]:
                    bad.append("残留" + "/".join(r["foreign"]))
                if len(r["facts"]) < len(FACTS):
                    bad.append(f"事实{len(r['facts'])}/4缺{'、'.join(set(FACTS)-set(r['facts']))}")
                why = " ← " + "；".join(bad)
            print(f"  {tag} {r['lang']:<12} 事实{len(r['facts'])}/4  {r['summary']}{why}")
        ctrl = [r for r in rows if r["mode"] == "关开关"]
        print(f"\n对照组（开关关掉，该跟着原文语言走）：")
        for r in ctrl:
            print(f"  {r['lang']:<12} 中文占比={r['zh']} 源文字残留={r['foreign'] or '无'} "
                  f"{r['summary'][:34]}")

        # ---------- 收尾 ----------
        for nid in made:
            client.delete(f"/api/notes/{nid}", headers=hdr)
        db.expire_all()
        after = db.query(Note).filter(Note.user_id == str(user.id)).count()
        print(f"\n收尾：删掉 {len(made)} 篇，笔记数 {before} → {after} "
              f"{'✓ 回到起点' if after == before else '✗ 没回到起点，要手工查'}")
        lst = client.get("/api/notes/", params={"search": MARK}, headers=hdr).json()
        print(f"回读：列表里搜署名 {MARK} 命中 {len(lst)} 行 "
              f"{'✓' if len(lst) == 0 else '✗ 还留着'}")
        return 0 if (after == before and len(good) == len(ok)) else 1
    finally:
        for nid in made:
            client.delete(f"/api/notes/{nid}", headers=hdr)
        db.close()


if __name__ == "__main__":
    sys.exit(main())
