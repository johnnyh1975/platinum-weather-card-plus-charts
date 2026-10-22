import { describe, it, expect } from 'vitest';
import '../src/platinum-weather-card';
import { makeHass } from './helpers';

type CardClass = { getStubConfig: (...a: unknown[]) => Record<string, unknown> };
const Card = () => customElements.get('platinum-weather-card-plus-charts') as unknown as CardClass;

describe('getStubConfig', () => {
  it('prefers a weather entity no other card uses', () => {
    const stub = Card().getStubConfig(undefined, ['light.x', 'weather.unused'], ['weather.used', 'weather.unused']);
    expect(stub.weather_entity).toBe('weather.unused');
    expect(stub.entity_temperature).toBe('weather.unused');
    expect(stub.entity_forecast_icon).toBe('weather.unused');
    expect(stub.forecast_type).toBe('daily');
  });

  it('falls back to any weather entity', () => {
    expect(Card().getStubConfig(undefined, [], ['sensor.a', 'weather.any']).weather_entity).toBe('weather.any');
  });

  it('falls back to hass.states when no lists are passed', () => {
    const hass = makeHass({ 'weather.from_states': { state: 'sunny' } });
    expect(Card().getStubConfig(hass).weather_entity).toBe('weather.from_states');
  });

  it('always carries a section_order, so the card is never an empty frame', () => {
    const stub = Card().getStubConfig(undefined, [], ['sensor.a']);
    expect(stub.weather_entity).toBeUndefined();
    expect(stub.section_order).toEqual(['warnings', 'overview', 'extended', 'slots', 'daily_forecast', 'charts']);
  });

  it('passes the card’s own validation', () => {
    const el = document.createElement('platinum-weather-card-plus-charts') as HTMLElement & { setConfig: (c: unknown) => void };
    expect(() => el.setConfig({ type: 'custom:platinum-weather-card-plus-charts', ...Card().getStubConfig(undefined, [], ['weather.x']) })).not.toThrow();
  });
});
