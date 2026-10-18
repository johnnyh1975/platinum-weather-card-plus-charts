import { describe, it, expect } from 'vitest';
import '../src/platinum-weather-card';
import { makeHass, baseConfig, renderCard } from './helpers';

// The hourly subscription is the one place the card writes reactive state from
// inside updated(). A condition that is never satisfied there does not fail a
// test that reads the source; it freezes a browser tab. So these run the card.

const HOURLY = 'weather.hourly';

// Counts hourly subscriptions, and pulls the entity out from under the card
// after `limit` of them so that a runaway loop ends instead of hanging the run.
function watch(hass: ReturnType<typeof makeHass>, limit = 40) {
  const counter = { hourly: 0, runaway: false };
  const original = hass.connection.subscribeMessage;
  hass.connection.subscribeMessage = (async (cb: never, msg: { type: string; forecast_type?: string }) => {
    if (msg.type === 'weather/subscribe_forecast' && msg.forecast_type === 'hourly') {
      counter.hourly += 1;
      if (counter.hourly > limit) {
        counter.runaway = true;
        delete (hass.states as Record<string, unknown>)[HOURLY];
      }
    }
    return original(cb, msg as never);
  }) as typeof original;
  return counter;
}

async function settle(el: HTMLElement & { updateComplete: Promise<unknown> }) {
  for (let i = 0; i < 12; i++) {
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
  }
}

describe('subscribing to the hourly forecast', () => {
  it('subscribes once, not in a loop, when there is no weather_entity (#23)', async () => {
    // Daily data from per-day sensors, so _subscribed is never set — and the
    // hourly subscription used to be re-issued on every update because of it.
    const hass = makeHass({ [HOURLY]: { state: 'cloudy' } });
    const count = watch(hass);
    const el = (await renderCard(
      baseConfig({
        section_order: ['overview', 'daily_forecast'],
        entity_hourly: HOURLY,
        show_section_hourly_forecast: true,
      } as never),
      hass,
    )) as HTMLElement & { updateComplete: Promise<unknown> };
    await settle(el);
    expect(count.runaway, 'the hourly subscription was re-issued without end').toBe(false);
    expect(count.hourly).toBe(1);
  });

  it('does not loop on the legacy forecast type either', async () => {
    // _needForecastSubscription() is false there too, so _subscribed stays unset.
    const hass = makeHass({ [HOURLY]: { state: 'cloudy' }, 'weather.home': { state: 'cloudy' } });
    const count = watch(hass);
    const el = (await renderCard(
      baseConfig({
        section_order: ['overview', 'daily_forecast'],
        weather_entity: 'weather.home',
        forecast_type: 'legacy',
        entity_hourly: HOURLY,
        show_section_hourly_forecast: true,
      } as never),
      hass,
    )) as HTMLElement & { updateComplete: Promise<unknown> };
    await settle(el);
    expect(count.runaway).toBe(false);
    expect(count.hourly).toBe(1);
  });

  it('still subscribes once with a weather_entity, as before', async () => {
    const hass = makeHass({ [HOURLY]: { state: 'cloudy' }, 'weather.home': { state: 'cloudy' } });
    const count = watch(hass);
    const el = (await renderCard(
      baseConfig({
        section_order: ['overview', 'daily_forecast'],
        weather_entity: 'weather.home',
        forecast_type: 'daily',
        entity_hourly: HOURLY,
        show_section_hourly_forecast: true,
      } as never),
      hass,
    )) as HTMLElement & { updateComplete: Promise<unknown> };
    await settle(el);
    expect(count.hourly).toBe(1);
  });

  it('subscribes once the hourly entity appears, if it was not there at first', async () => {
    // Home Assistant can hand the card its states before an integration has
    // loaded. Subscribing only once, up front, would leave the hours empty for good.
    const hass = makeHass({});
    const count = watch(hass);
    const el = (await renderCard(
      baseConfig({
        section_order: ['overview', 'daily_forecast'],
        entity_hourly: HOURLY,
        show_section_hourly_forecast: true,
      } as never),
      hass,
    )) as HTMLElement & { updateComplete: Promise<unknown>; hass: unknown };
    await settle(el);
    expect(count.hourly).toBe(0);
    const later = makeHass({ [HOURLY]: { state: 'cloudy' } });
    const count2 = watch(later);
    el.hass = later;
    await settle(el);
    expect(count2.runaway).toBe(false);
    expect(count2.hourly).toBe(1);
  });
});
