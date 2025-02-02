const { 
    app, 
    request, 
    randomName,
    createAdminUser,
    DB 
  } = require('./testUtils');
  
  describe('Franchise Router', () => {
    let testFranchise;
    let adminUser;
    let adminToken;
    let testDiner;
    let dinerToken;
  
    beforeAll(async () => {
      // Create admin user
      adminUser = await createAdminUser();
      const loginRes = await request(app)
        .put('/api/auth')
        .send({ email: adminUser.email, password: adminUser.password });
      adminToken = loginRes.body.token;
  
      // Create test diner
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
    });
  
    test('create franchise as admin', async () => {
      const franchiseData = {
        name: randomName(),
        admins: [{ email: adminUser.email }]
      };
  
      const res = await request(app)
        .post('/api/franchise')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(franchiseData);
  
      expect(res.status).toBe(200);
      expect(res.body.name).toBe(franchiseData.name);
      testFranchise = res.body;
    });
  
    test('list all franchises', async () => {
      const res = await request(app)
        .get('/api/franchise');
  
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });
  
    test('get user franchises', async () => {
      const res = await request(app)
        .get(`/api/franchise/${adminUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
  
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  
    test('cannot get other user franchises without admin', async () => {
      const res = await request(app)
        .get(`/api/franchise/${adminUser.id}`)
        .set('Authorization', `Bearer ${dinerToken}`);
  
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  
    test('cannot create franchise as non-admin', async () => {
      const franchiseData = {
        name: randomName(),
        admins: [{ email: testDiner.email }]
      };
  
      const res = await request(app)
        .post('/api/franchise')
        .set('Authorization', `Bearer ${dinerToken}`)
        .send(franchiseData);
  
      expect(res.status).toBe(403);
    });
  
    test('create and verify store in franchise', async () => {
      const storeName = randomName();
      const storeData = {
        name: storeName,
        franchiseId: testFranchise.id
      };
  
      const res = await request(app)
        .post(`/api/franchise/${testFranchise.id}/store`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(storeData);
  
      expect(res.status).toBe(200);
      expect(res.body.name).toBe(storeName);
  
      // Verify store was created by getting franchise details
      const franchiseRes = await request(app)
        .get('/api/franchise')
        .set('Authorization', `Bearer ${adminToken}`);
      
      const updatedFranchise = franchiseRes.body.find(f => f.id === testFranchise.id);
      expect(updatedFranchise.stores.some(store => store.name === storeName)).toBe(true);
    });
  
    test('cannot create store without authorization', async () => {
      const storeData = {
        name: randomName(),
        franchiseId: testFranchise.id
      };
  
      const res = await request(app)
        .post(`/api/franchise/${testFranchise.id}/store`)
        .send(storeData);
  
      expect(res.status).toBe(401);
    });
  
    test('delete store', async () => {
      // First create a store
      const storeData = {
        name: randomName(),
        franchiseId: testFranchise.id
      };
  
      const createRes = await request(app)
        .post(`/api/franchise/${testFranchise.id}/store`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(storeData);
  
      const storeId = createRes.body.id;
  
      // Then delete it
      const deleteRes = await request(app)
        .delete(`/api/franchise/${testFranchise.id}/store/${storeId}`)
        .set('Authorization', `Bearer ${adminToken}`);
  
      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.message).toBe('store deleted');
    });
  
    test('delete franchise', async () => {
      const res = await request(app)
        .delete(`/api/franchise/${testFranchise.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
  
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('franchise deleted');
    });
  });