const os = require('os');
const config = require('./config.js');

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
    metrics.latency.service.push(Date.now() - start);
  });
  
  next();
}

// Track authentication attempts
function trackAuth(success) {
  if (success) metrics.auth.successful++;
  else metrics.auth.failed++;
}

// Track pizza orders
function trackPizzaOrder(order, success, creationTime) {
  if (success) {
    metrics.pizzas.sold += order.items.length;
    metrics.pizzas.revenue += order.items.reduce((sum, item) => sum + parseFloat(item.price), 0);
    if (creationTime) metrics.latency.pizzaCreation.push(creationTime);
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

// Send metrics to Grafana
async function sendMetrics() {
  if (!config.metrics || !config.metrics.url || !config.metrics.apiKey) return;

  const timestamp = Date.now() * 1000000; // Nanoseconds
  
  try {
    // Build OTLP format metrics
    const payload = {
      resourceMetrics: [{
        resource: {
          attributes: [{ key: "service.name", value: { stringValue: config.metrics.source } }]
        },
        scopeMetrics: [{
          metrics: [
            // HTTP request metrics
            createCounterMetric("http_requests_total", metrics.httpRequests.total, timestamp),
            createCounterMetric("http_requests_get", metrics.httpRequests.get, timestamp),
            createCounterMetric("http_requests_post", metrics.httpRequests.post, timestamp),
            createCounterMetric("http_requests_put", metrics.httpRequests.put, timestamp),
            createCounterMetric("http_requests_delete", metrics.httpRequests.delete, timestamp),
            
            // Auth metrics
            createCounterMetric("auth_attempts_successful", metrics.auth.successful, timestamp),
            createCounterMetric("auth_attempts_failed", metrics.auth.failed, timestamp),
            
            // Active users
            createGaugeMetric("active_users", metrics.users.size, timestamp),
            
            // System metrics
            createGaugeMetric("system_cpu_usage", parseFloat(getSystemMetrics().cpu), timestamp),
            createGaugeMetric("system_memory_usage", parseFloat(getSystemMetrics().memory), timestamp),
            
            // Pizza metrics
            createCounterMetric("pizzas_sold", metrics.pizzas.sold, timestamp),
            createCounterMetric("pizzas_failures", metrics.pizzas.failures, timestamp),
            createCounterMetric("pizzas_revenue", metrics.pizzas.revenue, timestamp),
            
            // Latency metrics
            createGaugeMetric("latency_service", getAverage(metrics.latency.service), timestamp),
            createGaugeMetric("latency_pizza_creation", getAverage(metrics.latency.pizzaCreation), timestamp)
          ]
        }]
      }]
    };

    // Send to Grafana
    await fetch(config.metrics.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.metrics.apiKey}`
      },
      body: JSON.stringify(payload)
    });
    
    // Reset counters after successful send
    resetCounters();
  } catch (error) {
    console.error("Error sending metrics:", error);
  }
}

// Helper function to create a counter metric
function createCounterMetric(name, value, timestamp) {
  return {
    name: name,
    sum: {
      dataPoints: [{ timeUnixNano: timestamp.toString(), asInt: value }],
      isMonotonic: true
    }
  };
}

// Helper function to create a gauge metric
function createGaugeMetric(name, value, timestamp) {
  return {
    name: name,
    gauge: {
      dataPoints: [{ timeUnixNano: timestamp.toString(), asDouble: value }]
    }
  };
}

// Calculate average of array
function getAverage(arr) {
  return arr.length ? arr.reduce((sum, val) => sum + val, 0) / arr.length : 0;
}

// Reset counters
function resetCounters() {
  metrics.httpRequests = { total: 0, get: 0, post: 0, put: 0, delete: 0 };
  metrics.auth = { successful: 0, failed: 0 };
  metrics.users = new Set();
  metrics.pizzas = { sold: 0, failures: 0, revenue: 0 };
  metrics.latency = { service: [], pizzaCreation: [] };
}

// Start sending metrics periodically
setInterval(sendMetrics, 15000);

module.exports = {
  requestTracker,
  trackAuth,
  trackPizzaOrder
};