const os = require('os');
const config = require('./config.js');

class Metrics {
  constructor() {
    this.httpRequests = {
      total: 0,
      get: 0,
      post: 0,
      put: 0,
      delete: 0
    };
    
    this.auth = {
      successfulAttempts: 0,
      failedAttempts: 0
    };
    
    this.users = {
      active: new Set()
    };
    
    this.pizzas = {
      sold: 0,
      failures: 0,
      revenue: 0
    };
    
    this.latency = {
      endpoints: {},
      pizzaCreation: []
    };
    
    this.requestStartTimes = new Map();
    
    // Start periodic reporting if configuration is available
    if (config.metrics && config.metrics.url && config.metrics.apiKey) {
      this.startPeriodicReporting();
    } else {
      console.log('Metrics disabled: Missing configuration');
    }
  }
  
  // Express middleware to track HTTP requests
  requestTracker(req, res, next) {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(2);
    
    // Store start time for latency calculation
    metrics.requestStartTimes.set(requestId, {
      startTime,
      method: req.method,
      path: req.path
    });
    
    // Track active user if authenticated
    if (req.user && req.user.id) {
      metrics.users.active.add(req.user.id);
    }
    
    // Increment HTTP request counters
    metrics.httpRequests.total++;
    switch (req.method.toLowerCase()) {
      case 'get':
        metrics.httpRequests.get++;
        break;
      case 'post':
        metrics.httpRequests.post++;
        break;
      case 'put':
        metrics.httpRequests.put++;
        break;
      case 'delete':
        metrics.httpRequests.delete++;
        break;
    }
    
    // Capture response time when request completes
    res.on('finish', () => {
      const requestInfo = metrics.requestStartTimes.get(requestId);
      if (requestInfo) {
        const responseTime = Date.now() - requestInfo.startTime;
        const path = requestInfo.path;
        
        // Store endpoint latency
        if (!metrics.latency.endpoints[path]) {
          metrics.latency.endpoints[path] = [];
        }
        metrics.latency.endpoints[path].push(responseTime);
        
        // Cleanup
        metrics.requestStartTimes.delete(requestId);
      }
    });
    
    next();
  }
  
  // Track authentication attempts
  trackAuthentication(success) {
    if (success) {
      this.auth.successfulAttempts++;
    } else {
      this.auth.failedAttempts++;
    }
  }
  
  // Track pizza orders
  trackPizzaOrder(order, success, creationTime) {
    if (success) {
      this.pizzas.sold += order.items.length;
      
      // Calculate total revenue
      const revenue = order.items.reduce((sum, item) => sum + parseFloat(item.price), 0);
      this.pizzas.revenue += revenue;
      
      // Track pizza creation time
      if (creationTime) {
        this.latency.pizzaCreation.push(creationTime);
      }
    } else {
      this.pizzas.failures += order.items.length;
    }
  }
  
  // Get system metrics
  getSystemMetrics() {
    return {
      cpuUsage: this.getCpuUsagePercentage(),
      memoryUsage: this.getMemoryUsagePercentage()
    };
  }
  
  getCpuUsagePercentage() {
    const cpuUsage = os.loadavg()[0] / os.cpus().length;
    return cpuUsage * 100;
  }
  
  getMemoryUsagePercentage() {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    return (usedMemory / totalMemory) * 100;
  }
  
  // Start periodic reporting to Grafana
  startPeriodicReporting() {
    // Report metrics every 15 seconds
    setInterval(() => {
      try {
        this.sendMetricsToGrafana();
      } catch (error) {
        console.error('Error sending metrics to Grafana:', error);
      }
    }, 15000);
  }
  
  // Send metrics to Grafana using OTLP format
  async sendMetricsToGrafana() {
    if (!config.metrics || !config.metrics.url || !config.metrics.apiKey) {
      return;
    }
    
    const timestamp = new Date().getTime() * 1000000; // Nanoseconds
    const source = config.metrics.source;
    
    // Build OTLP payload
    const payload = {
      resourceMetrics: [
        {
          resource: {
            attributes: [
              {
                key: "service.name",
                value: {
                  stringValue: source
                }
              }
            ]
          },
          scopeMetrics: [
            {
              metrics: [
                // HTTP Requests
                {
                  name: "http_requests_total",
                  sum: {
                    dataPoints: [
                      {
                        timeUnixNano: timestamp.toString(),
                        asInt: this.httpRequests.total
                      }
                    ],
                    isMonotonic: true
                  }
                },
                {
                  name: "http_requests_get",
                  sum: {
                    dataPoints: [
                      {
                        timeUnixNano: timestamp.toString(),
                        asInt: this.httpRequests.get
                      }
                    ],
                    isMonotonic: true
                  }
                },
                {
                  name: "http_requests_post",
                  sum: {
                    dataPoints: [
                      {
                        timeUnixNano: timestamp.toString(),
                        asInt: this.httpRequests.post
                      }
                    ],
                    isMonotonic: true
                  }
                },
                {
                  name: "http_requests_put",
                  sum: {
                    dataPoints: [
                      {
                        timeUnixNano: timestamp.toString(),
                        asInt: this.httpRequests.put
                      }
                    ],
                    isMonotonic: true
                  }
                },
                {
                  name: "http_requests_delete",
                  sum: {
                    dataPoints: [
                      {
                        timeUnixNano: timestamp.toString(),
                        asInt: this.httpRequests.delete
                      }
                    ],
                    isMonotonic: true
                  }
                },
                
                // Authentication metrics
                {
                  name: "auth_attempts_successful",
                  sum: {
                    dataPoints: [
                      {
                        timeUnixNano: timestamp.toString(),
                        asInt: this.auth.successfulAttempts
                      }
                    ],
                    isMonotonic: true
                  }
                },
                {
                  name: "auth_attempts_failed",
                  sum: {
                    dataPoints: [
                      {
                        timeUnixNano: timestamp.toString(),
                        asInt: this.auth.failedAttempts
                      }
                    ],
                    isMonotonic: true
                  }
                },
                
                // Active users
                {
                  name: "active_users",
                  gauge: {
                    dataPoints: [
                      {
                        timeUnixNano: timestamp.toString(),
                        asInt: this.users.active.size
                      }
                    ]
                  }
                },
                
                // System metrics
                {
                  name: "system_cpu_usage",
                  gauge: {
                    dataPoints: [
                      {
                        timeUnixNano: timestamp.toString(),
                        asDouble: this.getSystemMetrics().cpuUsage
                      }
                    ]
                  }
                },
                {
                  name: "system_memory_usage",
                  gauge: {
                    dataPoints: [
                      {
                        timeUnixNano: timestamp.toString(),
                        asDouble: this.getSystemMetrics().memoryUsage
                      }
                    ]
                  }
                },
                
                // Pizza metrics
                {
                  name: "pizzas_sold",
                  sum: {
                    dataPoints: [
                      {
                        timeUnixNano: timestamp.toString(),
                        asInt: this.pizzas.sold
                      }
                    ],
                    isMonotonic: true
                  }
                },
                {
                  name: "pizzas_failures",
                  sum: {
                    dataPoints: [
                      {
                        timeUnixNano: timestamp.toString(),
                        asInt: this.pizzas.failures
                      }
                    ],
                    isMonotonic: true
                  }
                },
                {
                  name: "pizzas_revenue",
                  sum: {
                    dataPoints: [
                      {
                        timeUnixNano: timestamp.toString(),
                        asDouble: this.pizzas.revenue
                      }
                    ],
                    isMonotonic: true
                  }
                },
                
                // Latency metrics
                {
                  name: "latency_service",
                  gauge: {
                    dataPoints: [
                      {
                        timeUnixNano: timestamp.toString(),
                        asDouble: this.calculateAverageServiceLatency()
                      }
                    ]
                  }
                },
                {
                  name: "latency_pizza_creation",
                  gauge: {
                    dataPoints: [
                      {
                        timeUnixNano: timestamp.toString(),
                        asDouble: this.calculateAveragePizzaCreationLatency()
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
    
    try {
      const response = await fetch(config.metrics.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.metrics.apiKey}`
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        console.error('Failed to send metrics to Grafana:', await response.text());
      } else {
        // Reset certain counters after successful reporting
        this.resetCounters();
      }
    } catch (error) {
      console.error('Error sending metrics to Grafana:', error);
    }
  }
  
  // Calculate average service latency
  calculateAverageServiceLatency() {
    let avgServiceLatency = 0;
    let endpointCount = 0;
    
    Object.values(this.latency.endpoints).forEach(latencies => {
      if (latencies.length > 0) {
        const sum = latencies.reduce((a, b) => a + b, 0);
        avgServiceLatency += sum;
        endpointCount += latencies.length;
      }
    });
    
    return endpointCount > 0 ? avgServiceLatency / endpointCount : 0;
  }
  
  // Calculate average pizza creation latency
  calculateAveragePizzaCreationLatency() {
    return this.latency.pizzaCreation.length > 0
      ? this.latency.pizzaCreation.reduce((a, b) => a + b, 0) / this.latency.pizzaCreation.length
      : 0;
  }
  
  // Reset counters after sending metrics
  resetCounters() {
    this.httpRequests = {
      total: 0,
      get: 0,
      post: 0,
      put: 0,
      delete: 0
    };
    
    this.auth = {
      successfulAttempts: 0,
      failedAttempts: 0
    };
    
    // Keep track of unique users over a window, but clear old data
    this.users.active = new Set();
    
    this.pizzas = {
      sold: 0,
      failures: 0,
      revenue: 0
    };
    
    // Reset latency tracking
    this.latency.endpoints = {};
    this.latency.pizzaCreation = [];
  }
}

// Create a singleton instance
const metrics = new Metrics();

// Export both the class and the singleton
module.exports = {
  Metrics,
  metrics,
  // Middleware for Express
  requestTracker: (req, res, next) => metrics.requestTracker(req, res, next)
};