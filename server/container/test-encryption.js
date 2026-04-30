#!/usr/bin/env node
/**
 * Test script for encryption service
 * Run with: node server/container/test-encryption.js
 *
 * Requires ENCRYPTION_MASTER_KEY environment variable
 */

import { encryptionService } from '../services/encryption.js';

console.log('='.repeat(60));
console.log('Encryption Service Test Suite');
console.log('='.repeat(60));
console.log('');

if (!process.env.ENCRYPTION_MASTER_KEY) {
  console.error('❌ Error: ENCRYPTION_MASTER_KEY environment variable not set');
  console.error('Generate one with: openssl rand -hex 32');
  process.exit(1);
}

try {
  // Test 1: Basic encryption/decryption
  console.log('Test 1: Basic encryption/decryption');
  const testValue = 'my-secret-api-key-12345';
  const userId = 1;

  const encrypted = encryptionService.encrypt(testValue, userId);
  console.log('  Encrypted length:', encrypted.encrypted.length, 'chars');
  console.log('  IV length:', encrypted.iv.length, 'chars');
  console.log('  AuthTag length:', encrypted.authTag.length, 'chars');

  const decrypted = encryptionService.decrypt(
    encrypted.encrypted,
    encrypted.iv,
    encrypted.authTag,
    userId
  );

  if (decrypted === testValue) {
    console.log('  ✅ PASS: Decryption successful');
  } else {
    console.log('  ❌ FAIL: Decrypted value does not match');
    process.exit(1);
  }
  console.log('');

  // Test 2: User isolation
  console.log('Test 2: User isolation');
  try {
    encryptionService.decrypt(encrypted.encrypted, encrypted.iv, encrypted.authTag, 999);
    console.log('  ❌ FAIL: Different user could decrypt!');
    process.exit(1);
  } catch (err) {
    console.log('  ✅ PASS: User isolation enforced');
  }
  console.log('');

  // Test 3: Multiple users
  console.log('Test 3: Multiple users with same value');
  const user1Encrypted = encryptionService.encrypt('shared-value', 1);
  const user2Encrypted = encryptionService.encrypt('shared-value', 2);

  if (user1Encrypted.encrypted !== user2Encrypted.encrypted) {
    console.log('  ✅ PASS: Different users produce different ciphertext');
  } else {
    console.log('  ❌ FAIL: Same ciphertext for different users');
    process.exit(1);
  }

  const user1Decrypted = encryptionService.decrypt(
    user1Encrypted.encrypted,
    user1Encrypted.iv,
    user1Encrypted.authTag,
    1
  );
  const user2Decrypted = encryptionService.decrypt(
    user2Encrypted.encrypted,
    user2Encrypted.iv,
    user2Encrypted.authTag,
    2
  );

  if (user1Decrypted === user2Decrypted && user1Decrypted === 'shared-value') {
    console.log('  ✅ PASS: Both users can decrypt their own values');
  }
  console.log('');

  // Test 4: Tampering detection
  console.log('Test 4: Tampering detection');
  try {
    const tampered = encrypted.encrypted.substring(0, encrypted.encrypted.length - 2) + 'XX';
    encryptionService.decrypt(tampered, encrypted.iv, encrypted.authTag, userId);
    console.log('  ❌ FAIL: Tampered data was not detected');
    process.exit(1);
  } catch (err) {
    console.log('  ✅ PASS: Tampering detected and rejected');
  }
  console.log('');

  // Test 5: Configuration check
  console.log('Test 5: Configuration validation');
  if (encryptionService.isConfigured()) {
    console.log('  ✅ PASS: Configuration valid');
  } else {
    console.log('  ❌ FAIL: Configuration invalid');
    process.exit(1);
  }
  console.log('');

  // Test 6: Roundtrip test
  console.log('Test 6: Roundtrip test');
  if (encryptionService.testEncryption(1)) {
    console.log('  ✅ PASS: Built-in roundtrip test passed');
  } else {
    console.log('  ❌ FAIL: Roundtrip test failed');
    process.exit(1);
  }
  console.log('');

  console.log('='.repeat(60));
  console.log('✅ All tests passed!');
  console.log('='.repeat(60));

} catch (err) {
  console.error('');
  console.error('❌ Test suite failed:');
  console.error('  ', err.message);
  console.error('');
  console.error('Stack trace:');
  console.error(err.stack);
  process.exit(1);
}
