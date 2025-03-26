const { 
    app, 
    request, 
    randomName, 
    expectValidJwt, 
    createAdminUser 
  } = require('./testUtils');
  
  const testUser = { 
    name: 'pizza diner', 
    email: 'reg@test.com', 
    password: 'testpass' 
  };
  
  let testUserAuthToken;
  let adminUser;
  let adminAuthToken;
  
  beforeAll(async () => {
    // Create test user
    testUser.email = randomName() + '@test.com';
    const registerRes = await request(app).post('/api/auth').send(testUser);
    testUser.id = registerRes.body.user.id;
    testUserAuthToken = registerRes.body.token;
    expectValidJwt(testUserAuthToken);
  
    // Create admin user
    adminUser = await createAdminUser();
    const adminLoginRes = await request(app)
      .put('/api/auth')
      .send({ email: adminUser.email, password: adminUser.password });
    adminAuthToken = adminLoginRes.body.token;
    expectValidJwt(adminAuthToken);
  });
  
  describe('Auth Router', () => {
    test('register new user', async () => {
      const newUser = {
        name: randomName(),
        email: randomName() + '@test.com',
        password: 'testpass'
      };
  
      const res = await request(app)
        .post('/api/auth')
        .send(newUser);
  
      expect(res.status).toBe(200);
      expectValidJwt(res.body.token);
      expect(res.body.user.name).toBe(newUser.name);
      expect(res.body.user.email).toBe(newUser.email);
      expect(res.body.user.roles).toEqual([{ role: 'diner' }]);
    });
  
    test('register fails without required fields', async () => {
      const res = await request(app)
        .post('/api/auth')
        .send({ name: 'incomplete' });
  
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('name, email, and password are required');
    });
  
    test('login with valid credentials', async () => {
      const res = await request(app)
        .put('/api/auth')
        .send(testUser);
  
      expect(res.status).toBe(200);
      expectValidJwt(res.body.token);
    });
  
    test('logout user', async () => {
      const res = await request(app)
        .delete('/api/auth')
        .set('Authorization', `Bearer ${testUserAuthToken}`);
  
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('logout successful');
    });
  });