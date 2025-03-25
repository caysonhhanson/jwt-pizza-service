const os = require('os');
const config = require('./config.js');

// Storage for metrics
const metrics = {
  httpRequests: { total: 0, get: 0, post: 0, put: 0, delete: 0 },
  activeUsers: new Set(),
  authSuccess: 0,
  authFailed: 0,
  pizzasSold: 0,
  pizzaFailures: 0,
  pizzaRevenue: 0,
  endpointLatency: {},
  pizzaCreationTimes: []
};

// Middleware to track HTTP requests
function requestTracker(req, res, next) {
  const startTime = Date.now();
  const method = req.method.toLowerCase();
  
  // Track request count
  metrics.httpRequests.total++;
  if (metrics.httpRequests[method] !== undefined) {
    metrics.httpRequests[method]++;
  }
  
  // Track response time
  const originalEnd = res.end;
  res.end = function(...args) {
    const duration = Date.now() - startTime;
    const path = req.baseUrl + (req.route ? req.route.path : '');
    
    if (!metrics.endpointLatency[path]) {
      metrics.endpointLatency[path] = [];
    }
    metrics.endpointLatency[path].push(duration);
    
    return originalEnd.apply(this, args);
  };
  
  next();
}

// Track active user
function trackUser(userId) {
  if (userId) {
    metrics.activeUsers.add(userId);
  }
}

// Track authentication attempts
function trackAuth(success) {
  if (success) {
    metrics.authSuccess++;
  } else {
    metrics.authFailed++;
  }
}

// Track pizza order
function trackPizzaOrder(count, revenue) {
  metrics.pizzasSold += count;
  metrics.pizzaRevenue += revenue;
}

// Track pizza creation failure
function trackPizzaFailure() {
  metrics.pizzaFailures++;
}

// Track pizza creation time
function trackPizzaCreationTime(duration) {
  metrics.pizzaCreationTimes.push(duration);
}

// Get CPU usage percentage
function getCpuUsage() {
  const cpuUsage = os.loadavg()[0] / os.cpus().length;
  return cpuUsage * 100;
}

// Get memory usage percentage
function getMemoryUsage() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  return (usedMemory / totalMemory) * 100;
}

// Send metrics to Grafana
function sendMetricToGrafana(name, value, unit, attributes = {}) {
  attributes = { ...attributes, source: config.metrics.source };
  
  const metric = {
    resourceMetrics: [
      {
        scopeMetrics: [
          {
            metrics: [
              {
                name,
                unit,
                sum: {
                  dataPoints: [
                    {
                      asDouble: value,
                      timeUnixNano: Date.now() * 1000000,
                      attributes: Object.entries(attributes).map(([key, val]) => ({
                        key,
                        value: { stringValue: String(val) }
                      }))
                    },
                  ],
                  aggregationTemporality: 'AGGREGATION_TEMPORALITY_CUMULATIVE',
                  isMonotonic: true,
                },
              },
            ],
          },
        ],
      },
    ],
  };

  fetch(config.metrics.url, {
    method: 'POST',
    body: JSON.stringify(metric),
    headers: { 
      'Authorization': `Bearer ${config.metrics.apiKey}`, 
      'Content-Type': 'application/json' 
    },
  })
    .then((response) => {
      if (!response.ok) {
        console.error(`Failed to push metric ${name} to Grafana`);
      } else {
        console.log(`Pushed ${name}`);
      }
    })
    .catch((error) => {
      console.error(`Error pushing metric ${name}:`, error);
    });
}

// Periodically send metrics to Grafana
setInterval(() => {
  // System metrics
  sendMetricToGrafana('cpu_usage', getCpuUsage(), '%');
  sendMetricToGrafana('memory_usage', getMemoryUsage(), '%');
  
  // HTTP request metrics
  Object.entries(metrics.httpRequests).forEach(([method, count]) => {
    sendMetricToGrafana('http_requests', count, '1', { method });
  });
  
  // User metrics
  sendMetricToGrafana('active_users', metrics.activeUsers.size, '1');
  
  // Auth metrics
  sendMetricToGrafana('auth_attempts', metrics.authSuccess, '1', { status: 'success' });
  sendMetricToGrafana('auth_attempts', metrics.authFailed, '1', { status: 'failed' });
  
  // Pizza metrics
  sendMetricToGrafana('pizzas_sold', metrics.pizzasSold, '1');
  sendMetricToGrafana('pizza_failures', metrics.pizzaFailures, '1');
  sendMetricToGrafana('pizza_revenue', metrics.pizzaRevenue, '$');
  
  // Latency metrics
  Object.entries(metrics.endpointLatency).forEach(([endpoint, times]) => {
    if (times.length > 0) {
      const avg = times.reduce((sum, val) => sum + val, 0) / times.length;
      sendMetricToGrafana('endpoint_latency', avg, 'ms', { endpoint });
    }
  });
  
  if (metrics.pizzaCreationTimes.length > 0) {
    const avg = metrics.pizzaCreationTimes.reduce((sum, val) => sum + val, 0) / metrics.pizzaCreationTimes.length;
    sendMetricToGrafana('pizza_creation_latency_milliseconds_total', avg, 'ms');
  }
  
  // Reset some metrics after reporting
  metrics.endpointLatency = {};
  metrics.pizzaCreationTimes = [];
}, 60000); // Send metrics every minute

module.exports = {
  requestTracker,
  trackUser,
  trackAuth,
  trackPizzaOrder,
  trackPizzaFailure,
  trackPizzaCreationTime
};