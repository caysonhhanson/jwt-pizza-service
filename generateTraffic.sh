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

# Register admin user if not exists
admin_login=$(curl -s -X PUT "$host/api/auth" -H "Content-Type: application/json" \
  -d '{"email":"a@jwt.com","password":"admin"}')

if [[ $admin_login == *"unknown user"* ]]; then
  echo "Admin user doesn't exist, creating..."
  curl -s -X POST "$host/api/auth" -H "Content-Type: application/json" \
    -d '{"name":"Admin User","email":"a@jwt.com","password":"admin"}' > /dev/null
  admin_login=$(curl -s -X PUT "$host/api/auth" -H "Content-Type: application/json" \
    -d '{"email":"a@jwt.com","password":"admin"}')
fi

# Register diner user if not exists
diner_login=$(curl -s -X PUT "$host/api/auth" -H "Content-Type: application/json" \
  -d '{"email":"d@jwt.com","password":"diner"}')

if [[ $diner_login == *"unknown user"* ]]; then
  echo "Diner user doesn't exist, creating..."
  curl -s -X POST "$host/api/auth" -H "Content-Type: application/json" \
    -d '{"name":"Diner User","email":"d@jwt.com","password":"diner"}' > /dev/null
  diner_login=$(curl -s -X PUT "$host/api/auth" -H "Content-Type: application/json" \
    -d '{"email":"d@jwt.com","password":"diner"}')
fi

# Extract tokens
admin_token=$(echo $admin_login | grep -o '"token":"[^"]*' | cut -d'"' -f4)
diner_token=$(echo $diner_login | grep -o '"token":"[^"]*' | cut -d'"' -f4)

# Ensure we have tokens
if [ -z "$admin_token" ] || [ -z "$diner_token" ]; then
  echo "Failed to get authentication tokens. Check the server logs."
  exit 1
fi

echo "Tokens acquired. Starting traffic generation..."

# Create franchise and store if needed
franchise_check=$(curl -s "$host/api/franchise")
if [[ $franchise_check == "[]" ]] || [[ $franchise_check != *"\"id\":1"* ]]; then
  echo "Creating test franchise and store..."
  franchise_result=$(curl -s -X POST "$host/api/franchise" -H "Content-Type: application/json" \
    -H "Authorization: Bearer $admin_token" \
    -d '{"name":"Test Franchise","admins":[{"email":"a@jwt.com"}]}')
  
  franchise_id=$(echo $franchise_result | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)
  
  if [ ! -z "$franchise_id" ]; then
    curl -s -X POST "$host/api/franchise/$franchise_id/store" -H "Content-Type: application/json" \
      -H "Authorization: Bearer $admin_token" \
      -d '{"name":"Test Store"}' > /dev/null
  fi
fi

# Create menu item if needed
menu_check=$(curl -s "$host/api/order/menu")
if [[ $menu_check == "[]" ]]; then
  echo "Creating test menu item..."
  curl -s -X PUT "$host/api/order/menu" -H "Content-Type: application/json" \
    -H "Authorization: Bearer $admin_token" \
    -d '{"title":"Veggie","description":"A garden of delight","image":"pizza1.png","price":0.05}' > /dev/null
fi

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