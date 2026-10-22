import { describe, it, expect } from 'vitest';
import '../src/platinum-weather-card';
import { makeHass, makeForecast, renderCard, warnings } from './helpers';
import type { WeatherCardConfig } from '../src/types';

// Sensors on the weather entity's device fill the readings the weather entity
// itself does not carry. The fixture is a real DWD (FL550) station: its weather
// entity reports temperature, humidity, pressure, wind speed/bearing, visibility
// and UV, but no dew point, apparent temperature, gusts or cloud cover — and its
// sensors have German entity ids with stable English translation keys.

const W = 'weather.nuernberg';
const DEV = 'dev-nbg';
const ALL = ['warnings', 'overview', 'extended', 'slots', 'daily_forecast', 'charts'];

type Reg = Record<string, { entity_id: string; device_id?: string; translation_key?: string; entity_category?: string | null }>;
type States = Record<string, { state: string; attributes?: Record<string, unknown> }>;

const dwdSensors: Array<[string, string, string, string | undefined, string]> = [
  // entity id, translation_key, state, device_class, unit
  ['sensor.nuernberg_temperatur', 'temperature', '7.6', 'temperature', '°C'],
  ['sensor.nuernberg_taupunkt', 'dewpoint', '4.8', 'temperature', '°C'],
  ['sensor.nuernberg_druck', 'pressure', '1020.3', 'pressure', 'hPa'],
  ['sensor.nuernberg_windboen', 'wind_gusts', '24.0', 'wind_speed', 'km/h'],
  ['sensor.nuernberg_niederschlag', 'precipitation', '0.0', 'precipitation_intensity', 'mm/h'],
  ['sensor.nuernberg_niederschlagswahrscheinlichkeit', 'precipitation_probability', '9', undefined, '%'],
  ['sensor.nuernberg_bewolkungsgrad', 'cloud_coverage', '79', undefined, '%'],
  ['sensor.nuernberg_sichtweite', 'visibility', '47.7', 'distance', 'km'],
  ['sensor.nuernberg_sonneneinstrahlung', 'sun_irradiance', '7', 'irradiance', 'W/m²'],
  ['sensor.nuernberg_relative_luftfeuchtigkeit', 'humidity', '83.1', 'humidity', '%'],
  ['sensor.nuernberg_uv_index', 'uv_index', '2', undefined, ''],
  ['sensor.nuernberg_radar_niederschlag_aktuell', 'radar_precipitation_now', '0.0', 'precipitation_intensity', 'mm/h'],
];

function station(opts: { drop?: string[]; extraStates?: States; extraReg?: Reg; weatherAttrs?: Record<string, unknown>; noRegistry?: boolean } = {}) {
  const states: States = {
    [W]: { state: 'cloudy', attributes: { temperature: 7.6, humidity: 83, pressure: 1020, wind_speed: 11, wind_bearing: 250, visibility: 47.7, uv_index: 2, temperature_unit: '°C', ...opts.weatherAttrs } },
    'sun.sun': { state: 'above_horizon', attributes: { elevation: 20 } },
  };
  const entities: Reg = { [W]: { entity_id: W, device_id: DEV } };
  for (const [id, tk, state, dc, unit] of dwdSensors) {
    if (opts.drop?.includes(id)) continue;
    states[id] = { state, attributes: { unit_of_measurement: unit, ...(dc ? { device_class: dc } : {}), friendly_name: id } };
    entities[id] = { entity_id: id, device_id: DEV, translation_key: tk };
  }
  Object.assign(states, opts.extraStates);
  Object.assign(entities, opts.extraReg);
  const hass = makeHass(states, opts.noRegistry ? {} : { entities });
  hass.connection.subscribeMessage = (async (cb: (e: { type: string; forecast: unknown[] }) => void, msg: { type: string }) => {
    if (msg.type === 'weather/subscribe_forecast') setTimeout(() => cb({ type: 'daily', forecast: makeForecast(6, 0) }), 0);
    return () => undefined;
  }) as never;
  return hass;
}

const cfg = (extra: Record<string, unknown> = {}) =>
  ({ type: 'custom:platinum-weather-card-plus-charts', weather_entity: W, section_order: ALL, ...extra }) as unknown as WeatherCardConfig;

type Card = HTMLElement & { _config: Record<string, unknown>; hass: unknown; updateComplete: Promise<unknown> };
const conf = (el: HTMLElement) => (el as Card)._config;

describe('sensors on the weather entity\'s device — a DWD station', () => {
  it('fills the readings the weather entity lacks', async () => {
    const el = await renderCard(cfg(), station());
    expect(conf(el).entity_dew_point).toBe('sensor.nuernberg_taupunkt');
    expect(conf(el).entity_wind_gust).toBe('sensor.nuernberg_windboen');
    expect(conf(el).entity_cloud_cover).toBe('sensor.nuernberg_bewolkungsgrad');
    expect(warnings(el)).toEqual([]);
  });

  it('keeps the weather entity for readings it does carry', async () => {
    const el = await renderCard(cfg(), station());
    for (const k of ['entity_temperature', 'entity_humidity', 'entity_pressure', 'entity_visibility', 'entity_uv_index']) {
      expect(conf(el)[k], k).toBe(W);
    }
  });

  it('uses the sensor when the weather entity stops reporting an attribute', async () => {
    const el = await renderCard(cfg(), station({ weatherAttrs: { humidity: undefined } }));
    expect(conf(el).entity_humidity).toBe('sensor.nuernberg_relative_luftfeuchtigkeit');
  });

  it('shows the gust from the sensor on the card', async () => {
    const el = await renderCard(cfg({ section_order: ['slots'], slot_l1: 'wind_gust' }), station());
    expect(el.shadowRoot?.querySelector('[data-slot="wind_gust"]')?.textContent).toContain('24');
  });

  it('never assigns rain rate or solar radiation — the card treats those as instruments', async () => {
    const el = await renderCard(cfg(), station());
    expect(conf(el).entity_rain_rate).toBeUndefined();
    expect(conf(el).entity_solar_radiation).toBeUndefined();
    expect(conf(el).entity_rainfall).toBeUndefined();
  });

  it('a sensor the user chose wins', async () => {
    const el = await renderCard(cfg({ entity_dew_point: 'sensor.garden_dew' }),
      station({ extraStates: { 'sensor.garden_dew': { state: '3.0', attributes: { unit_of_measurement: '°C' } } } }));
    expect(conf(el).entity_dew_point).toBe('sensor.garden_dew');
  });

  it('can be switched off', async () => {
    const el = await renderCard(cfg({ option_discover_sensors: false }), station());
    expect(conf(el).entity_dew_point).toBeUndefined();
    expect(conf(el).entity_wind_gust).toBeUndefined();
  });

  it('ignores sensors on other devices and diagnostic sensors', async () => {
    const el = await renderCard(cfg(), station({
      drop: ['sensor.nuernberg_taupunkt'],
      extraStates: {
        'sensor.other_dewpoint': { state: '1', attributes: { device_class: 'temperature', unit_of_measurement: '°C' } },
        'sensor.nuernberg_dewpoint_diag': { state: '1', attributes: { device_class: 'temperature', unit_of_measurement: '°C' } },
      },
      extraReg: {
        'sensor.other_dewpoint': { entity_id: 'sensor.other_dewpoint', device_id: 'elsewhere', translation_key: 'dewpoint' },
        'sensor.nuernberg_dewpoint_diag': { entity_id: 'sensor.nuernberg_dewpoint_diag', device_id: DEV, translation_key: 'dewpoint', entity_category: 'diagnostic' },
      },
    }));
    expect(conf(el).entity_dew_point).toBeUndefined();
  });

  it('writes nothing back into the stored configuration', async () => {
    const stored = cfg() as unknown as Record<string, unknown>;
    await renderCard(stored as unknown as WeatherCardConfig, station());
    expect(stored.entity_dew_point).toBeUndefined();
    expect(stored.entity_wind_gust).toBeUndefined();
  });

  it('does nothing without an entity registry (older Home Assistant)', async () => {
    const el = await renderCard(cfg(), station({ noRegistry: true }));
    expect(conf(el).entity_dew_point).toBeUndefined();
  });

  it('lets go of a sensor that disappears (disabled or removed)', async () => {
    const el = (await renderCard(cfg(), station())) as Card;
    expect(conf(el).entity_dew_point).toBe('sensor.nuernberg_taupunkt');
    el.hass = station({ drop: ['sensor.nuernberg_taupunkt'] });
    await el.updateComplete;
    expect(conf(el).entity_dew_point).toBeUndefined();
  });
});

describe('integrations without translation keys', () => {
  const plain = (sensors: Array<[string, string, string]>) => {
    const extraStates: States = {};
    const extraReg: Reg = {};
    for (const [id, dc, name] of sensors) {
      extraStates[id] = { state: '5', attributes: { device_class: dc, unit_of_measurement: '°C', friendly_name: name } };
      extraReg[id] = { entity_id: id, device_id: DEV };
    }
    return station({ drop: dwdSensors.map((s) => s[0]), extraStates, extraReg });
  };

  it('match by device class and name', async () => {
    const el = await renderCard(cfg(), plain([['sensor.home_dew_point', 'temperature', 'Home Dew point'], ['sensor.home_feels_like', 'temperature', 'Home Feels like']]));
    expect(conf(el).entity_dew_point).toBe('sensor.home_dew_point');
    expect(conf(el).entity_apparent_temp).toBe('sensor.home_feels_like');
  });

  it('assign nothing when two sensors fit equally well', async () => {
    const el = await renderCard(cfg(), plain([['sensor.a_dew_point', 'temperature', 'A Dew point'], ['sensor.b_dew_point', 'temperature', 'B Dew point']]));
    expect(conf(el).entity_dew_point).toBeUndefined();
  });
});
