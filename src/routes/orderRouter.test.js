const { 
    app, 
    request, 
    randomName,
    createAdminUser,
    DB 
  } = require('./testUtils');
  
  describe('Order Router', () => {
    let adminToken;
    let testDiner;
    let dinerToken;
    let testStore;
    let testMenuItem;
  
    beforeAll(async () => {
      const admin = await createAdminUser();
      const adminLogin = await request(app)
        .put('/api/auth')
        .send({ email: admin.email, password: admin.password });
      adminToken = adminLogin.body.token;
  
      testDiner = await DB.addUser({
        name: randomName(),
        email: `${randomName()}@test.com`,
        password: 'testpass',
        roles: [{ role: 'diner' }]
      });
      const dinerLogin = await request(app)
        .put('/api/auth')
        .send({ email: testDiner.email, password: 'testpass' });
      dinerToken = dinerLogin.body.token;
  
      const franchise = await DB.createFranchise({
        name: randomName(),
        admins: [{ email: admin.email }]
      });
      testStore = await DB.createStore(franchise.id, { name: 'Test Store' });
  
      testMenuItem = {
        title: randomName(),
        description: 'Test pizza',
        image: 'pizza_test.png',
        price: 0.001
      };
  
      await request(app)
        .put('/api/order/menu')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(testMenuItem);
    });
  
    test('get menu', async () => {
      const res = await request(app).get('/api/order/menu');
  
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });
  
    test('add menu item as admin', async () => {
      const menuItem = {
        title: randomName(),
        description: 'Test pizza',
        image: 'pizza_test.png',
        price: 0.001
      };
  
      const res = await request(app)
        .put('/api/order/menu')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(menuItem);
  
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some(item => item.title === menuItem.title)).toBe(true);
    });
  
    test('cannot add menu item without admin', async () => {
      const menuItem = {
        title: randomName(),
        description: 'Test pizza',
        image: 'pizza_test.png',
        price: 0.001
      };
  
      const res = await request(app)
        .put('/api/order/menu')
        .set('Authorization', `Bearer ${dinerToken}`)
        .send(menuItem);
  
      expect(res.status).toBe(403);
    });
  
    test('create order as authenticated user', async () => {
      const menu = await request(app).get('/api/order/menu');
      const menuItem = menu.body[0];
  
      const orderData = {
        franchiseId: testStore.franchiseId,
        storeId: testStore.id,
        items: [
          {
            menuId: menuItem.id,
            description: menuItem.description,
            price: menuItem.price
          }
        ]
      };
  
      const res = await request(app)
        .post('/api/order')
        .set('Authorization', `Bearer ${dinerToken}`)
        .send(orderData);
  
      expect(res.status).toBe(200);
      expect(res.body.order).toBeDefined();
      expect(res.body.order.items).toHaveLength(1);
    });
  
    test('cannot create order without authentication', async () => {
      const menu = await request(app).get('/api/order/menu');
      const menuItem = menu.body[0];
  
      const orderData = {
        franchiseId: testStore.franchiseId,
        storeId: testStore.id,
        items: [
          {
            menuId: menuItem.id,
            description: menuItem.description,
            price: menuItem.price
          }
        ]
      };
  
      const res = await request(app)
        .post('/api/order')
        .send(orderData);
  
      expect(res.status).toBe(401);
    });
  
    test('get orders as authenticated user', async () => {
      const res = await request(app)
        .get('/api/order')
        .set('Authorization', `Bearer ${dinerToken}`);
  
      expect(res.status).toBe(200);
      expect(res.body.orders).toBeDefined();
      expect(Array.isArray(res.body.orders)).toBe(true);
    });
  
    test('get orders with pagination', async () => {
      const res = await request(app)
        .get('/api/order?page=1')
        .set('Authorization', `Bearer ${dinerToken}`);
  
      expect(res.status).toBe(200);
      expect(res.body.orders).toBeDefined();
      expect(res.body.page).toBe("1");
    });
  });