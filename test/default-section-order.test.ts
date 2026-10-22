import { describe, it, expect } from 'vitest';
import '../src/platinum-weather-card';
import { makeHass, renderCard } from './helpers';
import type { WeatherCardConfig } from '../src/types';

// A card written in YAML rather than through the editor has no section_order.
// It used to render an empty ha-card with nothing to say why.

const hass = () => makeHass({
  'sensor.temp': { state: '7.6', attributes: { unit_of_measurement: '°C' } },
});

type Card = HTMLElement & { _config: Record<string, unknown> };

describe('section_order left out', () => {
  it('falls back to the documented default order', async () => {
    const el = await renderCard({ type: 'custom:platinum-weather-card-plus-charts', entity_temperature: 'sensor.temp' } as unknown as WeatherCardConfig, hass());
    expect((el as Card)._config.section_order).toEqual(['warnings', 'overview', 'extended', 'slots', 'daily_forecast', 'charts']);
  });

  it('draws the sections rather than an empty card', async () => {
    const el = await renderCard({ type: 'custom:platinum-weather-card-plus-charts', entity_temperature: 'sensor.temp' } as unknown as WeatherCardConfig, hass());
    expect(el.shadowRoot?.querySelector('.overview-section')).not.toBeNull();
    expect(el.shadowRoot?.querySelector('#current-temp-text')?.textContent).toBe('8');
  });

  it('is not written into the stored configuration', async () => {
    const stored = { type: 'custom:platinum-weather-card-plus-charts' } as Record<string, unknown>;
    await renderCard(stored as unknown as WeatherCardConfig, hass());
    expect(stored.section_order).toBeUndefined();
  });

  it('leaves an explicit order alone, including a shortened one', async () => {
    const el = await renderCard({ type: 'custom:platinum-weather-card-plus-charts', section_order: ['overview'] } as unknown as WeatherCardConfig, hass());
    expect((el as Card)._config.section_order).toEqual(['overview']);
  });
});
