#!/bin/bash

# Configuration
host="${1:-http://localhost:3000}"
echo "Using host: $host"

# Step 1: Login as admin to get token
echo "Logging in as admin..."
response=$(curl -s -X PUT "$host/api/auth" -H "Content-Type: application/json" -d '{"email":"a@jwt.com","password":"admin"}')
token=$(echo $response | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$token" ]; then
  echo "Failed to get authentication token"
  exit 1
fi

echo "Successfully authenticated"

# Step 2: Enable chaos mode
echo "Enabling chaos mode..."
chaos_response=$(curl -s -X PUT "$host/api/order/chaos/true" -H "Authorization: Bearer $token")
echo "Chaos mode response: $chaos_response"

# Step 3: Login as a regular user
echo "Logging in as regular user..."
diner_response=$(curl -s -X PUT "$host/api/auth" -H "Content-Type: application/json" -d '{"email":"d@jwt.com","password":"diner"}')
diner_token=$(echo $diner_response | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$diner_token" ]; then
  echo "Failed to get diner authentication token"
  exit 1
fi

# Step 4: Simulate traffic with multiple order attempts
echo "Starting traffic simulation with potential chaos failures..."
for i in {1..10}; do
  echo "Placing order $i..."
  order_response=$(curl -s -X POST "$host/api/order" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $diner_token" \
    -d '{"franchiseId": 1, "storeId": 1, "items":[{ "menuId": 1, "description": "Veggie", "price": 0.05 }]}')
  
  # Check if order was successful or failed due to chaos
  if echo "$order_response" | grep -q "Chaos monkey"; then
    echo "Order $i FAILED due to chaos monkey!"
  else
    echo "Order $i successful"
  fi
  
  # Add a small delay between requests
  sleep 1
done

# Step 5: Disable chaos mode when done
echo "Disabling chaos mode..."
disable_chaos=$(curl -s -X PUT "$host/api/order/chaos/false" -H "Authorization: Bearer $token")
echo "Chaos mode disabled: $disable_chaos"

echo "Chaos testing complete!"