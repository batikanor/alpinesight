#!/bin/bash
# Test production requirements size for Vercel deployment
# Vercel limit: 250 MB unzipped

set -e

echo "============================================================"
echo "Testing Production Requirements Size"
echo "============================================================"
echo ""

# Create temporary virtual environment
TEMP_VENV="/tmp/alpinesight_test_venv"
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

# Calculate size
echo ""
echo "📊 Calculating installed package sizes..."
SITE_PACKAGES="$TEMP_VENV/lib/python3.*/site-packages"
TOTAL_SIZE=$(du -sh $SITE_PACKAGES | cut -f1)
TOTAL_BYTES=$(du -s $SITE_PACKAGES | cut -f1)
TOTAL_MB=$((TOTAL_BYTES / 1024))

echo ""
echo "============================================================"
echo "Results"
echo "============================================================"
echo "Total size: $TOTAL_SIZE (${TOTAL_MB} MB)"
echo "Vercel limit: 250 MB"
echo ""

if [ $TOTAL_MB -lt 250 ]; then
    REMAINING=$((250 - TOTAL_MB))
    echo "✅ PASS: Size is within Vercel limits!"
    echo "   Remaining capacity: ${REMAINING} MB"
else
    OVERFLOW=$((TOTAL_MB - 250))
    echo "❌ FAIL: Size exceeds Vercel limits!"
    echo "   Overflow: ${OVERFLOW} MB"
fi

echo ""
echo "Top 10 largest packages:"
du -sh $SITE_PACKAGES/* | sort -hr | head -10

# Cleanup
echo ""
echo "🧹 Cleaning up temporary virtual environment..."
deactivate
rm -rf "$TEMP_VENV"

echo ""
echo "============================================================"
echo "Test Complete"
echo "============================================================"
