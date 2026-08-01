#!/usr/bin/env python3
"""抓取具身智能相关的论文/博客/社区讨论，合并写入 ../data/events.json。"""

import hashlib
import json
import os
import re
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup

import sources

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "site" / "data" / "events.json"
HEALTH_PATH = ROOT / "site" / "data" / "health.json"
TIMEOUT = 20
HEADERS = {"User-Agent": "embodied-ai-chronicle/0.1 (personal news aggregator)"}
SITE_URL = "https://roboherald.github.io/embodied-ai-chronicle/"
FEISHU_DIGEST_LIMIT = 20

ATOM_NS = {"atom": "http://www.w3.org/2005/Atom"}


def make_id(url):
    return hashlib.sha1(url.encode("utf-8")).hexdigest()[:16]


def clean_text(html, limit=280):
    text = BeautifulSoup(html or "", "html.parser").get_text(" ", strip=True)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > limit:
        text = text[: limit - 1].rstrip() + "…"
    return text


def to_date(dt_str, fmts):
    for fmt in fmts:
        try:
            dt = datetime.strptime(dt_str, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc).date().isoformat()
        except ValueError:
            continue
    return None


def fetch_arxiv():
    print("[arxiv] fetching...", file=sys.stderr)
    params = {
        "search_query": sources.ARXIV_QUERY,
        "sortBy": "submittedDate",
        "sortOrder": "descending",
        "max_results": sources.ARXIV_MAX_RESULTS,
    }
    resp = requests.get(
        "http://export.arxiv.org/api/query", params=params, headers=HEADERS, timeout=TIMEOUT
    )
    resp.raise_for_status()
    root = ET.fromstring(resp.content)
    events = []
    for entry in root.findall("atom:entry", ATOM_NS):
        title = entry.findtext("atom:title", default="", namespaces=ATOM_NS)
        summary = entry.findtext("atom:summary", default="", namespaces=ATOM_NS)
        published = entry.findtext("atom:published", default="", namespaces=ATOM_NS)
        url = ""
        for link in entry.findall("atom:link", ATOM_NS):
            if link.get("rel") == "alternate" or url == "":
                url = link.get("href", "")
        date = to_date(published, ["%Y-%m-%dT%H:%M:%SZ"])
        if not url or not date:
            continue
        events.append(
            {
                "id": make_id(url),
                "title": clean_text(title, 200),
                "url": url,
                "source": "arXiv",
                "date": date,
                "summary": clean_text(summary),
            }
        )
    print(f"[arxiv] got {len(events)} entries", file=sys.stderr)
    return events


def matches_keywords(*texts):
    joined = " ".join(texts).lower()
    return any(kw in joined for kw in sources.KEYWORDS)


def matches_keywords_zh(title):
    """中文源只用标题匹配：这些站的 description 是全文正文，用它会大量误判。"""
    low = title.lower()
    return any(kw in low for kw in sources.KEYWORDS_ZH)


def tag_entities(*texts):
    joined = " ".join(texts).lower()
    return sorted(
        name
        for name, aliases in sources.ENTITIES.items()
        if any(alias in joined for alias in aliases)
    )


def tag_topics(*texts):
    joined = " ".join(texts).lower()
    return sorted(
        name
        for name, aliases in sources.TOPICS.items()
        if any(alias in joined for alias in aliases)
    )


def tag_kinds(*texts):
    joined = " ".join(texts).lower()
    return sorted(
        name
        for name, aliases in sources.KINDS.items()
        if any(alias in joined for alias in aliases)
    )


DATE_FORMATS = [
    "%a, %d %b %Y %H:%M:%S %z",
    "%a, %d %b %Y %H:%M:%S %Z",
    # 36氪等国内源用这种格式，注意时间和时区之间是两个空格；
    # 解析失败会让条目被静默丢弃，所以两种空格数都列上。
    "%Y-%m-%d %H:%M:%S  %z",
    "%Y-%m-%d %H:%M:%S %z",
]


def fetch_rss(feed):
    print(f"[rss] fetching {feed['name']}...", file=sys.stderr)
    url = feed["url"]
    if feed.get("cache_bust"):
        # 该站曾被观察到对同一 URL 返回陈旧缓存副本，加个变化参数绕开
        sep = "&" if "?" in url else "?"
        url = f"{url}{sep}_={datetime.now(timezone.utc).strftime('%Y%m%d%H%M')}"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
        resp.raise_for_status()
        root = ET.fromstring(resp.content)
    except Exception as exc:  # noqa: BLE001 - one bad feed shouldn't kill the run
        print(f"[rss] {feed['name']} failed: {exc}", file=sys.stderr)
        return []

    events = []
    skipped_date = 0
    for item in root.findall(".//item"):
        title = item.findtext("title", default="")
        url_item = item.findtext("link", default="")
        pub_date = item.findtext("pubDate", default="")
        description = item.findtext("description", default="")
        if not url_item:
            continue
        if feed.get("filter") and not matches_keywords(title, description):
            continue
        if feed.get("filter_zh") and not matches_keywords_zh(title):
            continue
        date = to_date(pub_date, DATE_FORMATS)
        if not date:
            skipped_date += 1
            continue
        events.append(
            {
                "id": make_id(url_item),
                "title": clean_text(title, 200),
                "url": url_item,
                "source": feed["name"],
                "date": date,
                "summary": clean_text(description),
            }
        )
    if skipped_date:
        # 静默丢弃过是个真实事故（36氪日期格式没被识别），出现就报出来
        print(
            f"[rss] {feed['name']}: WARNING {skipped_date} 条因日期无法解析被丢弃",
            file=sys.stderr,
        )
    print(f"[rss] {feed['name']}: {len(events)} matched", file=sys.stderr)
    return events


def fetch_hn():
    print("[hn] fetching...", file=sys.stderr)
    events = []
    for query in sources.HN_QUERIES:
        try:
            resp = requests.get(
                "https://hn.algolia.com/api/v1/search_by_date",
                params={"tags": "story", "query": query, "hitsPerPage": sources.HN_MAX_PER_QUERY},
                headers=HEADERS,
                timeout=TIMEOUT,
            )
            resp.raise_for_status()
            hits = resp.json().get("hits", [])
        except Exception as exc:  # noqa: BLE001
            print(f"[hn] query '{query}' failed: {exc}", file=sys.stderr)
            continue
        for hit in hits:
            title = hit.get("title", "")
            # Algolia 的模糊匹配会把 "embodied" 错配成 "embedded" 之类，标题里必须真的出现关键词
            if not matches_keywords(title):
                continue
            # 实测 47 条 HN 里 26 条只有 ≤2 分——没人看过的贴，纯噪声，稀释信息流
            points = hit.get("points") or 0
            if points < sources.HN_MIN_POINTS:
                continue
            url = hit.get("url") or f"https://news.ycombinator.com/item?id={hit['objectID']}"
            date = to_date(hit.get("created_at", ""), ["%Y-%m-%dT%H:%M:%SZ"])
            if not date:
                continue
            comments = hit.get("num_comments") or 0
            events.append(
                {
                    "id": make_id(url),
                    "title": clean_text(hit.get("title", ""), 200),
                    "url": url,
                    "source": "Hacker News",
                    "date": date,
                    # 原来 summary 是 "N points, <链接>"，对读者零信息量。
                    # 改成结构化字段，前端渲染成徽标，摘要留空而不是塞垃圾。
                    "summary": "",
                    "hn": {
                        "points": points,
                        "comments": comments,
                        "discussion": f"https://news.ycombinator.com/item?id={hit['objectID']}",
                    },
                }
            )
    print(f"[hn] got {len(events)} entries", file=sys.stderr)
    return events


def load_existing():
    if DATA_PATH.exists():
        return json.loads(DATA_PATH.read_text(encoding="utf-8"))
    return []


def notify_feishu(new_items):
    webhook = os.environ.get("FEISHU_WEBHOOK_URL")
    if not webhook or not new_items:
        return
    lines = [f"具身智能大事纪：新增 {len(new_items)} 条"]
    for e in new_items[:FEISHU_DIGEST_LIMIT]:
        lines.append(f"[{e['source']}] {e['title']}\n{e['url']}")
    if len(new_items) > FEISHU_DIGEST_LIMIT:
        lines.append(f"...等共 {len(new_items)} 条")
    lines.append(SITE_URL)
    text = "\n\n".join(lines)
    try:
        resp = requests.post(
            webhook,
            json={"msg_type": "text", "content": {"text": text}},
            timeout=TIMEOUT,
        )
        resp.raise_for_status()
        print("[feishu] notification sent", file=sys.stderr)
    except Exception as exc:  # noqa: BLE001 - 推送失败不应影响抓取流程
        print(f"[feishu] notify failed: {exc}", file=sys.stderr)


def main():
    # 抓取源静默失效过（The Robot Report 突然返回 403，站点默默少一个来源），
    # 所以记录每个源的产出并在最后汇总告警，而不是只往 stderr 打一行就算了。
    health = {}

    fresh = fetch_arxiv()
    health["arXiv"] = len(fresh)
    for feed in sources.RSS_FEEDS:
        got = fetch_rss(feed)
        health[feed["name"]] = len(got)
        fresh.extend(got)
    hn = fetch_hn()
    health["Hacker News"] = len(hn)
    fresh.extend(hn)

    dead = [name for name, n in health.items() if n == 0]
    if dead:
        print(
            f"[health] WARNING 本次 0 产出的来源: {', '.join(dead)}",
            file=sys.stderr,
        )

    existing = load_existing()
    by_id = {e["id"]: e for e in existing}
    added = 0
    new_items = []
    for e in fresh:
        if e["id"] not in by_id:
            added += 1
            new_items.append(e)
        by_id[e["id"]] = e  # 新抓的数据覆盖旧的，其余字段不变

    cutoff = (datetime.now(timezone.utc).date() - timedelta(days=sources.MAX_AGE_DAYS)).isoformat()
    merged = [e for e in by_id.values() if e["date"] >= cutoff]
    for e in merged:
        e["tags"] = tag_entities(e["title"], e["summary"])
        e["topics"] = tag_topics(e["title"], e["summary"])
        e["kinds"] = tag_kinds(e["title"], e["summary"])
    merged.sort(key=lambda e: (e["date"], e["source"]), reverse=True)

    # 把健康状况写成文件，前端可以展示「数据源状态」，让失效可见而不是悄悄消失
    HEALTH_PATH.write_text(
        json.dumps(
            {
                "updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "sources": health,
                "dead": dead,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    DATA_PATH.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        f"[done] {len(merged)} events total ({added} new), written to {DATA_PATH}",
        file=sys.stderr,
    )
    notify_feishu(new_items)


if __name__ == "__main__":
    main()
