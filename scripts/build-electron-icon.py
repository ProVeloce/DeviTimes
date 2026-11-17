"""Generate electron/icon.ico from icon.png (valid ICO for NSIS)."""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PNG = ROOT / "electron" / "icon.png"
ICO = ROOT / "electron" / "icon.ico"

img = Image.open(PNG).convert("RGBA")
sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
img.save(ICO, format="ICO", sizes=sizes)
print(f"Wrote {ICO} ({ICO.stat().st_size} bytes)")
