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

// Format to InfluxDB line protocol
function formatInfluxMetric(measurement, tags, fields, timestamp = Date.now()) {
  // Format tags
  const tagString = Object.entries(tags)
    .map(([key, value]) => `${key}=${escapeValue(value)}`)
    .join(',');
  
  // Format fields
  const fieldString = Object.entries(fields)
    .map(([key, value]) => {
      // Handle numeric values correctly for InfluxDB
      if (typeof value === 'number') {
        // Integer or float formatting
        return Number.isInteger(value) ? `${key}=${value}i` : `${key}=${value}`;
      }
      return `${key}="${escapeValue(value)}"`;
    })
    .join(',');
  
  // Format the full line
  return `${measurement},${tagString} ${fieldString} ${timestamp}000000`;
}

function escapeValue(value) {
  // Escape special characters in tag/field values
  if (typeof value === 'string') {
    return value.replace(/ /g, '\\ ').replace(/,/g, '\\,').replace(/=/g, '\\=');
  }
  return value;
}

// Send metrics to Grafana
async function sendMetrics() {
  if (!config.metrics || !config.metrics.url || !config.metrics.apiKey) {
    console.log('Metrics configuration not found, skipping metrics reporting');
    return;
  }

  try {
    const timestamp = Math.floor(Date.now() / 1000) * 1000; // Round to nearest second
    const lines = [];
    const source = config.metrics.source;
    const systemMetrics = getSystemMetrics();
    
    // HTTP request metrics
    lines.push(formatInfluxMetric('http_requests', { source }, { 
      total: metrics.httpRequests.total,
      get: metrics.httpRequests.get,
      post: metrics.httpRequests.post,
      put: metrics.httpRequests.put,
      delete: metrics.httpRequests.delete
    }, timestamp));
    
    // Authentication metrics
    lines.push(formatInfluxMetric('auth_attempts', { source }, {
      successful: metrics.auth.successful,
      failed: metrics.auth.failed
    }, timestamp));
    
    // Active users metric
    lines.push(formatInfluxMetric('active_users', { source }, {
      count: metrics.users.size
    }, timestamp));
    
    // System metrics
    lines.push(formatInfluxMetric('system', { source }, {
      cpu_usage: parseFloat(systemMetrics.cpu),
      memory_usage: parseFloat(systemMetrics.memory)
    }, timestamp));
    
    // Pizza metrics
    lines.push(formatInfluxMetric('pizzas', { source }, {
      sold: metrics.pizzas.sold,
      failures: metrics.pizzas.failures,
      revenue: metrics.pizzas.revenue
    }, timestamp));
    
    // Latency metrics
    const avgServiceLatency = getAverage(metrics.latency.service);
    const avgPizzaCreationLatency = getAverage(metrics.latency.pizzaCreation);
    
    lines.push(formatInfluxMetric('latency', { source }, {
      service: avgServiceLatency,
      pizza_creation: avgPizzaCreationLatency
    }, timestamp));

    // Send to Grafana
    const response = await fetch(config.metrics.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'Authorization': `Bearer ${config.metrics.apiKey}`
      },
      body: lines.join('\n')
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

// Start sending metrics periodically (every 15 seconds)
const METRICS_INTERVAL = 15000; // 15 seconds
setInterval(sendMetrics, METRICS_INTERVAL);

module.exports = {
  requestTracker,
  trackAuth,
  trackPizzaOrder
};