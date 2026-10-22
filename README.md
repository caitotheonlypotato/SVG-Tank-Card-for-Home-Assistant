# SVG Tank Card for Home Assistant

A custom Lovelace card that draws a rainwater tank with an animated water level, optional inlet and overflow pipes, a percentage scale, rain information, flow animations, valve buttons, and up to two additional info buttons in the bottom corners.

<img width="478" height="655" alt="image" src="https://github.com/user-attachments/assets/97df5c7d-fcd6-4806-abe8-8ed41a237ddd" />

---

## Features

- Animated water level driven by any numeric sensor, with a configurable full value and top margin
- Optional percentage scale, wave animation and custom colours
- Optional top inlet and overflow outlet pipes
- Inflow animation driven by a rain rate sensor, and overflow animation when the tank is full
- Rain information above the tank: daily total, current rate and maximum rate, each with an optional label override
- Up to two valve buttons with custom images, labels, and tap and hold actions
- Up to two additional info buttons in the bottom corners, for any entity
  - Binary sensors: custom on and off text, with a background colour for each state
  - Battery sensors: background colour set automatically (green, amber or red) using configurable thresholds
  - Other sensors: a single background colour
- Height factor to make the tank area taller
- Visual editor with collapsible sections, plus full YAML support

---

## Requirements

- A working Home Assistant installation with access to `/config/www/`
- A modern browser (Chrome, Edge, Firefox, Safari, or the Home Assistant companion apps)
- A numeric sensor for the tank level

---

## Installation (manual)

1. **Download the card.** Save `svg-tank-card.js` from this repository.

2. **Copy the file** to your Home Assistant `www` folder. The location depends on your setup:

   ```
   /config/www/svg-tank-card.js
   ```

   or, if you use a community subfolder:

   ```
   /config/www/community/svg-tank-card.js
   ```

   If the `www` folder doesn't exist, create it. Files placed there are served at `/local/`, so the second option is served at `/local/community/svg-tank-card.js`. Use whichever path matches where the file actually is.

3. **Add the resource.**
   - Go to **Settings → Dashboards**.
   - Open the three-dot menu (top right) and choose **Resources**.
   - Select **Add resource** and enter:
     - **URL:** `/local/svg-tank-card.js` (or `/local/community/svg-tank-card.js` if you used the community folder)
     - **Resource type:** `JavaScript module`
   - Select **Create**.

4. **Clear the browser cache** or do a hard refresh (Ctrl+F5, or Cmd+Shift+R on macOS) so the new file loads.

5. **Add the card.** Edit a dashboard, select **Add card**, search for **Tank**, or use the YAML editor with the example below.

### Updating

Replace the file in the same folder you installed it to, then clear your browser cache. You don't need to change the resource entry unless you've moved the file or changed its name, in which case update the resource URL to match.

---

## Quick start

```yaml
type: custom:svg-tank-card
entity: sensor.tank_level
name: Water Tank
full_value: 100
top_margin: 12
show_scale: true
wave_motion: true
```

---

## Full example

```yaml
type: custom:svg-tank-card
entity: sensor.realistic_front_tank_level
name: Front Water Tank Level
full_value: 101
top_margin: 9
wave_motion: true
wave_color: '#1d6fbf'
wave_color_light: '#4aa3e0'
tank_color: '#3a3a3a'
show_scale: true
height_factor: 1.2

show_top_inlet: true
show_top_outlet: true
show_inflow: true
inflow_entity: sensor.gw1100c_rain_rate

show_rain_daily: true
rain_daily_entity: sensor.daily_rain_total_since_midnight
rain_daily_label: Since Midnight
show_rain_rate: true          # uses inflow_entity if rain_rate_entity is not set
rain_rate_label: Rate
show_rain_max: true
rain_max_entity: input_number.daily_rain_rate_max
rain_max_label: Max Rate

valve_height: 75
valves:
  - entity: switch.tank_bypass_switch
    name: Tank First Flush Bypass
    background_color: transparent
    background_image_on: /local/to-street.png
    background_image_off: /local/to-rainwater-tank.png
    state_map:
      'on': To Street
      'off': To Tank
  - entity: switch.roof_divert_switch
    name: Main Roof Divert
    background_color: transparent
    background_image_on: /local/to-street.png
    background_image_off: /local/to-rainwater-tank.png
    state_map:
      'on': To Street
      'off': To Tank

show_bottom_left: true
bottom_left_entity: sensor.gutter_sensor_battery
bottom_left_text_color: '#ffffff'
bottom_left_bg_color: '#2a2a2a'

show_bottom_right: true
bottom_right_entity: binary_sensor.gutter_water_leak
bottom_right_label: The gutter level is
bottom_right_on_text: Flooded
bottom_right_off_text: Normal
bottom_right_on_bg_color: '#8b0000'
bottom_right_off_bg_color: '#006400'
```

---

## Configuration reference

### Level and appearance

| Option | Type | Default | Description |
|---|---|---|---|
| `entity` | string | **required** | Sensor reporting the tank level |
| `name` | string | `''` | Title shown above the valves |
| `full_value` | number | `100` | The sensor value that means 100% |
| `cap_at_100` | boolean | `true` | Limit the displayed percentage to 100%. When off, values up to 130% are shown |
| `top_margin` | number | `12` | Headroom above 100%, as a percentage of tank height |
| `show_scale` | boolean | `true` | Show the 0–100% scale on the left |
| `wave_motion` | boolean | `true` | Animate the water surface |
| `wave_color` | colour | `#1d6fbf` | Water colour |
| `wave_color_light` | colour | `#4aa3e0` | Water surface highlight colour |
| `tank_color` | colour | `#3a3a3a` | Tank body colour |
| `height_factor` | number | `1` | Multiplies the tank area's height. `1` is natural height, `1.2` is 20% taller. Values below 1 are not allowed |

### Pipes and inflow

| Option | Type | Default | Description |
|---|---|---|---|
| `show_top_inlet` | boolean | `false` | Show the inlet pipe at the top left |
| `show_top_outlet` | boolean | `false` | Show the overflow pipe at the top right |
| `show_inflow` | boolean | `false` | Enable the inflow animation |
| `inflow_entity` | string | `''` | Rain rate sensor. The inflow animation runs when this is above 0. The overflow animation runs when the tank is full, the outlet is shown, and this is above 0 |

### Rain information

Shown above the tank as a single line. Each value is optional.

| Option | Type | Default | Description |
|---|---|---|---|
| `show_rain_daily` | boolean | `false` | Show the daily rain total |
| `rain_daily_entity` | string | `''` | Daily rain total sensor |
| `rain_daily_label` | string | `''` | Label override. Blank uses the sensor's friendly name |
| `show_rain_rate` | boolean | `false` | Show the current rain rate |
| `rain_rate_entity` | string | `inflow_entity` | Current rain rate sensor. Defaults to `inflow_entity` when blank |
| `rain_rate_label` | string | `''` | Label override |
| `show_rain_max` | boolean | `false` | Show the maximum rain rate |
| `rain_max_entity` | string | `''` | Maximum rain rate sensor |
| `rain_max_label` | string | `''` | Label override |

Values use one decimal place and the unit from the sensor. A sensor that is unavailable or unknown shows `--`.

### Additional info (bottom corners)

Two independent buttons, one per corner. Each is shown whenever it's enabled, regardless of the sensor's state.

| Option | Type | Default | Description |
|---|---|---|---|
| `show_bottom_left` / `show_bottom_right` | boolean | `false` | Show the button |
| `bottom_left_entity` / `bottom_right_entity` | string | `''` | Entity to display |
| `bottom_*_label` | string | `''` | Name override. Blank uses the friendly name |
| `bottom_*_text_color` | colour | `#ffffff` | Text colour (not used for battery sensors, which are always white) |
| `bottom_*_bg_color` | colour | `#2a2a2a` | Background colour for other sensors |
| `bottom_*_on_text` | string | `On` | Binary sensors: text shown when on |
| `bottom_*_off_text` | string | `Off` | Binary sensors: text shown when off |
| `bottom_*_on_bg_color` | colour | `#2a2a2a` | Binary sensors: background when on |
| `bottom_*_off_bg_color` | colour | `#2a2a2a` | Binary sensors: background when off |
| `bottom_*_battery_green_at` | number | `50` | Battery sensors: green at or above this percentage |
| `bottom_*_battery_amber_at` | number | `20` | Battery sensors: amber at or above this percentage, red below |

Entity types are detected automatically:

- **Binary sensor:** any `binary_sensor.*` entity, or any entity whose state is `on` or `off`.
- **Battery:** a numeric sensor with `device_class: battery`, or a `%` sensor with "battery" in its entity ID or name. Battery colours are fixed: green `#1b6b1b`, amber `#b07d00`, red `#a31515`.
- **Other:** anything else, using the single background colour.

### Valves

| Option | Type | Default | Description |
|---|---|---|---|
| `valve_height` | number | auto | Button height in pixels |
| `valve_width` | number | stretch | Button width in pixels |
| `valves` | list | `[]` | Up to two valve entries (see below) |

Each valve entry:

| Option | Type | Default | Description |
|---|---|---|---|
| `entity` | string | **required** | Switch or other entity to control |
| `name` | string | entity ID | Button label |
| `background_color` | colour | `#222222` | Background colour |
| `background_image_on` | path | none | Image shown when the entity is on (for example `/local/valve_on.png`) |
| `background_image_off` | path | none | Image shown when the entity is off |
| `state_map` | map | `Valve open` / `Valve closed` | Custom label for each state, for example `'on': To Street` |
| `tap_action` | action | `toggle` | Action on tap |
| `hold_action` | action | `more-info` | Action on hold |

### Tank actions

| Option | Type | Default | Description |
|---|---|---|---|
| `tap_action` | action | `more-info` | Action when the tank is tapped |
| `hold_action` | action | `none` | Action when the tank is held |

Supported actions: `more-info`, `toggle`, `none`, `navigate` (with `navigation_path`), `url` (with `url_path`), and `call-service` (with `service` and optional `data`).

---

## Using the visual editor

Open the card's editor and expand the sections:

- **Level:** sensor, name, full value, margin, cap
- **Appearance:** wave motion, scale, colours, height factor
- **Pipes & flow:** inlet, outlet, inflow animation
- **Rain info:** daily, rate and maximum values, with labels
- **Additional info:** bottom corner buttons, with entity-specific options shown as appropriate
- **Tank actions:** tap and hold behaviour
- **Valves:** button size and up to two valves

Each section shows a summary of its current settings when collapsed.

---

## Troubleshooting

- **Card doesn't appear in the picker:** Check that the resource is added as a JavaScript module at `/local/svg-tank-card.js`, then clear your browser cache.
- **Old version still loads:** Do a hard refresh, or clear the cache for your Home Assistant address.
- **Height factor has no effect:** Check that the card is not inside a fixed-size layout element, such as a picture elements card. Card sizing depends on the parent layout.
- **Sensor shows `--`:** The entity is unavailable or unknown, or the value isn't a number. Check it in Developer Tools → States.
- **Valve images don't show:** Check the paths are correct and the files are in `/config/www/` (or a subfolder of it). Paths start with `/local/`.

---

## Contributing

Issues and pull requests are welcome. Please describe the change you're proposing and include the Home Assistant version and your configuration (with any sensitive entity names removed) when reporting a bug.

---

## Disclaimer

**Please read before installing.**

- **Back up first.** Before installing or updating this card, back up your Home Assistant configuration, dashboards and any automations that use the entities shown on the card. Editing or replacing files in `/config` can break your setup.
- **Use at your own risk.** This card is provided "as is", without warranty of any kind, express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, and non-infringement.
- **Not a safety system.** The card displays information and can operate switches and valves. It must not be relied on for flood protection, leak detection, water supply control, or any other safety-critical function. Use proper, certified systems for those purposes.
- **No liability.** The authors and contributors accept no responsibility for damage, data loss, property damage, water damage, or any other loss arising from the use of this card, whether caused by bugs, misconfiguration, sensor faults, network or service problems, or anything else.
- **Not affiliated.** This project is not affiliated with, endorsed by, or supported by Home Assistant, Nabu Casa, or any device manufacturer. Product names are used for identification only.
- **Third-party integrations.** Sensors and switches depend on their own integrations and hardware. Check that they work reliably before relying on them in a dashboard.

---

## Licence

Add your chosen licence here (for example MIT) and include a `LICENSE` file in the repository.
