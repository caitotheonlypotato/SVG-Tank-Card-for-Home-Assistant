// svg-tank-card.js
// Custom Lovelace card: SVG rainwater tank with animated water level,
// optional horizontal ribs, side valve, top inlet & overflow pipes,
// percentage scale, and inflow/overflow stream animations driven by
// a rain/flow sensor.
//
// Install:
//   1. Copy this file to /config/www/svg-tank-card.js
//   2. Settings -> Dashboards -> Resources -> Add resource
//        URL: /local/svg-tank-card.js   Type: JavaScript module
//   3. Add the card (search "Tank") or use YAML:
//
// type: custom:svg-tank-card
// entity: sensor.gympie_tank_exact_level
// full_value: 100
// name: Gympie Water Tank
// top_margin: 12
// wave_motion: true
// show_scale: true
// show_top_outlet: true
// show_top_inlet: true
// show_inflow: true
// inflow_entity: sensor.rain_rate          # >0 triggers inflow animation
// wave_color: '#1d6fbf'
// wave_color_light: '#4aa3e0'
// tank_color: '#3a3a3a'
// show_bottom_left: true
// bottom_left_entity: sensor.gw1100c_gutter_battery
// bottom_left_label: ''                      # optional; blank = friendly name
// bottom_left_text_color: '#ffffff'
// bottom_left_bg_color: '#2a2a2a'           # used for 'other' entities
// bottom_left_on_text: 'Wet'                # binary sensors only
// bottom_left_off_text: 'Dry'
// bottom_left_on_bg_color: '#8b0000'
// bottom_left_off_bg_color: '#006400'
// bottom_left_battery_green_at: 50          # battery sensors only
// bottom_left_battery_amber_at: 20
// show_bottom_right: false
// bottom_right_entity: ''
// bottom_right_label: ''
// bottom_right_text_color: '#ffffff'
// bottom_right_bg_color: '#2a2a2a'
// height_factor: 1.2                        # 1 = natural height; extra space added at the bottom
// show_rain_daily: true
// rain_daily_entity: sensor.rain_since_midnight
// rain_daily_label: ''                      # optional; blank = sensor friendly name
// show_rain_rate: true
// rain_rate_entity: sensor.rain_rate        # blank = inflow_entity
// rain_rate_label: ''
// show_rain_max: true
// rain_max_entity: sensor.rain_max_rate
// rain_max_label: ''
// valves:
//   - entity: switch.xxx
//     name: North Valve
//     background_color: '#222222'                # fallback when no image set for the current state
//     background_image_on: /local/valve_north_on.jpg    # shown while entity state is "on"
//     background_image_off: /local/valve_north_off.jpg  # shown while entity state is "off"
//     state_map:                                  # optional, overrides default "Valve open/closed" text
//       "off": "To Tank"
//       "on": "To Street"

const WAVE_PERIOD = 120;
const WAVE_TOP = 4;
const WAVE_CREST = -11;
const WAVE_TROUGH = 19;
const HOLD_MS = 500;

function buildWavePath({ leftX, rightX, baseY = WAVE_TOP, closeToY = null }) {
  const start = Math.floor(leftX / WAVE_PERIOD) * WAVE_PERIOD - WAVE_PERIOD;
  const end = Math.ceil(rightX / WAVE_PERIOD) * WAVE_PERIOD + WAVE_PERIOD;
  let d = `M${start},${baseY}`;
  for (let x = start; x < end; x += WAVE_PERIOD) {
    const c1 = x + WAVE_PERIOD / 3;
    const c2 = x + (WAVE_PERIOD * 2) / 3;
    const nx = x + WAVE_PERIOD;
    d += ` C${c1},${baseY + WAVE_CREST} ${c2},${baseY + WAVE_TROUGH} ${nx},${baseY}`;
  }
  if (closeToY !== null) {
    d += ` L${end},${closeToY} L${start},${closeToY} Z`;
  }
  return d;
}

const BATTERY_COLOURS = { green: '#1b6b1b', amber: '#b07d00', red: '#a31515' };

function numOr(value, fallback) {
  if (value === '' || value === null || value === undefined) return fallback;
  const n = Number(value);
  return Number.isNaN(n) ? fallback : n;
}

// Decides how a bottom info entity is presented: binary (on/off text and colours),
// battery (automatic green/amber/red by percentage), or other (manual colour).
function bottomKind(entityId, state) {
  if (!entityId) return 'other';
  if (entityId.startsWith('binary_sensor.') || (state && (state.state === 'on' || state.state === 'off'))) {
    return 'binary';
  }
  if (state && state.attributes && !Number.isNaN(parseFloat(state.state))) {
    const a = state.attributes;
    const named = /battery/i.test(entityId) || /battery/i.test(a.friendly_name || '');
    if (a.device_class === 'battery' || (a.unit_of_measurement === '%' && named)) return 'battery';
  }
  return 'other';
}

class SvgTankCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement('svg-tank-card-editor');
  }

  static getStubConfig(hass) {
    const sensors = hass ? Object.keys(hass.states).filter((e) => e.startsWith('sensor.')) : [];
    return {
      entity: sensors[0] || '',
      name: 'Tank',
      full_value: 100,
      top_margin: 12,
      wave_motion: true,
      show_scale: true,
      cap_at_100: true,
      show_top_outlet: false,
      show_top_inlet: false,
      show_inflow: false,
      inflow_entity: '',
      wave_color: '#1d6fbf',
      wave_color_light: '#4aa3e0',
      tank_color: '#3a3a3a',
      valves: [],
    };
  }

  setConfig(config) {
    if (!config.entity) {
      throw new Error('svg-tank-card: "entity" is required (the level sensor)');
    }
    this._config = {
      full_value: 100,
      name: '',
      wave_color: '#1d6fbf',
      wave_color_light: '#4aa3e0',
      tank_color: '#3a3a3a',
      valves: [],
      top_margin: 12,
      wave_motion: true,
      show_scale: true,
      cap_at_100: true,
      show_top_outlet: false,
      show_top_inlet: false,
      show_inflow: false,
      inflow_entity: '',
      show_rain_daily: false,
      show_rain_rate: false,
      show_rain_max: false,
      height_factor: 1,
      show_bottom_left: false,
      bottom_left_text_color: '#ffffff',
      bottom_left_bg_color: '#2a2a2a',
      bottom_left_on_text: 'On',
      bottom_left_off_text: 'Off',
      bottom_left_on_bg_color: '#2a2a2a',
      bottom_left_off_bg_color: '#2a2a2a',
      bottom_left_battery_green_at: 50,
      bottom_left_battery_amber_at: 20,
      show_bottom_right: false,
      bottom_right_text_color: '#ffffff',
      bottom_right_bg_color: '#2a2a2a',
      bottom_right_on_text: 'On',
      bottom_right_off_text: 'Off',
      bottom_right_on_bg_color: '#2a2a2a',
      bottom_right_off_bg_color: '#2a2a2a',
      bottom_right_battery_green_at: 50,
      bottom_right_battery_amber_at: 20,
      ...config,
    };
    if (!this._built) {
      this._build();
    } else {
      this._built = false;
      this.shadowRoot.innerHTML = '';
      this._build();
      if (this._hass) this.hass = this._hass;
    }
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._built) return;
    this._updateLevel();
    this._updateValves();
    this._updateInflow();
    this._updateRain();
    this._updateBottom();
  }

  getCardSize() {
    const factor = Math.max(1, Number(this._config.height_factor) || 1);
    return Math.max(1, Math.round(6 * factor));
  }

  _build() {
    this._built = true;
    const root = this.shadowRoot || this.attachShadow({ mode: 'open' });
    const valves = this._config.valves || [];
    const valveHeight = this._config.valve_height;
    const valveWidth = this._config.valve_width;
    let sizeStyle = '';
    if (valveHeight) sizeStyle += `height:${valveHeight}px;`;
    if (valveWidth) sizeStyle += `width:${valveWidth}px;flex:0 0 auto;`;

    const valveButtons = valves
      .map((v, i) => {
        const bg = v.background_color || '#222222';
        return `
      <button class="valve" id="valve-${i}" data-i="${i}" style="background:${bg};${sizeStyle}">
        <div class="valve-name">${v.name || v.entity}</div>
        <i class="valve-icon" id="icon-${i}">&#9210;</i>
        <div class="valve-label" id="label-${i}">--</div>
      </button>`;
      })
      .join('');

    // Geometry
    const tankLeft = 80;
    const tankRight = 260;
    const tankTop = 30;
    const tankBottom = 250;
    const tankHeight = tankBottom - tankTop; // 220

    const marginPx = tankHeight * (this._config.top_margin / 100);
    const usableTop = tankTop + marginPx;
    const usableBottom = tankBottom;
    const usableHeight = usableBottom - usableTop;

    const fillPath = buildWavePath({ leftX: tankLeft - 20, rightX: tankRight + 20, closeToY: 280 });
    const highlightPath = buildWavePath({ leftX: tankLeft - 20, rightX: tankRight + 20 });
    const motionAttr = this._config.wave_motion
      ? `<animateTransform attributeName="transform" type="translate" attributeType="XML"
           from="0,0" to="-${WAVE_PERIOD},0" dur="6s" repeatCount="indefinite" calcMode="linear"/>`
      : '';

    const heightFactor = Math.max(1, Number(this._config.height_factor) || 1);
    const viewH = Math.round(340 * heightFactor);
    const tankColor = this._config.tank_color || '#3a3a3a';
    const tankPath = `M${tankLeft},${tankTop}
      Q${tankLeft},18 100,18
      L240,18
      Q${tankRight},18 ${tankRight},${tankTop}
      L${tankRight},${tankBottom}
      Q${tankRight},262 240,262
      L100,262
      Q${tankLeft},262 ${tankLeft},${tankBottom} Z`;

    // Scale
    let scaleSvg = '';
    if (this._config.show_scale) {
      const scaleX = 58;
      const tickLen = 8;
      const labelX = 50;
      scaleSvg += `<line x1="${scaleX}" y1="${usableTop}" x2="${scaleX}" y2="${usableBottom}"
                    stroke="#888" stroke-width="1.5" opacity="0.8"/>`;
      for (let p = 0; p <= 100; p += 10) {
        const y = usableBottom - (p / 100) * usableHeight;
        const isMajor = p % 20 === 0;
        const len = isMajor ? tickLen + 2 : tickLen;
        scaleSvg += `
          <line x1="${scaleX - len}" y1="${y}" x2="${scaleX}" y2="${y}"
                stroke="#aaa" stroke-width="${isMajor ? 1.5 : 1}" opacity="0.9"/>
          <text x="${labelX}" y="${y + 3.5}" text-anchor="end"
                fill="#ccc" font-size="9" font-family="sans-serif" opacity="0.9">${p}%</text>`;
      }
    }

    // Flow animation – direction controlled by from/to
    const flowAnimIn = `
      <animate attributeName="stroke-dashoffset" from="24" to="0" dur="0.55s"
               repeatCount="indefinite" calcMode="linear"/>`;
    const flowAnimOut = `
      <animate attributeName="stroke-dashoffset" from="24" to="0" dur="0.55s"
               repeatCount="indefinite" calcMode="linear"/>`;

    root.innerHTML = `
      <style>
        :host { display:block; width: 100%; }
        ha-card { position: relative; overflow: hidden; border-radius: var(--ha-card-border-radius, 12px); padding: 16px; box-sizing: border-box; display: flex; flex-direction: column; }
        .valves { display:flex; gap:8px; margin-bottom:8px; flex: 0 0 auto; }
        .valve { flex:1; background: #222222; border:none; border-radius:8px; padding:8px; cursor:pointer; color:#fff; text-align:center; text-shadow: 0 1px 3px rgba(0,0,0,0.8); box-sizing: border-box; }
        .valve:active { opacity:0.8; }
        .valve-name { font-size:13px; font-weight:500; }
        .valve-icon { font-style:normal; font-size:20px; display:block; margin:4px 0; color:#4a86c7; }
        .valve-label { font-size:12px; }
        .name { text-align:center; color: var(--primary-text-color,#fff); font-size:14px; font-weight:500; margin-bottom:4px; flex: 0 0 auto; }
        .pct { text-anchor:middle; font-size:16px; font-weight:600; fill: var(--primary-text-color,#fff); }
        .wave-group { transition: transform 0.8s ease; }
        .flow-stream { display: none; }
        .flow-stream.active { display: block; }
        .rain-line { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 4px 14px; font-size: 12px; line-height: 1.4; margin-top: 6px; flex: 0 0 auto; text-align: center; }
        .rain-item { white-space: nowrap; }
        .rain-label { color: var(--secondary-text-color, #9ca3af); }
        .rain-value { color: var(--primary-text-color, #fff); font-weight: 500; }
        .bottom-row { display: flex; justify-content: space-between; align-items: stretch; gap: 8px; margin-top: 8px; }
        .bottom-item { flex: 0 1 45%; min-width: 0; border: none; border-radius: 8px; padding: 8px 10px; cursor: pointer; font: inherit; text-align: center; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; }
        .bottom-item:active { opacity: 0.8; }
        .bottom-left { margin-right: auto; }
        .bottom-right { margin-left: auto; }
        .bottom-name { font-size: 12px; font-weight: 500; overflow-wrap: anywhere; }
        .bottom-state { font-size: 12px; opacity: 0.9; }
        svg { overflow: hidden; cursor: pointer; touch-action: manipulation; width: 100%; height: auto; display: block; }
      </style>
      <ha-card>
        <div class="name">${this._config.name}</div>
        <div class="valves">${valveButtons}</div>
        <div class="rain-line" id="rainLine" style="display:none"></div>
        <svg id="tankSvg" width="100%" viewBox="0 -20 360 ${viewH}" role="img" aria-label="Tank level">
          <defs>
            <clipPath id="tankClip-${this._uid()}">
              <path d="${tankPath}"/>
            </clipPath>
            <!-- Clip that hides the falling stream below the current water surface -->
            <clipPath id="aboveWaterClip-${this._uid()}">
              <rect id="aboveWaterRect" x="0" y="-20" width="360" height="120"/>
            </clipPath>
            <linearGradient id="tankBodyGrad-${this._uid()}" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="#2a2a2a"/>
              <stop offset="15%" stop-color="#3d3d3d"/>
              <stop offset="50%" stop-color="${tankColor}"/>
              <stop offset="85%" stop-color="#3d3d3d"/>
              <stop offset="100%" stop-color="#2a2a2a"/>
            </linearGradient>
          </defs>

          ${scaleSvg}

          <!-- Main tank body -->
          <path d="${tankPath}" fill="url(#tankBodyGrad-${this._uid()})" stroke="#555" stroke-width="1.5"/>

          <!-- Horizontal ribs -->
          <g stroke="#222" stroke-width="1.2" fill="none" opacity="0.75">
            <path d="M82,48 Q82,42 100,42 L240,42 Q258,42 258,48"/>
            <path d="M82,70 Q82,64 100,64 L240,64 Q258,64 258,70"/>
            <path d="M82,92 Q82,86 100,86 L240,86 Q258,86 258,92"/>
            <path d="M82,114 Q82,108 100,108 L240,108 Q258,108 258,114"/>
            <path d="M82,136 Q82,130 100,130 L240,130 Q258,130 258,136"/>
            <path d="M82,158 Q82,152 100,152 L240,152 Q258,152 258,158"/>
            <path d="M82,180 Q82,174 100,174 L240,174 Q258,174 258,180"/>
            <path d="M82,202 Q82,196 100,196 L240,196 Q258,196 258,202"/>
            <path d="M82,224 Q82,218 100,218 L240,218 Q258,218 258,224"/>
            <path d="M82,246 Q82,240 100,240 L240,240 Q258,240 258,246"/>
          </g>
          <g stroke="#666" stroke-width="0.7" fill="none" opacity="0.35">
            <path d="M83,59 L257,59"/><path d="M83,81 L257,81"/><path d="M83,103 L257,103"/>
            <path d="M83,125 L257,125"/><path d="M83,147 L257,147"/><path d="M83,169 L257,169"/>
            <path d="M83,191 L257,191"/><path d="M83,213 L257,213"/><path d="M83,235 L257,235"/>
          </g>

          <!-- Animated water -->
          <g clip-path="url(#tankClip-${this._uid()})">
            <g class="wave-group" id="waveGroup">
              <path d="${fillPath}" fill="${this._config.wave_color}">
                ${motionAttr}
              </path>
              <path d="${highlightPath}" fill="none" stroke="${this._config.wave_color_light}" stroke-width="2.5" opacity="0.75">
                ${motionAttr}
              </path>
            </g>
          </g>

          <!-- Outline -->
          <path d="${tankPath}" fill="none" stroke="#666" stroke-width="2"/>

          <!-- ===== TOP OUTLET (right, downturn) ===== -->
          ${this._config.show_top_outlet ? `
          <rect x="258" y="38" width="22" height="12" rx="2" fill="#555" stroke="#333" stroke-width="1"/>
          <rect x="278" y="34" width="7" height="20" rx="1" fill="#666" stroke="#333" stroke-width="1"/>
          <path d="M285,44 L300,44 Q308,44 308,52 L308,68" fill="none" stroke="#555" stroke-width="10" stroke-linecap="round"/>
          <path d="M285,44 L300,44 Q308,44 308,52 L308,68" fill="none" stroke="#333" stroke-width="1.5"/>
          <ellipse cx="308" cy="70" rx="6" ry="3" fill="#444" stroke="#222" stroke-width="1"/>
          ` : ''}

          <!-- ===== TOP INLET (left, upward bend) ===== -->
          ${this._config.show_top_inlet ? `
          <rect x="60" y="28" width="22" height="12" rx="2" fill="#555" stroke="#333" stroke-width="1"/>
          <rect x="55" y="24" width="7" height="20" rx="1" fill="#666" stroke="#333" stroke-width="1"/>
          <path d="M55,34 L40,34 Q32,34 32,26 L32,10" fill="none" stroke="#555" stroke-width="10" stroke-linecap="round"/>
          <path d="M55,34 L40,34 Q32,34 32,26 L32,10" fill="none" stroke="#333" stroke-width="1.5"/>
          <ellipse cx="32" cy="8" rx="6" ry="3" fill="#444" stroke="#222" stroke-width="1"/>
          ` : ''}

          <!-- ===== INFLOW STREAM (left inlet → into tank → falls) ===== -->
          <g id="inflowStream" class="flow-stream">
            <!-- Translucent section following the pipe into the tank -->
            <path d="M32,10 L32,26 Q32,34 40,34 L60,34 L90,34"
                  fill="none" stroke="#4aa3e0" stroke-width="5" stroke-linecap="round"
                  stroke-dasharray="6 6" opacity="0.45">
              ${flowAnimIn}
            </path>
            <!-- Opaque free-fall well inside the tank (clipped above water surface) -->
            <g clip-path="url(#aboveWaterClip-${this._uid()})">
              <path d="M90,34 L90,250"
                    fill="none" stroke="#1d6fbf" stroke-width="4.5" stroke-linecap="round"
                    stroke-dasharray="10 6 4 6" opacity="0.95">
                ${flowAnimIn}
              </path>
              <path d="M90,34 L90,230"
                    fill="none" stroke="#4aa3e0" stroke-width="2.5" stroke-linecap="round"
                    stroke-dasharray="5 9 3 8" opacity="0.7">
                ${flowAnimIn}
              </path>
            </g>
          </g>

          <!-- ===== OVERFLOW STREAM (right outlet → out & down) ===== -->
          <g id="overflowStream" class="flow-stream">
            <!-- Translucent inside pipe (tank → outward) -->
            <path d="M258,44 L285,44 L300,44 Q308,44 308,52 L308,62"
                  fill="none" stroke="#4aa3e0" stroke-width="5" stroke-linecap="round"
                  stroke-dasharray="6 6" opacity="0.45">
              ${flowAnimOut}
            </path>
            <!-- Opaque free-flow – longer stream + droplet-style dashes -->
            <path d="M308,62 L308,145"
                  fill="none" stroke="#1d6fbf" stroke-width="4.5" stroke-linecap="round"
                  stroke-dasharray="10 6 4 6" opacity="0.95">
              ${flowAnimOut}
            </path>
            <!-- Secondary thinner stream for a bit more realism -->
            <path d="M308,62 L308,130"
                  fill="none" stroke="#4aa3e0" stroke-width="2.5" stroke-linecap="round"
                  stroke-dasharray="5 9 3 8" opacity="0.7">
              ${flowAnimOut}
            </path>
          </g>

          <!-- Bottom valve -->
          <rect x="258" y="210" width="28" height="14" rx="2" fill="#555" stroke="#333" stroke-width="1"/>
          <rect x="284" y="206" width="8" height="22" rx="1" fill="#666" stroke="#333" stroke-width="1"/>
          <circle cx="310" cy="217" r="12" fill="#4a4a4a" stroke="#222" stroke-width="1.5"/>
          <line x1="310" y1="205" x2="310" y2="229" stroke="#ccc" stroke-width="2.5" stroke-linecap="round"/>
          <line x1="298" y1="217" x2="322" y2="217" stroke="#ccc" stroke-width="2.5" stroke-linecap="round"/>
          <circle cx="310" cy="217" r="3.5" fill="#888"/>
          <rect x="304" y="228" width="12" height="6" rx="1" fill="#555" stroke="#333" stroke-width="0.8"/>

          <text x="170" y="295" class="pct" id="pctLabel">--%</text>
        </svg>
        <div class="bottom-row" id="bottomRow" style="display:none">
          <button class="bottom-item bottom-left" id="bottomLeft" style="display:none">
            <span class="bottom-name"></span>
            <span class="bottom-state"></span>
          </button>
          <button class="bottom-item bottom-right" id="bottomRight" style="display:none">
            <span class="bottom-name"></span>
            <span class="bottom-state"></span>
          </button>
        </div>
      </ha-card>
    `;

    this._root = root;

    this._bindActions(
      root.getElementById('tankSvg'),
      this._config.entity,
      this._resolveAction(this._config.tap_action, { action: 'more-info' }),
      this._resolveAction(this._config.hold_action, { action: 'none' })
    );

    const bottomCfg = [
      ['bottomLeft', this._config.bottom_left_entity],
      ['bottomRight', this._config.bottom_right_entity],
    ];
    bottomCfg.forEach(([id, entityId]) => {
      const el = root.getElementById(id);
      if (el) this._bindActions(el, entityId, { action: 'more-info' }, { action: 'none' });
    });

    root.querySelectorAll('.valve').forEach((btn) => {
      const i = Number(btn.dataset.i);
      const v = valves[i];
      if (!v) return;
      this._bindActions(
        btn,
        v.entity,
        this._resolveAction(v.tap_action, { action: 'toggle' }),
        this._resolveAction(v.hold_action, { action: 'more-info' })
      );
    });
  }

  _resolveAction(actionConfig, fallback) {
    if (!actionConfig || !actionConfig.action || actionConfig.action === 'default') {
      return fallback;
    }
    return actionConfig;
  }

  _bindActions(el, entityId, tapConfig, holdConfig) {
    if (!el) return;
    let holdTimer = null;
    let didHold = false;
    let pointerId = null;

    const releaseCapture = () => {
      if (pointerId !== null) {
        try { el.releasePointerCapture(pointerId); } catch (e) {}
        pointerId = null;
      }
    };

    const start = (ev) => {
      ev.stopPropagation();
      didHold = false;
      pointerId = ev.pointerId;
      try { el.setPointerCapture(pointerId); } catch (e) {}
      holdTimer = setTimeout(() => {
        didHold = true;
        this._handleAction(holdConfig, entityId);
      }, HOLD_MS);
    };

    const clearTimer = () => {
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    };

    const end = (ev) => {
      ev.stopPropagation();
      clearTimer();
      releaseCapture();
      if (!didHold) this._handleAction(tapConfig, entityId);
    };

    const cancel = () => { clearTimer(); releaseCapture(); };

    el.addEventListener('pointerdown', start);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('contextmenu', (ev) => ev.preventDefault());
  }

  _handleAction(actionConfig, entityId) {
    if (!this._hass || !actionConfig || actionConfig.action === 'none') return;
    const domain = entityId ? entityId.split('.')[0] : null;
    switch (actionConfig.action) {
      case 'more-info':
        this._fireMoreInfo(entityId);
        break;
      case 'toggle':
        if (domain) this._hass.callService(domain, 'toggle', { entity_id: entityId });
        break;
      case 'call-service':
      case 'perform-action': {
        const serviceStr = actionConfig.perform_action || actionConfig.service || '';
        const [svcDomain, svcName] = serviceStr.split('.');
        if (svcDomain && svcName) {
          this._hass.callService(
            svcDomain,
            svcName,
            actionConfig.data || actionConfig.service_data || {},
            actionConfig.target
          );
        }
        break;
      }
      case 'navigate':
        if (actionConfig.navigation_path) {
          history.pushState(null, '', actionConfig.navigation_path);
          window.dispatchEvent(new CustomEvent('location-changed', { bubbles: true, composed: true }));
        }
        break;
      case 'url':
        if (actionConfig.url_path) window.open(actionConfig.url_path);
        break;
      default:
        break;
    }
  }

  _fireMoreInfo(entityId) {
    if (!entityId) return;
    this.dispatchEvent(
      new CustomEvent('hass-more-info', {
        bubbles: true,
        composed: true,
        detail: { entityId },
      })
    );
  }

  _updateBottom() {
    const row = this._root.getElementById('bottomRow');
    if (!row) return;
    const cfg = this._config;
    let anyShown = false;
    ['left', 'right'].forEach((side) => {
      const btn = this._root.getElementById(side === 'left' ? 'bottomLeft' : 'bottomRight');
      if (!btn) return;
      if (!cfg[`show_bottom_${side}`]) {
        btn.style.display = 'none';
        return;
      }
      anyShown = true;
      const entity = cfg[`bottom_${side}_entity`];
      const state = entity ? this._hass.states[entity] : null;
      const kind = bottomKind(entity, state);
      const friendly = state && state.attributes ? state.attributes.friendly_name : '';

      let bg = cfg[`bottom_${side}_bg_color`] || '#2a2a2a';
      let fg = cfg[`bottom_${side}_text_color`] || '#ffffff';
      let valueText = this._formatBottomState(state);

      if (kind === 'battery') {
        const v = parseFloat(state.state);
        const greenAt = numOr(cfg[`bottom_${side}_battery_green_at`], 50);
        const amberAt = numOr(cfg[`bottom_${side}_battery_amber_at`], 20);
        if (v >= greenAt) bg = BATTERY_COLOURS.green;
        else if (v >= amberAt) bg = BATTERY_COLOURS.amber;
        else bg = BATTERY_COLOURS.red;
        fg = '#ffffff';
      } else if (kind === 'binary' && state && (state.state === 'on' || state.state === 'off')) {
        const isOn = state.state === 'on';
        bg = cfg[`bottom_${side}_${isOn ? 'on' : 'off'}_bg_color`] || '#2a2a2a';
        valueText = cfg[`bottom_${side}_${isOn ? 'on' : 'off'}_text`] || (isOn ? 'On' : 'Off');
      }

      btn.style.display = '';
      btn.style.background = bg;
      btn.style.color = fg;
      btn.querySelector('.bottom-name').textContent = cfg[`bottom_${side}_label`] || friendly || entity || '';
      btn.querySelector('.bottom-state').textContent = valueText;
    });
    row.style.display = anyShown ? '' : 'none';
  }

  _formatBottomState(state) {
    if (!state || state.state === 'unavailable' || state.state === 'unknown') return '--';
    const unit = state.attributes ? state.attributes.unit_of_measurement : '';
    return unit ? `${state.state} ${unit}` : state.state;
  }

  _updateRain() {
    const el = this._root.getElementById('rainLine');
    if (!el) return;
    const items = this._rainItems();
    if (!items.length) {
      el.style.display = 'none';
      el.innerHTML = '';
      return;
    }
    el.style.display = '';
    el.innerHTML = items
      .map(
        (it) =>
          `<span class="rain-item"><span class="rain-label">${this._escHtml(it.label)}:</span> <span class="rain-value">${this._escHtml(it.value)}</span></span>`
      )
      .join('');
  }

  _rainItems() {
    const cfg = this._config;
    const defs = [
      { on: cfg.show_rain_daily, entity: cfg.rain_daily_entity, label: cfg.rain_daily_label },
      { on: cfg.show_rain_rate, entity: cfg.rain_rate_entity || cfg.inflow_entity, label: cfg.rain_rate_label },
      { on: cfg.show_rain_max, entity: cfg.rain_max_entity, label: cfg.rain_max_label },
    ];
    return defs
      .filter((d) => d.on && d.entity)
      .map((d) => {
        const state = this._hass.states[d.entity];
        const friendly = state && state.attributes ? state.attributes.friendly_name : '';
        return {
          label: d.label || friendly || d.entity,
          value: this._formatRain(state),
        };
      });
  }

  _formatRain(state) {
    if (!state || state.state === 'unavailable' || state.state === 'unknown') return '--';
    const n = parseFloat(state.state);
    if (Number.isNaN(n)) return '--';
    const unit = state.attributes ? state.attributes.unit_of_measurement : '';
    const text = n.toFixed(1);
    return unit ? `${text} ${unit}` : text;
  }

  _escHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  _uid() {
    if (!this.__uid) this.__uid = Math.random().toString(36).slice(2, 8);
    return this.__uid;
  }

  _updateLevel() {
    const state = this._hass.states[this._config.entity];
    if (!state) return;
    const raw = parseFloat(state.state);
    if (Number.isNaN(raw)) return;

    const full = Number(this._config.full_value) || 100;
    let pct = (raw / full) * 100;
    // Floor at 0 always. Cap at 100 only when enabled (default).
    if (this._config.cap_at_100 !== false) {
      pct = Math.max(0, Math.min(100, pct));
    } else {
      // Uncapped: still floor at 0; soft ceiling so the wave stays inside the tank graphic
      pct = Math.max(0, Math.min(130, pct));
    }

    const tankTop = 30;
    const tankBottom = 250;
    const tankHeight = tankBottom - tankTop;
    const marginPx = tankHeight * (this._config.top_margin / 100);
    const usableTop = tankTop + marginPx;
    const usableBottom = tankBottom;
    const usableHeight = usableBottom - usableTop;

    // 100% sits at usableTop (overflow level). Above 100% rises into the top-margin zone.
    // Never draw the surface above the physical tank top.
    let surfaceY = usableBottom - (pct / 100) * usableHeight;
    surfaceY = Math.max(tankTop, surfaceY);
    const offset = surfaceY - WAVE_TOP;

    const waveGroup = this._root.getElementById('waveGroup');
    if (waveGroup) waveGroup.style.transform = `translateY(${offset}px)`;

    const pctLabel = this._root.getElementById('pctLabel');
    if (pctLabel) pctLabel.textContent = `${pct.toFixed(1)}%`;

    // Update the "above water" clip so the falling stream vanishes at the surface
    const aboveRect = this._root.getElementById('aboveWaterRect');
    if (aboveRect) {
      // rect goes from top of viewBox down to the current surface
      aboveRect.setAttribute('height', String(Math.max(0, surfaceY + 20)));
    }

    this._lastPct = pct;
  }

  _updateValves() {
    (this._config.valves || []).forEach((v, i) => {
      const state = this._hass.states[v.entity];
      const btn = this._root.getElementById(`valve-${i}`);
      const icon = this._root.getElementById(`icon-${i}`);
      const label = this._root.getElementById(`label-${i}`);
      if (!state || !icon || !label || !btn) return;
      const isOn = state.state === 'on';
      icon.style.color = isOn ? '#f2c744' : '#4a86c7';

      const map = v.state_map || {};
      label.textContent = map[state.state] ?? (isOn ? 'Valve open' : 'Valve closed');

      const img = isOn ? v.background_image_on : v.background_image_off;
      if (img) {
        btn.style.backgroundImage = `url('${img}')`;
        btn.style.backgroundSize = 'contain';
        btn.style.backgroundPosition = 'center';
        btn.style.backgroundRepeat = 'no-repeat';
        btn.style.backgroundColor = v.background_color || '#222222';
        icon.style.display = 'none';
      } else {
        btn.style.backgroundImage = 'none';
        btn.style.backgroundColor = v.background_color || '#222222';
        icon.style.display = '';
      }
    });
  }

  _updateInflow() {
    if (!this._config.show_inflow || !this._config.inflow_entity) {
      this._setStreamActive('inflowStream', false);
      this._setStreamActive('overflowStream', false);
      return;
    }

    const state = this._hass.states[this._config.inflow_entity];
    const rate = state ? parseFloat(state.state) : 0;
    const isFlowing = !Number.isNaN(rate) && rate > 0;

    // Inflow stream only if the inlet pipe is shown
    const showIn = isFlowing && this._config.show_top_inlet;
    this._setStreamActive('inflowStream', showIn);

    // Overflow only when full + flowing + outlet pipe shown
    const isFull = (this._lastPct || 0) >= 99.5;
    const showOut = isFlowing && isFull && this._config.show_top_outlet;
    this._setStreamActive('overflowStream', showOut);
  }

  _setStreamActive(id, active) {
    const el = this._root.getElementById(id);
    if (!el) return;
    if (active) el.classList.add('active');
    else el.classList.remove('active');
  }
}

customElements.define('svg-tank-card', SvgTankCard);
// ---------------------------------------------------------------------
// Visual editor — collapsible panels (bar-chart style)
// ---------------------------------------------------------------------

class SvgTankCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._hass = null;
    this._rendered = false;
    this._helpersLoaded = false;
    // All panels collapsed by default
    this._openPanels = {
      level: false,
      appearance: false,
      pipes: false,
      actions: false,
      valves: false,
      rain: false,
      bottom: false,
    };
  }

  setConfig(config) {
    this._config = config || {};
    if (!Array.isArray(this._config.valves)) this._config.valves = [];
    this.render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._rendered) {
      this._updateEntityPickers();
    } else {
      this.render();
    }
  }

  connectedCallback() {
    this.render();
  }

  configChanged(newConfig) {
    this.dispatchEvent(
      new CustomEvent('config-changed', {
        detail: { config: newConfig },
        bubbles: true,
        composed: true,
      })
    );
  }

  async _ensureHelpers() {
    if (this._helpersLoaded) return;
    try {
      if (!customElements.get('ha-entity-picker')) {
        const entitiesCard = customElements.get('hui-entities-card');
        if (entitiesCard && entitiesCard.getConfigElement) {
          await entitiesCard.getConfigElement();
        }
      }
      await customElements.whenDefined('ha-entity-picker').catch(() => {});
    } catch (e) {
      console.warn('svg-tank-card: could not pre-load HA pickers', e);
    }
    this._helpersLoaded = true;
  }

  _handleFieldChange(ev) {
    if (!this._config) return;
    const target = ev.target;
    const field = target.dataset.field;
    if (!field) return;

    let value;
    if (target.tagName === 'HA-ENTITY-PICKER') {
      value = target.value;
    } else if (target.type === 'checkbox') {
      value = target.checked;
    } else if (target.type === 'number') {
      value = target.value === '' ? null : Number(target.value);
    } else {
      value = target.value;
    }

    const updated = JSON.parse(JSON.stringify(this._config));
    if (!Array.isArray(updated.valves)) updated.valves = [];

    // Valve-scoped fields: valve_N_xxx
    const valveMatch = field.match(/^valve_(\d+)_(.+)$/);
    if (valveMatch) {
      const idx = parseInt(valveMatch[1], 10) - 1;
      const sub = valveMatch[2];
      while (updated.valves.length <= idx) {
        updated.valves.push({
          entity: '',
          name: '',
          background_color: '#222222',
          background_image_on: '',
          background_image_off: '',
          state_map: {},
          tap_action: { action: 'toggle' },
          hold_action: { action: 'more-info' },
        });
      }
      const v = updated.valves[idx];
      if (sub === 'entity') v.entity = value || '';
      else if (sub === 'name') v.name = value || '';
      else if (sub === 'background_color') v.background_color = value || '#222222';
      else if (sub === 'background_image_on') v.background_image_on = value || '';
      else if (sub === 'background_image_off') v.background_image_off = value || '';
      else if (sub === 'state_on_label') {
        v.state_map = v.state_map || {};
        if (value) v.state_map.on = value;
        else delete v.state_map.on;
      } else if (sub === 'state_off_label') {
        v.state_map = v.state_map || {};
        if (value) v.state_map.off = value;
        else delete v.state_map.off;
      } else if (sub === 'tap_action') {
        v.tap_action = this._actionFromSelect(value, v.tap_action);
      } else if (sub === 'hold_action') {
        v.hold_action = this._actionFromSelect(value, v.hold_action);
      } else if (sub === 'tap_path' || sub === 'tap_url' || sub === 'tap_service') {
        v.tap_action = v.tap_action || { action: 'none' };
        if (sub === 'tap_path') v.tap_action.navigation_path = value;
        if (sub === 'tap_url') v.tap_action.url_path = value;
        if (sub === 'tap_service') v.tap_action.service = value;
      } else if (sub === 'hold_path' || sub === 'hold_url' || sub === 'hold_service') {
        v.hold_action = v.hold_action || { action: 'none' };
        if (sub === 'hold_path') v.hold_action.navigation_path = value;
        if (sub === 'hold_url') v.hold_action.url_path = value;
        if (sub === 'hold_service') v.hold_action.service = value;
      }
      // Keep only valves that have an entity (preserves order of filled slots)
      updated.valves = updated.valves.filter((v) => v && v.entity);
    } else if (field === 'tap_action') {
      updated.tap_action = this._actionFromSelect(value, updated.tap_action);
    } else if (field === 'hold_action') {
      updated.hold_action = this._actionFromSelect(value, updated.hold_action);
    } else if (field === 'tap_path' || field === 'tap_url' || field === 'tap_service') {
      updated.tap_action = updated.tap_action || { action: 'none' };
      if (field === 'tap_path') updated.tap_action.navigation_path = value;
      if (field === 'tap_url') updated.tap_action.url_path = value;
      if (field === 'tap_service') updated.tap_action.service = value;
    } else if (field === 'hold_path' || field === 'hold_url' || field === 'hold_service') {
      updated.hold_action = updated.hold_action || { action: 'none' };
      if (field === 'hold_path') updated.hold_action.navigation_path = value;
      if (field === 'hold_url') updated.hold_action.url_path = value;
      if (field === 'hold_service') updated.hold_action.service = value;
    } else {
      updated[field] = value;
    }

    this._config = updated;
    this.configChanged(updated);
    // Re-render when structure-affecting fields change (show/hide conditional rows)
    if (
      ['show_inflow', 'show_top_inlet', 'show_top_outlet', 'show_rain_daily', 'show_rain_rate', 'show_rain_max', 'show_bottom_left', 'show_bottom_right', 'bottom_left_entity', 'bottom_right_entity', 'tap_action', 'hold_action'].includes(field) ||
      (valveMatch && ['tap_action', 'hold_action', 'entity'].includes(valveMatch[2]))
    ) {
      this.render();
    }
  }

  _actionFromSelect(actionName, previous) {
    const prev = previous || {};
    const base = { action: actionName || 'none' };
    if (actionName === 'navigate') {
      base.navigation_path = prev.navigation_path || '';
    } else if (actionName === 'url') {
      base.url_path = prev.url_path || '';
    } else if (actionName === 'call-service') {
      base.service = prev.service || '';
      base.data = prev.data || {};
    }
    return base;
  }

  _actionName(cfg) {
    return (cfg && cfg.action) || 'none';
  }

  _actionExtraFields(prefix, actionCfg) {
    const a = this._actionName(actionCfg);
    if (a === 'navigate') {
      return `
        <div class="field">
          <label>Navigation path</label>
          <input type="text" data-field="${prefix}_path" value="${this._escape((actionCfg && actionCfg.navigation_path) || '')}" placeholder="/lovelace/0" />
        </div>`;
    }
    if (a === 'url') {
      return `
        <div class="field">
          <label>URL</label>
          <input type="text" data-field="${prefix}_url" value="${this._escape((actionCfg && actionCfg.url_path) || '')}" placeholder="https://…" />
        </div>`;
    }
    if (a === 'call-service') {
      return `
        <div class="field">
          <label>Service (domain.service)</label>
          <input type="text" data-field="${prefix}_service" value="${this._escape((actionCfg && actionCfg.service) || '')}" placeholder="switch.toggle" />
        </div>`;
    }
    return '';
  }

  _actionSelect(field, current, options) {
    const cur = this._actionName(current);
    const opts = options || [
      ['none', 'None'],
      ['more-info', 'More info'],
      ['toggle', 'Toggle'],
      ['navigate', 'Navigate'],
      ['url', 'URL'],
      ['call-service', 'Call service'],
    ];
    return `
      <select data-field="${field}">
        ${opts.map(([v, l]) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select>`;
  }

  _updateEntityPickers() {
    if (!this._hass || !this.shadowRoot) return;
    this.shadowRoot.querySelectorAll('ha-entity-picker').forEach((picker) => {
      picker.hass = this._hass;
    });
  }

  async render() {
    if (!this.shadowRoot) return;
    await this._ensureHelpers();

    const cfg = this._config || {};
    const valves = Array.isArray(cfg.valves) ? cfg.valves : [];
    // Always show 2 valve slots in the editor
    const v1 = valves[0] || {};
    const v2 = valves[1] || {};
    const hasEntityPicker = !!customElements.get('ha-entity-picker');

    // Status lines for collapsed summaries
    const levelStatus = [
      cfg.entity || 'no sensor',
      cfg.full_value != null ? `full ${cfg.full_value}` : null,
      cfg.top_margin != null ? `margin ${cfg.top_margin}%` : null,
      cfg.cap_at_100 === false ? 'uncapped' : 'capped',
    ].filter(Boolean).join(' · ');

    const appearanceStatus = [
      cfg.wave_motion !== false ? 'wave on' : 'wave off',
      cfg.show_scale !== false ? 'scale on' : 'scale off',
      `height x${cfg.height_factor ?? 1}`,
    ].join(' · ');

    const pipesParts = [];
    if (cfg.show_top_inlet) pipesParts.push('inlet');
    if (cfg.show_top_outlet) pipesParts.push('outlet');
    if (cfg.show_inflow) pipesParts.push(cfg.inflow_entity ? `inflow: ${cfg.inflow_entity}` : 'inflow on');
    const pipesStatus = pipesParts.length ? pipesParts.join(' · ') : 'none';

    const actionsStatus = `tap: ${this._actionName(cfg.tap_action)} · hold: ${this._actionName(cfg.hold_action)}`;

    const rainCount = [cfg.show_rain_daily, cfg.show_rain_rate, cfg.show_rain_max].filter(Boolean).length;
    const rainStatus = rainCount ? `${rainCount} shown` : 'none';
    const bottomCount = [cfg.show_bottom_left, cfg.show_bottom_right].filter(Boolean).length;
    const bottomStatus = bottomCount ? `${bottomCount} shown` : 'none';

    const valveCount = valves.filter((v) => v && v.entity).length;
    const valvesStatus = valveCount
      ? `${valveCount} valve${valveCount === 1 ? '' : 's'}${cfg.valve_height ? ` · ${cfg.valve_height}px` : ''}`
      : 'none';

    this.shadowRoot.innerHTML = `
      <style>
        .form {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 8px;
          font-family: var(--paper-font-body1_-_font-family, sans-serif);
          color: var(--primary-text-color, #fff);
        }
        .hint {
          font-size: 11px;
          color: var(--secondary-text-color, #9ca3af);
          line-height: 1.35;
        }
        .row {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
        }
        .field {
          display: flex;
          flex-direction: column;
          gap: 4px;
          flex: 1;
          min-width: 0;
        }
        label {
          font-size: 12px;
          color: var(--secondary-text-color, #9ca3af);
        }
        input, select {
          padding: 8px;
          border-radius: 6px;
          border: 1px solid var(--divider-color, #4b5563);
          background: var(--card-background-color, #1f2937);
          color: var(--primary-text-color, #fff);
          font-size: 13px;
          box-sizing: border-box;
          width: 100%;
        }
        input[type="color"] {
          padding: 2px;
          height: 36px;
        }
        input[type="checkbox"] {
          width: auto;
          margin-right: 6px;
        }
        .check-label {
          display: flex;
          align-items: center;
          cursor: pointer;
          font-size: 12px;
          color: var(--primary-text-color, #fff);
          gap: 2px;
        }
        .entity-box {
          border: 1px solid var(--divider-color, #4b5563);
          padding: 10px;
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          background: rgba(0,0,0,0.12);
        }
        .subhead {
          font-weight: 600;
          font-size: 12px;
          color: var(--secondary-text-color, #9ca3af);
          margin-top: 4px;
        }
        ha-entity-picker {
          display: block;
          width: 100%;
        }

        details.panel {
          border: 1px solid var(--divider-color, #4b5563);
          border-left: 3px solid transparent;
          border-radius: 8px;
          background: rgba(0, 0, 0, 0.12);
          overflow: hidden;
        }
        details.panel > summary {
          cursor: pointer;
          list-style: none;
          padding: 10px 12px;
          font-weight: 600;
          font-size: 13px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          user-select: none;
          color: var(--primary-text-color, #fff);
          background: rgba(255, 255, 255, 0.03);
        }
        details.panel > summary::-webkit-details-marker { display: none; }
        details.panel > summary .summary-main {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }
        details.panel > summary .summary-title { font-weight: 600; font-size: 13px; }
        details.panel > summary .summary-status {
          font-weight: 400;
          font-size: 11px;
          color: var(--secondary-text-color, #9ca3af);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        details.panel > summary .summary-hint { font-weight: 400; font-size: 11px; opacity: 0.75; }
        details.panel > summary .hint-collapse { display: none; }
        details.panel[open] > summary .hint-expand { display: none; }
        details.panel[open] > summary .hint-collapse { display: inline; }
        details.panel > summary::after {
          content: "▸";
          font-size: 12px;
          color: var(--secondary-text-color, #9ca3af);
          transition: transform 0.15s ease;
          flex-shrink: 0;
        }
        details.panel[open] > summary::after { transform: rotate(90deg); }
        .panel-body {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 10px 12px 12px;
          background: rgba(0, 0, 0, 0.15);
        }

        details.panel.accent-red {
          border-color: #440000; border-left-color: #440000;
          background: rgba(68, 0, 0, 0.1);
        }
        details.panel.accent-red > summary { background: #220000; }
        details.panel.accent-red[open] > summary { background: #220000; border-bottom: 1px solid #440000; }
        details.panel.accent-red > summary:hover { background: #2a0000; }
        details.panel.accent-red > summary .summary-status,
        details.panel.accent-red > summary::after { color: rgba(255, 190, 190, 0.7); }

        details.panel.accent-green {
          border-color: #004400; border-left-color: #004400;
          background: rgba(0, 68, 0, 0.1);
        }
        details.panel.accent-green > summary { background: #002200; }
        details.panel.accent-green[open] > summary { background: #002200; border-bottom: 1px solid #004400; }
        details.panel.accent-green > summary:hover { background: #002a00; }
        details.panel.accent-green > summary .summary-status,
        details.panel.accent-green > summary::after { color: rgba(190, 255, 190, 0.7); }

        details.panel.accent-blue {
          border-color: #000044; border-left-color: #000044;
          background: rgba(0, 0, 68, 0.1);
        }
        details.panel.accent-blue > summary { background: #000022; }
        details.panel.accent-blue[open] > summary { background: #000022; border-bottom: 1px solid #000044; }
        details.panel.accent-blue > summary:hover { background: #00002a; }
        details.panel.accent-blue > summary .summary-status,
        details.panel.accent-blue > summary::after { color: rgba(190, 190, 255, 0.7); }
      </style>

      <div class="form">
        <!-- 1. Level -->
        <details class="panel accent-red" data-panel="level" ${this._openPanels.level ? 'open' : ''}>
          <summary>
            <span class="summary-main">
              <span class="summary-title">Level</span>
              <span class="summary-status">${this._escape(levelStatus)}<span class="summary-hint hint-expand"> · Tap to expand</span><span class="summary-hint hint-collapse"> · Tap to collapse</span></span>
            </span>
          </summary>
          <div class="panel-body">
            <div class="field">
              <label>Level sensor</label>
              ${hasEntityPicker
                ? `<ha-entity-picker data-field="entity" allow-custom-entity></ha-entity-picker>`
                : `<input type="text" data-field="entity" value="${this._escape(cfg.entity || '')}" placeholder="sensor.tank_level" />`
              }
            </div>
            <div class="field">
              <label>Card name</label>
              <input type="text" data-field="name" value="${this._escape(cfg.name || '')}" />
            </div>
            <div class="row">
              <div class="field">
                <label>Full value</label>
                <input type="number" step="any" min="1" data-field="full_value" value="${cfg.full_value ?? 100}" />
              </div>
              <div class="field">
                <label>Top margin (%)</label>
                <input type="number" step="1" min="0" max="50" data-field="top_margin" value="${cfg.top_margin ?? 12}" title="Headroom above 100% / overflow level" />
              </div>
            </div>
            <label class="check-label">
              <input type="checkbox" data-field="cap_at_100" ${cfg.cap_at_100 !== false ? 'checked' : ''} />
              Cap percentage display at 100%
            </label>
            <div class="hint">Off = allow levels above full (e.g. temporary fill past the overflow outlet). Soft visual limit 130%.</div>
          </div>
        </details>

        <!-- 2. Appearance -->
        <details class="panel accent-green" data-panel="appearance" ${this._openPanels.appearance ? 'open' : ''}>
          <summary>
            <span class="summary-main">
              <span class="summary-title">Appearance</span>
              <span class="summary-status">${this._escape(appearanceStatus)}<span class="summary-hint hint-expand"> · Tap to expand</span><span class="summary-hint hint-collapse"> · Tap to collapse</span></span>
            </span>
          </summary>
          <div class="panel-body">
            <div class="row">
              <label class="check-label">
                <input type="checkbox" data-field="wave_motion" ${cfg.wave_motion !== false ? 'checked' : ''} />
                Animate wave
              </label>
              <label class="check-label">
                <input type="checkbox" data-field="show_scale" ${cfg.show_scale !== false ? 'checked' : ''} />
                Show percentage scale
              </label>
            </div>
            <div class="row">
              <div class="field">
                <label>Height factor (1 = natural)</label>
                <input type="number" step="0.05" min="1" max="3" data-field="height_factor" value="${cfg.height_factor ?? 1}" />
              </div>
            </div>
            <div class="row">
              <div class="field" style="flex: 0 0 90px;">
                <label>Wave colour</label>
                <input type="color" data-field="wave_color" value="${(cfg.wave_color || '#1d6fbf').startsWith('#') ? cfg.wave_color : '#1d6fbf'}" />
              </div>
              <div class="field">
                <label>Or CSS / hex</label>
                <input type="text" data-field="wave_color" value="${this._escape(cfg.wave_color || '#1d6fbf')}" />
              </div>
            </div>
            <div class="row">
              <div class="field" style="flex: 0 0 90px;">
                <label>Highlight</label>
                <input type="color" data-field="wave_color_light" value="${(cfg.wave_color_light || '#4aa3e0').startsWith('#') ? cfg.wave_color_light : '#4aa3e0'}" />
              </div>
              <div class="field">
                <label>Or CSS / hex</label>
                <input type="text" data-field="wave_color_light" value="${this._escape(cfg.wave_color_light || '#4aa3e0')}" />
              </div>
            </div>
            <div class="row">
              <div class="field" style="flex: 0 0 90px;">
                <label>Tank colour</label>
                <input type="color" data-field="tank_color" value="${(cfg.tank_color || '#3a3a3a').startsWith('#') ? cfg.tank_color : '#3a3a3a'}" />
              </div>
              <div class="field">
                <label>Or CSS / hex</label>
                <input type="text" data-field="tank_color" value="${this._escape(cfg.tank_color || '#3a3a3a')}" />
              </div>
            </div>
          </div>
        </details>

        <!-- 3. Pipes & flow -->
        <details class="panel accent-blue" data-panel="pipes" ${this._openPanels.pipes ? 'open' : ''}>
          <summary>
            <span class="summary-main">
              <span class="summary-title">Pipes &amp; flow</span>
              <span class="summary-status">${this._escape(pipesStatus)}<span class="summary-hint hint-expand"> · Tap to expand</span><span class="summary-hint hint-collapse"> · Tap to collapse</span></span>
            </span>
          </summary>
          <div class="panel-body">
            <label class="check-label">
              <input type="checkbox" data-field="show_top_inlet" ${cfg.show_top_inlet ? 'checked' : ''} />
              Show top inlet (left, upward)
            </label>
            <label class="check-label">
              <input type="checkbox" data-field="show_top_outlet" ${cfg.show_top_outlet ? 'checked' : ''} />
              Show top overflow outlet
            </label>
            <label class="check-label">
              <input type="checkbox" data-field="show_inflow" ${cfg.show_inflow ? 'checked' : ''} />
              Enable inflow animation
            </label>
            ${cfg.show_inflow ? `
              <div class="field">
                <label>Inflow / rain-rate entity</label>
                ${hasEntityPicker
                  ? `<ha-entity-picker data-field="inflow_entity" allow-custom-entity></ha-entity-picker>`
                  : `<input type="text" data-field="inflow_entity" value="${this._escape(cfg.inflow_entity || '')}" placeholder="sensor.rain_rate" />`
                }
              </div>
              <div class="hint">Stream animates when this entity is &gt; 0. Overflow stream only when level ≥ ~100% and the outlet pipe is shown.</div>
            ` : ''}
          </div>
        </details>

        <!-- 3b. Rain info -->
        <details class="panel accent-blue" data-panel="rain" ${this._openPanels.rain ? 'open' : ''}>
          <summary>
            <span class="summary-main">
              <span class="summary-title">Rain info</span>
              <span class="summary-status">${this._escape(rainStatus)}<span class="summary-hint hint-expand"> · Tap to expand</span><span class="summary-hint hint-collapse"> · Tap to collapse</span></span>
            </span>
          </summary>
          <div class="panel-body">
            ${this._rainRowEditor('daily', 'Daily rain total', cfg.show_rain_daily, cfg.rain_daily_entity, cfg.rain_daily_label, 'sensor.rain_since_midnight', hasEntityPicker)}
            ${this._rainRowEditor('rate', 'Current rain rate', cfg.show_rain_rate, cfg.rain_rate_entity || cfg.inflow_entity, cfg.rain_rate_label, 'Blank = inflow entity', hasEntityPicker)}
            ${this._rainRowEditor('max', 'Max rain rate', cfg.show_rain_max, cfg.rain_max_entity, cfg.rain_max_label, 'sensor.rain_max_rate', hasEntityPicker)}
            <div class="hint">Each value shows -- when its sensor is unavailable. Units come from each sensor.</div>
          </div>
        </details>

        <!-- 3c. Additional info (bottom corners) -->
        <details class="panel accent-green" data-panel="bottom" ${this._openPanels.bottom ? 'open' : ''}>
          <summary>
            <span class="summary-main">
              <span class="summary-title">Additional info</span>
              <span class="summary-status">${this._escape(bottomStatus)}<span class="summary-hint hint-expand"> · Tap to expand</span><span class="summary-hint hint-collapse"> · Tap to collapse</span></span>
            </span>
          </summary>
          <div class="panel-body">
            ${this._bottomRowEditor('left', 'Bottom left entity', cfg, hasEntityPicker)}
            ${this._bottomRowEditor('right', 'Bottom right entity', cfg, hasEntityPicker)}
          </div>
        </details>

        <!-- 4. Tank actions -->
        <details class="panel accent-red" data-panel="actions" ${this._openPanels.actions ? 'open' : ''}>
          <summary>
            <span class="summary-main">
              <span class="summary-title">Tank actions</span>
              <span class="summary-status">${this._escape(actionsStatus)}<span class="summary-hint hint-expand"> · Tap to expand</span><span class="summary-hint hint-collapse"> · Tap to collapse</span></span>
            </span>
          </summary>
          <div class="panel-body">
            <div class="row">
              <div class="field">
                <label>Tap action</label>
                ${this._actionSelect('tap_action', cfg.tap_action || { action: 'more-info' })}
              </div>
              <div class="field">
                <label>Hold action</label>
                ${this._actionSelect('hold_action', cfg.hold_action || { action: 'none' })}
              </div>
            </div>
            ${this._actionExtraFields('tap', cfg.tap_action)}
            ${this._actionExtraFields('hold', cfg.hold_action)}
          </div>
        </details>

        <!-- 5. Valves -->
        <details class="panel accent-green" data-panel="valves" ${this._openPanels.valves ? 'open' : ''}>
          <summary>
            <span class="summary-main">
              <span class="summary-title">Valves</span>
              <span class="summary-status">${this._escape(valvesStatus)}<span class="summary-hint hint-expand"> · Tap to expand</span><span class="summary-hint hint-collapse"> · Tap to collapse</span></span>
            </span>
          </summary>
          <div class="panel-body">
            <div class="row">
              <div class="field">
                <label>Button height (px)</label>
                <input type="number" step="1" min="20" max="300" data-field="valve_height" value="${cfg.valve_height ?? ''}" placeholder="Auto" />
              </div>
              <div class="field">
                <label>Button width (px)</label>
                <input type="number" step="1" min="20" max="400" data-field="valve_width" value="${cfg.valve_width ?? ''}" placeholder="Stretch" />
              </div>
            </div>

            ${[1, 2].map((n) => {
              const v = n === 1 ? v1 : v2;
              const map = v.state_map || {};
              return `
              <div class="entity-box">
                <div class="subhead">Valve ${n}</div>
                <div class="field">
                  <label>Entity</label>
                  ${hasEntityPicker
                    ? `<ha-entity-picker data-field="valve_${n}_entity" allow-custom-entity></ha-entity-picker>`
                    : `<input type="text" data-field="valve_${n}_entity" value="${this._escape(v.entity || '')}" placeholder="switch.valve_${n}" />`
                  }
                </div>
                <div class="row">
                  <div class="field">
                    <label>Name</label>
                    <input type="text" data-field="valve_${n}_name" value="${this._escape(v.name || '')}" />
                  </div>
                  <div class="field" style="flex: 0 0 90px;">
                    <label>Background</label>
                    <input type="color" data-field="valve_${n}_background_color" value="${(v.background_color || '#222222').startsWith('#') ? (v.background_color || '#222222') : '#222222'}" />
                  </div>
                </div>
                <div class="row">
                  <div class="field">
                    <label>Image when ON</label>
                    <input type="text" data-field="valve_${n}_background_image_on" value="${this._escape(v.background_image_on || '')}" placeholder="/local/valve_on.jpg" />
                  </div>
                  <div class="field">
                    <label>Image when OFF</label>
                    <input type="text" data-field="valve_${n}_background_image_off" value="${this._escape(v.background_image_off || '')}" placeholder="/local/valve_off.jpg" />
                  </div>
                </div>
                <div class="row">
                  <div class="field">
                    <label>Label when ON</label>
                    <input type="text" data-field="valve_${n}_state_on_label" value="${this._escape(map.on || '')}" placeholder="Valve open" />
                  </div>
                  <div class="field">
                    <label>Label when OFF</label>
                    <input type="text" data-field="valve_${n}_state_off_label" value="${this._escape(map.off || '')}" placeholder="Valve closed" />
                  </div>
                </div>
                <div class="row">
                  <div class="field">
                    <label>Tap action</label>
                    ${this._actionSelect(`valve_${n}_tap_action`, v.tap_action || { action: 'toggle' })}
                  </div>
                  <div class="field">
                    <label>Hold action</label>
                    ${this._actionSelect(`valve_${n}_hold_action`, v.hold_action || { action: 'more-info' })}
                  </div>
                </div>
                ${this._actionExtraFields(`valve_${n}_tap`, v.tap_action)}
                ${this._actionExtraFields(`valve_${n}_hold`, v.hold_action)}
              </div>`;
            }).join('')}
          </div>
        </details>
      </div>
    `;

    // Persist open/closed state
    this.shadowRoot.querySelectorAll('details.panel').forEach((el) => {
      const key = el.dataset.panel;
      if (!key) return;
      el.addEventListener('toggle', () => {
        this._openPanels[key] = el.open;
      });
    });

    // Field listeners
    this.shadowRoot.querySelectorAll('input, select').forEach((input) => {
      input.addEventListener('change', (e) => this._handleFieldChange(e));
    });

    // Entity pickers
    this.shadowRoot.querySelectorAll('ha-entity-picker').forEach((picker) => {
      picker.hass = this._hass;
      const field = picker.dataset.field;
      let val = '';
      if (field === 'entity') val = cfg.entity || '';
      else if (field === 'inflow_entity') val = cfg.inflow_entity || '';
      else if (field === 'valve_1_entity') val = v1.entity || '';
      else if (field === 'valve_2_entity') val = v2.entity || '';
      else if (field === 'rain_daily_entity') val = cfg.rain_daily_entity || '';
      else if (field === 'rain_rate_entity') val = cfg.rain_rate_entity || cfg.inflow_entity || '';
      else if (field === 'rain_max_entity') val = cfg.rain_max_entity || '';
      else if (field === 'bottom_left_entity') val = cfg.bottom_left_entity || '';
      else if (field === 'bottom_right_entity') val = cfg.bottom_right_entity || '';
      picker.value = val;
      picker.addEventListener('value-changed', (e) => {
        const fakeEv = {
          target: {
            tagName: 'HA-ENTITY-PICKER',
            dataset: { field },
            value: e.detail?.value ?? picker.value,
          },
        };
        this._handleFieldChange(fakeEv);
      });
    });

    this._rendered = true;
  }

  _bottomRowEditor(side, title, cfg, hasPicker) {
    const on = !!cfg[`show_bottom_${side}`];
    const entity = cfg[`bottom_${side}_entity`] || '';
    const label = cfg[`bottom_${side}_label`] || '';
    const st = entity && this._hass ? this._hass.states[entity] : null;
    const kind = bottomKind(entity, st);

    const bg = cfg[`bottom_${side}_bg_color`] || '#2a2a2a';
    const text = cfg[`bottom_${side}_text_color`] || '#ffffff';
    const onBg = cfg[`bottom_${side}_on_bg_color`] || '#2a2a2a';
    const offBg = cfg[`bottom_${side}_off_bg_color`] || '#2a2a2a';
    const onText = cfg[`bottom_${side}_on_text`] || 'On';
    const offText = cfg[`bottom_${side}_off_text`] || 'Off';
    const greenAt = numOr(cfg[`bottom_${side}_battery_green_at`], 50);
    const amberAt = numOr(cfg[`bottom_${side}_battery_amber_at`], 20);

    const pickerHtml = hasPicker
      ? `<ha-entity-picker data-field="bottom_${side}_entity" allow-custom-entity></ha-entity-picker>`
      : `<input type="text" data-field="bottom_${side}_entity" value="${this._escape(entity)}" placeholder="sensor.gutter_battery" />`;

    const colourRow = (key, caption, value) => `
          <div class="row">
            <div class="field" style="flex: 0 0 90px;">
              <label>${caption}</label>
              <input type="color" data-field="bottom_${side}_${key}" value="${value.startsWith('#') ? value : '#ffffff'}" />
            </div>
            <div class="field">
              <label>Or CSS / hex</label>
              <input type="text" data-field="bottom_${side}_${key}" value="${this._escape(value)}" />
            </div>
          </div>`;

    let kindFields;
    if (kind === 'battery') {
      kindFields = `
          <div class="hint">Battery detected: background is set automatically (green at or above ${greenAt}%, amber at or above ${amberAt}%, red below). Text is white.</div>
          <div class="row">
            <div class="field">
              <label>Green at or above (%)</label>
              <input type="number" step="1" min="0" max="100" data-field="bottom_${side}_battery_green_at" value="${greenAt}" />
            </div>
            <div class="field">
              <label>Amber at or above (%)</label>
              <input type="number" step="1" min="0" max="100" data-field="bottom_${side}_battery_amber_at" value="${amberAt}" />
            </div>
          </div>`;
    } else if (kind === 'binary') {
      kindFields = `
          <div class="row">
            <div class="field">
              <label>On shows</label>
              <input type="text" data-field="bottom_${side}_on_text" value="${this._escape(onText)}" />
            </div>
            <div class="field">
              <label>Off shows</label>
              <input type="text" data-field="bottom_${side}_off_text" value="${this._escape(offText)}" />
            </div>
          </div>
          ${colourRow('on_bg_color', 'On colour', onBg)}
          ${colourRow('off_bg_color', 'Off colour', offBg)}`;
    } else {
      kindFields = colourRow('bg_color', 'Background colour', bg);
    }

    const textFields = kind === 'battery' ? '' : colourRow('text_color', 'Text colour', text);

    return `
      <div class="entity-box">
        <label class="check-label">
          <input type="checkbox" data-field="show_bottom_${side}" ${on ? 'checked' : ''} />
          ${title}
        </label>
        ${on ? `
          <div class="field">
            <label>Entity</label>
            ${pickerHtml}
          </div>
          <div class="field">
            <label>Name override (blank = friendly name)</label>
            <input type="text" data-field="bottom_${side}_label" value="${this._escape(label)}" />
          </div>
          ${kindFields}
          ${textFields}` : ''}
      </div>`;
  }

  _rainRowEditor(key, title, on, entity, label, placeholder, hasPicker) {
    const pickerHtml = hasPicker
      ? `<ha-entity-picker data-field="rain_${key}_entity" allow-custom-entity></ha-entity-picker>`
      : `<input type="text" data-field="rain_${key}_entity" value="${this._escape(entity || '')}" placeholder="${this._escape(placeholder)}" />`;
    return `
      <div class="entity-box">
        <label class="check-label">
          <input type="checkbox" data-field="show_rain_${key}" ${on ? 'checked' : ''} />
          ${title}
        </label>
        ${on ? `
          <div class="field">
            <label>Entity</label>
            ${pickerHtml}
          </div>
          <div class="field">
            <label>Label override (blank = friendly name)</label>
            <input type="text" data-field="rain_${key}_label" value="${this._escape(label || '')}" />
          </div>` : ''}
      </div>`;
  }

  _escape(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}

customElements.define('svg-tank-card-editor', SvgTankCardEditor);

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === 'svg-tank-card')) {
  window.customCards.push({
    type: 'svg-tank-card',
    name: 'SVG Tank Card',
    description: 'Rainwater tank with animated level, optional inlet/overflow pipes, inflow animation driven by a rain-rate sensor, scale, and valve buttons with custom labels and images.',
  });
}
