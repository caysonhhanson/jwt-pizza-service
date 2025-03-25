#!/bin/bash
# Check if host is provided as a command line argument
if [ -z "$1" ]; then
echo "Usage: $0 <host>"
echo "Example: $0 http://localhost:3000"
exit 1
fi
host=$1
echo "JWT Pizza Service Traffic Generator"
# Function to cleanly exit
cleanup() {
echo "Terminating background processes..."
kill $pid1 $pid2 $pid3 $pid4
exit 0
}
# Trap SIGINT (Ctrl+C) to execute the cleanup function
trap cleanup SIGINT
# Get tokens for our requests
admin_token=$(curl -s -X PUT "$host/api/auth" -H "Content-Type: application/json" \
-d '{"email":"a@jwt.com","password":"admin"}' | grep -o '"token":"[^"]' | cut -d'"' -f4)
diner_token=$(curl -s -X PUT "$host/api/auth" -H "Content-Type: application/json" \
-d '{"email":"d@jwt.com","password":"diner"}' | grep -o '"token":"[^"]' | cut -d'"' -f4)
echo "Tokens acquired. Starting traffic generation..."
# Simulate browsing the menu
while true; do
curl -s "$host/api/order/menu" > /dev/null
echo "Browsing menu..."
sleep $((RANDOM % 3 + 1))
done &
pid1=$!
# Simulate user login attempts
while true; do
curl -s -X PUT "$host/api/auth" -H "Content-Type: application/json" \
-d '{"email":"d@jwt.com","password":"diner"}' > /dev/null
echo "User login..."
sleep $((RANDOM % 5 + 2))
done &
pid2=$!
# Simulate viewing franchises
while true; do
curl -s "$host/api/franchise" > /dev/null
echo "Viewing franchises..."
sleep $((RANDOM % 4 + 1))
done &
pid3=$!
# Simulate ordering pizzas
while true; do
curl -s -X POST "$host/api/order" -H "Content-Type: application/json" \
-H "Authorization: Bearer $diner_token" \
-d '{"franchiseId":1,"storeId":1,"items":[{"menuId":1,"description":"Veggie","price":0.05}]}' > /dev/null
echo "Ordering pizza..."
sleep $((RANDOM % 10 + 5))
done &
pid4=$!
# Wait for the background processes to complete
wait $pid1 $pid2 $pid3 $pid4