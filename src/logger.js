const config = require('./config.js');

class Logger {
  // HTTP request logging middleware
  httpLogger = (req, res, next) => {
    let send = res.send;
    res.send = (resBody) => {
      const logData = {
        authorized: !!req.headers.authorization,
        path: req.originalUrl,
        method: req.method,
        statusCode: res.statusCode,
        reqBody: JSON.stringify(req.body),
        resBody: JSON.stringify(resBody),
      };
      const level = this.statusToLogLevel(res.statusCode);
      this.log(level, 'http', logData);
      res.send = send;
      return res.send(resBody);
    };
    next();
  };

  // Database query logging
  dbLogger = (sql, params) => {
    const logData = {
      query: sql,
      params: this.sanitize(params || [])
    };
    this.log('info', 'database', logData);
  };

  // Factory service request logging
  factoryLogger = (url, method, requestBody, responseBody, statusCode) => {
    const logData = {
      url,
      method,
      requestBody: JSON.stringify(requestBody),
      responseBody: JSON.stringify(responseBody),
      statusCode
    };
    const level = this.statusToLogLevel(statusCode);
    this.log(level, 'factory', logData);
  };

  // Error logging
  errorLogger = (err, req) => {
    const logData = {
      message: err.message,
      stack: err.stack,
      path: req?.originalUrl,
      method: req?.method
    };
    this.log('error', 'exception', logData);
  };

  // Main logging method
  log(level, type, logData) {
    const labels = { component: config.logging.source, level: level, type: type };
    const values = [this.nowString(), this.sanitize(logData)];
    const logEvent = { streams: [{ stream: labels, values: [values] }] };

    this.sendLogToGrafana(logEvent);
  }

  statusToLogLevel(statusCode) {
    if (statusCode >= 500) return 'error';
    if (statusCode >= 400) return 'warn';
    return 'info';
  }

  nowString() {
    return (Math.floor(Date.now()) * 1000000).toString();
  }

  sanitize(logData) {
    let data = JSON.stringify(logData);
    
    // Sanitize passwords
    data = data.replace(/\\"password\\":\s*\\"[^"]*\\"/g, '\\"password\\": \\"*****\\"');
    
    // Sanitize JWT tokens
    data = data.replace(/\\"token\\":\s*\\"[^"]*\\"/g, '\\"token\\": \\"*****\\"');
    data = data.replace(/Bearer\s+[^"\\s]+/g, 'Bearer *****');
    
    // Sanitize sensitive fields like API keys
    data = data.replace(/\\"apiKey\\":\s*\\"[^"]*\\"/g, '\\"apiKey\\": \\"*****\\"');
    
    return data;
  }

  sendLogToGrafana(event) {
    const body = JSON.stringify(event);
    fetch(`${config.logging.url}`, {
      method: 'post',
      body: body,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.logging.userId}:${config.logging.apiKey}`,
      },
    }).then((res) => {
      if (!res.ok) console.log('Failed to send log to Grafana');
    }).catch(err => {
      console.error('Error sending log to Grafana:', err.message);
    });
  }
}

module.exports = new Logger();