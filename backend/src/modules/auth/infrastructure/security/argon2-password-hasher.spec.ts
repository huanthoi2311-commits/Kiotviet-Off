import { Argon2PasswordHasher } from './argon2-password-hasher';

describe('Argon2PasswordHasher', () => {
  const hasher = new Argon2PasswordHasher();

  it('hash tạo ra chuỗi khác với mật khẩu gốc và verify đúng mật khẩu', async () => {
    const plain = 'P@ssw0rd123';
    const hash = await hasher.hash(plain);

    expect(hash).not.toBe(plain);
    expect(hash.startsWith('$argon2id$')).toBe(true);
    await expect(hasher.verify(hash, plain)).resolves.toBe(true);
  });

  it('verify trả về false với mật khẩu sai', async () => {
    const hash = await hasher.hash('P@ssw0rd123');
    await expect(hasher.verify(hash, 'wrong-password')).resolves.toBe(false);
  });

  it('hash cùng 1 mật khẩu 2 lần cho ra 2 chuỗi khác nhau (random salt)', async () => {
    const plain = 'P@ssw0rd123';
    const [hash1, hash2] = await Promise.all([
      hasher.hash(plain),
      hasher.hash(plain),
    ]);
    expect(hash1).not.toBe(hash2);
  });
});
