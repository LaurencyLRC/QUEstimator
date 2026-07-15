import json
import time
import httpx
import os

# 1. Setup the storage directory
SAVE_DIR = "6Kleaderboards"
os.makedirs(SAVE_DIR, exist_ok=True)

# 2. Load the enriched data containing the SHA-512 hashes
try:
    with open('UEtable_enriched.json', 'r', encoding='utf-8') as f:
        ue_table = json.load(f)
except FileNotFoundError:
    print("Error: 'UEtable_enriched.json' not found. Please run the hash translation script first.")
    exit(1)

total_charts = len(ue_table)
print(f"Loaded {total_charts} charts. Starting Qwilight IR download...")

# 3. Use httpx.Client for connection pooling (faster and more stable)
# We use a custom User-Agent to politely identify the scraper
headers = {"User-Agent": "QUEstimator Data Pipeline / 1.0"}

with httpx.Client(timeout=15.0, headers=headers) as client:
    for index, chart in enumerate(ue_table, start=1):
        sha512 = chart.get('sha512')
        title = chart.get('title', 'Unknown Title')
        
        # Skip if no sha512 was mapped
        if not sha512:
            print(f"[{index}/{total_charts}] ⚠️ SKIPPED (No SHA-512): {title}")
            continue
            
        save_path = os.path.join(SAVE_DIR, f"{sha512}.json")
        
        # 4. Resumability: Skip if we already downloaded this chart's leaderboard
        if os.path.exists(save_path):
            print(f"[{index}/{total_charts}] ⏭️ ALREADY EXISTS: {title[:30]}")
            continue
            
        # 5. Fetch the data (Note the obligatory ':0' at the end)
        url = f"https://taehui.net/qwilight/www/comment?noteID={sha512}:0"
        
        try:
            response = client.get(url)
            
            if response.status_code == 200:
                data = response.json()
                
                # 6. Save the raw JSON data securely
                with open(save_path, 'w', encoding='utf-8') as out_f:
                    json.dump(data, out_f, indent=4, ensure_ascii=False)
                
                print(f"[{index}/{total_charts}] ✅ SUCCESS: {title[:30]}")
            else:
                print(f"[{index}/{total_charts}] ❌ HTTP {response.status_code}: {title[:30]}")
                
        except Exception as e:
            print(f"[{index}/{total_charts}] 🚨 ERROR fetching {title[:30]}: {e}")
            

print("\nDownload sequence complete! Leaderboards saved in the 'qwilight_leaderboards' directory.")