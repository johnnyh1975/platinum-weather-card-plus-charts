import { describe, it, expect } from 'vitest';
import '../src/platinum-weather-card';
import { makeHass, baseConfig, renderCard } from './helpers';

// A card driven by per-day sensors (entity_forecast_*_1 with a trailing number,
// the way the original Platinum card was configured) has no weather entity and so
// no forecast array. The charts used to read only that array, and drew nothing,
// silently, while the forecast strip beside them worked (#23, second report).

type State = { state: string; attributes?: Record<string, unknown> };

function sensors(days = 5, over: Record<string, State> = {}) {
  const st: Record<string, State> = {};
  for (let i = 1; i <= days; i++) {
    st[`sensor.icon_${i}`] = { state: 'cloudy' };
    st[`sensor.max_${i}`] = { state: String(15 + i), attributes: { unit_of_measurement: '°C' } };
    st[`sensor.min_${i}`] = { state: String(5 + i), attributes: { unit_of_measurement: '°C' } };
    st[`sensor.pos_${i}`] = { state: i === 1 ? '0' : `0.${i}`, attributes: { unit_of_measurement: 'mm' } };
    st[`sensor.sum_${i}`] = { state: 'Cloudy' };
  }
  return { ...st, ...over };
}

async function mount(states: Record<string, State>, extra: Record<string, unknown> = {}, drop: string[] = []) {
  const cfg: Record<string, unknown> = {
    section_order: ['daily_forecast'],
    entity_forecast_icon_1: 'sensor.icon_1',
    entity_forecast_max_1: 'sensor.max_1',
    entity_forecast_min_1: 'sensor.min_1',
    entity_pos_1: 'sensor.pos_1',
    entity_summary_1: 'sensor.sum_1',
    daily_forecast_layout: 'horizontal',
    daily_forecast_days: 5,
    option_show_current_day: true,
    show_section_charts: true,
    option_show_temperature_chart: true,
    option_show_precipitation_chart: true,
    ...extra,
  };
  for (const k of drop) delete cfg[k];
  return (await renderCard(baseConfig(cfg as never), makeHass(states))) as HTMLElement;
}

const points = (el: HTMLElement, nth = 0) => {
  const line = el.shadowRoot?.querySelectorAll('svg polyline')[nth];
  const pts = line?.getAttribute('points') ?? '';
  return pts.trim() ? pts.trim().split(/\s+/).length : 0;
};
const html = (el: HTMLElement) => el.shadowRoot?.innerHTML ?? '';

describe('the charts with per-day sensors and no weather entity', () => {
  it('draw the max and min temperature lines, a point per day', async () => {
    const el = await mount(sensors());
    expect(points(el, 0), 'no maximum line').toBe(5);
    expect(points(el, 1), 'no minimum line').toBe(5);
  });

  it('draw the rain, labelled in the sensor\'s own unit', async () => {
    const el = await mount(sensors());
    expect(html(el)).toContain('0.4 mm');
    expect(html(el)).not.toContain('NaN');
  });

  it('stop where the strip stops: a day without an icon sensor is not a day', async () => {
    const st = sensors(5);
    delete (st as Record<string, State>)['sensor.icon_4'];
    delete (st as Record<string, State>)['sensor.icon_5'];
    const el = await mount(st);
    expect(points(el, 0)).toBe(3);
  });

  it('lose only the day whose sensor is unavailable, not the whole line', async () => {
    const el = await mount(sensors(5, { 'sensor.max_3': { state: 'unavailable' } }));
    expect(points(el, 0), 'one gap took the line with it').toBe(4);
    expect(points(el, 1)).toBe(5);
  });

  it('are not poisoned by a rain sensor that is unavailable', async () => {
    const el = await mount(sensors(5, { 'sensor.pos_2': { state: 'unavailable' } }));
    expect(html(el)).not.toContain('NaN');
    expect(html(el), 'the other days lost their bars').toContain('0.3 mm');
  });

  it('leave out the rain chart when there is no rain sensor to draw it from', async () => {
    const el = await mount(sensors(), {}, ['entity_pos_1']);
    expect(points(el, 0)).toBe(5);
    // the 0 mm dash is the only thing the rain chart draws for a dry day
    expect(html(el), 'a rain chart of nothing but zeroes').not.toContain('151,230,255');
  });

  it('leave out the temperature chart when there is no maximum sensor to draw it from', async () => {
    const el = await mount(sensors(), {}, ['entity_forecast_max_1']);
    expect(points(el, 0)).toBe(0);
    expect(html(el)).toContain('0.4 mm');
  });

  it('read the date from the day, so the hover tooltip has one', async () => {
    const el = await mount(sensors());
    // the strip has a tooltip per day and the chart another per day on top
    const blocks = [...(el.shadowRoot?.querySelectorAll('.fcasttooltipblock') ?? [])];
    expect(blocks.length, 'no chart tooltips').toBe(10);
    const today = new Date().toLocaleDateString(undefined, { weekday: 'long' });
    expect(blocks[5].textContent).toContain(today);
  });
});
