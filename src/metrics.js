const os = require('os');
const config = require('./config.js');

// Track the interval ID so we can clear it in tests
let metricsInterval;

// Global metrics counters
const metrics = {
  httpRequests: { total: 0, get: 0, post: 0, put: 0, delete: 0 },
  auth: { successful: 0, failed: 0 },
  users: new Set(),
  pizzas: { sold: 0, failures: 0, revenue: 0 },
  latency: { service: [], pizzaCreation: [] }
};

// Express middleware to track HTTP requests
function requestTracker(req, res, next) {
  const start = Date.now();
  
  // Track requests by method
  metrics.httpRequests.total++;
  if (req.method.toLowerCase() === 'get') metrics.httpRequests.get++;
  if (req.method.toLowerCase() === 'post') metrics.httpRequests.post++;
  if (req.method.toLowerCase() === 'put') metrics.httpRequests.put++;
  if (req.method.toLowerCase() === 'delete') metrics.httpRequests.delete++;
  
  // Track authenticated users
  if (req.user && req.user.id) {
    metrics.users.add(req.user.id);
  }
  
  // Track response time
  res.on('finish', () => {
    const duration = Date.now() - start;
    metrics.latency.service.push(duration);
    
    // Keep the array size reasonable
    if (metrics.latency.service.length > 100) {
      metrics.latency.service.shift();
    }
  });
  
  next();
}

// Track authentication attempts
function trackAuth(success) {
  if (success) {
    metrics.auth.successful++;
  } else {
    metrics.auth.failed++;
  }
}

// Track pizza orders
function trackPizzaOrder(order, success, creationTime) {
  if (success) {
    metrics.pizzas.sold += order.items.length;
    metrics.pizzas.revenue += order.items.reduce((sum, item) => sum + parseFloat(item.price), 0);
    if (creationTime) {
      metrics.latency.pizzaCreation.push(creationTime);
      // Keep the array size reasonable
      if (metrics.latency.pizzaCreation.length > 100) {
        metrics.latency.pizzaCreation.shift();
      }
    }
  } else {
    metrics.pizzas.failures += order.items.length;
  }
}

// Get system metrics
function getSystemMetrics() {
  return {
    cpu: (os.loadavg()[0] / os.cpus().length * 100).toFixed(2),
    memory: ((os.totalmem() - os.freemem()) / os.totalmem() * 100).toFixed(2)
  };
}

// Send metrics to Grafana using OTLP format
async function sendMetrics() {
  if (!config.metrics || !config.metrics.url || !config.metrics.apiKey) {
    console.log('Metrics configuration not found, skipping metrics reporting');
    return;
  }

  try {
    const timestamp = Date.now() * 1000000; // Convert to nanoseconds
    const source = config.metrics.source;
    const systemMetrics = getSystemMetrics();
    
    // Create an OTLP metrics payload
    const payload = {
      resourceMetrics: [
        {
          scopeMetrics: [
            {
              metrics: [
                // HTTP requests metric
                {
                  name: "http_requests",
                  unit: "1",
                  sum: {
                    dataPoints: [
                      {
                        asInt: metrics.httpRequests.total,
                        timeUnixNano: timestamp,
                        attributes: [
                          { key: "source", value: { stringValue: source } },
                          { key: "method", value: { stringValue: "total" } }
                        ]
                      },
                      {
                        asInt: metrics.httpRequests.get,
                        timeUnixNano: timestamp,
                        attributes: [
                          { key: "source", value: { stringValue: source } },
                          { key: "method", value: { stringValue: "get" } }
                        ]
                      },
                      {
                        asInt: metrics.httpRequests.post,
                        timeUnixNano: timestamp,
                        attributes: [
                          { key: "source", value: { stringValue: source } },
                          { key: "method", value: { stringValue: "post" } }
                        ]
                      },
                      {
                        asInt: metrics.httpRequests.put,
                        timeUnixNano: timestamp,
                        attributes: [
                          { key: "source", value: { stringValue: source } },
                          { key: "method", value: { stringValue: "put" } }
                        ]
                      },
                      {
                        asInt: metrics.httpRequests.delete,
                        timeUnixNano: timestamp,
                        attributes: [
                          { key: "source", value: { stringValue: source } },
                          { key: "method", value: { stringValue: "delete" } }
                        ]
                      }
                    ],
                    aggregationTemporality: "AGGREGATION_TEMPORALITY_CUMULATIVE",
                    isMonotonic: true
                  }
                },
                // Auth metrics
                {
                  name: "auth_attempts",
                  unit: "1",
                  sum: {
                    dataPoints: [
                      {
                        asInt: metrics.auth.successful,
                        timeUnixNano: timestamp,
                        attributes: [
                          { key: "source", value: { stringValue: source } },
                          { key: "result", value: { stringValue: "success" } }
                        ]
                      },
                      {
                        asInt: metrics.auth.failed,
                        timeUnixNano: timestamp,
                        attributes: [
                          { key: "source", value: { stringValue: source } },
                          { key: "result", value: { stringValue: "failure" } }
                        ]
                      }
                    ],
                    aggregationTemporality: "AGGREGATION_TEMPORALITY_CUMULATIVE",
                    isMonotonic: true
                  }
                },
                // Active users
                {
                  name: "active_users",
                  unit: "1",
                  gauge: {
                    dataPoints: [
                      {
                        asInt: metrics.users.size,
                        timeUnixNano: timestamp,
                        attributes: [
                          { key: "source", value: { stringValue: source } }
                        ]
                      }
                    ]
                  }
                },
                // CPU usage
                {
                  name: "cpu_usage",
                  unit: "%",
                  gauge: {
                    dataPoints: [
                      {
                        asDouble: parseFloat(systemMetrics.cpu),
                        timeUnixNano: timestamp,
                        attributes: [
                          { key: "source", value: { stringValue: source } }
                        ]
                      }
                    ]
                  }
                },
                // Memory usage
                {
                  name: "memory_usage",
                  unit: "%",
                  gauge: {
                    dataPoints: [
                      {
                        asDouble: parseFloat(systemMetrics.memory),
                        timeUnixNano: timestamp,
                        attributes: [
                          { key: "source", value: { stringValue: source } }
                        ]
                      }
                    ]
                  }
                },
                // Pizza metrics
                {
                  name: "pizzas_sold",
                  unit: "1",
                  sum: {
                    dataPoints: [
                      {
                        asInt: metrics.pizzas.sold,
                        timeUnixNano: timestamp,
                        attributes: [
                          { key: "source", value: { stringValue: source } }
                        ]
                      }
                    ],
                    aggregationTemporality: "AGGREGATION_TEMPORALITY_CUMULATIVE",
                    isMonotonic: true
                  }
                },
                {
                  name: "pizza_failures",
                  unit: "1",
                  sum: {
                    dataPoints: [
                      {
                        asInt: metrics.pizzas.failures,
                        timeUnixNano: timestamp,
                        attributes: [
                          { key: "source", value: { stringValue: source } }
                        ]
                      }
                    ],
                    aggregationTemporality: "AGGREGATION_TEMPORALITY_CUMULATIVE",
                    isMonotonic: true
                  }
                },
                {
                  name: "pizza_revenue",
                  unit: "$",
                  sum: {
                    dataPoints: [
                      {
                        asDouble: metrics.pizzas.revenue,
                        timeUnixNano: timestamp,
                        attributes: [
                          { key: "source", value: { stringValue: source } }
                        ]
                      }
                    ],
                    aggregationTemporality: "AGGREGATION_TEMPORALITY_CUMULATIVE",
                    isMonotonic: true
                  }
                },
                // Latency metrics
                {
                  name: "service_latency",
                  unit: "ms",
                  gauge: {
                    dataPoints: [
                      {
                        asDouble: getAverage(metrics.latency.service),
                        timeUnixNano: timestamp,
                        attributes: [
                          { key: "source", value: { stringValue: source } }
                        ]
                      }
                    ]
                  }
                },
                {
                  name: "pizza_creation_latency",
                  unit: "ms",
                  gauge: {
                    dataPoints: [
                      {
                        asDouble: getAverage(metrics.latency.pizzaCreation),
                        timeUnixNano: timestamp,
                        attributes: [
                          { key: "source", value: { stringValue: source } }
                        ]
                      }
                    ]
                  }
                }
              ]
            }
          ]
        }
      ]
    };

    console.log('Sending metrics to Grafana');
    
    // Send to Grafana
    const response = await fetch(config.metrics.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.metrics.apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`Error sending metrics: ${response.status} - ${text}`);
    } else {
      console.log('Metrics sent successfully');
      // Reset counters after successful send, but keep the users set
      resetCounters();
    }
  } catch (error) {
    console.error("Error sending metrics:", error);
  }
}

// Calculate average of array
function getAverage(arr) {
  return arr.length ? arr.reduce((sum, val) => sum + val, 0) / arr.length : 0;
}

// Reset counters after sending metrics
function resetCounters() {
  metrics.httpRequests = { total: 0, get: 0, post: 0, put: 0, delete: 0 };
  metrics.auth = { successful: 0, failed: 0 };
  // Don't reset users set to track active users across intervals
  metrics.pizzas = { sold: 0, failures: 0, revenue: 0 };
  // Keep latency arrays for smooth averages
}

// Function to validate metrics configuration
function validateMetricsConfig() {
  if (!config.metrics) {
    console.error("Metrics configuration missing");
    return false;
  }
  
  if (!config.metrics.url) {
    console.error("Metrics URL missing");
    return false;
  }
  
  if (!config.metrics.apiKey) {
    console.error("Metrics API key missing");
    return false;
  }
  
  if (!config.metrics.source) {
    console.error("Metrics source missing");
    return false;
  }
  
  return true;
}

// Call validation on startup
validateMetricsConfig();

// Start sending metrics periodically (every 15 seconds)
const METRICS_INTERVAL = 15000; // 15 seconds
metricsInterval = setInterval(sendMetrics, METRICS_INTERVAL);

module.exports = {
  requestTracker,
  trackAuth,
  trackPizzaOrder,
  sendMetrics, // Export this for manual metrics sending
  // Add this for testing
  clearInterval: () => clearInterval(metricsInterval)
};