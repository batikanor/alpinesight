# DEPRECATED
# file: fetch_image.py
import os
import math
import requests

def latlon_to_tile(lat, lon, zoom):
    lat_rad = math.radians(lat)
    n = 2.0 ** zoom
    x_tile = int((lon + 180.0) / 360.0 * n)
    y_tile = int((1.0 - math.log(math.tan(lat_rad) + 1.0 / math.cos(lat_rad)) / math.pi) / 2.0 * n)
    return x_tile, y_tile

def fetch_satellite_tile(lat, lon, zoom, out_path, url_template, api_key=None):
    """
    url_template example for a tile based provider:
    "https://api.example.com/tiles/satellite/{z}/{x}/{y}.png?key={api_key}"
    You must choose a provider that allows this usage.
    """
    x, y = latlon_to_tile(lat, lon, zoom)
    url = url_template.format(z=zoom, x=x, y=y, api_key=api_key or "")
    resp = requests.get(url, timeout=20)
    resp.raise_for_status()
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "wb") as f:
        f.write(resp.content)
    return out_path

if __name__ == "__main__":
    # Example placeholder, replace url_template and api_key with a legal source
    img_path = fetch_satellite_tile(
        lat=47.263, lon=11.400,
        zoom=19,
        out_path="data/raw/test_tile.png",
        url_template="https://your-provider.example/{z}/{x}/{y}.png?key={api_key}",
        api_key="YOUR_KEY"
    )
    print("Saved", img_path)

