#!/usr/bin/env python3
"""
SQLiteデータベースからメタデータをJSON形式に変換するスクリプト
"""
import sqlite3
import json
from pathlib import Path

def export_metadata_to_json():
    """メタデータをJSONファイルにエクスポート"""
    
    db_path = Path(__file__).parent.parent / "data" / "hanrei.db"
    output_path = Path(__file__).parent / "data" / "metadata.json"
    
    # 出力ディレクトリを作成
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # メタデータを取得
    cursor.execute("""
        SELECT 
            id,
            jiken_shubetsu,
            kenri_shubetsu,
            jiken_shurui,
            hatsumei_meisho,
            jiken_bango,
            bumei,
            saiban_nengappi,
            hanketsu_kekka,
            genkoku,
            hikoku,
            soten,
            zenbun_url
        FROM hanrei_metadata
        ORDER BY saiban_nengappi DESC
    """)
    
    rows = cursor.fetchall()
    
    # データを整形
    data = []
    for row in rows:
        record = {
            "id": row["id"],
            "jiken_shubetsu": row["jiken_shubetsu"] or "",
            "kenri_shubetsu": row["kenri_shubetsu"] or "",
            "jiken_shurui": row["jiken_shurui"] or "",
            "hatsumei_meisho": row["hatsumei_meisho"] or "",
            "jiken_bango": row["jiken_bango"] or "",
            "bumei": row["bumei"] or "",
            "saiban_nengappi": row["saiban_nengappi"] or "",
            "hanketsu_kekka": row["hanketsu_kekka"] or "",
            "genkoku": row["genkoku"] or "",
            "hikoku": row["hikoku"] or "",
            "soten": row["soten"] or "",
            "pdf_url": row["zenbun_url"] or ""
        }
        data.append(record)
    
    conn.close()
    
    # JSONファイルに保存
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"✅ エクスポート完了: {len(data)}件のレコード")
    print(f"📁 出力先: {output_path}")

if __name__ == "__main__":
    export_metadata_to_json()
