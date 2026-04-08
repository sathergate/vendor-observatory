#!/usr/bin/env python3
"""BF6 Loadout Advisor -- real-time loadout recommendations from your match history."""

import argparse
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "bf6.db"


def get_db():
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    schema = (Path(__file__).parent / "schema.sql").read_text()
    db.executescript(schema)
    return db


def cmd_log(args):
    db = get_db()
    kd = args.kills / args.deaths if args.deaths > 0 else args.kills
    db.execute(
        """INSERT INTO matches (map, mode, class, weapon, attachments, kills, deaths, assists, accuracy, score, win, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (args.map, args.mode, args.cls, args.weapon, args.attachments,
         args.kills, args.deaths, args.assists, args.accuracy, args.score,
         1 if args.win else 0, args.notes),
    )
    db.commit()
    print(f"Logged: {args.map} / {args.mode} -- {args.cls} / {args.weapon} -- {args.kills}/{args.deaths} {'W' if args.win else 'L'}")
    print(f"  K/D: {kd:.2f}" + (f"  Acc: {args.accuracy}%" if args.accuracy else ""))


def cmd_recommend(args):
    db = get_db()
    params = [args.map]
    query = """
        SELECT class, weapon,
               COUNT(*) as matches,
               AVG(CASE WHEN deaths > 0 THEN CAST(kills AS REAL)/deaths ELSE kills END) as avg_kd,
               AVG(accuracy) as avg_acc,
               AVG(win) * 100 as winrate,
               SUM(kills) as total_kills
        FROM matches
        WHERE map = ?
    """
    if args.mode:
        query += " AND mode = ?"
        params.append(args.mode)

    query += """
        GROUP BY class, weapon
        HAVING matches >= ?
        ORDER BY (avg_kd * 0.4 + winrate * 0.01 + COALESCE(avg_acc, 0) * 0.005) DESC
        LIMIT 5
    """
    params.append(args.min_matches)

    rows = db.execute(query, params).fetchall()

    header = f"Top loadouts for {args.map}"
    if args.mode:
        header += f" ({args.mode})"
    print(f"\n{header}")
    print("=" * len(header))

    if not rows:
        print(f"Not enough data (need {args.min_matches}+ matches per loadout).")
        print("Log more matches with: bf6.py log ...")
        return

    for i, r in enumerate(rows, 1):
        bar = "\u2588" * int(r["avg_kd"] * 5)
        print(f"\n  #{i}  {r['class']} / {r['weapon']}")
        print(f"      K/D: {r['avg_kd']:.2f} {bar}  |  WR: {r['winrate']:.0f}%  |  Matches: {r['matches']}")
        if r["avg_acc"]:
            print(f"      Accuracy: {r['avg_acc']:.1f}%")


def cmd_stats(args):
    db = get_db()
    total = db.execute("SELECT COUNT(*) as n FROM matches").fetchone()["n"]
    if total == 0:
        print("No matches logged yet.")
        return

    print(f"\nOverall Stats ({total} matches)")
    print("=" * 30)

    row = db.execute("""
        SELECT AVG(CASE WHEN deaths > 0 THEN CAST(kills AS REAL)/deaths ELSE kills END) as avg_kd,
               AVG(accuracy) as avg_acc,
               AVG(win) * 100 as winrate,
               SUM(kills) as total_kills,
               SUM(deaths) as total_deaths
        FROM matches
    """).fetchone()
    print(f"  K/D: {row['avg_kd']:.2f}  |  WR: {row['winrate']:.0f}%  |  Kills: {row['total_kills']}")
    if row["avg_acc"]:
        print(f"  Accuracy: {row['avg_acc']:.1f}%")

    print("\nBy Class:")
    for r in db.execute("""
        SELECT class, COUNT(*) as n,
               AVG(CASE WHEN deaths > 0 THEN CAST(kills AS REAL)/deaths ELSE kills END) as avg_kd,
               AVG(win) * 100 as wr
        FROM matches GROUP BY class ORDER BY avg_kd DESC
    """):
        print(f"  {r['class']:10s}  K/D: {r['avg_kd']:.2f}  WR: {r['wr']:.0f}%  ({r['n']} matches)")

    print("\nBest Maps:")
    for r in db.execute("""
        SELECT map, COUNT(*) as n,
               AVG(CASE WHEN deaths > 0 THEN CAST(kills AS REAL)/deaths ELSE kills END) as avg_kd,
               AVG(win) * 100 as wr
        FROM matches GROUP BY map ORDER BY avg_kd DESC LIMIT 5
    """):
        print(f"  {r['map']:18s}  K/D: {r['avg_kd']:.2f}  WR: {r['wr']:.0f}%  ({r['n']} matches)")


def cmd_history(args):
    db = get_db()
    rows = db.execute(
        "SELECT * FROM matches ORDER BY date DESC LIMIT ?", (args.limit,)
    ).fetchall()
    if not rows:
        print("No matches logged yet.")
        return
    print(f"\nLast {len(rows)} matches:")
    print(f"  {'Date':19s}  {'Map':18s}  {'Class':10s}  {'Weapon':12s}  {'K/D':>5s}  {'W/L':>3s}")
    print("  " + "-" * 75)
    for r in rows:
        kd = r["kills"] / r["deaths"] if r["deaths"] > 0 else r["kills"]
        wl = "W" if r["win"] else "L"
        print(f"  {r['date']:19s}  {r['map']:18s}  {r['class']:10s}  {r['weapon']:12s}  {kd:5.2f}  {wl:>3s}")


def main():
    parser = argparse.ArgumentParser(description="BF6 Loadout Advisor")
    sub = parser.add_subparsers(dest="command", required=True)

    # log
    p_log = sub.add_parser("log", help="Log a match result")
    p_log.add_argument("--map", required=True, help="Map name")
    p_log.add_argument("--mode", default="Conquest", help="Game mode (default: Conquest)")
    p_log.add_argument("--cls", required=True, help="Class (Assault/Engineer/Support/Recon)")
    p_log.add_argument("--weapon", required=True, help="Primary weapon")
    p_log.add_argument("--attachments", default=None, help="Attachments (freeform text)")
    p_log.add_argument("--kills", type=int, required=True)
    p_log.add_argument("--deaths", type=int, required=True)
    p_log.add_argument("--assists", type=int, default=0)
    p_log.add_argument("--accuracy", type=float, default=None, help="Accuracy %%")
    p_log.add_argument("--score", type=int, default=None)
    p_log.add_argument("--win", action="store_true")
    p_log.add_argument("--notes", default=None)
    p_log.set_defaults(func=cmd_log)

    # recommend
    p_rec = sub.add_parser("recommend", aliases=["rec"], help="Get loadout recommendations for a map")
    p_rec.add_argument("map", help="Map name")
    p_rec.add_argument("--mode", default=None, help="Filter by mode")
    p_rec.add_argument("--min-matches", type=int, default=2, help="Min matches for confidence (default: 2)")
    p_rec.set_defaults(func=cmd_recommend)

    # stats
    p_stats = sub.add_parser("stats", help="Show overall stats")
    p_stats.set_defaults(func=cmd_stats)

    # history
    p_hist = sub.add_parser("history", help="Show recent matches")
    p_hist.add_argument("--limit", type=int, default=20)
    p_hist.set_defaults(func=cmd_history)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
