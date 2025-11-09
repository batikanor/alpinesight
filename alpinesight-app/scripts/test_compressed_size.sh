#!/bin/bash
# Test production requirements COMPRESSED size for Vercel deployment
# Vercel limit: 250 MB AFTER gzip compression

set -e

echo "============================================================"
echo "Testing Production Requirements COMPRESSED Size"
echo "============================================================"
echo ""

# Create temporary virtual environment
TEMP_VENV="/tmp/alpinesight_compressed_test"
echo "🔧 Creating temporary virtual environment..."
rm -rf "$TEMP_VENV"
python3 -m venv "$TEMP_VENV"

# Activate virtual environment
source "$TEMP_VENV/bin/activate"

# Install production requirements
echo ""
echo "📦 Installing production requirements..."
pip install --quiet --upgrade pip
pip install --quiet -r requirements.txt

# Calculate uncompressed size
echo ""
echo "📊 Calculating sizes..."
SITE_PACKAGES="$TEMP_VENV/lib/python3.*/site-packages"
UNCOMPRESSED_BYTES=$(du -s $SITE_PACKAGES | cut -f1)
UNCOMPRESSED_MB=$((UNCOMPRESSED_BYTES / 1024))

# Create tarball and compress
echo "🗜️  Compressing with gzip..."
TARBALL="/tmp/site_packages.tar"
COMPRESSED="/tmp/site_packages.tar.gz"
tar -cf "$TARBALL" -C $(dirname $SITE_PACKAGES) $(basename $SITE_PACKAGES) 2>/dev/null
gzip -f "$TARBALL"

COMPRESSED_BYTES=$(stat -f%z "$COMPRESSED" 2>/dev/null || stat -c%s "$COMPRESSED")
COMPRESSED_MB=$((COMPRESSED_BYTES / 1024 / 1024))

echo ""
echo "============================================================"
echo "Results"
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
else
    OVERFLOW=$((COMPRESSED_MB - 250))
    echo "❌ FAIL: Compressed size exceeds Vercel limits!"
    echo "   Overflow: ${OVERFLOW} MB"
fi

# Cleanup
echo ""
echo "🧹 Cleaning up..."
deactivate
rm -rf "$TEMP_VENV" "$COMPRESSED"

echo ""
echo "============================================================"
echo "Test Complete"
echo "============================================================"
