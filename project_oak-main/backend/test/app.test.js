const assert = require('node:assert/strict');
const http = require('node:http');
const { after, before, test } = require('node:test');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const User = require('../src/models/User');
const authController = require('../src/controllers/authController');

let server;
let baseUrl;
const originalGoogleClientId = process.env.GOOGLE_CLIENT_ID;

before(async () => {
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  if (originalGoogleClientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
  else process.env.GOOGLE_CLIENT_ID = originalGoogleClientId;
});

test('health endpoint responds without a database connection', async () => {
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('server serves both user and admin pages', async () => {
  for (const page of ['/', '/admin.html']) {
    const response = await fetch(`${baseUrl}${page}`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /<!DOCTYPE html>/i);
  }
});

test('runtime config exposes the configured public Google client ID', async () => {
  const response = await fetch(`${baseUrl}/config.js`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /test-client-id/);
});

test('borrow APIs reject unauthenticated access before reading data', async () => {
  const response = await fetch(`${baseUrl}/api/borrows`);
  assert.equal(response.status, 401);
});

test('Google endpoint requires a credential', async () => {
  const response = await fetch(`${baseUrl}/api/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.equal(response.status, 400);
});

test('Google endpoint rejects an invalid ID token', async () => {
  const response = await fetch(`${baseUrl}/api/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credential: 'not-a-google-token' })
  });
  assert.equal(response.status, 401);
});

test('student sessions cannot access admin borrow routes', async () => {
  const token = jwt.sign({ id: 'student-id', role: 'student' }, 'fallback_secret_key');
  const response = await fetch(`${baseUrl}/api/borrows`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(response.status, 403);
});

test('phone registration rejects invalid phone numbers', async () => {
  const response = await fetch(`${baseUrl}/api/auth/register/phone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: 'phone-number', full_name: 'Test User', password: 'long-password' })
  });
  assert.equal(response.status, 400);
});

test('phone registration normalizes phone and never grants admin role', async () => {
  const originalFindOne = User.findOne;
  const originalCreate = User.create;
  let createdUser;
  User.findOne = async () => null;
  User.create = async fields => {
    createdUser = { _id: 'phone-user-id', ...fields };
    return createdUser;
  };

  const response = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };

  try {
    await authController.registerPhoneUser({ body: {
      phone: '089-123-4567',
      full_name: 'Test User',
      password: 'long-password',
      role: 'admin'
    } }, response);
    assert.equal(response.statusCode, 201);
    assert.equal(createdUser.phone, '0891234567');
    assert.equal(createdUser.identifier_code, 'PHONE-0891234567');
    assert.equal(createdUser.role, 'user');
    assert.ok(response.body.token);
  } finally {
    User.findOne = originalFindOne;
    User.create = originalCreate;
  }
});

test('phone login normalizes formatted numbers and returns a user session', async () => {
  const originalFindOne = User.findOne;
  const passwordHash = await bcrypt.hash('SafePass123', 4);
  User.findOne = async filter => {
    assert.ok(filter.$or.some(condition => condition.phone === '0891234567'));
    return {
      _id: 'phone-user-id',
      phone: '0891234567',
      identifier_code: 'PHONE-0891234567',
      full_name: 'Test User',
      role: 'user',
      department: 'DIT',
      password_hash: passwordHash
    };
  };
  const response = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };

  try {
    await authController.login({ body: { phone: '(089) 123-4567', password: 'SafePass123' } }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.user.phone, '0891234567');
    assert.equal(response.body.user.role, 'user');
    assert.ok(response.body.token);
  } finally {
    User.findOne = originalFindOne;
  }
});
