module.exports = {
  root: true,
  extends: '@koi-design/eslint-config',
  settings: {
    'import/extensions': ['.js', '.jsx', '.ts', '.tsx'],
    'import/resolver': {
      node: {
        extensions: ['.js', '.jsx', '.ts', '.tsx'],
      },
      alias: [
        ['@', './src'],
        ['@api', './src/api'],
        ['@assets', './src/assets'],
      ],
    },
  },
};
