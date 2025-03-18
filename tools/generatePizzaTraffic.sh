#!/bin/bash

# Check if a host parameter was provided
if [ -z "$1" ]; then
  echo "Error: No host URL provided"
  echo "Usage: $0 <host_url>"
  echo "Example: $0 http://localhost:3000"
  exit 1
fi

host=$1
echo "Targeting host: $host"

# Function to handle Ctrl+C
cleanup() {
  echo "Stopping traffic simulation..."
  kill $(jobs -p) 2>/dev/null
  exit 0
}

trap cleanup SIGINT

# Menu requests every 3 seconds
(
  while true; do
    echo "Requesting menu..."
    curl -s $host/api/order/menu > /dev/null
    sleep 3
  done
) &

# Invalid logins every 25 seconds
(
  while true; do
    echo "Logging in with invalid credentials..."
    curl -s -X PUT $host/api/auth -d '{"email":"unknown@jwt.com", "password":"bad"}' -H 'Content-Type: application/json' > /dev/null
    sleep 25
  done
) &

# Franchisee login/logout cycle
(
  while true; do
    echo "Login franchisee..."
    response=$(curl -s -X PUT $host/api/auth -d '{"email":"f@jwt.com", "password":"franchisee"}' -H 'Content-Type: application/json')
    token=$(echo $response | grep -o '"token":"[^"]*"' | cut -d':' -f2 | tr -d '"')
    sleep 110
    echo "Logout franchisee..."
    curl -s -X DELETE $host/api/auth -H "Authorization: Bearer $token" > /dev/null
    sleep 10
  done
) &

# Diner pizza ordering cycle
(
  while true; do
    echo "Login diner..."
    response=$(curl -s -X PUT $host/api/auth -d '{"email":"d@jwt.com", "password":"diner"}' -H 'Content-Type: application/json')
    token=$(echo $response | grep -o '"token":"[^"]*"' | cut -d':' -f2 | tr -d '"')
    echo "Buying a pizza..."
    curl -s -X POST $host/api/order -H 'Content-Type: application/json' -d '{"franchiseId": 1, "storeId":1, "items":[{ "menuId": 1, "description": "Veggie", "price": 0.05 }]}' -H "Authorization: Bearer $token" > /dev/null
    sleep 20
    echo "Logout diner..."
    curl -s -X DELETE $host/api/auth -H "Authorization: Bearer $token" > /dev/null
    sleep 40
  done
) &

wait