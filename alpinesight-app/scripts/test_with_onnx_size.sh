#!/bin/bash
# Test production requirements with ONNX dependencies
# To see if we can include YOLO detection in production

set -e

echo "============================================================"
echo "Testing Production Size WITH ONNX Dependencies"
echo "============================================================"
echo ""

# Create temporary requirements file with ONNX uncommented
TEMP_REQ="/tmp/requirements_with_onnx.txt"
cat requirements.txt | sed 's/^# numpy/numpy/' | sed 's/^# onnxruntime/onnxruntime/' | sed 's/^# opencv-python-headless/opencv-python-headless/' | sed 's/^# Pillow/Pillow/' > "$TEMP_REQ"

echo "📝 Testing with ONNX dependencies enabled..."
cat "$TEMP_REQ" | tail -10

# Create temporary virtual environment
TEMP_VENV="/tmp/alpinesight_onnx_test"
echo ""
echo "🔧 Creating temporary virtual environment..."
rm -rf "$TEMP_VENV"
python3 -m venv "$TEMP_VENV"

# Activate virtual environment
source "$TEMP_VENV/bin/activate"

# Install production requirements
echo ""
echo "📦 Installing requirements with ONNX..."
pip install --quiet --upgrade pip
pip install --quiet -r "$TEMP_REQ"

# Calculate uncompressed size
echo ""
echo "📊 Calculating sizes..."
SITE_PACKAGES="$TEMP_VENV/lib/python3.*/site-packages"
UNCOMPRESSED_BYTES=$(du -s $SITE_PACKAGES | cut -f1)
UNCOMPRESSED_MB=$((UNCOMPRESSED_BYTES / 1024))

# Create tarball and compress
echo "🗜️  Compressing with gzip..."
TARBALL="/tmp/site_packages_onnx.tar"
COMPRESSED="/tmp/site_packages_onnx.tar.gz"
tar -cf "$TARBALL" -C $(dirname $SITE_PACKAGES) $(basename $SITE_PACKAGES) 2>/dev/null
gzip -f "$TARBALL"

COMPRESSED_BYTES=$(stat -f%z "$COMPRESSED" 2>/dev/null || stat -c%s "$COMPRESSED")
COMPRESSED_MB=$((COMPRESSED_BYTES / 1024 / 1024))

echo ""
echo "============================================================"
echo "Results WITH ONNX Dependencies"
echo "============================================================"
echo "Uncompressed size: ${UNCOMPRESSED_MB} MB"
echo "Compressed size (gzip): ${COMPRESSED_MB} MB"
echo "Compression ratio: $(echo "scale=1; $UNCOMPRESSED_MB / $COMPRESSED_MB" | bc)x"
echo ""
echo "Vercel limit: 250 MB (after gzip compression)"
echo ""

if [ $COMPRESSED_MB -lt 250 ]; then
    REMAINING=$((250 - COMPRESSED_MB))
    echo "✅ PASS: Compressed size is within Vercel limits!"
    echo "   Remaining capacity: ${REMAINING} MB"
    echo ""
    echo "🎉 YOLO detection CAN be enabled in production!"
else
    OVERFLOW=$((COMPRESSED_MB - 250))
    echo "❌ FAIL: Compressed size exceeds Vercel limits!"
    echo "   Overflow: ${OVERFLOW} MB"
    echo ""
    echo "⚠️  YOLO detection must remain disabled for production"
fi

echo ""
echo "Top 10 largest packages:"
du -sh $SITE_PACKAGES/* | sort -hr | head -10

# Cleanup
echo ""
echo "🧹 Cleaning up..."
deactivate
rm -rf "$TEMP_VENV" "$COMPRESSED" "$TEMP_REQ"

echo ""
echo "============================================================"
echo "Test Complete"
echo "============================================================"
