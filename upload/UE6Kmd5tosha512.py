import json
import time
import httpx

# Load the original U_E table
with open('UEtable.json', 'r', encoding='utf-8') as f:
    ue_table = json.load(f)

enriched_table = []

with httpx.Client() as client:
    for chart in ue_table:
        md5_hash = chart.get('md5')
        
        # Default to empty if API fails
        chart['sha512'] = "" 
        
        if md5_hash:
            try:
                # Query the EZ2PATTERN Rosetta Stone
                url = f"https://ez2pattern.kr/api/bms/v1/_internal_/md5_or_sha256_to_sha512.json?md5={md5_hash}"
                response = client.get(url)
                
                if response.status_code == 200:
                    data = response.json()
                    chart['sha512'] = data.get('sha512', "")
                    print(f"Mapped {chart['title']} -> {chart['sha512'][:8]}...")
            except Exception as e:
                print(f"Failed to map {chart['title']}: {e}")
        
        enriched_table.append(chart)
        time.sleep(0.01) # Polite rate limiting

# Save the enriched data
with open('UEtable_enriched.json', 'w', encoding='utf-8') as f:
    json.dump(enriched_table, f, indent=4, ensure_ascii=False)