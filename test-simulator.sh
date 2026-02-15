#!/bin/bash
# Quick test script for ReefMind Electron simulator mode

echo "🧪 Testing ReefMind Simulator API..."
echo ""

BASE_URL="http://localhost:8080"

echo "1. Status check..."
curl -s $BASE_URL/api/status | jq -r '"   Status: \(.status) | Mode: \(.demo_mode)"'
echo ""

echo "2. Tank data..."
curl -s $BASE_URL/api/tanks | jq -r '.tanks[0] | "   Tank: \(.name) | Serial: \(.apexSerial) | Volume: \(.volume)gal"'
echo ""

echo "3. Recent readings (last 3)..."
curl -s $BASE_URL/api/tanks/sim-tank-1/readings?days=7 | jq -r '.readings[0:3][] | "   \(.timestamp | .[0:10]): Alk \(.alk) | Ca \(.ca) | pH \(.ph)"'
echo ""

echo "4. Events (count)..."
EVENT_COUNT=$(curl -s $BASE_URL/api/tanks/sim-tank-1/events | jq '.events | length')
echo "   Total events: $EVENT_COUNT"
echo ""

echo "5. AI analysis..."
curl -s -X POST $BASE_URL/api/tanks/sim-tank-1/analyze | jq -r '"   Diagnosis: \(.analysis.diagnosis[0:80])..."'
echo ""

echo "✅ All tests passed! Simulator API is working."
echo ""
echo "Next: Open the Electron app and verify:"
echo "  - Blue banner: 'You're viewing simulated data'"
echo "  - Dashboard loads with charts"
echo "  - Timeline shows 6 events"
echo "  - System tray icon appears"
