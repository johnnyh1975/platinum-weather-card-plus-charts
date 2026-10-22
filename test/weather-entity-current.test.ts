import { describe, it, expect } from 'vitest';
import '../src/platinum-weather-card';
import { makeHass, makeForecast, renderCard, allText, warnings } from './helpers';
import type { WeatherCardConfig } from '../src/types';

// The daily strip already treats a lone weather_entity as its source (#24). The
// current conditions now do the same: temperature, icon and the slots are read
// from the entity's attributes unless the user has set a source of their own.

const W = 'weather.home';
const ALL = ['warnings', 'overview', 'extended', 'slots', 'daily_forecast', 'charts'];

function hassWith(attrs: Record<string, unknown>, extra: Record<string, { state: string; attributes?: Record<string, unknown> }> = {}) {
  const hass = makeHass({
    [W]: { state: 'cloudy', attributes: { temperature_unit: '°C', ...attrs } },
    'sun.sun': { state: 'above_horizon', attributes: { elevation: 20, next_rising: '2026-10-23T06:30:00+00:00', next_setting: '2026-10-22T16:20:00+00:00' } },
    ...extra,
  });
  hass.connection.subscribeMessage = (async (cb: (e: { type: string; forecast: unknown[] }) => void, msg: { type: string }) => {
    if (msg.type === 'weather/subscribe_forecast') setTimeout(() => cb({ type: 'daily', forecast: makeForecast(6, 0) }), 0);
    return () => undefined;
  }) as never;
  return hass;
}

const cfg = (extra: Record<string, unknown> = {}) =>
  ({ type: 'custom:platinum-weather-card-plus-charts', weather_entity: W, section_order: ALL, ...extra }) as unknown as WeatherCardConfig;

type Card = HTMLElement & { _config: Record<string, unknown> };

describe('a weather_entity as the source of the current conditions', () => {
  it('reads temperature, humidity and pressure from the entity', async () => {
    const el = await renderCard(cfg({ slot_l1: 'humidity', slot_l2: 'pressure' }),
      hassWith({ temperature: 7.6, humidity: 83, pressure: 1020 }));
    const text = allText(el);
    expect(el.shadowRoot?.querySelector('#current-temp-text')?.textContent).toBe('8');
    expect(text).toContain('83');
    expect(text).toContain('1,020');
    expect(warnings(el)).toEqual([]);
  });

  it('takes the condition icon and text from the entity state', async () => {
    const el = await renderCard(cfg(), hassWith({ temperature: 7.6 }));
    expect((el as Card)._config.entity_forecast_icon).toBe(W);
    expect((el as Card)._config.entity_summary).toBe(W);
  });

  it('does not invent a feels-like line the provider has no data for', async () => {
    const el = await renderCard(cfg(), hassWith({ temperature: 7.6 }));
    expect((el as Card)._config.entity_apparent_temp).toBeUndefined();
    expect(el.shadowRoot?.querySelector('.apparent-temp')).toBeNull();
  });

  it('shows it when the provider does report one', async () => {
    const el = await renderCard(cfg(), hassWith({ temperature: 7.6, apparent_temperature: 5.2 }));
    expect(el.shadowRoot?.querySelector('.apparent-temp')?.textContent).toContain('5');
  });

  it('defaults the sun to sun.sun', async () => {
    const el = await renderCard(cfg(), hassWith({ temperature: 7.6 }));
    expect((el as Card)._config.entity_sun).toBe('sun.sun');
  });

  it('reads the UV index from the weather attribute', async () => {
    const el = await renderCard(cfg({ section_order: ['slots'], slot_l1: 'uv_index' }), hassWith({ uv_index: 6.4 }));
    expect(el.shadowRoot?.querySelector('[data-slot="uv_index"]')?.textContent).toContain('6');
  });

  // The comfort word sits under the feels-like line, so the provider needs one.
  it('reads the dew point from the weather attribute', async () => {
    const el = await renderCard(cfg({ option_show_comfort: true }), hassWith({ temperature: 22, apparent_temperature: 24, dew_point: 22 }));
    expect(el.shadowRoot?.querySelector('.comfort')).not.toBeNull();
  });

  it('keeps a sensor the user chose', async () => {
    const el = await renderCard(cfg({ entity_temperature: 'sensor.garden' }),
      hassWith({ temperature: 7.6 }, { 'sensor.garden': { state: '12.3', attributes: { unit_of_measurement: '°C' } } }));
    expect((el as Card)._config.entity_temperature).toBe('sensor.garden');
    expect(el.shadowRoot?.querySelector('#current-temp-text')?.textContent).toBe('12');
  });

  it('writes nothing back into the stored configuration', async () => {
    const stored = cfg() as unknown as Record<string, unknown>;
    await renderCard(stored as unknown as WeatherCardConfig, hassWith({ temperature: 7.6, humidity: 83 }));
    expect(stored.entity_temperature).toBeUndefined();
    expect(stored.entity_sun).toBeUndefined();
  });

  it('fills nothing in without a weather_entity', async () => {
    const el = await renderCard({ type: 'custom:platinum-weather-card-plus-charts', section_order: ALL } as unknown as WeatherCardConfig, hassWith({ temperature: 7.6 }));
    expect((el as Card)._config.entity_temperature).toBeUndefined();
  });
});
