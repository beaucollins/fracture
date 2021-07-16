// eslint-disable-next-line no-undef
const { readFileSync } = require('fs');
module.exports = {
    "env": {
        "browser": true,
        "es2020": true
    },
    "extends": [
        "eslint:recommended",
        "plugin:@typescript-eslint/recommended",
        "plugin:json/recommended"
    ],
    "parser": "@typescript-eslint/parser",
    "parserOptions": {
        "ecmaVersion": 11,
        "sourceType": "module"
    },
    "plugins": [
        "@typescript-eslint",
        "eslint-plugin-json",
        "markdown",
    ],
    "rules": {
        "json/*": ["error", { allowComments: true }]
        "comma-dangle": ["error", "only-multiline"],
        "brace-style": ["error", "1tbs", { "allowSingleLine": true }],
        "curly": ["error", "multi-line"],
        "no-console": "warn",
      }
};
