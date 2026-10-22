import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const editor = readFileSync(join(__dirname, '../src/editor.ts'), 'utf8');

// The card reads uv_index and dew_point from a weather entity's attributes, so
// the editor should let one be chosen for them, as it does for humidity or pressure.
describe('the UV index and dew point pickers', () => {
  for (const key of ['entity_uv_index', 'entity_dew_point']) {
    it(`offer weather entities for ${key}`, () => {
      const picker = new RegExp(`configValue=\\$\\{'${key}'\\}[^>]*includeDomains=\\$\\{\\[([^\\]]*)\\]\\}`).exec(editor);
      expect(picker, key).not.toBeNull();
      expect(picker![1]).toContain("'weather'");
      expect(picker![1]).toContain("'sensor'");
    });
  }
});
