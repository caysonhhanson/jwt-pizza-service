const { requestTracker, trackAuth, trackPizzaOrder } = require('./metrics');

// Mock fetch to prevent actual network calls
global.fetch = jest.fn(() => 
  Promise.resolve({
    ok: true,
    text: () => Promise.resolve("")
  })
);

// Mock config to avoid real API calls
jest.mock('./config', () => ({
  metrics: {
    source: 'test-source',
    url: 'https://example.com/metrics',
    apiKey: 'test-api-key'
  }
}));

describe('Metrics', () => {
  let req, res, next;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Mock Express request/response objects
    req = {
      method: 'GET',
      user: { id: 1 }
    };
    
    res = {
      on: jest.fn((event, callback) => {
        if (event === 'finish') {
          callback();
        }
      })
    };
    
    next = jest.fn();
  });

  afterAll(() => {
    // Clear the interval to prevent test leaks
    jest.useRealTimers();
  });

  test('requestTracker should track HTTP requests', () => {
    // Test GET request
    requestTracker(req, res, next);
    expect(next).toHaveBeenCalled();
    
    // Test POST request
    req.method = 'POST';
    requestTracker(req, res, next);
    
    // Test PUT request
    req.method = 'PUT';
    requestTracker(req, res, next);
    
    // Test DELETE request
    req.method = 'DELETE';
    requestTracker(req, res, next);
  });

  test('trackAuth should track authentication attempts', () => {
    // Test successful auth
    trackAuth(true);
    
    // Test failed auth
    trackAuth(false);
  });

  test('trackPizzaOrder should track pizza orders', () => {
    const mockOrder = {
      items: [
        { price: 10.5 },
        { price: 15.75 }
      ]
    };
    
    // Test successful order
    trackPizzaOrder(mockOrder, true, 150);
    
    // Test failed order
    trackPizzaOrder(mockOrder, false);
  });
});