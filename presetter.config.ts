import esm from '@presetter/preset-esm';
import strict from '@presetter/preset-strict';

import { asset, preset } from 'presetter';

import { name } from './package.json';

export default preset(name, {
  extends: [esm, strict],
  override: {
    assets: {
      '.gitignore': asset<string[]>((current) => [
        ...(current ?? []),
        '.state/',
      ]),
    },
  },
});
