import { describe, it, expect } from 'vitest';
import '../src/editor';
import { makeHass } from './helpers';

// _configCleanup renames the pre-2022 slot values daytime_high/daytime_low. The
// loop that does it iterated over a single string holding all sixteen slot names,
// so no slot was ever renamed and old configurations kept a value no slot matches.

interface EditorEl extends HTMLElement {
  setConfig: (c: Record<string, unknown>) => void;
  hass: unknown;
  _configCleanup: () => void;
  _config: Record<string, unknown>;
  updateComplete: Promise<unknown>;
}

async function cleaned(config: Record<string, unknown>) {
  const el = document.createElement('platinum-weather-card-plus-charts-editor') as EditorEl;
  el.setConfig({ type: 'custom:platinum-weather-card-plus-charts', ...config });
  el.hass = makeHass();
  document.body.appendChild(el);
  await el.updateComplete;
  el._configCleanup();
  return el._config;
}

describe('legacy slot values', () => {
  it('daytime_high becomes forecast_max in any slot', async () => {
    const c = await cleaned({ slot_l1: 'daytime_high', slot_r8: 'daytime_high' });
    expect(c.slot_l1).toBe('forecast_max');
    expect(c.slot_r8).toBe('forecast_max');
  });

  it('daytime_low becomes forecast_min', async () => {
    const c = await cleaned({ slot_l4: 'daytime_low' });
    expect(c.slot_l4).toBe('forecast_min');
  });

  it('other values are untouched', async () => {
    const c = await cleaned({ slot_l1: 'humidity', slot_r2: 'moon' });
    expect(c.slot_l1).toBe('humidity');
    expect(c.slot_r2).toBe('moon');
  });
});
