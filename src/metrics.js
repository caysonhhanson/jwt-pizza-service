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
    
    if (config.metrics && config.metrics.url && config.metrics.apiKey) {
      this.startPeriodicReporting();
    } else {
      console.log('Metrics disabled: Missing configuration');
    }
  }
  
  requestTracker(req, res, next) {
    const startTime = Date.now();
    const requestId = Math.random().toString(36).substring(2);
    
    metrics.requestStartTimes.set(requestId, {
      startTime,
      method: req.method,
      path: req.path
    });
    
    if (req.user && req.user.id) {
      metrics.users.active.add(req.user.id);
    }
    
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
    
    res.on('finish', () => {
      const requestInfo = metrics.requestStartTimes.get(requestId);
      if (requestInfo) {
        const responseTime = Date.now() - requestInfo.startTime;
        const path = requestInfo.path;
        
        if (!metrics.latency.endpoints[path]) {
          metrics.latency.endpoints[path] = [];
        }
        metrics.latency.endpoints[path].push(responseTime);
        
        metrics.requestStartTimes.delete(requestId);
      }
    });
    
    next();
  }
  
  trackAuthentication(success) {
    if (success) {
      this.auth.successfulAttempts++;
    } else {
      this.auth.failedAttempts++;
    }
  }
  
  trackPizzaOrder(order, success, creationTime) {
    if (success) {
      this.pizzas.sold += order.items.length;
      
      const revenue = order.items.reduce((sum, item) => sum + parseFloat(item.price), 0);
      this.pizzas.revenue += revenue;
      
      if (creationTime) {
        this.latency.pizzaCreation.push(creationTime);
      }
    } else {
      this.pizzas.failures += order.items.length;
    }
  }
  

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
  
  startPeriodicReporting() {
    setInterval(() => {
      try {
        this.sendMetricsToGrafana();
      } catch (error) {
        console.error('Error sending metrics to Grafana:', error);
      }
    }, 15000);
  }
  

  async sendMetricsToGrafana() {
    if (!config.metrics || !config.metrics.url || !config.metrics.apiKey) {
      return;
    }
    
    const timestamp = new Date().getTime() * 1000000;
    const source = config.metrics.source;
    
    const lines = [];
    
    lines.push(`http_requests,source=${source} total=${this.httpRequests.total},get=${this.httpRequests.get},post=${this.httpRequests.post},put=${this.httpRequests.put},delete=${this.httpRequests.delete} ${timestamp}`);
    
    lines.push(`auth_attempts,source=${source} successful=${this.auth.successfulAttempts},failed=${this.auth.failedAttempts} ${timestamp}`);
    
    lines.push(`active_users,source=${source} count=${this.users.active.size} ${timestamp}`);
    
    const systemMetrics = this.getSystemMetrics();
    lines.push(`system,source=${source} cpu=${systemMetrics.cpuUsage},memory=${systemMetrics.memoryUsage} ${timestamp}`);
    
    lines.push(`pizzas,source=${source} sold=${this.pizzas.sold},failures=${this.pizzas.failures},revenue=${this.pizzas.revenue} ${timestamp}`);
    
    let avgServiceLatency = 0;
    let endpointCount = 0;
    
    Object.values(this.latency.endpoints).forEach(latencies => {
      if (latencies.length > 0) {
        const sum = latencies.reduce((a, b) => a + b, 0);
        avgServiceLatency += sum;
        endpointCount += latencies.length;
      }
    });
    
    avgServiceLatency = endpointCount > 0 ? avgServiceLatency / endpointCount : 0;
    
    const avgPizzaCreationLatency = this.latency.pizzaCreation.length > 0
      ? this.latency.pizzaCreation.reduce((a, b) => a + b, 0) / this.latency.pizzaCreation.length
      : 0;
    
    lines.push(`latency,source=${source} service=${avgServiceLatency},pizza_creation=${avgPizzaCreationLatency} ${timestamp}`);
    
    const metricsData = lines.join('\n');
    
    try {
      const response = await fetch(config.metrics.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
          'Authorization': `Bearer ${config.metrics.apiKey}`
        },
        body: metricsData
      });
      
      if (!response.ok) {
        console.error('Failed to send metrics to Grafana:', await response.text());
      } else {
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
        
        this.users.active = new Set();
        
        this.pizzas = {
          sold: 0,
          failures: 0,
          revenue: 0
        };
        
        this.latency.endpoints = {};
        this.latency.pizzaCreation = [];
      }
    } catch (error) {
      console.error('Error sending metrics to Grafana:', error);
    }
  }
}

const metrics = new Metrics();

module.exports = {
  Metrics,
  metrics,
  requestTracker: (req, res, next) => metrics.requestTracker(req, res, next)
};