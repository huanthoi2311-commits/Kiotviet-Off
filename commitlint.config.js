/**
 * Conventional Commit bắt buộc: type(scope): subject
 * Ví dụ hợp lệ: feat(product): create CRUD | fix(auth): refresh token
 * Ví dụ KHÔNG hợp lệ: "update", "fix bug", "abc", "123"
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-empty': [2, 'never'],
    'subject-case': [2, 'never', ['upper-case', 'pascal-case', 'start-case']],
    'header-max-length': [2, 'always', 100],
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'docs',
        'style',
        'refactor',
        'perf',
        'test',
        'build',
        'ci',
        'chore',
        'revert',
        'security',
      ],
    ],
  },
};
