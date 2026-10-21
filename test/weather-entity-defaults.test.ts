import { describe, it, expect } from 'vitest';
import { render } from 'lit';
import '../src/platinum-weather-card';
import '../src/editor';
import { makeHass, makeForecast, baseConfig, renderCard } from './helpers';
import { issue24Config } from './fixtures/issue-24-config';

// Issue #24: weather_entity set, the six entity_*_1 keys absent, forecast_type
// hourly. The strip came out empty and said nothing. Two separate faults, each
// enough on its own: with no entity_forecast_icon_1 the strip has no source, and
// hourly data has up to 24 entries a day where the strip wants one.

const DAILY = 'weather.openweathermap_valencia_daily';
const HOURLY = 'weather.openweathermap_valencia_hourly';
const SIX = ['entity_forecast_icon_1', 'entity_summary_1', 'entity_forecast_min_1', 'entity_forecast_max_1', 'entity_pop_1', 'entity_pos_1'];

const hourlyData = () => Array.from({ length: 48 }, (_, i) => {
  const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + i);
  return { datetime: d.toISOString(), temperature: 14 + (i % 6), condition: 'cloudy', precipitation: 0 };
});

// A provider that answers each subscription with the forecast type it was asked
// for, as Home Assistant does, and keeps a record of what was asked.
function provider(extraStates: Record<string, { state: string; attributes?: Record<string, unknown> }> = {}, daily: unknown[] = makeForecast(6, 0)) {
  const attrs = { temperature: 16.7, humidity: 66, pressure: 1017, wind_speed: 16, wind_bearing: 264, friendly_name: 'OWM', supported_features: 3 };
  const hass = makeHass({
    [DAILY]: { state: 'sunny', attributes: attrs },
    [HOURLY]: { state: 'sunny', attributes: attrs },
    'sun.sun': { state: 'above_horizon', attributes: { elevation: 30, azimuth: 150 } },
    ...extraStates,
  });
  const asked: { entity: string; type: string }[] = [];
  hass.connection.subscribeMessage = (async (cb: (e: { type: string; forecast: unknown[] }) => void, msg: { type: string; entity_id?: string; forecast_type?: string }) => {
    if (msg.type === 'weather/subscribe_forecast') {
      asked.push({ entity: msg.entity_id ?? '', type: msg.forecast_type ?? '' });
      const forecast = msg.forecast_type === 'hourly' ? hourlyData() : daily;
      setTimeout(() => cb({ type: msg.forecast_type ?? 'daily', forecast }), 0);
    }
    return () => undefined;
  }) as never;
  return { hass, asked };
}

// the configuration warning is drawn in its own element, which allText() does not read
const html = (el: HTMLElement) => el.shadowRoot?.innerHTML ?? '';
const columns = (el: HTMLElement) => el.shadowRoot?.querySelectorAll('.daily-forecast-horiz-section [class*=day]').length ?? 0;
const points = (el: HTMLElement, n = 0) => {
  const p = el.shadowRoot?.querySelectorAll('svg polyline')[n]?.getAttribute('points')?.trim() ?? '';
  return p ? p.split(/\s+/).length : 0;
};

async function mount(config: Record<string, unknown>, states = {}, daily?: unknown[]) {
  const { hass, asked } = provider(states, daily);
  const el = (await renderCard(baseConfig(config as never), hass)) as HTMLElement;
  return { el, asked };
}

const strip = { section_order: ['daily_forecast'], weather_entity: DAILY, daily_forecast_layout: 'horizontal', daily_forecast_days: 5, option_show_current_day: false, show_section_daily_forecast: true };

describe('a weather_entity on its own', () => {
  it('draws the days from the configuration posted in #24, as posted', async () => {
    const { el } = await mount(issue24Config);
    expect(columns(el), 'the daily strip is empty').toBeGreaterThan(0);
  });

  it('draws the days with nothing but a weather_entity and the daily type', async () => {
    const { el } = await mount({ ...strip, forecast_type: 'daily' });
    expect(columns(el)).toBeGreaterThan(0);
  });

  it('does so by treating the six _1 keys as the weather entity — in memory, not in the stored configuration', async () => {
    const stored: Record<string, unknown> = { ...strip, forecast_type: 'daily' };
    const { el } = await mount(stored);
    const inside = (el as unknown as { _config: Record<string, unknown> })._config;
    for (const k of SIX) expect(inside[k], k).toBe(DAILY);
    for (const k of SIX) expect(stored[k], `${k} was written into the user's configuration`).toBeUndefined();
  });

  it('does not make warnings of the keys it supplied', async () => {
    // A provider with no precipitation probability: for a key the user set that
    // earns a warning, for one the card filled in on its own it must not.
    const noPop = makeForecast(6, 0).map(({ precipitation_probability: _p, ...rest }: Record<string, unknown>) => rest);
    const { el } = await mount({ ...strip, forecast_type: 'daily' }, {}, noPop);
    expect(html(el)).not.toContain('attribute forecast[1]');
    const { el: explicit } = await mount({ ...strip, forecast_type: 'daily', ...Object.fromEntries(SIX.map((k) => [k, DAILY])) }, {}, noPop);
    expect(html(explicit), 'the warning for a key the user set has gone').toContain('entity_pop_1 attribute forecast[1]');
  });
});

describe('the per-day keys that are the user\'s own are left alone', () => {
  const sensors: Record<string, { state: string; attributes?: Record<string, unknown> }> = {};
  for (let i = 1; i <= 5; i++) {
    sensors[`sensor.icon_${i}`] = { state: 'cloudy' };
    sensors[`sensor.max_${i}`] = { state: String(15 + i), attributes: { unit_of_measurement: '°C' } };
    sensors[`sensor.min_${i}`] = { state: String(5 + i), attributes: { unit_of_measurement: '°C' } };
  }

  it('when they are sensors', async () => {
    const { el } = await mount({ ...strip, forecast_type: 'daily', entity_forecast_icon_1: 'sensor.icon_1', entity_forecast_max_1: 'sensor.max_1', entity_forecast_min_1: 'sensor.min_1' }, sensors);
    const inside = (el as unknown as { _config: Record<string, unknown> })._config;
    expect(inside.entity_forecast_icon_1).toBe('sensor.icon_1');
    expect(inside.entity_summary_1).toBeUndefined();
    expect(columns(el)).toBeGreaterThan(0);
  });

  it('when only some are set, even to a weather entity', async () => {
    const { el } = await mount({ ...strip, forecast_type: 'daily', entity_forecast_max_1: DAILY });
    const inside = (el as unknown as { _config: Record<string, unknown> })._config;
    expect(inside.entity_forecast_icon_1, 'filled in around a key the user chose').toBeUndefined();
    expect(inside.entity_forecast_max_1).toBe(DAILY);
  });

  it('when there is no weather_entity at all', async () => {
    const { el } = await mount({ section_order: ['daily_forecast'], forecast_type: 'daily' });
    const inside = (el as unknown as { _config: Record<string, unknown> })._config;
    for (const k of SIX) expect(inside[k], k).toBeUndefined();
  });
});

describe('forecast_type: hourly on the strip', () => {
  it('asks Home Assistant for the daily forecast, which is the only one the strip can use', async () => {
    const { asked } = await mount({ ...strip, forecast_type: 'hourly', ...Object.fromEntries(SIX.map((k) => [k, DAILY])) });
    const forStrip = asked.filter((a) => a.entity === DAILY).map((a) => a.type);
    expect(forStrip, 'the strip was given hourly data').toEqual(['daily']);
  });

  it('draws the days even with the six keys set, which is the other half of #24', async () => {
    const { el } = await mount({ ...strip, forecast_type: 'hourly', ...Object.fromEntries(SIX.map((k) => [k, DAILY])) });
    expect(columns(el)).toBeGreaterThan(0);
  });

  it('leaves twice_daily as it was', async () => {
    const { asked } = await mount({ ...strip, forecast_type: 'twice_daily' });
    expect(asked.filter((a) => a.entity === DAILY).map((a) => a.type)).toEqual(['twice_daily']);
  });

  it('leaves the hourly view its own subscription, to its own entity', async () => {
    const { asked } = await mount({ ...strip, forecast_type: 'hourly', entity_hourly: HOURLY, show_section_hourly_forecast: true });
    expect(asked.filter((a) => a.entity === HOURLY).map((a) => a.type)).toEqual(['hourly']);
  });

  it('feeds the charts the daily forecast too', async () => {
    const { el } = await mount({ ...strip, forecast_type: 'hourly', show_section_charts: true, option_show_temperature_chart: true });
    expect(points(el, 0), 'no temperature line').toBeGreaterThan(1);
  });
});

describe('the editor and forecast_type', () => {
  interface Ed extends HTMLElement { setConfig: (c: Record<string, unknown>) => void; hass: unknown; updateComplete: Promise<unknown>; _sectionDailyForecastEditor: () => unknown }
  async function select(config: Record<string, unknown>) {
    const el = document.createElement('platinum-weather-card-plus-charts-editor') as Ed;
    // a configuration without a version is treated as old and migrated, which drops keys
    el.setConfig({ card_config_version: 8, ...config });
    el.hass = makeHass({ [DAILY]: { state: 'sunny' } });
    document.body.appendChild(el);
    await el.updateComplete;
    const box = document.createElement('div');
    render(el._sectionDailyForecastEditor() as never, box);
    const sel = [...box.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'twice_daily'))!;
    return sel;
  }

  it('no longer offers hourly, which the strip cannot use', async () => {
    const sel = await select({ weather_entity: DAILY, forecast_type: 'daily' });
    expect([...sel.options].map((o) => o.value)).not.toContain('hourly');
  });

  it('shows daily for a configuration that still says hourly, rather than a blank', async () => {
    const sel = await select({ weather_entity: DAILY, forecast_type: 'hourly' });
    expect(sel.value).toBe('daily');
  });
});
